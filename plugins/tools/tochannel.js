/**
 * plugins/tools/tochannel.js
 * Forward messages/media to WhatsApp Newsletter Channel
 * Bot harus menjadi admin di saluran target agar bisa mengirim pesan.
 */

import { downloadMediaMessage } from 'baileys';
import { res } from '../../src/response.js';

const NEWSLETTER_JID = '120363401731165846@newsletter';

export default {
    cmd: ['tochannel', 'tonewsletter', 'saluran', 'toch', 'togh'],
    category: 'tools',
    desc: 'Meneruskan pesan/media ke saluran (newsletter). Reply pesan yang ingin diteruskan dengan perintah ini. Bot harus admin di saluran.',
    exec: async (m, { sock, command }) => {
        // Harus reply pesan
        if (!m.quoted) {
            return m.reply(
                `*♯ Cara Penggunaan*\n\n` +
                `Reply pesan (teks/gambar/video/audio/stiker/dokumen) yang ingin diteruskan ke saluran dengan:\n` +
                `> ${m.prefix}${command}\n\n` +
                `Opsional: tambahkan caption kustom\n` +
                `> ${m.prefix}${command} caption teks kamu\n\n` +
                `_Bot harus menjadi admin di saluran tujuan._`
            );
        }

        await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        try {
            const quoted = m.quoted;
            const quotedType = quoted.type || '';
            const quotedMsg = quoted.msg || quoted;
            const mime = quotedMsg?.mimetype || '';
            const customCaption = m.query || '';

            // === TEKS BIASA ===
            if (quotedType === 'conversation' || quotedType === 'extendedTextMessage') {
                const text = quoted.text || quotedMsg?.text || '';
                if (!text) {
                    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                    return m.reply('❌ Pesan teks kosong, tidak ada yang bisa diteruskan.');
                }

                const finalText = customCaption
                    ? `${customCaption}\n\n${text}`
                    : text;

                await sock.sendMessage(NEWSLETTER_JID, { text: finalText });

                await sock.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                return m.reply('✅ Pesan teks berhasil diteruskan ke saluran!');
            }

            // === MEDIA (image, video, audio, sticker, document) ===
            if (mime || ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage', 'documentWithCaptionMessage'].includes(quotedType)) {
                const buffer = await downloadMediaMessage(
                    {
                        key: { id: quoted.id, remoteJid: m.from, participant: quoted.participant },
                        message: quoted.message || quoted
                    },
                    'buffer',
                    {},
                    { logger: { info: () => { }, error: () => { }, warn: () => { }, debug: () => { } } }
                );

                if (!buffer) {
                    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                    return m.reply('❌ Gagal mengunduh media. Coba lagi.');
                }

                const originalCaption = quoted.text || quotedMsg?.caption || '';
                const caption = customCaption || originalCaption;

                // Kirim berdasarkan tipe media
                if (/image/.test(mime) || quotedType === 'imageMessage') {
                    await sock.sendMessage(NEWSLETTER_JID, {
                        image: buffer,
                        caption: caption || undefined
                    });
                } else if (/video/.test(mime) || quotedType === 'videoMessage') {
                    await sock.sendMessage(NEWSLETTER_JID, {
                        video: buffer,
                        caption: caption || undefined,
                        mimetype: mime || 'video/mp4'
                    });
                } else if (/audio/.test(mime) || quotedType === 'audioMessage') {
                    await sock.sendMessage(NEWSLETTER_JID, {
                        audio: buffer,
                        mimetype: mime || 'audio/mpeg',
                        ptt: quotedMsg?.ptt || false
                    });
                } else if (/webp/.test(mime) || quotedType === 'stickerMessage') {
                    await sock.sendMessage(NEWSLETTER_JID, {
                        sticker: buffer
                    });
                } else if (quotedType === 'documentMessage' || quotedType === 'documentWithCaptionMessage') {
                    const fileName = quotedMsg?.fileName || 'file';
                    await sock.sendMessage(NEWSLETTER_JID, {
                        document: buffer,
                        mimetype: mime || 'application/octet-stream',
                        fileName: fileName,
                        caption: caption || undefined
                    });
                } else {
                    // Fallback: kirim sebagai dokumen
                    await sock.sendMessage(NEWSLETTER_JID, {
                        document: buffer,
                        mimetype: mime || 'application/octet-stream',
                        fileName: `forwarded_${Date.now()}`,
                        caption: caption || undefined
                    });
                }

                await sock.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                return m.reply('✅ Media berhasil diteruskan ke saluran!');
            }

            // === TIPE TIDAK DIDUKUNG ===
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            return m.reply('❌ Tipe pesan ini tidak didukung untuk diteruskan ke saluran.');

        } catch (err) {
            console.error('[TOCHANNEL_ERR]', err);
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });

            if (err.message?.includes('not-authorized') || err.message?.includes('403')) {
                return m.reply('❌ Bot bukan admin di saluran tujuan! Pastikan bot sudah menjadi admin di saluran.');
            }

            return m.reply('❌ Gagal meneruskan ke saluran. ' + (err.message || ''));
        }
    }
};
