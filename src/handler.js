import chokidar from "chokidar";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import cron from "node-cron";
import {
  getGroupSettings,
  getAutoCloseGroups,
  getLidMapping,
  isUserWhitelisted,
  incrementGroupMessage,
  getAfk,
  deleteAfk,
} from "./database.js";
import { serialize } from "./serialize.js";
import { config } from "../config.js";
import { groupCache } from "./helper.js";
import { runDefender } from "./defender.js";

const formatDuration = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h && `${h} jam`, m && `${m} menit`, sec && `${sec} detik`].filter(Boolean).join(" ") || "beberapa saat";
};

export class Handler {
  constructor({ pluginDir, logger }) {
    this.pluginDir = pluginDir;
    this.prefix = Array.isArray(config.prefix) ? config.prefix : [config.prefix || "."];
    this.mode = config.mode || "self";
    this.welcome = true;
    this.goodbye = true;
    this.antilink = true;
    this.autoclose = true;
    this.autoread = false;
    this.autoreject = false;
    this.autoreact = false;
    this.ac_closeCron = "30 22 * * 1-5";
    this.ac_openCron = "00 05 * * 1-5";
    this.log = logger;
    this.plugins = new Map();
    this.processedMsgs = new Set();
    this.aliases = new Map();
    this.acCloseTask = null;
    this.acOpenTask = null;

    this.cooldowns = new Map();
    this.cooldownMs = 3000;

    this._startCleanupInterval();
    this._initWatcher();
  }

  _startCleanupInterval() {
    setInterval(() => {
      this.processedMsgs.clear();
      const now = Date.now();
      for (const [key, ts] of this.cooldowns.entries()) {
        if (now - ts > 60000) this.cooldowns.delete(key);
      }
    }, 300000);
  }

  _initWatcher() {
    if (process.env.NODE_ENV === "production") return;

    chokidar.watch(this.pluginDir).on("all", (event, loc) => {
      if ((event === "add" || event === "change") && loc.endsWith(".js")) {
        this.log.info(`Plugin ${event === "add" ? "Added" : "Updated"}: ${path.basename(loc)}`);
        this._loadPlugin(loc);
      }
    });

    const settingsPath = path.join(process.cwd(), "data", "settings.json");
    chokidar.watch(settingsPath).on("change", () => {
      this.log.info("settings.json updated manually! Reloading settings...");
      this.initGlobalSettings();
    });
  }

  async _loadPlugin(loc) {
    try {
      const name = path.basename(loc, ".js");
      const oldPlugin = this.plugins.get(name);
      if (oldPlugin) {
        for (const [alias, plugin] of this.aliases.entries()) {
          if (plugin === oldPlugin) this.aliases.delete(alias);
        }
      }

      const { default: plugin } = await import(`${pathToFileURL(loc).href}?t=${Date.now()}`);
      if (plugin?.exec) {
        this.plugins.set(name, plugin);
        if (plugin.cmd) {
          const cmds = Array.isArray(plugin.cmd) ? plugin.cmd : [plugin.cmd];
          cmds.forEach((alias) => this.aliases.set(alias.toLowerCase(), plugin));
        }
        return true;
      }
      return false;
    } catch (e) {
      this.log.error("LOAD_PLUGIN", `${path.basename(loc)}: ${e.message}`);
      return false;
    }
  }

  async initGlobalSettings() {
    const settingsPath = path.join(process.cwd(), "data", "settings.json");
    if (!fs.existsSync(settingsPath)) {
      fs.writeFileSync(settingsPath, JSON.stringify({ mode: config.mode, prefix: config.prefix }, null, 2));
    }

    try {
      const data = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      if (data.prefix) this.prefix = Array.isArray(data.prefix) ? data.prefix : [data.prefix];
      if (data.mode) this.mode = data.mode;
      if (typeof data.welcome === "boolean") this.welcome = data.welcome;
      if (typeof data.goodbye === "boolean") this.goodbye = data.goodbye;
      if (typeof data.antilink === "boolean") this.antilink = data.antilink;
      if (typeof data.autoclose === "boolean") this.autoclose = data.autoclose;
      if (typeof data.autoread === "boolean") this.autoread = data.autoread;
      if (typeof data.autoreject === "boolean") this.autoreject = data.autoreject;
      if (typeof data.autoreact === "boolean") this.autoreact = data.autoreact;
      if (data.ac_closeCron) this.ac_closeCron = data.ac_closeCron;
      if (data.ac_openCron) this.ac_openCron = data.ac_openCron;

      if (this.sock) this.reloadCron();
    } catch (e) {
      this.log.error("GLOBAL_SETTING", `Failed to load settings: ${e.message}`);
    }
  }

