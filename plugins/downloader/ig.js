/**
 * plugins/download/instagram.js
 * Downloader Instagram (Universal Chat Style & Auto-Clear React)
 */

import axios from 'axios';
import { config } from '../../config.js';
import { res } from '../../src/response.js';


async function cloudHostIG(url) {
    try {
        const res = await axios.get(`https://api.zellrayy.com/download/instagram?url=${encodeURIComponent(url)}`);
        if (!res.data || res.data.status !== true) return null;
        
        const result = res.data.result;
        
        let medias = [];
        let caption = '';
        
        if (Array.isArray(result)) {
            for (let item of result) {
                if (item.video_url) medias.push({ url: item.video_url, type: 'video' });
                else if (item.image_url) medias.push({ url: item.image_url, type: 'image' });
                else if (item.url) medias.push({ url: item.url, type: item.url.includes('.mp4') ? 'video' : 'image' });
                
                if (item.caption && !caption) caption = item.caption;
            }
        } else if (result.url) {
            const arr = Array.isArray(result.url) ? result.url : [result.url];
            medias = arr.map(u => ({ url: u, type: u.includes('.mp4') ? 'video' : 'image' }));
        } else if (result.media) {
            const arr = Array.isArray(result.media) ? result.media : [result.media];
            medias = arr.map(u => ({ url: u, type: u.includes('.mp4') ? 'video' : 'image' }));
        } else if (result.downloadURL) {
            const arr = Array.isArray(result.downloadURL) ? result.downloadURL : [result.downloadURL];
            medias = arr.map(u => ({ url: u, type: u.includes('.mp4') ? 'video' : 'image' }));
        } else if (typeof result === 'string') {
            medias = [{ url: result, type: result.includes('.mp4') ? 'video' : 'image' }];
        }

        return {
            medias: medias.filter(m => typeof m.url === 'string' && m.url.startsWith('http')),
            caption: caption || result?.title || result?.caption || '',
            user: result?.username || result?.[0]?.username || 'user',
            isVideo: false 
        };
    } catch (e) { 
        return null; 
    }
}

export default {
    cmd: ['ig', 'igdl', 'reels', 'instagram'],
    category: 'download',
    exec: async (m, { sock, query, command }) => {
        if (!query) {
            return m.reply(res.format(m.prefix, command, `https://instagram.com/...`));
        }
        if (!/instagram\.com/i.test(query)) {
            return m.reply('Link tidak valid!');
        }

        await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
        
        const data = await cloudHostIG(query);
        
        if (!data || data.medias.length === 0) {
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            return m.reply(res.error);
        }

        let capt = `*INSTAGRAM DOWNLOADER*\n`;
        capt += `*@${data.user}*\n`;
        capt += `${data.caption}`;

        try {
            if (data.medias.length > 1) {
                const albumMedia = [];
                for (let mediaObj of data.medias) {
                    const finalUrl = mediaObj.url.replace(/\\/g, '');
                    const isVideo = mediaObj.type === 'video';
                    
                    albumMedia.push({
                        [isVideo ? 'video' : 'image']: { url: finalUrl },
                        mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                    });
                }

                await m.reply(capt + `\n\n_Mengirim berkas album (${data.medias.length} media)..._`);

                for (let media of albumMedia) {
                    await sock.sendMessage(m.from, media, { quoted: m });
                }
            } else {
                const mediaObj = data.medias[0];
                const finalUrl = mediaObj.url.replace(/\\/g, '');
                const isVideo = mediaObj.type === 'video';
                
                await sock.sendMessage(m.from, {
                    [isVideo ? 'video' : 'image']: { url: finalUrl },
                    caption: capt,
                    mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                }, { quoted: m });
            }

            await sock.sendMessage(m.from, { react: { text: '', key: m.key } });

        } catch (err) {
            console.error('[IG_DL_ERR]', err);
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await m.reply('Terjadi kesalahan saat memproses pengiriman media.');
        }
    }
};