/**
 * plugins/grup/swgc.js
 * Mengirim ulang pesan/media ke dalam grup (Universal Chat Style & Auto-Clear React)
 */

import { downloadContentFromMessage } from 'baileys';
import { res } from '../../src/response.js';


export default {
    cmd: ['swgc'],
    category: 'grup',
    desc: 'Mengirim ulang pesan atau media ke dalam grup (status whatsapp)',
    exec: async (m, { sock, query }) => {
        if (!m.isGroup) return m.reply(res.group);
        if (!m.isOwner && !m.isAdmin) return m.reply('_kamu bukan admin/owner!_');

        let q = m.quoted ? m.quoted : m;
        let mime = (q.msg || q).mimetype || '';
        let isMedia = /image|video|audio/.test(mime);
        let text = query || (q.msg || q).caption || '';

        await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        try {
            let content = {
                contextInfo: {
                    isGroupStatus: true,
                    remoteJid: m.from
                }
            };

            if (isMedia) {
                const messageToDownload = q.msg || q;
                const downloadType = mime.split('/')[0];
                
                const stream = await downloadContentFromMessage(messageToDownload, downloadType);
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                if (downloadType === 'audio') {
                    content.audio = buffer;
                    content.ptt = true;
                    content.mimetype = 'audio/ogg; codecs=opus';
                } else {
                    content[downloadType] = buffer;
                    content.caption = text || undefined;
                }
            } else {
                if (!query) {
                    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                    return m.reply("_Format salah! masukkan teks pesan atau reply pada media yang ingin dikirim ulang._");
                }
                content.text = query;
            }

            await sock.sendMessage(m.from, content);
            await sock.sendMessage(m.from, { react: { text: '', key: m.key } });

        } catch (e) {
            console.error('[SWGC_ERR]', e);
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await m.reply(res.error);
        }
    }
};