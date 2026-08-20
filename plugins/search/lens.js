/**
 * plugins/search/googlelens.js
 * Identifikasi dan pencarian visual menggunakan API Google Lens via SerpAPI (Universal Chat Style)
 */

import axios from 'axios';
import FormData from 'form-data';
import { config } from '../../config.js';
import { res } from '../../src/response.js';


/**
 * Mengunggah buffer gambar ke hosting catbox.moe untuk mendapatkan URL publik direct
 */
async function uploadMedia(buffer) {
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', buffer, {
            filename: 'upload.jpg',
            contentType: 'image/jpeg'
        });

        const { data } = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity
        });

        if (!data || !data.startsWith('http')) return null;

        return data;
    } catch (err) {
        console.error('[UPLOAD_LENS_ERROR]', err.message);
        return null;
    }
}

export default {
    cmd: ['lens', 'googlelens'],
    category: 'search',
    desc: 'Melakukan pelacakan atau pencarian kesamaan gambar melalui Google Lens.',
    exec: async (m, { sock, query }) => {
        const quoted = m.quoted ? m.quoted : m;
        const mime = (quoted.msg || quoted).mimetype || '';

        if (!/image/.test(mime)) return m.reply(res.format(m.prefix, command, `[reply/kirim foto]`));

        await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        try {
            const buffer = await quoted.download();

            const imageUrl = await uploadMedia(buffer);
            if (!imageUrl) {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                return m.reply(res.error);
            }

            const serpUrl = `https://serpapi.com/search.json?engine=google_lens&url=${encodeURIComponent(imageUrl)}&api_key=${process.env.SERPAPI_KEY}&hl=id&gl=id`;
            const { data: res } = await axios.get(serpUrl);

            let capt = `『 *GOOGLE LENS RESULTS* 』\n\n`;
            
            let hasResults = false;

            if (res.knowledge_graph && res.knowledge_graph.length > 0) {
                hasResults = true;
                const kg = res.knowledge_graph[0];
                capt += `*🧠 Knowledge Graph*\n`;
                capt += `   ◦ *Title:* ${kg.title || '-'}\n`;
                if (kg.subtitle) capt += `   ◦ *Subtitle:* ${kg.subtitle}\n`;
                capt += `\n`;
            }

            if (res.exact_matches && res.exact_matches.length > 0) {
                hasResults = true;
                capt += `*🎯 Exact Matches*\n`;
                const exactResults = res.exact_matches.slice(0, 3);
                exactResults.forEach((v, i) => {
                    capt += `*${i + 1}. ${v.title || 'Tanpa Judul'}*\n`;
                    capt += `   ◦ *Sumber:* ${v.source || 'Tidak diketahui'}\n`;
                    capt += `   ◦ *Tautan:* ${v.link}\n\n`;
                });
            }

            if (res.visual_matches && res.visual_matches.length > 0) {
                hasResults = true;
                capt += `*🔍 Visual Matches*\n`;
                const results = res.visual_matches.slice(0, 5);
                results.forEach((v, i) => {
                    capt += `*${i + 1}. ${v.title || 'Tanpa Judul'}*\n`;
                    capt += `   ◦ *Sumber:* ${v.source || 'Tidak diketahui'}\n`;
                    capt += `   ◦ *Tautan:* ${v.link}\n\n`;
                });
            }

            if (!hasResults) {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                return m.reply('_Pencarian selesai! Tidak ditemukan hasil yang cocok dengan gambar tersebut._');
            }

            await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
            
            return await m.reply(capt.trim());

        } catch (e) {
            console.error('[GOOGLE_LENS_ERR]', e);
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await m.reply('Terjadi kesalahan sistem internal saat memproses data Google Lens: ' + e.message);
        }
    }
};