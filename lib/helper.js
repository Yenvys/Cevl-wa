/**
 * lib/helper.js
 * Core System Media & Socket Wrapper for Yenvy Bot Engine
 */
// FORMAT SUCI ES6 IMPORT SESUAI DOKUMENTASI RESMI BAILEYS 2026
import {
    generateMessageID,
    generateWAMessage,
    generateWAMessageFromContent,
    prepareWAMessageMedia,
    proto,
    downloadMediaMessage,
} from 'baileys';

import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
import WebP from 'node-webpmux';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough, Readable } from 'stream';
import { tmpdir } from 'os';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import pino from 'pino';

const customTemp = path.join(process.cwd(), 'data', 'tmp');
if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });

export const groupCache = new Map();

export const store = {
    messages: new Map(),
    isDirty: false,
    limit: 2000,
    bind(ev) {
        ev.on('messages.upsert', ({ messages, type }) => {
            if (type !== 'notify' && type !== 'append') return;
            let added = false;
            for (const msg of messages) {
                if (!msg.key?.id || !msg.message) continue;
                this.messages.set(msg.key.id, msg.message);
                added = true;
            }
            if (added) {
                this.isDirty = true;
                this._cleanOldMessages();
            }
        });

        ev.on('messages.update', (updates) => {
            let updated = false;
            for (const update of updates) {
                if (!update.key?.id || !update.message) continue;
                if (this.messages.has(update.key.id)) {
                    this.messages.set(update.key.id, {
                        ...this.messages.get(update.key.id),
                        ...update.message
                    });
                    updated = true;
                }
            }
            if (updated) {
                this.isDirty = true;
            }
        });
    },

    _cleanOldMessages() {
        if (this.messages.size > this.limit) {
            const keysToDelete = Array.from(this.messages.keys()).slice(0, this.messages.size - this.limit);
            for (const key of keysToDelete) {
                this.messages.delete(key);
            }
        }
    },

    async writeToFile(filePath) {
        if (!this.isDirty) return;
        this.isDirty = false;
        try {
            const obj = Object.fromEntries(this.messages);
            await fs.promises.writeFile(filePath, JSON.stringify(obj));
        } catch (e) {
            this.isDirty = true;
            throw e;
        }
    },

    writeToFileSync(filePath) {
        if (!this.isDirty) return;
        const obj = Object.fromEntries(this.messages);
        fs.writeFileSync(filePath, JSON.stringify(obj));
        this.isDirty = false;
    },

    readFromFile(filePath) {
        try {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            for (const [id, msg] of Object.entries(raw)) {
                this.messages.set(id, msg);
            }
            this._cleanOldMessages();
        } catch (e) {}
    }
};

export const getMessageFromStoreById = (id) => {
    if (!id) return null;
    return store.messages.get(id) || null;
};


// ==========================================
// AUDIO PROCESSING HELPERS
// ==========================================

export const convertToOpus = (input) => {
    return new Promise((resolve, reject) => {
        const output = new PassThrough();
        const buffers = [];
        const source = Buffer.isBuffer(input) ? Readable.from(input) : input;

        ffmpeg(source)
            .audioCodec('libopus')
            .audioChannels(1)
            .audioFrequency(16000)
            .toFormat('opus')
            .addOutputOptions(['-avoid_negative_ts make_zero', '-map_metadata -1'])
            .on('error', reject)
            .pipe(output);

        output.on('data', (chunk) => buffers.push(chunk));
        output.on('end', () => resolve(Buffer.concat(buffers)));
    });
};

export const toMp3 = (input, output, bitrate = 128) => {
    return new Promise((res, rej) => {
        ffmpeg(input)
            .noVideo()
            .audioCodec('libmp3lame')
            .audioBitrate(bitrate)
            .format('mp3')
            .on('end', res)
            .on('error', rej)
            .save(output);
    });
};

// ==========================================
// STICKER ENGINE (BRAT & UNIVERSAL WEBPMUX)
// ==========================================

export const convertToStickerWebp = (inputFile, isVideo = false) => {
    return new Promise((resolve, reject) => {
        const randomId = crypto.randomBytes(4).toString('hex');
        const outputFile = path.join(tmpdir(), `yenvy_canvas_sticker_${randomId}.webp`);
        
        let command = `"${ffmpegInstaller.path}" -i "${inputFile}" -vcodec libwebp -vf "scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -y "${outputFile}"`;
        
        if (isVideo) {
            command = `"${ffmpegInstaller.path}" -i "${inputFile}" -vcodec libwebp -vf "scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -loop 0 -preset default -fps_mode cfr -r 15 -t 5 -y "${outputFile}"`;
        }

        exec(command, (err) => {
            if (err) return reject(err);
            resolve(outputFile);
        });
    });
};

