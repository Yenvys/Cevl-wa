/**
 * plugins/download/instagram.js
 * Downloader Instagram (Universal Chat Style & Auto-Clear React)
 */

import axios from 'axios';
import { config } from '../../config.js';
import { res } from '../../src/response.js';


async function cloudHostIG(url) {
    try {
        const res = await axios.get(`https://api.vreden.web.id/api/igdl?url=${encodeURIComponent(url)}`);
        if (res.data && res.data.result) {
           let medias = [];
           if (Array.isArray(res.data.result)) {
               medias = res.data.result.map(m => ({ url: m.url || m, type: (m.url || m).includes('.mp4') ? 'video' : 'image' }));
           } else {
               medias = [{ url: res.data.result, type: res.data.result.includes('.mp4') ? 'video' : 'image' }];
           }
           return {
               medias: medias.filter(m => typeof m.url === 'string' && m.url.startsWith('http')),
               caption: 'Instagram Downloader',
               user: 'user',
               isVideo: false
           };
        }
    } catch(e) {}

    try {
        const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(url)}`);
        if (res.data && res.data.data) {
           let medias = [];
           if (Array.isArray(res.data.data)) {
               medias = res.data.data.map(m => ({ url: m.url || m, type: (m.url || m).includes('.mp4') ? 'video' : 'image' }));
           }
           return {
               medias: medias.filter(m => typeof m.url === 'string' && m.url.startsWith('http')),
               caption: 'Instagram Downloader',
               user: 'user',
               isVideo: false
           };
        }
    } catch (e) {}

    return null;
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