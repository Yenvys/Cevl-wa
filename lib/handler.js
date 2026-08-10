import chokidar from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import cron from 'node-cron';
import { getGroupSettings, getAutoCloseGroups, getLidMapping, isUserWhitelisted, incrementGroupMessage, getAfk, setAfk, deleteAfk } from './database.js';
import { serialize } from './serialize.js';
import { config } from '../config.js';

export class Handler {
  constructor({ pluginDir, logger }) {
    this.pluginDir = pluginDir;
    this.prefix = Array.isArray(config.prefix) ? config.prefix : [config.prefix || '.'];
    this.mode = config.mode || 'self';
    this.welcome = true;
    this.goodbye = true;
    this.antilink = true;
    this.autoclose = true;
    this.ac_closeCron = '30 22 * * 1-5';
    this.ac_openCron = '00 05 * * 1-5';
    this.log = logger;
    this.plugins = new Map();
    this.processedMsgs = new Set();
    this.aliases = new Map();
    this.acCloseTask = null;
    this.acOpenTask = null;
    this._initWatcher();
  }

  _initWatcher() {
    if (process.env.NODE_ENV === 'production') return;
    const watchEvents = ['add', 'change'];
    watchEvents.forEach(event => {
      chokidar.watch(this.pluginDir).on(event, (loc) => {
        if (loc.endsWith('.js')) {
          this.log.info(`Plugin ${event === 'add' ? 'Added' : 'Updated'}: ${path.basename(loc)}`);
          this._loadPlugin(loc);
        }
      });
    });

    // Otomatis reload saat settings.json diedit manual
    const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
    chokidar.watch(settingsPath).on('change', () => {
      this.log.info('settings.json updated manually! Reloading global settings...');
      this.initGlobalSettings();
    });
  }

  async _loadPlugin(loc) {
    try {
      const name = path.basename(loc, '.js');

      const oldPlugin = this.plugins.get(name);
      if (oldPlugin) {
        for (let [alias, plugin] of this.aliases.entries()) {
          if (plugin === oldPlugin) this.aliases.delete(alias);
        }
      }

      const { default: plugin } = await import(`${pathToFileURL(loc).href}?t=${Date.now()}`);

      if (plugin?.exec) {
        this.plugins.set(name, plugin);

        if (plugin.cmd) {
          const cmds = Array.isArray(plugin.cmd) ? plugin.cmd : [plugin.cmd];
          cmds.forEach(alias => this.aliases.set(alias.toLowerCase(), plugin));
        }
        return true;
      }
      return false;
    } catch (e) {
      this.log.error('LOAD_PLUGIN', `${path.basename(loc)}: ${e.message}`);
      return false;
    }
  }

  async initGlobalSettings() {
    const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      fs.writeFileSync(settingsPath, JSON.stringify({ mode: config.mode, prefix: config.prefix }, null, 2));
    }

