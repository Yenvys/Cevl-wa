/**
 * plugins/tools/sticker.js
 * Mengubah gambar atau video pendek menjadi berkas stiker WebP (Universal Chat Style)
 */

import { downloadMediaMessage } from 'baileys';
import { res } from '../../lib/response.js';


export default {
    cmd: ['sticker', 's', 'stiker'],
    category: 'tools',
    desc: 'Mengonversi berkas media gambar atau video pendek menjadi bentuk stiker WhatsApp.',
    exec: async (m, { sock, command }) => {
        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || '';

        if (!/image|video/.test(mime)) return m.reply(`_Format salah! kirim atau reply objek gambar/video pendek dengan *${m.prefix}${command}*_`);

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        try {
            const buffer = await downloadMediaMessage(
                { key: m.quoted ? { id: m.quoted.id, remoteJid: m.from } : m.key, message: q.message || q },
                'buffer',
                {},
                { logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } }
            );

            await sock.sendSticker(m.from, buffer, m, {
                isAnimated: /video/.test(mime)
            });

            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });

        } catch (e) {
            console.error('[STICKER_GEN_ERR]', e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
        }
    }
};