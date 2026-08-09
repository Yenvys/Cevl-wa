/**
 * plugins/tools/convert.js
 * Utilitas konversi tipe data berkas media dengan Flag Parameter (Universal Chat Style)
 */

import { getMedia, createTemp, cleanup, toGif, toMp3, stickerToImage, convertToMp4 } from '../../lib/helper.js';
import fs from 'node:fs';
import { res } from '../../lib/response.js';


export default {
    cmd: ['convert', 'conv'],
    category: 'tools',
    desc: 'Melakukan konversi ekstensi antar berkas media menggunakan parameter flag.',
    exec: async (m, { sock, args, command }) => {
        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || q.mimetype || '';

        let helpText = `『 *MEDIA CONVERTER* 』\n\n`;
        helpText += `*Daftar Perintah Konversi (Reply Media):*\n`;
        helpText += `│ ◦ ${m.prefix}${command} --tomp4 / --tovideo - Ubah video/gif ke MP4\n`;
        helpText += `│ ◦ ${m.prefix}${command} --togif - Ubah video ke GIF animasi\n`;
        helpText += `│ ◦ ${m.prefix}${command} --toimg / --toimage - Ubah stiker ke Gambar\n`;
        helpText += `│ ◦ ${m.prefix}${command} --tomp3 / --toaudio - Ubah video/audio ke MP3\n`;
        helpText += `╰───────────────────────────\n\n`;
        helpText += `_Contoh: Reply stiker lalu ketik: ${m.prefix}${command} --toimg_`;

        if (!args[0]) return m.reply(helpText);
        if (!mime) return m.reply("_Format salah! Harap reply berkas media terlebih dahulu sebelum melakukan konversi._");

        const flag = args[0].toLowerCase();

        switch (flag) {
            // ==========================================
            // FLAG: --tomp4 / --tovideo
            // ==========================================
            case '--tomp4':
            case '--tovideo': {
                if (!/video|gif/.test(mime)) return m.reply("_Target harus berupa video atau gif._");
                await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                try {
                    const buffer = await q.download();
                    const mp4Buffer = await convertToMp4(buffer);

                    await sock.sendMessage(m.from, { video: mp4Buffer }, { quoted: m });
                    await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                } catch (e) { 
                    console.error('[CONV_MP4_ERR]', e);
                    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                    await m.reply(res.error); 
                }
                break;
            }

            // ==========================================
            // FLAG: --togif
            // ==========================================
            case '--togif': {
                if (!/video/.test(mime)) return m.reply("_Target harus berupa video untuk diubah ke GIF._");
                await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                
                const tmpIn = createTemp('mp4');
                const tmpOut = tmpIn.replace('.mp4', '_out.mp4');

                try {
                    const buffer = await q.download();
                    fs.writeFileSync(tmpIn, buffer);
                    await toGif(tmpIn, tmpOut);

                    await sock.sendMessage(m.from, { 
                        video: fs.readFileSync(tmpOut), 
                        gifPlayback: true 
                    }, { quoted: m });
                    await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                } catch (e) { 
                    console.error('[CONV_GIF_ERR]', e);
                    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                    await m.reply(res.error); 
                } finally {
                    cleanup(tmpIn);
                    cleanup(tmpOut);
                }
                break;
            }

            // ==========================================
            // FLAG: --toimg / --toimage
            // ==========================================
            case '--toimg':
            case '--toimage': {
                if (!/webp|sticker/.test(mime)) return m.reply("_Target harus berupa stiker WebP untuk diubah menjadi gambar._");
                await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                try {
                    const buffer = await q.download();
                    const imageBuffer = await stickerToImage(buffer);

                    await sock.sendMessage(m.from, { 
                        image: imageBuffer,
                        mimetype: 'image/png'
                    }, { quoted: m });
                    await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                } catch (e) { 
                    console.error('[CONV_IMG_ERR]', e);
                    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                    await m.reply(res.error); 
                }
                break;
            }

            // ==========================================
            // FLAG: --tomp3 / --toaudio
            // ==========================================
            case '--tomp3':
            case '--toaudio': {
                if (!/video|audio/.test(mime)) return m.reply("Target harus berupa video atau rekaman suara untuk diubah menjadi audio MP3._");
                await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                const ext = mime.split('/')[1]?.split(';')[0] || 'mp4';
                const tmpIn = createTemp(ext);
                const tmpOut = createTemp('mp3');

                try {
                    const buffer = await q.download();
                    fs.writeFileSync(tmpIn, buffer);
                    await toMp3(tmpIn, tmpOut);

                    await sock.sendMessage(m.from, { 
                        audio: fs.readFileSync(tmpOut), 
                        mimetype: 'audio/mpeg',
                        fileName: `audio.mp3`
                    }, { quoted: m });
                    await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                } catch (e) { 
                    console.error('[CONV_MP3_ERR]', e);
                    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                    await m.reply(res.error); 
                } finally {
                    cleanup(tmpIn);
                    cleanup(tmpOut);
                }
                break;
            }

            default:
                return m.reply(`Opsi *"${flag}"* tidak valid!\n\nKetik *${m.prefix}${command}* untuk melihat daftar bantuan.`);
        }
    }
};