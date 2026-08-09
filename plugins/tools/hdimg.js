/**
 * plugins/tools/upscale.js
 * Meningkatkan resolusi kualitas gambar (Upscaling HD) via API iLoveIMG (Universal Chat Style)
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import FormData from 'form-data';
import { res } from '../../lib/response.js';


/**
 * Mengambil parameter token otentikasi serta token csrf dari sesi iLoveIMG
 */
async function getToken() {
    try {
        const { data } = await axios.get('https://www.iloveimg.com/upscale-image');
        const $ = cheerio.load(data);
        const script = $('script:contains("ilovepdfConfig =")').html();
        const configJson = JSON.parse(script.split('ilovepdfConfig =')[1].split(';')[0]);
        const csrf = $('meta[name="csrf-token"]').attr('content');
        return { token: configJson.token, csrf };
    } catch (err) {
        throw new Error('Gagal mengekstraksi token otentikasi dari iLoveIMG.');
    }
}

/**
 * Mengunggah gambar ke salah satu sub-server API iLoveIMG
 */
async function uploader(server, headers, buffer) {
    const form = new FormData();
    form.append('name', 'hd.jpg');
    form.append('chunk', '0');
    form.append('chunks', '1');
    form.append('task', 'r68zl88mq72xq94j2d5p66bn2z9lrbx20njsbw2qsAvgmzr11lvfhAx9kl87pp6yqgx7c8vg7sfbqnrr42qb16v0gj8jl5s0kq1kgp26mdyjjspd8c5A2wk8b4Adbm6vf5tpwbqlqdr8A9tfn7vbqvy28ylphlxdl379psxpd8r70nzs3sk1');
    form.append('preview', '1');
    form.append('file', buffer, { filename: 'hd.jpg', contentType: 'image/jpeg' });

    const { data } = await axios.post(`https://${server}.iloveimg.com/v1/upload`, form, { 
        headers: { ...headers, ...form.getHeaders() } 
    });
    return data;
}

/**
 * Memproses upscaling resolusi gambar menggunakan skala pengali tertentu
 */
async function upscaleImage(buffer, scale = 2) {
    const { token, csrf } = await getToken();
    const servers = ['api1g', 'api2g', 'api3g', 'api8g'];
    const server = servers[Math.floor(Math.random() * servers.length)];
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://www.iloveimg.com/',
        'Cookie': `_csrf=${csrf}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    const upload = await uploader(server, headers, buffer);

    const form = new FormData();
    form.append('task', 'r68zl88mq72xq94j2d5p66bn2z9lrbx20njsbw2qsAvgmzr11lvfhAx9kl87pp6yqgx7c8vg7sfbqnrr42qb16v0gj8jl5s0kq1kgp26mdyjjspd8c5A2wk8b4Adbm6vf5tpwbqlqdr8A9tfn7vbqvy28ylphlxdl379psxpd8r70nzs3sk1');
    form.append('server_filename', upload.server_filename);
    form.append('scale', scale);

    const res = await axios.post(`https://${server}.iloveimg.com/v1/upscale`, form, {
        headers: { ...headers, ...form.getHeaders() },
        responseType: 'arraybuffer'
    });

    return res.data;
}

export default {
    cmd: ['hd', 'upscale'],
    category: 'tools',
    desc: 'Meningkatkan resolusi serta memperjelas ketajaman kualitas piksel gambar (AI Upscaler).',
    async exec(m, { sock, args, handler }) {
        const log = handler.log;
        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || '';

        if (!/image/.test(mime)) {
            return m.reply("Format salah! Harap reply gambar atau kirim gambar dengan .hd/.hd 2_");
        }

        let scale = args[0] === '2' ? 4 : 2;

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        try {
            const buffer = await q.download();
            if (!buffer) throw new Error("_Gagal mengunduh berkas gambar dari server WhatsApp._");

            log.info(`Processing HD Image: ${m.sender} | Scale: ${scale}x`);

            const result = await upscaleImage(buffer, scale);

            await sock.sendMessage(m.from, { 
                image: result, 
                caption: `*IMAGE UPSCALED* \n\n> *Rasio:* ${scale === 4 ? '4x (400%)' : '2x (200%)'}`
            }, { quoted: m });
            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });

        } catch (e) {
            log.error('HD_EXEC_ERR', e.message);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
        }
    }
};