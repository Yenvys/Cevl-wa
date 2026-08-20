/**
 * plugins/search/wikipedia.js
 * Mencari artikel ringkasan informasi via Wikipedia Indonesia (Universal Chat Style)
 */

import fetch from 'node-fetch';
import { res } from '../src/response.js';


export default {
    cmd: ['wiki', 'wikipedia'],
    category: 'search',
    desc: 'Mencari artikel penjelasan ensiklopedia di platform Wikipedia Indonesia.',
    exec: async (m, { sock, query, command }) => {
        if (!query) return m.reply(res.format(m.prefix, command, `<kata_kunci_pencarian>`));

        try {
            await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

            const searchUrl = `https://id.wikipedia.org/w/api.php?action=opensearch&format=json&search=${encodeURIComponent(query)}&limit=1`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();

            if (!searchData[1] || searchData[1].length === 0) {
                await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
                return m.reply(`_Pencarian gagal! Topik mengenai "${query}" tidak ditemukan di Wikipedia._`);
            }

            const title = searchData[1][0];

            const url = `https://id.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|pageimages&exintro&explaintext&exsentences=5&pithumbsize=1000&titles=${encodeURIComponent(title)}`;
            
            const response = await fetch(url);
            const data = await response.json();
            const pages = data.query.pages;
            const result = pages[Object.keys(pages)[0]];

            const thumb = result.thumbnail ? result.thumbnail.source : null;
            const articleUrl = `https://id.wikipedia.org/wiki/${encodeURIComponent(title)}`;
            
            let teks = `『 *WIKIPEDIA* 』\n\n`;
            teks += `📌 ${result.title}\n`;
            teks += `${result.extract || 'Tidak ada ringkasan teks deskripsi yang tersedia untuk entri ini.'}\n\n`;
            teks += `🔗 *Tautan Artikel:* ${articleUrl}`;

            if (thumb) {
                await sock.sendMessage(m.from, { 
                    image: { url: thumb }, 
                    caption: teks 
                }, { quoted: m });
            } else {
                await m.reply(teks);
            }

            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });

        } catch (e) {
            console.error('[WIKI_SINOPSIS_ERR]', e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(`_Terjadi kendala teknis saat memproses penarikan data ensiklopedia._`);
        }
    }
};