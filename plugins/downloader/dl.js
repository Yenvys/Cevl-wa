/**
 * plugins/download/dl.js
 * Media Downloader (Interactive Selection & Auto-Clear React)
 * from: Omegatech v1.1
 */

import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { prepareWAMessageMedia } from 'baileys';
import { config } from '../../config.js';
import { res } from '../../src/response.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const CLOUDINARY_IMAGE = 'https://files.catbox.moe/r5qcku.jpg';
const NEWSLETTER_JID = '120363401731165846@newsletter';

// Global cache for download selections
if (!global.dlCache) global.dlCache = {};

// Extract audio from video URL using ffmpeg
async function extractAudioFromVideo(videoUrl) {
    const tmpDir = os.tmpdir();
    const outputFile = path.join(tmpDir, `dl_audio_${Date.now()}.mp3`);

    return new Promise((resolve, reject) => {
        ffmpeg(videoUrl)
            .noVideo()
            .audioCodec('libmp3lame')
            .audioBitrate(192)
            .format('mp3')
            .on('end', () => resolve(outputFile))
            .on('error', (err) => {
                try { fs.unlinkSync(outputFile); } catch (e) { }
                reject(err);
            })
            .save(outputFile);
    });
}

async function sendInteractiveMedia(sock, chatId, result, sender, taggedUsers = []) {
    try {
        const source = result.source || 'Unknown';
        const title = result.title || 'Untitled';
        const author = result.author || 'Unknown';
        const thumbnail = result.thumbnail || result.thumb || CLOUDINARY_IMAGE;
        const duration = result.duration || 'N/A';

        // Store result for download selection
        global.dlCache[sender] = {
            result: result,
            timestamp: Date.now()
        };

        // Prepare image for header
        let imageMessage;
        try {
            const imgResp = await axios.get(thumbnail, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(imgResp.data);
            const media = await prepareWAMessageMedia({ image: buffer }, { upload: sock.waUploadToServer });
            imageMessage = media.imageMessage;
        } catch (e) { }

        // Build buttons based on available media
        const buttons = [];
        const videos = result.videos || [];
        const audios = result.audios || [];
        const photos = result.photos || [];

        // Video options
        if (videos.length > 0) {
            const videoRows = videos.map((v, idx) => ({
                id: `.dl video ${idx}`,
                title: `Video ${v.quality || idx + 1}`,
                description: `Quality: ${v.quality || 'HD'}`
            }));

            buttons.push({
                name: "single_select",
                buttonParamsJson: JSON.stringify({
                    title: "🎬 Video",
                    sections: [{
                        title: `Select Video (${videos.length})`,
                        highlight_label: "📹",
                        rows: [
                            ...videoRows,
                            {
                                id: `.dl extractaudio 0`,
                                title: "🎵 Extract Audio",
                                description: "Extract audio from best video"
                            }
                        ]
                    }]
                })
            });
        }

        // Audio options
        if (audios.length > 0) {
            const audioRows = audios.map((a, idx) => ({
                id: `.dl audio ${idx}`,
                title: `Audio ${idx + 1}`,
                description: `Format: ${a.format || a.quality || 'mp3'}`
            }));

            buttons.push({
                name: "single_select",
                buttonParamsJson: JSON.stringify({
                    title: "🎵 Audio",
                    sections: [{
                        title: `Select Audio (${audios.length})`,
                        highlight_label: "🎵",
                        rows: audioRows
                    }]
                })
            });
        }

        // Photo options
        if (photos.length > 0) {
            buttons.push({
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: `🖼️ Download All Photos (${photos.length})`,
                    id: `.dl photo all`
                })
            });
        }


        // Channel button
        buttons.push({
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
                display_text: "📢 Channel",
                url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
                webview_interaction: true,
                icon: "default"
            })
        });

        // Build body text
        let bodyText = ` *@${author}* ${title}\n`;
        bodyText += `Available:\n`;
        if (videos.length > 0) bodyText += `     ${videos.length} video(s)\n`;
        if (audios.length > 0) bodyText += `     ${audios.length} audio(s)\n`;
        if (photos.length > 0) bodyText += `     ${photos.length} photo(s)\n`;

        const interactiveMsg = {
            interactiveMessage: {
                header: {
                    title: `> *From ${source}*`,
                    hasMediaAttachment: !!imageMessage
                },
                body: { text: bodyText },
                footer: { text: "💡 *Select an option below to download.*" },
                contextInfo: {
                    mentionedJid: taggedUsers,
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: NEWSLETTER_JID,
                        serverMessageId: 142,
                        newsletterName: 'Cevl'
                    }
                },
                nativeFlowMessage: { buttons }
            }
        };

        if (imageMessage) {
            interactiveMsg.interactiveMessage.header.imageMessage = imageMessage;
        }

        await sock.relayMessage(chatId, interactiveMsg, {
            additionalNodes: [{
                tag: "biz",
                attrs: {},
                content: [{
                    tag: "interactive",
                    attrs: { type: "native_flow", v: "1" },
                    content: [{
                        tag: "native_flow",
                        attrs: { v: "9", name: "mixed" }
                    }]
                }]
            }]
        });

        return true;
    } catch (e) {
        console.error('[DL_INTERACTIVE_ERR]', e);
        return false;
    }
}

