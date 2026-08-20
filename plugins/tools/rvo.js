/**
 * plugins/tools/rvo.js
 * Membongkar isi pesan media sekali lihat / View Once (Universal Chat Style)
 */

import { downloadContentFromMessage } from 'baileys';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { res } from '../src/response.js';


export default {
    cmd: ['rvo', 'readviewonce'],
    category: 'tools',
    desc: 'Membongkar dan mengirimkan kembali isi pesan media sekali lihat (View Once).',
    exec: async (m, { sock, command }) => {
        if (!m.quoted) return m.reply(`_Format salah! reply pada pesan media sekali lihat (*View Once*) menggunakan perintah ${m.prefix}${command}_`);

        try {
            const type = m.quoted.type;
            const msg = m.quoted.msg;

            if (!msg) return m.reply(res.error);

            await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

            const stream = await downloadContentFromMessage(
                msg,
                type.replace('Message', '')
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const ext = type === 'imageMessage' ? 'jpg' :
                        type === 'videoMessage' ? 'mp4' :
                        type === 'audioMessage' ? 'mp3' :
                        type === 'documentMessage' ? '' : 'bin';

            const fileName = `rvo_${Date.now()}.${ext}`;
            const filePath = path.join(process.cwd(), 'data', 'tmp', fileName);

            if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, buffer);

            if (type === 'imageMessage') {
                await sock.sendMessage(m.from, { image: fs.readFileSync(filePath), caption: msg.caption || '' }, { quoted: m });
            } else if (type === 'videoMessage') {
                await sock.sendMessage(m.from, { video: fs.readFileSync(filePath), caption: msg.caption || '' }, { quoted: m });
            } else if (type === 'audioMessage') {
                await sock.sendMessage(m.from, { audio: fs.readFileSync(filePath), mimetype: 'audio/mpeg' }, { quoted: m });
            } else if (type === 'documentMessage') {
                await sock.sendMessage(m.from, { document: fs.readFileSync(filePath), mimetype: msg.mimetype, fileName: msg.fileName || fileName }, { quoted: m });
            } else {
                await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
                return m.reply('Tipe media ini belum didukung oleh sistem: ' + type);
            }

            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });

            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                } catch {}
            }, 5000);

        } catch (e) {
            console.error('[RVO_FATAL_ERR]', e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });

            if (m.quoted?.text) {
                await sock.sendMessage(m.from, { text: m.quoted.text }, { quoted: m });
            } else {
                await m.reply(res.error);
            }
        }
    }
};