/**
 * plugins/downloader/hdvid.js
 * Video Enhancer AI Scraper - Baileys Plugin (Simplified Request & Edit Version)
 */

import axios from "axios";
import crypto from "crypto";
import { proto } from "baileys";

const PRODUCT_CODE = '067003';
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
];

// ====================================================================
// UTILS & ENGINE (OPTIMIZED)
// ====================================================================
const randomSerial = () => Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
const pickUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const baseHeaders = (ua) => ({
    'user-agent': ua,
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'origin': 'https://unblurimage.ai',
    'referer': 'https://unblurimage.ai/',
    'product-serial': randomSerial(),
    'product-code': PRODUCT_CODE
});

async function jsonRequest(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    if (!res.ok) throw new Error(`${options?.method || 'GET'} -> ${res.status} ${text.slice(0, 300)}`);
    try { return JSON.parse(text); } catch { return text; }
}

async function pollJob(jobId, headers) {
    const url = `https://api.unwatermark.ai/api/web/unblurimage/v1/video-enhancer/get-job/${jobId}`;
    let delay = 2000;
    while (true) {
        const data = await jsonRequest(url, { headers });
        const r = data?.result;
        if (r?.status === 1 && r?.output_url?.length) return r;
        if (r?.status === 2) throw new Error('Job failed on server side.');
        await sleep(delay);
        delay = Math.min(delay + 500, 4000);
    }
}

async function enhanceVideoEngine(videoBuffer, resolution = '2k') {
    const ua = pickUA();
    const headers = baseHeaders(ua);

    const upForm = new FormData();
    upForm.append('video_file_name', `video_${Date.now()}.mp4`);

    const upRes = await jsonRequest('https://api.unwatermark.ai/api/web/common/upload/video', {
        method: 'POST', headers, body: upForm
    });

    const uploadUrl = upRes.result.url;
    const objectUrl = uploadUrl.split('?')[0];

    const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'user-agent': ua, 'content-type': 'video/mp4', 'referer': 'https://unblurimage.ai/' },
        body: videoBuffer
    });
    if (!putRes.ok) throw new Error(`Upload storage failed: ${putRes.status}`);

    const jobForm = new FormData();
    jobForm.append('original_video_url', objectUrl);
    jobForm.append('resolution', resolution);
    jobForm.append('is_preview', 'false');

    const jobRes = await jsonRequest('https://api.unwatermark.ai/api/web/unblurimage/v1/video-enhancer/create-job', {
        method: 'POST', headers, body: jobForm
    });

    const jobId = jobRes?.result?.job_id;
    if (!jobId) throw new Error(`Failed to inject job: ${JSON.stringify(jobRes)}`);

    const done = await pollJob(jobId, headers);
    const outRes = await fetch(done.output_url[0], { headers: { 'user-agent': ua } });

    return {
        buffer: Buffer.from(await outRes.arrayBuffer()),
        remaining: done.remaining_free_times
    };
}

// ====================================================================
// PLUGINS COMMAND INTERFACE
// ====================================================================
export default {
    cmd: ["hdvid", "hdvi", "hdvideo", "enhancevideo"],
    category: "tools",

    exec: async (m, { sock, args, command }) => {
        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || '';

        if (!/video/.test(mime)) {
            return sock.sendMessage(m.from, {
                text: `_Format salah! Kirim video atau reply video dengan caption perintah *${m.prefix}${command}*._\n\n` +
                    `*Opsi Resolusi Sederhana:*\n` +
                    `• \`${m.prefix}${command}\` (Auto 2K Resolution)\n` +
                    `• \`${m.prefix}${command} 4k\` (Ultra HD 4K Resolution)`
            }, { quoted: m });
        }

        let resolution = "2k";
        const inputParam = args.join(" ").toLowerCase();
        if (inputParam.includes("4k") || inputParam.includes("--4k")) {
            resolution = "4k";
        }

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        const sentLoading = await sock.sendMessage(m.from, {
            text: `_Mengunduh berkas video dan mempersiapkan upscaling ke resolusi *${resolution.toUpperCase()}*..._`
        }, { quoted: m });

        try {
            const mediaBuffer = await q.download?.();
            if (!mediaBuffer) {
                return sock.sendMessage(m.from, { text: "_Gagal mengunduh video dari chat, silakan coba kirim ulang video._", edit: sentLoading.key });
            }

            await sock.sendMessage(m.from, {
                text: `_Sesi terdaftar. Sedang mengunggah biner video dan memproses antrean  [ *${resolution.toUpperCase()}* ]. Proses ini memerlukan waktu beberapa saat..._`,
                edit: sentLoading.key
            });

            const result = await enhanceVideoEngine(mediaBuffer, resolution);

            if (!result?.buffer) throw new Error("Output video kosong atau ditolak oleh server AI.");
            await sock.sendMessage(m.from, {
                video: result.buffer,
                caption: `*Kualitas:* ${resolution.toUpperCase()}\n> 🔋 *Sisa Limit Free:* ${result.remaining || 0}x`,
                mimetype: "video/mp4"
            }, { quoted: m });

            await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });

            return await sock.sendMessage(m.from, {
                text: `_Selesai diproses dalam kualitas resolusi ${resolution.toUpperCase()}!_`,
                edit: sentLoading.key
            });

        } catch (e) {
            console.error(e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            return sock.sendMessage(m.from, {
                text: `*Upscale Error:*\n\`\`\`${e.message || e}\`\`\``,
                edit: sentLoading.key
            });
        }
    }
};