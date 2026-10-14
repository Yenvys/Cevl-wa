/**
 * plugins/tools/hdvid.js
 * Meningkatkan resolusi serta ketajaman kualitas video (Video HD Enhancer).
 * Dilengkapi High-Quality Local FFmpeg Engine (Lanczos3 + Detail Enhancer) & Cloud AI Scraper Fallback
 */

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { downloadMediaMessage } from "baileys";

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegInstaller.path || "ffmpeg";

// ====================================================================
// CLOUD AI ENGINE (UNBLURIMAGE / UNWATERMARK V2 API)
// ====================================================================
const PRODUCT_CODE = "067003";
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

const pickUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const randomSerial = () =>
  "fallback_" + Math.random().toString(36).substring(2, 11);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseHeaders = (ua) => ({
  "user-agent": ua,
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  origin: "https://unblurimage.ai",
  referer: "https://unblurimage.ai/",
  "product-serial": randomSerial(),
  "product-code": PRODUCT_CODE,
});

async function jsonRequest(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `${options?.method || "GET"} -> ${res.status} ${text.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function pollJob(jobId, headers) {
  const url = `https://api.unwatermark.ai/api/web/unblurimage/v2/video-enhancer/get-job/${jobId}`;
  let delay = 2000;
  for (let i = 0; i < 30; i++) {
    const data = await jsonRequest(url, { headers });
    const r = data?.result;
    if (r?.status === 1 && r?.output_url?.length) return r;
    if (r?.status === 2) throw new Error("Job ditolak server AI.");
    await sleep(delay);
    delay = Math.min(delay + 500, 4000);
  }
  throw new Error("Timeout polling job AI.");
}

async function enhanceVideoAI(videoBuffer, resolution = "2k") {
  const ua = pickUA();
  const headers = baseHeaders(ua);

  const upForm = new FormData();
  upForm.append("video_file_name", `video_${Date.now()}.mp4`);

  const upRes = await jsonRequest(
    "https://api.unwatermark.ai/api/web/common/upload/video",
    {
      method: "POST",
      headers,
      body: upForm,
    },
  );

  const uploadUrl = upRes?.result?.url;
  if (!uploadUrl) {
    throw new Error("Gagal mendapatkan storage upload URL dari AI.");
  }
  const objectUrl = uploadUrl.split("?")[0];

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "user-agent": ua,
      "content-type": "video/mp4",
      referer: "https://unblurimage.ai/",
    },
    body: videoBuffer,
  });
  if (!putRes.ok) throw new Error(`Upload video gagal: ${putRes.status}`);

  const targetRes = resolution === "4k" ? "2k" : resolution; // AI endpoint supports up to 2k
  const jobForm = new FormData();
  jobForm.append("original_video_url", objectUrl);
  jobForm.append("resolution", targetRes);
  jobForm.append("is_preview", "false");

  const jobRes = await jsonRequest(
    "https://api.unwatermark.ai/api/web/unblurimage/v2/video-enhancer/create-job",
    {
      method: "POST",
      headers,
      body: jobForm,
    },
  );

  if (jobRes?.code !== 100000 && !jobRes?.result?.job_id) {
    const errMsg =
      jobRes?.message?.id ||
      jobRes?.message?.en ||
      JSON.stringify(jobRes?.message || jobRes);
    throw new Error(`AI Job Gagal: ${errMsg}`);
  }

  const jobId = jobRes?.result?.job_id;
  const done = await pollJob(jobId, headers);
  const outUrl = done?.output_url?.[0];
  if (!outUrl) throw new Error("URL output AI tidak ditemukan.");

  const outRes = await fetch(outUrl, {
    headers: { "user-agent": ua },
  });

  return {
    buffer: Buffer.from(await outRes.arrayBuffer()),
    originalRes: "Auto",
    targetRes: targetRes.toUpperCase(),
    duration: "Auto",
    resolution: targetRes.toUpperCase(),
    engine: "Cloud AI Model",
  };
}