async function sendMediaFile(sock, chatId, url, type, title, author, source, quoted) {
    try {
        const caption = `*${title}*\n${author}`;

        const contextInfo = {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: NEWSLETTER_JID,
                serverMessageId: 142,
                newsletterName: 'Cevl'
            }
        };

        if (type === 'video') {
            await sock.sendMessage(chatId, {
                video: { url },
                caption,
                mimetype: 'video/mp4',
                contextInfo
            }, { quoted });
        } else if (type === 'audio') {
            await sock.sendMessage(chatId, {
                audio: { url },
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `${title}.mp3`,
                contextInfo
            }, { quoted });
        } else if (type === 'photo') {
            await sock.sendMessage(chatId, {
                image: { url },
                caption,
                contextInfo
            }, { quoted });
        }

        return true;
    } catch (e) {
        console.error('[DL_SEND_ERR]', e);
        return false;
    }
}

export default {
    cmd: ['dl', 'download', 'downloader'],
    category: 'download',
    desc: 'Download media from any platform (TikTok, Instagram, YouTube, Facebook, Twitter/X, Snapchat, Bilibili, etc.)',
    exec: async (m, { sock, query, command }) => {
        if (!query) {
            return m.reply(res.format(m.prefix, command, `https://example.com/video`));
        }

        // Check for selection sub-commands (from interactive buttons)
        const parts = query.split(' ');
        const subCommand = parts[0]?.toLowerCase() || '';
        const dlCache = global.dlCache?.[m.sender];

        // Handle video selection
        if (subCommand === 'video' && parts[1] !== undefined) {
            const idx = parseInt(parts[1]);
            if (!dlCache?.result) return m.reply('⚠️ No media found. Please search again.');
            const videos = dlCache.result.videos || [];
            if (idx >= videos.length) return m.reply('❌ Invalid video selection.');

            await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
            const selected = videos[idx];
            await sendMediaFile(sock, m.from, selected.url, 'video', dlCache.result.title, dlCache.result.author, dlCache.result.source, m);
            await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
            return;
        }

        // Handle extract audio from video
        if (subCommand === 'extractaudio' && parts[1] !== undefined) {
            const idx = parseInt(parts[1]);
            if (!dlCache?.result) return m.reply('⚠️ No media found. Please search again.');
            const videos = dlCache.result.videos || [];
            if (idx >= videos.length) return m.reply('❌ Invalid video selection.');

            await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
            await m.reply('🎵 _Extracting audio from video..._');

            try {
                const selected = videos[idx];
                const audioPath = await extractAudioFromVideo(selected.url);
                const audioBuffer = fs.readFileSync(audioPath);

                const contextInfo = {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: NEWSLETTER_JID,
                        serverMessageId: 142,
                        newsletterName: 'Cevl'
                    }
                };

                await sock.sendMessage(m.from, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    fileName: `${dlCache.result.title || 'audio'}.mp3`,
                    contextInfo
                }, { quoted: m });

                // Cleanup temp file
                try { fs.unlinkSync(audioPath); } catch (e) { }

                await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
            } catch (err) {
                console.error('[DL_EXTRACT_ERR]', err);
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                await m.reply('❌ Failed to extract audio. Try downloading the audio option instead.');
            }
            return;
        }

        // Handle audio selection
        if (subCommand === 'audio' && parts[1] !== undefined) {
            const idx = parseInt(parts[1]);
            if (!dlCache?.result) return m.reply('⚠️ No media found. Please search again.');
            const audios = dlCache.result.audios || [];
            if (idx >= audios.length) return m.reply('❌ Invalid audio selection.');

            await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
            const selected = audios[idx];
            await sendMediaFile(sock, m.from, selected.url, 'audio', dlCache.result.title, dlCache.result.author, dlCache.result.source, m);
            await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
            return;
        }

        // Handle photo selection
        if (subCommand === 'photo' && parts[1] !== undefined) {
            if (!dlCache?.result) return m.reply('⚠️ No media found. Please search again.');
            const photos = dlCache.result.photos || [];

            await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

            if (parts[1] === 'all') {
                for (const p of photos) {
                    const photoUrl = p.url || p;
                    await sock.sendMessage(m.from, { image: { url: photoUrl } });
                }
            } else {
                const idx = parseInt(parts[1]);
                if (idx >= photos.length || isNaN(idx)) return m.reply('❌ Invalid photo selection.');
                const selected = photos[idx];
                const photoUrl = selected.url || selected;
                await sendMediaFile(sock, m.from, photoUrl, 'photo', dlCache.result.title, dlCache.result.author, dlCache.result.source, m);
            }

            await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
            return;
        }

        // Handle download all
        if (subCommand === 'all') {
            if (!dlCache?.result) return m.reply('⚠️ No media found. Please search again.');
            const result = dlCache.result;
            const videos = result.videos || [];
            const audios = result.audios || [];
            const photos = result.photos || [];

            await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

            let sent = 0;
            for (const v of videos) {
                if (await sendMediaFile(sock, m.from, v.url, 'video', result.title, result.author, result.source, m)) sent++;
            }
            for (const a of audios) {
                if (await sendMediaFile(sock, m.from, a.url, 'audio', result.title, result.author, result.source, m)) sent++;
            }
            for (const p of photos) {
                const photoUrl = p.url || p;
                try {
                    await sock.sendMessage(m.from, { image: { url: photoUrl } });
                    sent++;
                } catch (e) {
                    console.error('[DL_PHOTO_SEND_ERR]', e);
                }
            }

            if (sent === 0) {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                await m.reply('❌ Failed to send any media.');
            } else {
                await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                await m.reply(`✅ Sent ${sent} media files.`);
            }
            return;
        }

        // Regular download - fetch media info
        const urlMatch = query.match(/(https?:\/\/[^\s]+)/i);
        if (!urlMatch) return m.reply('❌ Invalid URL. Please provide a valid URL.');

        const url = urlMatch[0];

        await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        try {
            const apiUrl = `https://api.omegatech.app/api/download/All-downloader-v2?action=download&url=${encodeURIComponent(url)}`;
            const { data } = await axios.get(apiUrl, { timeout: 60000 });

            if (!data.success) {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                return m.reply(res.error);
            }

            const result = data.data;
            const videos = result.videos || [];
            const audios = result.audios || [];
            const photos = result.photos || [];

            if (videos.length === 0 && audios.length === 0 && photos.length === 0) {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                let content = `*MEDIA DOWNLOADER*\n`;
                content += `> *Title:* ${result.title || 'Untitled'}\n`;
                content += `> *Author:* ${result.author || 'Unknown'}\n`;
                content += `> *Source:* ${result.source || 'Unknown'}\n`;
                content += `> *Duration:* ${result.duration || 'N/A'}\n\n`;
                content += `💡 No downloadable media found in this link.`;
                return m.reply(content);
            }

            // Show interactive selection
            await sendInteractiveMedia(sock, m.from, result, m.sender, [m.sender]);
            await sock.sendMessage(m.from, { react: { text: '', key: m.key } });

        } catch (err) {
            console.error('[DL_ERR]', err);
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await m.reply(res.error);
        }
    }
};
