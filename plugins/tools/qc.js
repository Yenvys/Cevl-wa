/**
 * plugins/tools/qc.js
 * Quote Chat Generator using Local Puppeteer Rendering
 */

import axios from 'axios';
import { res } from '../../lib/response.js';
import db from '../../lib/database.js';

export default {
    cmd: ['qc', 'quote'],
    category: 'tools',
    desc: 'Membuat stiker Quote Chat bergaya WhatsApp (Tanpa API Eksternal)',
    
    exec: async (m, { sock, args }) => {
        const target = m.quoted ? m.quoted : m;
        
        let text = args.join(' ');
        if (!text && m.quoted) {
            text = m.quoted.text || m.quoted.body || m.quoted.query || '';
        }
        
        const isImage = target.type === 'imageMessage' || (target.mimetype && target.mimetype.startsWith('image/'));
        
        if (!text && !isImage) {
            return m.reply('_Kirim/Reply pesan (teks atau gambar) yang ingin dijadikan QC._');
        }

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        try {
            // Get Target Info
            const jid = target.sender;
            let name = target.pushName;
            
            if (!name) {
                const contact = db.prepare('SELECT pushname FROM contacts WHERE jid = ?').get(jid);
                name = (contact && contact.pushname && contact.pushname !== 'null') ? contact.pushname : jid.split('@')[0];
            }

            const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

            // Download quoted/attached image if available
            let contentImgHtml = '';
            if (isImage && target.download) {
                try {
                    const imgBuffer = await target.download();
                    if (imgBuffer) {
                        const mime = target.mimetype || 'image/jpeg';
                        const contentBase64 = `data:${mime};base64,${imgBuffer.toString('base64')}`;
                        contentImgHtml = `<img src="${contentBase64}" style="width: 100%; max-height: 250px; border-radius: 8px; margin-bottom: 5px; object-fit: cover; display: block;" />`;
                    }
                } catch (err) {
                    console.log('[QC_IMG_ERR]', err.message);
                }
            }

            // Get Profile Picture
            let avatarUrl;
            try {
                avatarUrl = await sock.profilePictureUrl(jid, 'image');
            } catch (e) {
                // Fallback default avatar
                avatarUrl = 'https://i.ibb.co/30Z3b14/profile.jpg';
            }

            // Download image to base64
            const { data: avatarBuffer } = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
            const avatarBase64 = `data:image/jpeg;base64,${Buffer.from(avatarBuffer).toString('base64')}`;

            // HTML Template
            const html = `
            <html>
                <head>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
                        body { 
                            font-family: 'Roboto', sans-serif; 
                            background: transparent; 
                            padding: 20px; 
                            display: inline-block; 
                            margin: 0; 
                        }
                        .container { 
                            display: flex; 
                            align-items: flex-start; 
                            max-width: 500px; 
                            padding: 10px; 
                        }
                        .avatar { 
                            width: 40px; 
                            height: 40px; 
                            border-radius: 50%; 
                            object-fit: cover; 
                            margin-right: 12px; 
                            margin-top: 2px;
                        }
                        .bubble { 
                            background-color: #202c33; 
                            color: #e9edef; 
                            padding: 6px 10px 8px 10px; 
                            border-radius: 0 12px 12px 12px; 
                            position: relative; 
                            max-width: 320px; 
                            display: flex; 
                            flex-direction: column; 
                            box-shadow: 0 1px 1px rgba(0,0,0,0.1);
                        }
                        .tail { 
                            position: absolute; 
                            left: -8px; 
                            top: 0; 
                            width: 0; 
                            height: 0; 
                            border-top: 12px solid #202c33; 
                            border-left: 10px solid transparent; 
                        }
                        .name { 
                            color: #53bdeb; 
                            font-size: 13px; 
                            font-weight: 500; 
                            margin-bottom: 2px; 
                        }
                        .text { 
                            font-size: 14.5px; 
                            line-height: 1.35; 
                            word-wrap: break-word; 
                            white-space: pre-wrap; 
                            margin-bottom: 2px; 
                        }
                        .time { 
                            font-size: 10.5px; 
                            color: #8696a0; 
                            align-self: flex-end; 
                            margin-left: 15px; 
                            margin-top: -5px; 
                        }
                    </style>
                </head>
                <body>
                    <div class="container" id="qc-container">
                        <img class="avatar" src="${avatarBase64}" />
                        <div class="bubble">
                            <div class="tail"></div>
                            <div class="name">${name.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
                            ${contentImgHtml}
                            ${text ? `<div class="text">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>` : ''}
                            <div class="time">${time}</div>
                        </div>
                    </div>
                </body>
            </html>`;

            // Import puppeteer dynamically
            const puppeteer = (await import('puppeteer')).default;

            const browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
            });
            const page = await browser.newPage();

            try {
                await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 4 });
                await page.setContent(html, { waitUntil: 'networkidle0' });
                const element = await page.$('#qc-container');
                const screenshotBuffer = await element.screenshot({ omitBackground: true });
                
                await sock.sendSticker(m.from, screenshotBuffer, m);
                await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
            } finally {
                await browser.close();
            }

        } catch (err) {
            console.error('[QC_ERROR]', err);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            return m.reply(`_Gagal memproses QC:_ ${err.message}`);
        }
    }
};
