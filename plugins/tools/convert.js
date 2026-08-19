/**
 * plugins/tools/convert.js
 * Utilitas konversi tipe data berkas media dengan Flag Parameter (Universal Chat Style)
 */

import { getMedia, createTemp, cleanup, toGif, toMp3, stickerToImage, convertToMp4 } from '../../lib/helper.js';
import fs from 'node:fs';
import axios from 'axios';
import FormData from 'form-data';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { res } from '../../lib/response.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function uploadToCatbox(buffer, filename) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, { filename });
    const { data } = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders(),
        timeout: 60000
    });
    return data;
}

async function uploadToTmpfiles(buffer, filename) {
    const form = new FormData();
    form.append('file', buffer, { filename });
    const { data } = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
        headers: form.getHeaders(),
        timeout: 60000
    });
    if (data?.data?.url) return data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    return null;
}


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
        helpText += `│ ◦ ${m.prefix}${command} --tourl / --tolink - Upload media ke URL\n`;
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
                if (!/video|gif|webp|sticker/.test(mime)) return m.reply("_Target harus berupa video, gif, atau stiker animasi._");
                await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                // Animated sticker (webp) → MP4
                if (/webp|sticker/.test(mime)) {
                    const tmpIn = createTemp('gif');
                    const tmpOut = tmpIn.replace('.gif', '_out.mp4');

                    try {
                        const buffer = await q.download();
                        const sharp = (await import('sharp')).default;
                        const gifBuffer = await sharp(buffer, { animated: true }).gif().toBuffer();
                        fs.writeFileSync(tmpIn, gifBuffer);

                        await new Promise((resolve, reject) => {
                            ffmpeg(tmpIn)
                                .outputOptions([
                                    '-vf', 'scale=480:-1:flags=lanczos',
                                    '-pix_fmt', 'yuv420p'
                                ])
                                .toFormat('mp4')
                                .on('end', resolve)
                                .on('error', reject)
                                .save(tmpOut);
                        });

                        await sock.sendMessage(m.from, {
                            video: fs.readFileSync(tmpOut),
                            mimetype: 'video/mp4'
                        }, { quoted: m });
                        await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                    } catch (e) {
                        console.error('[CONV_STICKER_MP4_ERR]', e);
                        await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await m.reply(res.error);
                    } finally {
                        cleanup(tmpIn);
                        cleanup(tmpOut);
                    }
                // Video/GIF → MP4
                } else {
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
                }
                break;
            }

            // ==========================================
            // FLAG: --togif
            // ==========================================
            case '--togif': {
                if (!/video|webp|sticker/.test(mime)) return m.reply("_Target harus berupa video atau stiker animasi untuk diubah ke GIF._");
                await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                // Animated sticker (webp) → GIF
                if (/webp|sticker/.test(mime)) {
                    const tmpIn = createTemp('gif');
                    const tmpOut = tmpIn.replace('.gif', '_out.mp4');

                    try {
                        const buffer = await q.download();
                        const sharp = (await import('sharp')).default;
                        const gifBuffer = await sharp(buffer, { animated: true }).gif().toBuffer();
                        fs.writeFileSync(tmpIn, gifBuffer);

                        await new Promise((resolve, reject) => {
                            ffmpeg(tmpIn)
                                .outputOptions([
                                    '-vf', 'scale=480:-1:flags=lanczos,fps=12',
                                    '-loop', '0',
                                    '-pix_fmt', 'yuv420p'
                                ])
                                .toFormat('mp4')
                                .on('end', resolve)
                                .on('error', reject)
                                .save(tmpOut);
                        });

                        await sock.sendMessage(m.from, {
                            video: fs.readFileSync(tmpOut),
                            gifPlayback: true
                        }, { quoted: m });
                        await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                    } catch (e) {
                        console.error('[CONV_STICKER_GIF_ERR]', e);
                        await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await m.reply(res.error);
                    } finally {
                        cleanup(tmpIn);
                        cleanup(tmpOut);
                    }
                // Video → GIF
                } else {
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

            // ==========================================
            // FLAG: --tourl / --tolink
            // ==========================================
            case '--tourl':
            case '--tolink': {
                await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                try {
                    const buffer = await q.download();

                    let ext = 'bin';
                    if (/image\/jpeg/.test(mime)) ext = 'jpg';
                    else if (/image\/png/.test(mime)) ext = 'png';
                    else if (/image\/webp/.test(mime)) ext = 'webp';
                    else if (/image\/gif/.test(mime)) ext = 'gif';
                    else if (/video/.test(mime)) ext = 'mp4';
                    else if (/audio\/mpeg/.test(mime)) ext = 'mp3';
                    else if (/audio\/ogg/.test(mime)) ext = 'ogg';
                    else if (/audio/.test(mime)) ext = 'mp3';
                    else if (/pdf/.test(mime)) ext = 'pdf';

                    const filename = `upload_${Date.now()}.${ext}`;

                    let url;
                    try {
                        url = await uploadToCatbox(buffer, filename);
                    } catch (e) {
                        url = await uploadToTmpfiles(buffer, filename);
                    }

                    if (!url) {
                        await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        return m.reply('❌ Gagal mengupload media.');
                    }

                    await m.reply(`✅ *Upload Berhasil*\n\n> ${url}`);
                    await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                } catch (e) {
                    console.error('[CONV_URL_ERR]', e);
                    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                    await m.reply(res.error);
                }
                break;
            }

            default:
                return m.reply(`Opsi *"${flag}"* tidak valid!\n\nKetik *${m.prefix}${command}* untuk melihat daftar bantuan.`);
        }
    }
};