// ====================================================================
// HIGH-QUALITY LOCAL FFMPEG ENGINE (LANCZOS3 + DETAIL ENHANCER)
// ====================================================================
async function getVideoInfo(filePath) {
  try {
    const res = await execFileAsync(ffmpegPath, ["-i", filePath]).catch(
      (err) => err,
    );
    const text = (res.stderr || "") + (res.stdout || "");
    const durMatch = text.match(/Duration:\s*(\d+):(\d+):([\d\.]+)/);
    let duration = null;
    if (durMatch) {
      duration =
        parseInt(durMatch[1]) * 3600 +
        parseInt(durMatch[2]) * 60 +
        parseFloat(durMatch[3]);
    }
    const resMatch = text.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/);
    let width = null,
      height = null;
    if (resMatch) {
      width = parseInt(resMatch[1]);
      height = parseInt(resMatch[2]);
    }
    return { width, height, duration };
  } catch {
    return { width: null, height: null, duration: null };
  }
}

async function enhanceVideoLocal(videoBuffer, resolution = "2k") {
  const tmpId = crypto.randomBytes(6).toString("hex");
  const inputPath = path.join(os.tmpdir(), `hdvid_in_${tmpId}.mp4`);
  const outputPath = path.join(os.tmpdir(), `hdvid_out_${tmpId}.mp4`);

  await fs.promises.writeFile(inputPath, videoBuffer);

  try {
    const info = await getVideoInfo(inputPath);
    const origWidth = info.width || 640;
    const origHeight = info.height || 360;
    const duration = info.duration || 0;

    if (duration > 180) {
      throw new Error(
        "Durasi video terlalu panjang (maksimal 3 menit). Silakan potong video terlebih dahulu.",
      );
    }

    let scaleFactor = 2;
    let targetMax = 1920;

    if (resolution === "4k") {
      scaleFactor = 4;
      targetMax = 3840;
    } else if (resolution === "2k") {
      scaleFactor = 2.5;
      targetMax = 2560;
    } else {
      scaleFactor = 2;
      targetMax = 1920;
    }

    let targetW = Math.round(origWidth * scaleFactor);
    let targetH = Math.round(origHeight * scaleFactor);

    const maxSide = Math.max(targetW, targetH);
    if (maxSide > targetMax) {
      const ratio = targetMax / maxSide;
      targetW = Math.round(targetW * ratio);
      targetH = Math.round(targetH * ratio);
    }

    // Libx264 memerlukan dimensi genap (divisible by 2)
    targetW = Math.max(2, Math.round(targetW / 2) * 2);
    targetH = Math.max(2, Math.round(targetH / 2) * 2);

    const vf = [
      "hqdn3d=1.2:1.2:3:3",
      `scale=${targetW}:${targetH}:flags=lanczos+accurate_rnd`,
      "unsharp=5:5:0.8:5:5:0.0",
      "eq=contrast=1.03:brightness=0.01:saturation=1.05",
    ].join(",");

    const args = [
      "-y",
      "-i",
      inputPath,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      outputPath,
    ];

    await execFileAsync(ffmpegPath, args);

    const resultBuffer = await fs.promises.readFile(outputPath);
    return {
      buffer: resultBuffer,
      originalRes: `${origWidth}x${origHeight}`,
      targetRes: `${targetW}x${targetH}`,
      duration: duration ? `${Math.round(duration)}s` : "N/A",
      resolution: resolution.toUpperCase(),
      engine: "Lanczos3 + Detail Enhancer",
    };
  } finally {
    await fs.promises.unlink(inputPath).catch(() => {});
    await fs.promises.unlink(outputPath).catch(() => {});
  }
}