export const stickerToImage = async (buf) => {
    const sharp = (await import('sharp')).default;
    return sharp(buf)
        .trim()
        .png()
        .toBuffer(); 
};

// ==========================================
// SYSTEM MISC MEDIA UTILITIES
// ==========================================

export const getMedia = async (m, sock) => {
    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || '';
    const buffer = await q.download?.() || (sock ? await downloadMediaMessage(q, 'buffer').catch(() => null) : null);
    return { mime, buffer };
};

export const createTemp = (ext) => path.join(tmpdir(), `yenvy_${Date.now()}.${ext}`);

export const cleanup = (...files) => files.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));

export const toGif = (input, output) => new Promise((res, rej) => {
    ffmpeg(input)
        .outputOptions([
            '-vf', 'scale=480:-1:flags=lanczos,fps=12',
            '-loop', '0',
            '-t', '10',
            '-pix_fmt', 'yuv420p'
        ])
        .toFormat('mp4')
        .on('end', () => res())
        .on('error', rej)
        .save(output);
});

export const convertToMp4 = async (input) => {
    const tmpIn = path.join(customTemp, `vid_in_${Date.now()}.webm`);
    const tmpOut = path.join(customTemp, `vid_out_${Date.now()}.mp4`);

    try {
        if (Buffer.isBuffer(input)) {
            fs.writeFileSync(tmpIn, input);
        } else {
            const buffer = await new Promise((res, rej) => {
                const chunks = [];
                input.on('data', c => chunks.push(c));
                input.on('end', () => res(Buffer.concat(chunks)));
                input.on('error', rej);
            });
            fs.writeFileSync(tmpIn, buffer);
        }

        return await new Promise((resolve, reject) => {
            ffmpeg(tmpIn)
                .outputOptions([
                    '-vcodec libx264',
                    '-pix_fmt yuv420p',
                    '-preset ultrafast',
                    '-movflags +faststart',
                    '-acodec aac'
                ])
                .toFormat('mp4')
                .on('error', (err) => {
                    cleanup(tmpIn, tmpOut);
                    reject(err);
                })
                .on('end', () => {
                    const result = fs.readFileSync(tmpOut);
                    cleanup(tmpIn, tmpOut);
                    resolve(result);
                })
                .save(tmpOut);
        });
    } catch (e) {
        cleanup(tmpIn, tmpOut);
        throw e;
    }
};

// ==========================================
// CORE SOCKET COUPLING WRAPPER (MAIN EXTENSION)
// ==========================================

export default async function wrapSocket(sock) {
    // Ikat event socket ke store agar otomatis mencatat seluruh traffic pesan masuk/keluar
    store.bind(sock.ev);

    const oldSendMessage = sock.sendMessage;
    sock.generateMessageID = generateMessageID;

    // OVERRIDE SENDMESSAGE WITH EXPIRED MANAGER
    sock.sendMessage = async (jid, content, options = {}) => {
        if (!jid || !content) return;
        if (!content.contextInfo) content.contextInfo = {};

        if (typeof jid === 'string' && jid.endsWith('@g.us')) {
            const duration = groupCache.get(jid);
            if (duration) content.contextInfo.expiration = duration;
        }
        return await oldSendMessage.call(sock, jid, content, options);
    };

    // QUICK MEDIA SHORTCUT SENDERS
    sock.sendImage = (jid, p, cap = '', q = '', opts = {}) => 
        sock.sendMessage(jid, { image: Buffer.isBuffer(p) ? p : { url: p }, caption: cap, ...opts }, { quoted: q });

    sock.sendVideo = (jid, p, cap = '', q = '', gif = false, opts = {}) => 
        sock.sendMessage(jid, { video: Buffer.isBuffer(p) ? p : { url: p }, caption: cap, gifPlayback: gif, ...opts }, { quoted: q });

    sock.sendAudio = async (jid, p, ptt = false, q = '', opts = {}) => {
        const src = Buffer.isBuffer(p) ? p : { url: p };
        const buffer = ptt ? await convertToOpus(Buffer.isBuffer(p) ? p : p) : src;
        return sock.sendMessage(jid, { 
            audio: buffer, 
            ptt, 
            mimetype: ptt ? 'audio/ogg; codecs=opus' : 'audio/mpeg', 
            ...opts 
        }, { quoted: q });
    };

    // CORE STICKER GENERATOR (WITH ANIMATION SAFE-PARSING)
    sock.sendSticker = async (jid, buffer, quoted = '', options = {}) => {
        const { packname = ':3', isAnimated = false } = options;
        const tmpIn = path.join(tmpdir(), `yenvy_in_${Date.now()}.${isAnimated ? 'mp4' : 'jpg'}`);
        const tmpOut = path.join(tmpdir(), `yenvy_out_${Date.now()}.webp`);

        fs.writeFileSync(tmpIn, buffer);

        return new Promise((resolve, reject) => {
            const ff = ffmpeg(tmpIn)
                .on('error', (e) => {
                    cleanup(tmpIn, tmpOut);
                    reject(e);
                })
                .on('end', async () => {
                    try {
                        const img = new WebP.Image();
                        await img.load(fs.readFileSync(tmpOut));
                        const json = { "sticker-pack-id": `yenvy-${Date.now()}`, "sticker-pack-name": packname };
                        const exifHeader = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
                        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
                        const exif = Buffer.concat([exifHeader, jsonBuffer]);
                        exif.writeUIntLE(jsonBuffer.length, 14, 4);
                        img.exif = exif;
                        
                        const final = await img.save(null);
                        const res = await sock.sendMessage(jid, { sticker: final, ...options }, { quoted });
                        cleanup(tmpIn, tmpOut);
                        resolve(res);
                    } catch (e) { 
                        cleanup(tmpIn, tmpOut); 
                        reject(e); 
                    }
                });

            const ffOpts = [
                "-vcodec", "libwebp",
                "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba",
                "-lossless", "1",
                "-loop", "0",
                "-an"
            ];
            
            if (isAnimated) {
                ffOpts.push("-preset", "default", "-t", "00:00:10", "-fps_mode", "cfr", "-r", "15", "-qscale", "20");
            }
            
            ff.addOutputOptions(ffOpts).toFormat('webp').save(tmpOut);
        });
    };

    return sock;
}

