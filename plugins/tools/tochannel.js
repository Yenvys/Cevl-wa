/**
 * plugins/tools/tochannel.js
 * Forward messages/media to WhatsApp Newsletter Channel
 * Bot harus menjadi admin di saluran target agar bisa mengirim pesan.
 * 
 * CATATAN: Pengiriman media ke saluran saat ini terbatas karena bug di Baileys.
 * Hanya teks yang berhasil terkirim. Media (gambar/video/audio/stiker) akan
 * otomatis dikonversi ke teks/caption jika memungkinkan.
 * Ref: https://github.com/WhiskeySockets/Baileys/issues/2199
 */

import { res } from '../../src/response.js';

const NEWSLETTER_JID = '120363401731165846@newsletter';

export default {
    cmd: ['tochannel', 'tch', 'saluran', 'toch'],
    category: 'tools',
    desc: 'Meneruskan pesan ke saluran (newsletter). Reply pesan yang ingin diteruskan. Saat ini hanya teks/caption yang didukung.',
    exec: async (m, { sock, command }) => {
        // Harus reply pesan
        if (!m.quoted) {
            return m.reply(
                `*♯ Cara Penggunaan*\n\n` +
                `Reply pesan yang ingin diteruskan ke saluran dengan:\n` +
                `> ${m.prefix}${command}\n\n` +
                `Opsional: tambahkan caption kustom\n` +
                `> ${m.prefix}${command} teks kamu\n\n` +
                `⚠️ _Saat ini hanya teks/caption yang bisa dikirim ke saluran. Media (gambar/video/audio) belum didukung oleh library Baileys._`
            );
        }

        await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        try {
            const quoted = m.quoted;
            const quotedType = quoted.type || '';
            const quotedMsg = quoted.msg || quoted;
            const customCaption = m.query || '';

            // Ambil teks dari pesan yang di-reply
            let text = '';

            if (quotedType === 'conversation' || quotedType === 'extendedTextMessage') {
                // Pesan teks biasa
                text = quoted.text || quotedMsg?.text || '';
            } else if (['imageMessage', 'videoMessage'].includes(quotedType)) {
                // Ambil caption dari media
                text = quotedMsg?.caption || quoted.text || '';
            } else if (quotedType === 'documentMessage' || quotedType === 'documentWithCaptionMessage') {
                text = quotedMsg?.caption || quoted.text || '';
            }

            // Jika ada custom caption, gunakan itu
            if (customCaption) {
                text = text ? `${customCaption}\n\n${text}` : customCaption;
            }

            if (!text) {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                return m.reply(
                    '❌ Tidak ada teks/caption yang bisa diteruskan.\n\n' +
                    '_Pengiriman media (gambar/video/audio/stiker) ke saluran belum didukung oleh Baileys._\n' +
                    '_Kamu bisa reply pesan teks atau media yang memiliki caption._'
                );
            }

            await sock.sendMessage(NEWSLETTER_JID, { text });

            await sock.sendMessage(m.from, { react: { text: '✅', key: m.key } });

            // Info tambahan jika pesan asli adalah media
            if (!['conversation', 'extendedTextMessage'].includes(quotedType)) {
                return m.reply('✅ Caption berhasil diteruskan ke saluran!\n\n_⚠️ Media (gambar/video/audio) belum bisa dikirim ke saluran karena keterbatasan library._');
            }

            return m.reply('✅ Pesan teks berhasil diteruskan ke saluran!');

        } catch (err) {
            console.error('[TOCHANNEL_ERR]', err);
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });

            if (err.message?.includes('not-authorized') || err.message?.includes('403')) {
                return m.reply('Bot bukan admin di saluran tujuan! Pastikan bot sudah menjadi admin di saluran.');
            }

            return m.reply('Gagal meneruskan ke saluran. ' + (err.message || ''));
        }
    }
};