// ====================================================================
// PLUGINS COMMAND INTERFACE
// ====================================================================
export default {
  cmd: ["hdvid", "hdvi", "hdvideo", "enhancevideo"],
  category: "tools",
  desc: "Meningkatkan resolusi serta ketajaman kualitas video (Video HD Enhancer).",

  exec: async (m, { sock, args, handler, command }) => {
    const log = handler?.log || console;
    const q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || q.mimetype || "";

    if (!/video/.test(mime)) {
      return m.reply(
        `*Format Salah!*\n\n` +
          `Kirim atau reply video dengan perintah:\n` +
          `• \`${m.prefix}${command}\` (Auto 2K Resolution - Cepat)\n` +
          `• \`${m.prefix}${command} 4k\` (Ultra HD 4K Resolution)\n` +
          `• \`${m.prefix}${command} hd\` (Standard HD 1080p)\n` +
          `• \`${m.prefix}${command} ai\` (AI Cloud Enhancer)\n\n` +
          `_Contoh: Balas video lalu ketik *${m.prefix}${command}* atau *${m.prefix}${command} 4k*_`,
      );
    }

    const inputParam = args.join(" ").toLowerCase();
    const isAI = inputParam.includes("ai");
    let resolution = "2k";
    if (inputParam.includes("4k") || inputParam.includes("--4k")) {
      resolution = "4k";
    } else if (
      inputParam.includes("hd") ||
      inputParam.includes("1080") ||
      inputParam.includes("720")
    ) {
      resolution = "hd";
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    const sentLoading = await sock.sendMessage(
      m.from,
      {
        text: `_Mengunduh berkas video dan mempersiapkan upscaling ke resolusi *${resolution.toUpperCase()}*..._`,
      },
      { quoted: m },
    );

    try {
      const mediaBuffer =
        (await q.download?.()) ||
        (await downloadMediaMessage(
          {
            key: m.quoted ? { id: m.quoted.id, remoteJid: m.from } : m.key,
            message: q.message || q,
          },
          "buffer",
          {},
          {
            logger: {
              info: () => {},
              error: () => {},
              warn: () => {},
              debug: () => {},
            },
          },
        ).catch(() => null));

      if (!mediaBuffer || !mediaBuffer.length) {
        return sock.sendMessage(m.from, {
          text: "_Gagal mengunduh berkas video dari WhatsApp, silakan kirim ulang video._",
          edit: sentLoading.key,
        });
      }

      await sock.sendMessage(m.from, {
        text: `_Memproses upscaling video [ *${resolution.toUpperCase()}* ]${isAI ? " via AI Cloud..." : "..."}_`,
        edit: sentLoading.key,
      });

      let result;
      let aiFallback = false;

      if (isAI) {
        try {
          result = await enhanceVideoAI(mediaBuffer, resolution);
        } catch (aiErr) {
          log.warn?.(
            `[HDVID] Cloud AI gagal (${aiErr.message}), mengalihkan ke Local FFmpeg Engine.`,
          );
          aiFallback = true;
          result = await enhanceVideoLocal(mediaBuffer, resolution);
        }
      } else {
        result = await enhanceVideoLocal(mediaBuffer, resolution);
      }

      if (!result?.buffer) {
        throw new Error("Output berkas video kosong.");
      }

      await sock.sendMessage(
        m.from,
        {
          video: result.buffer,
          caption:
            `*VIDEO UPSCALED [ ${result.resolution} ]*\n\n` +
            `> 📐 *Resolusi:* ${result.originalRes} ➔ ${result.targetRes}\n` +
            `> ⏱ *Durasi:* ${result.duration}\n` +
            `> ⚙ *Engine:* ${result.engine}` +
            (aiFallback
              ? `\n> 💡 _(Limit Cloud AI penuh, otomatis dialihkan ke Local HD Engine)_`
              : ""),
          mimetype: "video/mp4",
        },
        { quoted: m },
      );

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });

      return await sock.sendMessage(m.from, {
        text: `_Selesai diproses dalam resolusi ${result.resolution}!_`,
        edit: sentLoading.key,
      });
    } catch (e) {
      log.error?.("HDVID_ERR", e.message || e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return sock.sendMessage(m.from, {
        text: `*Upscale Error:*\n\`\`\`${e.message || e}\`\`\``,
        edit: sentLoading.key,
      });
    }
  },
};