// ==========================================
// FEATURE SPECIFIC RENDERERS (CAROUSEL Engine)
// ==========================================

export async function buildCarouselMessage(sock, jid, pins, title = 'Pinterest') {
    const cards = [];

    for (let i = 0; i < pins.length; i++) {
        try {
            const res = await fetch(pins[i].image);
            if (!res.ok) continue;

            const buffer = Buffer.from(await res.arrayBuffer());
            const sharp = (await import('sharp')).default;
            const finalBuffer = await sharp(buffer).jpeg({ quality: 80 }).toBuffer();

            const media = await prepareWAMessageMedia(
                { image: finalBuffer },
                { upload: sock.waUploadToServer }
            );

            cards.push({
                header: {
                    title: `Result ${i + 1}/${pins.length}`,
                    hasMediaAttachment: true,
                    ...media
                },
                body: { text: `Pinterest Image: ${title}` },
                footer: { text: 'Pinterest search' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "Source",
                                url: pins[i].link,
                                merchant_url: pins[i].link
                            })
                        }
                    ]
                }
            });
        } catch (err) {
            console.log('[Pinterest] Skip image:', err.message);
        }
    }

    if (!cards.length) throw new Error('Semua gambar gagal diproses');
    
    return generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: { text: `*PINTEREST SEARCH*\nResults for: ${title}` },
                    footer: { text: 'Swipe to see more' },
                    carouselMessage: { cards },
                    contextInfo: {
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363200000000000@newsletter',
                            newsletterName: 'Pinterest',
                            serverMessageId: 1
                        }
                    }
                }
            }
        }
    }, { userJid: sock.user.id });
}

export function pickRandomPins(pins, total = 5) {
    const shuffled = [...pins].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, total);
}

// ==========================================
// MULTI-CONTACT CARD GENERATOR (CONTACTS ARRAY)
// ==========================================

export const sendMultiContact = async (sock, jid, contactList = [], quoted = '') => {
    try {
        const displayName = contactList.length > 0 ? contactList[0].name : "Contacts";
        const processedContacts = [];

        for (const person of contactList) {
            const cleanNumber = person.number.replace(/[^0-9]/g, '');
            
            const vcardData = 
                'BEGIN:VCARD\n' +
                'VERSION:3.0\n' +
                `FN:${person.name}\n` +
                `ORG:Bot Owner;\n` +
                `TEL;type=CELL;type=VOICE;waid=${cleanNumber}:+${cleanNumber}\n` +
                'END:VCARD';

            processedContacts.push({
                vcard: vcardData
            });
        }

        return await sock.sendMessage(jid, {
            contacts: {
                displayName: `${displayName} and others`,
                contacts: processedContacts
            }
        }, { quoted });

    } catch (err) {
        console.error('\x1b[1;31m[MULTI-CONTACT SENDER ERROR]\x1b[0m', err);
        const lines = contactList.map(c => `• *${c.name}:* https://wa.me/${c.number.replace(/[^0-9]/g, '')}`);
        return await sock.sendMessage(jid, { text: `*LIST OWNER/DEVELOPER*\n\n${lines.join('\n')}` }, { quoted });
    }
};