  async _saveSettings() {
    const settingsPath = path.join(process.cwd(), "data", "settings.json");
    try {
      const current = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, "utf-8")) : {};
      const data = {
        ...current,
        mode: this.mode,
        prefix: this.prefix,
        welcome: this.welcome,
        goodbye: this.goodbye,
        antilink: this.antilink,
        autoclose: this.autoclose,
        ac_closeCron: this.ac_closeCron,
        ac_openCron: this.ac_openCron,
        autoread: this.autoread,
        autoreject: this.autoreject,
        autoreact: this.autoreact,
      };
      fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    } catch (e) {
      this.log.error("GLOBAL_SETTING", `Failed to save settings: ${e.message}`);
    }
  }

  async changeFeature(feature, value) {
    if (["welcome", "goodbye", "antilink", "autoclose", "autoread", "autoreject", "autoreact"].includes(feature)) {
      this[feature] = value;
      if (feature === "autoclose" && this.sock) this.reloadCron();
      await this._saveSettings();
    }
  }

  async changeAcTime(type, cronStr) {
    if (type === "close") this.ac_closeCron = cronStr;
    if (type === "open") this.ac_openCron = cronStr;
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

    const getFiles = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((dirent) => {
        const res = path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res.endsWith(".js") ? [res] : [];
      });

    const files = getFiles(this.pluginDir);
    const results = await Promise.all(files.map((f) => this._loadPlugin(f)));
    const success = results.filter(Boolean).length;

    console.log(
      `${this.log.color(36, "┌──────────────────────────────────┐")}\n` +
      `${this.log.color(36, "│")}  ${this.log.color(32, `✓ Loaded: ${success}`.padEnd(15))} ${this.log.color(31, `✖ Failed: ${files.length - success}`.padEnd(13))} ${this.log.color(36, "│")}\n` +
      `${this.log.color(36, "└──────────────────────────────────┘")}`
    );
  }

  reloadCron() {
    this.acCloseTask?.stop();
    this.acOpenTask?.stop();
    this.acCloseTask = null;
    this.acOpenTask = null;

    if (!this.autoclose || !this.sock) return;

    const runAutoClose = (status, msg) => async () => {
      const groups = await getAutoCloseGroups();
      for (const g of groups) {
        try {
          await this.sock.groupSettingUpdate(g.jid, status);
          await this.sock.sendMessage(g.jid, { text: msg });
        } catch {}
      }
    };

    const tz = { scheduled: true, timezone: "Asia/Jakarta" };
    this.acCloseTask = cron.schedule(this.ac_closeCron, runAutoClose("announcement", "_Grup telah ditutup otomatis. Selamat beristirahat!_"), tz);
    this.acOpenTask = cron.schedule(this.ac_openCron, runAutoClose("not_announcement", "_Selamat pagi! Grup telah dibuka kembali. Selamat beraktivitas!_"), tz);
    this.log.info("AutoClose Cron Scheduler Reloaded");
  }

  async attach(sock) {
    this.sock = sock;
    this.reloadCron();

    // Group Participant Update (Welcome / Goodbye)
    sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
      try {
        const settings = await getGroupSettings(id);
        if (!settings?.isWhitelist || (!settings.welcome && !settings.goodbye)) return;

        const cached = groupCache.get(id);
        const metadata = cached && Date.now() - cached._cachedAt < 300000 ? cached : await sock.groupMetadata(id).catch(() => ({ subject: "Grup" }));
        if (metadata.participants && !cached) {
          metadata._cachedAt = Date.now();
          groupCache.set(id, metadata);
        }

        for (const jid of participants) {
          const rawJid = typeof jid === "string" ? jid : jid?.id || jid?.jid;
          if (!rawJid) continue;

          const finalJid = rawJid.endsWith("@lid") ? (await getLidMapping(rawJid)) || rawJid : rawJid;
          const mentionTag = `@${finalJid.split("@")[0]}`;

          let text =
            action === "add" && settings.welcome && this.welcome
              ? settings.welcomeText
              : action === "remove" && settings.goodbye && this.goodbye
                ? settings.goodbyeText
                : null;
          if (!text) continue;

          text = text.replace(/@pushname/g, mentionTag).replace(/@gcname/g, metadata.subject);
          const pfpUrl = await sock.profilePictureUrl(finalJid, "image").catch(() => config.thumbnailUrl || "https://i.ibb.co/3pYpxJp/profile.png");

          await sock.sendMessage(id, { image: { url: pfpUrl }, caption: text, mentions: [finalJid] }).catch(() =>
            sock.sendMessage(id, { text, mentions: [finalJid] })
          );
        }
      } catch (e) {
        this.log.error("GP_UPDATE_ERR", e.message);
      }
    });

    // Auto Reject Call Listener
    sock.ev.on("call", async (calls) => {
      if (!this.autoreject) return;
      for (const call of calls) {
        if (call.status === "offer") {
          this.log.warn("AUTO_REJECT", `Menolak panggilan masuk dari ${call.from} (${call.id})`);
          await sock.rejectCall(call.id, call.from).catch(() => {});
        }
      }
    });

    // Main Message Handler
    sock.ev.on("messages.upsert", async (upsert) => {
      if (upsert.type !== "notify") return;

      for (const rawMsg of upsert.messages) {
        if (!rawMsg.message || rawMsg.message.protocolMessage) continue;

        const m = await serialize(sock, rawMsg);
        this.log.universal(m);

        const ownerNumbers = Array.isArray(config.ownerNumbers) ? config.ownerNumbers : [];
        m.isOwner = ownerNumbers.includes(m.sender?.split("@")[0]) || m.fromMe;

        const settings = m.isGroup ? await getGroupSettings(m.from) : null;

        await runDefender(m, { sock, handler: this });

        // Auto Read
        if (this.autoread && !m.fromMe && m.from !== "status@broadcast") {
          await sock.readMessages([m.key]).catch(() => {});
        }

        // Auto React
        if (this.autoreact && !m.fromMe && m.from !== "status@broadcast") {
          const emojis = ["✨", "👍", "🔥", "❤️", "🤖", "⭐", "🎉", "👏"];
          const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
          await sock.sendMessage(m.from, { react: { text: randomEmoji, key: m.key } }).catch(() => {});
        }

        if (m.isGroup && m.sender) incrementGroupMessage(m.from, m.sender);

        // Antilink
        if (this.antilink && m.isGroup && settings?.isWhitelist && settings?.antilink && !m.isAdmin && !m.isOwner) {
          const match = m.body?.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
          if (match) {
            const currentCode = await sock.groupInviteCode(m.from).catch(() => null);
            if (match[1] !== currentCode && m.isBotAdmin) {
              await sock.sendMessage(m.from, { delete: m.key });
            }
          }
        }

        // AFK Check (Return)
        if (m.sender) {
          const afkData = getAfk(m.sender, m.from);
          if (afkData) {
            deleteAfk(m.sender, m.from);
            sock.sendMessage(
              m.from,
              {
                text: `*AFK BERAKHIR*\n\n@${m.sender.split("@")[0]} telah kembali dari AFK setelah *${formatDuration(Date.now() - afkData.time)}*.\n*Alasan:* ${afkData.reason}`,
                mentions: [m.sender],
              },
              { quoted: m }
            );
          }
        }

        // AFK Check (Mentioned)
        const mentioned = [...new Set([...(m.mentionedJid || []), ...(m.quoted?.sender ? [m.quoted.sender] : [])])];
        for (const jid of mentioned) {
          const afkData = getAfk(jid, m.from);
          if (afkData) {
            sock.sendMessage(
              m.from,
              {
                text: `*Jangan Ganggu dulu!*\n> @${jid.split("@")[0]} sedang AFK sejak *${formatDuration(Date.now() - afkData.time)}* lalu.\n*Alasan:* ${afkData.reason}`,
                mentions: [jid],
              },
              { quoted: m }
            );
          }
        }

        // Plugin after hooks
        for (const [name, plugin] of this.plugins.entries()) {
          if (typeof plugin?.after === "function") {
            try {
              await plugin.after.call(this, m, { sock, handler: this });
            } catch (e) {
              this.log.error("AFTER_ERROR", `${name}: ${e.message}`);
            }
          }
        }

        // Mode Check
        if (!m.isOwner) {
          if (this.mode === "self") continue;
          if (this.mode === "group" && !m.isGroup) continue;
          if (this.mode === "private" && m.isGroup) continue;
          if (this.mode === "groupwl" && (!m.isGroup || !settings?.isWhitelist)) continue;
          if (this.mode === "userwl" && !(await isUserWhitelisted(m.sender))) continue;
        }

        // Prefix & Command Parsing
        const sortedPrefixes = [...this.prefix].sort((a, b) => b.length - a.length);
        const usedPrefix = sortedPrefixes.find((p) => m.body?.startsWith(p));
        if (usedPrefix === undefined) continue;

        const bodyNoPrefix = m.body.slice(usedPrefix.length).trim();
        const args = bodyNoPrefix.split(/ +/).filter(Boolean);
        const cmdName = args.shift()?.toLowerCase() || "";
        const plugin = this.aliases.get(cmdName);

        if (plugin) {
          if (!m.isOwner) {
            const lastCmd = this.cooldowns.get(m.sender);
            if (lastCmd && Date.now() - lastCmd < this.cooldownMs) continue;
            this.cooldowns.set(m.sender, Date.now());
          }

          m.prefix = usedPrefix;
          m.args = args;
          m.query = args.join(" ");
          this.log.cmd(m, plugin);

          try {
            await plugin.exec(m, {
              sock,
              handler: this,
              command: cmdName,
              args: m.args,
              query: m.query,
              isAdmin: m.isAdmin,
              isBotAdmin: m.isBotAdmin,
            });
          } catch (e) {
            this.log.error("EXEC_ERROR", e.message);
          }
        }
      }
    });
  }
}
