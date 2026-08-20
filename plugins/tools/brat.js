/**
 * plugins/brat.js
 * Fitur pembuat stiker BRAT (Gambar Diem) & BRATV (Video Bergerak / Kinetic Lyrics)
 * Menggunakan engine brat-canvas & brat-canvas/video + Helper Core Library
 */

import { bratGen } from 'brat-canvas';
import { bratVid } from 'brat-canvas/video';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { tmpdir } from 'os';
import { convertToStickerWebp, cleanup } from '../src/helper.js';
import { res } from '../src/response.js';


export default {
    cmd: ['brat', 'bratv'],
    category: 'tools',
    desc: 'Membuat stiker teks ala Brat Album. .brat untuk gambar statis, .bratv untuk video lirik bergerak.',
    
    exec: async (m, { sock, query, command }) => {
        if (!query) {
            return m.reply(res.format(m.prefix, command, `tes tes\n\n_Gunakan *.bratv* untuk versi video lirik bergerak_`));
        }

        const isVideoMode = command.toLowerCase() === 'bratv';
        const randomId = crypto.randomBytes(4).toString('hex');
        
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        try {
            if (isVideoMode) {
                // =========================================================
                // GENERATE BRAT VERSION VIDEO (.bratv)
                // =========================================================
                const tempMp4 = path.join(tmpdir(), `brat_raw_${randomId}.mp4`);
                
                const videoBuffer = await bratVid(query, {
                    outputFormat: "mp4",
                    fast_progress: true,
                    lyric: {
                        maxWordPerLayer: 5,
                        frameDuration: 0.6,
                        lastFrameDuration: 1.2
                    },
                    brat: { BLUR: 0 }
                });

                fs.writeFileSync(tempMp4, videoBuffer);

                const finalStickerPath = await convertToStickerWebp(tempMp4, true);
                await sock.sendMessage(m.from, { 
                    sticker: fs.readFileSync(finalStickerPath) 
                }, { quoted: m });

                cleanup(tempMp4, finalStickerPath);

            } else {
                // =========================================================
                // GENERATE BRAT VERSION IMAGE (.brat)
                // =========================================================
                const tempPng = path.join(tmpdir(), `brat_raw_${randomId}.png`);
                const imgBuffer = await bratGen(query, { BLUR: 0 });
                fs.writeFileSync(tempPng, imgBuffer);

                const finalStickerPath = await convertToStickerWebp(tempPng, false);
                await sock.sendMessage(m.from, { 
                    sticker: fs.readFileSync(finalStickerPath) 
                }, { quoted: m });

                cleanup(tempPng, finalStickerPath);
            }

            await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });

        } catch (err) {
            console.error('[BRAT_GEN_ERR]', err);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
        }
    }
};