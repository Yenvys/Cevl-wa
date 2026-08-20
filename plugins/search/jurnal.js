/**
 * plugins/search/scholar.js
 * Mencari data jurnal dan artikel ilmiah via Google Scholar (Universal Chat Style)
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { res } from '../src/response.js';


export default {
    cmd: ['jurnal', 'gscholar', 'scholar'],
    category: 'search',
    desc: 'Mencari referensi jurnal akademis atau artikel ilmiah di platform Google Scholar.',
    exec: async (m, { sock, query, command }) => {
        if (!query) return m.reply(res.format(m.prefix, command, `<topik_penelitian>\n\nContoh: *${m.prefix}${command}* data driven ui/ux design`));

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        try {
            const searchUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}&hl=id`;
            
            const { data } = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id,en-US;q=0.7,en;q=0.3',
                }
            });

            const $ = cheerio.load(data);
            let results = [];

            $('.gs_r.gs_or.gs_scl').each((i, el) => {
                if (i < 5) { 
                    const title = $(el).find('.gs_rt a').text() || $(el).find('.gs_rt').text();
                    const link = $(el).find('.gs_rt a').attr('href') || '#';
                    const info = $(el).find('.gs_a').text();
                    const desc = $(el).find('.gs_rs').text().replace(/\n/g, ' ');
                    
                    if (title) {
                        results.push({ title, link, info, desc });
                    }
                }
            });

            if (results.length === 0) {
                await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
                return m.reply(res.error);
            }

            let teks = `『 *GOOGLE SCHOLAR RESULTS* 』\n\n`;
            teks += `> *Kata Kunci:* "${query}"\n\n`;

            results.forEach((res, i) => {
                teks += `*${i + 1}. ${res.title}*\n`;
                teks += `   ◦ *Penerbit:* _${res.info}_\n`;
                teks += `   ◦ *Tautan:* ${res.link}\n\n`;
            });

            teks += `_Catatan: Beberapa dokumen mungkin membutuhkan hak akses institusi kampus untuk mengunduh versi teks lengkap (Full PDF)._`;

            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
            return m.reply(teks);

        } catch (e) {
            console.error('[SCHOLAR_ERR]', e.message);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            return m.reply(res.error);
        }
    }
};