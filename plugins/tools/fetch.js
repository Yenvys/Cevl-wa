/**
 * plugins/tools/fetch.js
 * Mengambil data atau mengunduh media secara langsung dari URL (Universal Chat Style)
 */

import fetch from 'node-fetch';
import path from 'node:path';
import fs from 'node:fs';
import { convertToMp4 } from '../src/helper.js';
import { res } from '../src/response.js';


export default {
    cmd: ['fetch', 'get'],
    category: 'tools',
    desc: 'Ambil data atau unduh media dari URL secara otomatis berdasarkan tipe konten.',
    exec: async (m, { sock, query, command }) => {
        if (!query) return m.reply(res.format(m.prefix, command, `<url_target>`));
        if (!/^https?:\/\//.test(query)) return m.reply(res.format(m.prefix, command, `https://...`));

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        try {
            const res = await fetch(query);
            const contentType = res.headers.get('content-type');
            
            if (/image/.test(contentType)) {
                await sock.sendMessage(m.from, { 
                    image: { url: query }, 
                    caption: `*Sumber:* ${query}` 
                }, { quoted: m });
                return await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
            }

            if (/video/.test(contentType)) {
                const arrayBuffer = await res.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const mp4Buffer = await convertToMp4(buffer);
                
                await sock.sendMessage(m.from, { 
                    video: mp4Buffer, 
                    caption: `*Sumber:* ${query}`,
                    mimetype: 'video/mp4',
                    fileName: 'video.mp4'
                }, { quoted: m });
                return await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
            }

            if (/audio/.test(contentType)) {
                await sock.sendMessage(m.from, { 
                    audio: { url: query }, 
                    mimetype: 'audio/mp4' 
                }, { quoted: m });
                return await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
            }

            if (/pdf|zip|msword/.test(contentType)) {
                await sock.sendMessage(m.from, { 
                    document: { url: query }, 
                    fileName: query.split('/').pop() || 'document',
                    mimetype: contentType 
                }, { quoted: m });
                return await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
            }

            let txt = await res.buffer();
            try {
                txt = JSON.stringify(JSON.parse(txt.toString()), null, 2);
            } catch {
                txt = txt.toString();
            }

            if (txt.length > 4000) {
                const fileName = `result_${Date.now()}.html`;
                const filePath = path.join(process.cwd(), 'data', 'tmp', fileName);
                
                if (!fs.existsSync(dirname(filePath))) fs.mkdirSync(dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, txt);

                await sock.sendMessage(m.from, { 
                    document: { url: filePath }, 
                    mimetype: 'text/html',
                    fileName: fileName,
                    caption: '_Hasil luaran data terlalu panjang, silakan baca melalui file._' 
                }, { quoted: m });

                setTimeout(() => {
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }, 5000);
            } else {
                await m.reply(txt);
            }

            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });

        } catch (e) {
            console.error('[FETCH_ERR]', e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
        }
    }
};