/**
 * plugins/download/tiktok.js
 * Downloader TikTok (Universal Chat Style & Auto-Clear React)
 */

import { exec } from 'child_process';
import util from 'util';
import * as cheerio from 'cheerio';
import { config } from '../../config.js';

const execPromise = util.promisify(exec);

import axios from 'axios';
import { res } from '../../lib/response.js';


async function savetikScrape(url) {
    try {
        const res = await axios.get(`https://api.zellrayy.com/download/tiktok?url=${encodeURIComponent(url)}`);
        const result = res.data?.result;
        if (!result) return null;

        return {
            title: result.title || 'TikTok Content',
            links: result.images && result.images.length > 0
                ? result.images.map(img => ({ text: 'photo', link: img }))
                : [
                    { text: 'hd', link: result.hdplay || result.play },
                    { text: 'sd', link: result.play }
                ].filter(l => l.link)
        };
    } catch (e) {
        console.error('ZellRayy Scrape Error:', e.message);
        return null;
    }
}

export default {
    cmd: ['tiktok', 'tt', 'ttdl'],
    category: 'download',
    desc: 'Download TikTok Video / Photo Slideshow',
    exec: async (m, { sock, query, command }) => {
        if (!query) {
            return m.reply(res.format(m.prefix, command, `https://vt.tiktok.com/...`));
        }
        if (!query.match(/tiktok\.com/gi)) {
            return m.reply('Link tidak valid!');
        }

        await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        try {
            const data = await savetikScrape(query);
            
            if (!data || data.links.length === 0) {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                return m.reply(res.error);
            }

            let capt = `*TIKTOK DOWNLOADER*\n`;
            capt += `> ${data.title}`;

            const photoLinks = data.links.filter(l => l.text.toLowerCase().includes('photo'));

            if (photoLinks.length > 0) {
                await m.reply(`${capt}\n\n_Mengirim berkas slideshow (${photoLinks.length} foto)..._`);
                
                for (let photo of photoLinks) {
                    await sock.sendMessage(m.from, { 
                        image: { url: photo.link },
                        caption: ''
                    }, { quoted: m });
                }
            } else {
                const videoUrl = data.links.find(l => l.text.toLowerCase().includes('hd'))?.link || data.links[0].link;
                
                await sock.sendMessage(m.from, {
                    video: { url: videoUrl },
                    caption: capt,
                    mimetype: 'video/mp4'
                }, { quoted: m });
            }

            await sock.sendMessage(m.from, { react: { text: '', key: m.key } });

        } catch (err) {
            console.error('[TIKTOK_DL_ERR]', err);
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await m.reply(res.error);
        }
    }
};