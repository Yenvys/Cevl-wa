/**
 * Adapted from Ginko project (https://github.com/ginkohub/mushi)
 */

import fs from 'node:fs';
import path from 'node:path';

const defenseFile = path.join(process.cwd(), 'data', 'defense.json');

function getDefenseConfig() {
    if (!fs.existsSync(defenseFile)) {
        const defaultCfg = {
            active: true,
            allow_status: [
                "extendedTextMessage",
                "videoMessage",
                "imageMessage",
                "audioMessage",
                "protocolMessage",
                "senderKeyDistributionMessage",
                "associatedChildMessage",
                "reactionMessage"
            ]
        };
        fs.writeFileSync(defenseFile, JSON.stringify(defaultCfg, null, 2));
        return defaultCfg;
    }
    return JSON.parse(fs.readFileSync(defenseFile, 'utf-8'));
}

export default {
    cmd: ['defense', 'defense+', 'defense-', 'skip', 'skip+', 'skip-', 'smp'],
    category: 'owner',
    desc: 'Mengatur status pertahanan (Defense) bot',
    exec: async (m, { command, args, sock }) => {
        if (!m.isOwner) return m.reply('Perintah ini hanya untuk Owner bot.');

        let config = getDefenseConfig();

        if (command === 'smp') {
            try {
                const data = JSON.stringify(m, null, 2);
                const fileName = `${m.from}_${m.sender.split('@')[0]}_${Date.now()}.json`;

                return await sock.sendMessage(m.from, {
                    document: Buffer.from(data),
                    fileName: fileName,
                    mimetype: 'application/json',
                    caption: `*From* : ${m.pushName} (${m.sender})\n*Chat* : ${m.from}`
                }, { quoted: m });
            } catch (e) {
                return m.reply('Gagal membuat sample message.');
            }
        }

        if (command.startsWith('defense')) {
            if (command === 'defense+') {
                config.active = true;
                fs.writeFileSync(defenseFile, JSON.stringify(config, null, 2));
            } else if (command === 'defense-') {
                config.active = false;
                fs.writeFileSync(defenseFile, JSON.stringify(config, null, 2));
            }

            const status = config.active ? 'Aktif' : 'Tidak Aktif ⚠️';
            let text = `*Status pertahanan* : *${status}*\n\n`;
            text += `Catatan :\n`;
            text += `  *${m.prefix}defense-* _untuk menonaktifkan_\n`;
            text += `  *${m.prefix}defense+* _untuk mengaktifkan_`;

            return m.reply(text);
        }

        if (command.startsWith('skip')) {
            let statusMsg = '';

            if (command === 'skip+') {
                if (args.length === 0) return m.reply(`Harap masukkan tipe pesan. Contoh:\n*${m.prefix}skip+* audioMessage`);
                let added = false;
                for (let type of args) {
                    if (!config.allow_status.includes(type)) {
                        config.allow_status.push(type);
                        added = true;
                    }
                }
                if (added) {
                    fs.writeFileSync(defenseFile, JSON.stringify(config, null, 2));
                    statusMsg = 'Berhasil menambahkan ke pengaturan\n\n';
                }
            } else if (command === 'skip-') {
                if (args.length === 0) return m.reply(`Harap masukkan tipe pesan. Contoh:\n*${m.prefix}skip-* audioMessage`);
                let removed = false;
                for (let type of args) {
                    const idx = config.allow_status.indexOf(type);
                    if (idx !== -1) {
                        config.allow_status.splice(idx, 1);
                        removed = true;
                    }
                }
                if (removed) {
                    fs.writeFileSync(defenseFile, JSON.stringify(config, null, 2));
                    statusMsg = 'Berhasil menghapus dari pengaturan\n\n';
                }
            }

            let text = statusMsg;
            text += `*# Tipe pesan yang diizinkan (Skip) di Status* :\n`;
            for (let type of config.allow_status) {
                text += `- \`${type}\`\n`;
            }
            
            text += `\nCatatan :\n`;
            text += `  *${m.prefix}skip-* _untuk menghapus_\n`;
            text += `  *${m.prefix}skip+* _untuk menambah_\n\n`;
            text += `Contoh :\n`;
            text += `  *${m.prefix}skip+ audioMessage imageMessage*`;

            return m.reply(text);
        }
    }
};