    try {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (data.prefix) this.prefix = Array.isArray(data.prefix) ? data.prefix : [data.prefix];
      if (data.mode) this.mode = data.mode;
      if (typeof data.welcome === 'boolean') this.welcome = data.welcome;
      if (typeof data.goodbye === 'boolean') this.goodbye = data.goodbye;
      if (typeof data.antilink === 'boolean') this.antilink = data.antilink;
      if (typeof data.autoclose === 'boolean') {
        this.autoclose = data.autoclose;
      }
      if (data.ac_closeCron) this.ac_closeCron = data.ac_closeCron;
      if (data.ac_openCron) this.ac_openCron = data.ac_openCron;

      if (this.sock) this.reloadCron();
    } catch (e) {
      this.log.error('GLOBAL_SETTING', `Failed to load settings: ${e.message}`);
    }
  }

  async _saveSettings() {
    const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
    try {
      let data = {};
      if (fs.existsSync(settingsPath)) {
        data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      }
      data.mode = this.mode;
      data.prefix = this.prefix;
      data.welcome = this.welcome;
      data.goodbye = this.goodbye;
      data.antilink = this.antilink;
      data.autoclose = this.autoclose;
      data.ac_closeCron = this.ac_closeCron;
      data.ac_openCron = this.ac_openCron;
      fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    } catch (e) {
      this.log.error('GLOBAL_SETTING', `Failed to save settings: ${e.message}`);
    }
  }

  async changeFeature(feature, value) {
    if (['welcome', 'goodbye', 'antilink', 'autoclose'].includes(feature)) {
      this[feature] = value;
      if (feature === 'autoclose') {
        if (this.sock) this.reloadCron();
      }
      await this._saveSettings();
    }
  }

  async changeAcTime(type, cronStr) {
    if (type === 'close') this.ac_closeCron = cronStr;
    if (type === 'open') this.ac_openCron = cronStr;
    if (this.sock) this.reloadCron();
    await this._saveSettings();
  }

  async changeMode(newMode) {
    this.mode = newMode;
    await this._saveSettings();
  }

  async changePrefix(newPrefix) {
    this.prefix = Array.isArray(newPrefix) ? newPrefix : [newPrefix];
    await this._saveSettings();
  }

  async initPlugins() {
    await this.initGlobalSettings();
    const getFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(dirent => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : res;
    }).filter(f => f.endsWith('.js'));

    const files = getFiles(this.pluginDir);
    let results = await Promise.all(files.map(f => this._loadPlugin(f)));

    const success = results.filter(Boolean).length;
    const failed = files.length - success;

    console.log(this.log.color(36, '┌──────────────────────────────────┐'));
    console.log(`${this.log.color(36, '│')}  ${this.log.color(32, `✓ Loaded: ${success}`.padEnd(15))} ${this.log.color(31, `✖ Failed: ${failed}`.padEnd(13))} ${this.log.color(36, '│')}`);
    console.log(this.log.color(36, '└──────────────────────────────────┘'));
  }

  reloadCron() {
    if (this.acCloseTask) {
      this.acCloseTask.stop();
      this.acCloseTask = null;
    }
    if (this.acOpenTask) {
      this.acOpenTask.stop();
      this.acOpenTask = null;
    }

    if (!this.autoclose || !this.sock) return;

    this.acCloseTask = cron.schedule(this.ac_closeCron, async () => {
      const groups = await getAutoCloseGroups();
      for (const g of groups) {
        try {
          await this.sock.groupSettingUpdate(g.jid, 'announcement');
          await this.sock.sendMessage(g.jid, { text: `_Grup telah ditutup otomatis. Selamat beristirahat!_` });
        } catch (e) { }
      }
    }, { scheduled: true, timezone: "Asia/Jakarta" });

    this.acOpenTask = cron.schedule(this.ac_openCron, async () => {
      const groups = await getAutoCloseGroups();
      for (const g of groups) {
        try {
          await this.sock.groupSettingUpdate(g.jid, 'not_announcement');
          await this.sock.sendMessage(g.jid, { text: `_Selamat pagi! Grup telah dibuka kembali. Selamat beraktivitas!_` });
        } catch (e) { }
      }
    }, { scheduled: true, timezone: "Asia/Jakarta" });

    this.log.info('AutoClose Cron Scheduler Reloaded');
  }

  async attach(sock) {
    this.sock = sock;
    this.reloadCron();

    // WELCOME/GOODBYE HANDLER
    sock.ev.on('group-participants.update', async (anu) => {
      const { id, participants, action } = anu;
      try {
        const settings = await getGroupSettings(id);
        if (!settings?.isWhitelist || (!settings.welcome && !settings.goodbye)) return;

        const metadata = await sock.groupMetadata(id).catch(() => ({ subject: 'Grup' }));

        for (let jid of participants) {
          const rawJid = typeof jid === 'string' ? jid : (jid?.id || jid?.jid);
          if (!rawJid) continue;

          const finalJid = rawJid.endsWith('@lid') ? (await getLidMapping(rawJid) || rawJid) : rawJid;
          const mentionTag = `@${finalJid.split('@')[0]}`;

          let text = (action === 'add' && settings.welcome && this.welcome) ? settings.welcomeText :
            (action === 'remove' && settings.goodbye && this.goodbye) ? settings.goodbyeText : null;

          if (!text) continue;
          text = text.replace(/@pushname/g, mentionTag).replace(/@gcname/g, metadata.subject);

          let pfpUrl;
          try {
            pfpUrl = await sock.profilePictureUrl(finalJid, 'image');
          } catch {
            pfpUrl = config.thumbnailUrl || 'https://i.ibb.co/3pYpxJp/profile.png';
          }

          await sock.sendMessage(id, {
            image: { url: pfpUrl },
            caption: text,
            mentions: [finalJid]
          });
        }
      } catch (e) { this.log.error('GP_UPDATE_ERR', e.message); }
    });

    // MAIN MESSAGE HANDLER
    sock.ev.on('messages.upsert', async (upsert) => {
      if (upsert.type !== 'notify') return;

      for (const rawMsg of upsert.messages) {
        if (!rawMsg.message || rawMsg.message.protocolMessage) continue;
        const m = await serialize(sock, rawMsg);
        this.log.universal(m);

        const ownerNumbers = Array.isArray(config.ownerNumbers) ? config.ownerNumbers : [];
        m.isOwner = ownerNumbers.includes(m.sender?.split('@')[0]) || m.fromMe;

        const settings = m.isGroup ? await getGroupSettings(m.from) : null;

        // INCREMENT TOTAL CHAT
        if (m.isGroup && m.sender) {
          incrementGroupMessage(m.from, m.sender);
        }

        // ANTILINK
        if (this.antilink && m.isGroup && settings?.isWhitelist && settings?.antilink && !m.isAdmin && !m.isOwner) {
          const isLink = /chat\.whatsapp\.com\/([A-Za-z0-9]+)/i.test(m.body || '');
          if (isLink) {
            const linkCode = m.body.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i)[1];
            const currentCode = await sock.groupInviteCode(m.from).catch(() => null);

            if (linkCode !== currentCode && m.isBotAdmin) {
              await sock.sendMessage(m.from, { delete: m.key });
            }
          }
        }

        // Cek jika sender baru saja kembali dari AFK
        if (m.sender) {
          const afkData = getAfk(m.sender);
          if (afkData) {
            deleteAfk(m.sender);
            const duration = Date.now() - afkData.time;
            const hours = Math.floor(duration / 3600000);
            const minutes = Math.floor((duration % 3600000) / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            let durText = '';
            if (hours > 0) durText += `${hours} jam `;
            if (minutes > 0) durText += `${minutes} menit `;
            if (seconds > 0) durText += `${seconds} detik`;
            if (!durText) durText = 'beberapa saat';

            sock.sendMessage(m.from, {
              text: `*AFK BERAKHIR*\n\n@${m.sender.split('@')[0]} telah kembali dari AFK setelah *${durText.trim()}*.\n*Alasan:* ${afkData.reason}`,
              mentions: [m.sender]
            }, { quoted: m });
          }
        }

        // Cek jika sender nge-tag orang yang sedang AFK
        if (m.mentionedJid?.length > 0 || (m.quoted && m.quoted.sender)) {
          const mentioned = [...(m.mentionedJid || [])];
          if (m.quoted && m.quoted.sender) mentioned.push(m.quoted.sender);

          // Hapus duplikat
          const uniqueMentioned = [...new Set(mentioned)];

          for (let jid of uniqueMentioned) {
            const afkData = getAfk(jid);
            if (afkData) {
              const duration = Date.now() - afkData.time;
              const hours = Math.floor(duration / 3600000);
              const minutes = Math.floor((duration % 3600000) / 60000);
              const seconds = Math.floor((duration % 60000) / 1000);
              let durText = '';
              if (hours > 0) durText += `${hours} jam `;
              if (minutes > 0) durText += `${minutes} menit `;
              if (seconds > 0) durText += `${seconds} detik`;
              if (!durText) durText = 'beberapa saat';

              sock.sendMessage(m.from, {
                text: `*Jangan Ganggu dulu!*\n> @${jid.split('@')[0]} sedang AFK sejak *${durText.trim()}* lalu.\n*Alasan:* ${afkData.reason}`,
                mentions: [jid]
              }, { quoted: m });
            }
          }
        }

        for (let [name, plugin] of this.plugins.entries()) {
          if (plugin && typeof plugin.after === 'function') {
            try {
              await plugin.after.call(this, m, { sock, handler: this });
            } catch (e) {
              this.log.error('AFTER_ERROR', `${name}: ${e.message}`);
            }
          }
        }

        if (!m.isOwner) {
          if (this.mode === 'self') continue;
          if (this.mode === 'group' && !m.isGroup) continue;
          if (this.mode === 'private' && m.isGroup) continue;

          if (this.mode === 'groupwl') {
            if (!m.isGroup) continue;
            if (!settings?.isWhitelist) continue;
          }

          if (this.mode === 'userwl') {
            const isWhitelisted = await isUserWhitelisted(m.sender);
            this.log.info(`[DEBUG USERWL] sender=${m.sender} isWhitelisted=${isWhitelisted} isGroup=${m.isGroup}`);
            if (!isWhitelisted) continue;
          }
        }

        const usedPrefix = this.prefix.find(p => m.body?.startsWith(p));
        if (usedPrefix === undefined) continue;

        const bodyNoPrefix = m.body.slice(usedPrefix.length).trim();
        const args = bodyNoPrefix.split(/ +/).filter(v => v !== "");
        const cmdName = args.shift()?.toLowerCase() || "";

        const plugin = this.aliases.get(cmdName);

        if (plugin) {
          m.prefix = usedPrefix;
          m.args = args;
          m.query = args.join(' ');
          this.log.cmd(m, plugin);

          try {
            await plugin.exec(m, {
              sock,
              handler: this,
              command: cmdName,
              args: m.args,
              query: m.query,
              isAdmin: m.isAdmin,
              isBotAdmin: m.isBotAdmin
            });
          } catch (e) {
            this.log.error('EXEC_ERROR', e.message);
          }
        }
      }
    });
  }
}