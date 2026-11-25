import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { downloadMediaMessage } from "baileys";
import { res } from "../../src/response.js";

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegInstaller.path || "ffmpeg";

const PRODUCT_CODE = "067003";
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

const pickUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseHeaders = (ua) => ({
  "user-agent": ua,
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  origin: "https://unblurimage.ai",
  referer: "https://unblurimage.ai/",
  "product-serial": "fallback_" + Math.random().toString(36).substring(2, 11),
  "product-code": PRODUCT_CODE,
});

async function jsonRequest(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(`${options?.method || "GET"} -> ${res.status} ${text.slice(0, 300)}`);
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

  const upRes = await jsonRequest("https://api.unwatermark.ai/api/web/common/upload/video", {
    method: "POST",
    headers,
    body: upForm,
  });

  const uploadUrl = upRes?.result?.url;
  if (!uploadUrl) throw new Error("Gagal mendapatkan storage upload URL.");

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "user-agent": ua, "content-type": "video/mp4", referer: "https://unblurimage.ai/" },
    body: videoBuffer,
  });
  if (!putRes.ok) throw new Error(`Upload video gagal: ${putRes.status}`);

  const targetRes = resolution === "4k" ? "2k" : resolution;
  const jobForm = new FormData();
  jobForm.append("original_video_url", uploadUrl.split("?")[0]);
  jobForm.append("resolution", targetRes);
  jobForm.append("is_preview", "false");

  const jobRes = await jsonRequest("https://api.unwatermark.ai/api/web/unblurimage/v2/video-enhancer/create-job", {
    method: "POST",
    headers,
    body: jobForm,
  });

  if (jobRes?.code !== 100000 && !jobRes?.result?.job_id) {
    throw new Error(`AI Job Gagal: ${jobRes?.message?.id || jobRes?.message?.en || "Unknown error"}`);
  }

  const done = await pollJob(jobRes.result.job_id, headers);
  const outUrl = done?.output_url?.[0];
  if (!outUrl) throw new Error("URL output AI tidak ditemukan.");

  const outRes = await fetch(outUrl, { headers: { "user-agent": ua } });
  return {
    buffer: Buffer.from(await outRes.arrayBuffer()),
    originalRes: "Auto",
    targetRes: targetRes.toUpperCase(),
    duration: "Auto",
    resolution: targetRes.toUpperCase(),
    engine: "Cloud AI Model",
  };
}

async function getVideoInfo(filePath) {
  try {
    const res = await execFileAsync(ffmpegPath, ["-i", filePath]).catch((err) => err);
    const text = (res.stderr || "") + (res.stdout || "");
    const durMatch = text.match(/Duration:\s*(\d+):(\d+):([\d\.]+)/);
    const duration = durMatch
      ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3])
      : null;
    const resMatch = text.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/);
    return {
      width: resMatch ? parseInt(resMatch[1]) : null,
      height: resMatch ? parseInt(resMatch[2]) : null,
      duration,
    };
  } catch {
    return { width: null, height: null, duration: null };
  }
}

async function enhanceVideoLocal(videoBuffer, resolution = "2k") {
  const tmpId = crypto.randomBytes(6).toString("hex");
  const inputPath = path.join(os.tmpdir(), `hdvid_in_${tmpId}.mp4`);
  const outputPath = path.join(os.tmpdir(), `hdvid_out_${tmpId}.mp4`);

  await fs.writeFile(inputPath, videoBuffer);

  try {
    const info = await getVideoInfo(inputPath);
    const origWidth = info.width || 640;
    const origHeight = info.height || 360;
    const duration = info.duration || 0;

    if (duration > 180) throw new Error("Durasi video terlalu panjang (maksimal 3 menit).");

    const scaleFactor = resolution === "4k" ? 4 : resolution === "2k" ? 2.5 : 2;
    const targetMax = resolution === "4k" ? 3840 : resolution === "2k" ? 2560 : 1920;

    let targetW = Math.round(origWidth * scaleFactor);
    let targetH = Math.round(origHeight * scaleFactor);

    const maxSide = Math.max(targetW, targetH);
    if (maxSide > targetMax) {
      const ratio = targetMax / maxSide;
      targetW = Math.round(targetW * ratio);
      targetH = Math.round(targetH * ratio);
    }

    targetW = Math.max(2, Math.round(targetW / 2) * 2);
    targetH = Math.max(2, Math.round(targetH / 2) * 2);

    const vf = [
      "hqdn3d=1.2:1.2:3:3",
      `scale=${targetW}:${targetH}:flags=lanczos+accurate_rnd`,
      "unsharp=5:5:0.8:5:5:0.0",
      "eq=contrast=1.03:brightness=0.01:saturation=1.05",
    ].join(",");

    await execFileAsync(ffmpegPath, [
      "-y", "-i", inputPath, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast",
      "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath,
    ]);

    const resultBuffer = await fs.readFile(outputPath);
    return {
      buffer: resultBuffer,
      originalRes: `${origWidth}x${origHeight}`,
      targetRes: `${targetW}x${targetH}`,
      duration: duration ? `${Math.round(duration)}s` : "N/A",
      resolution: resolution.toUpperCase(),
      engine: "Lanczos3 + Detail Enhancer",
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

export default {
  cmd: ["hdvid", "hdvi", "hdvideo", "enhancevideo"],
  category: "tools",
  desc: "Meningkatkan resolusi serta ketajaman kualitas video (Video HD Enhancer)",

  exec: async (m, { sock, args, handler, command }) => {
    const log = handler?.log || console;
    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || q.mimetype || "";

    if (!/video/.test(mime)) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          [
            "",
            "4k (Ultra HD 4K)",
            "hd (Standard 1080p)",
            "ai (AI Cloud Enhancer)",
          ],
          "Kirim atau reply video dengan opsi resolusi yang diinginkan",
          "Meningkatkan resolusi serta ketajaman kualitas video (Video HD Enhancer)",
        ),
      );
    }

    const inputParam = args.join(" ").toLowerCase();
    const isAI = inputParam.includes("ai");
    const resolution = inputParam.includes("4k") ? "4k" : /hd|1080|720/.test(inputParam) ? "hd" : "2k";

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    const sentLoading = await sock.sendMessage(
      m.from,
      { text: `_Mengunduh berkas video dan mempersiapkan upscaling ke *${resolution.toUpperCase()}*..._` },
      { quoted: m },
    );

    try {
      const mediaBuffer =
        (await q.download?.()) ||
        (await downloadMediaMessage(
          { key: m.quoted ? { id: m.quoted.id, remoteJid: m.from } : m.key, message: q.message || q },
          "buffer",
        ).catch(() => null));

      if (!mediaBuffer?.length) {
        return sock.sendMessage(m.from, {
          text: "_Gagal mengunduh berkas video, silakan kirim ulang._",
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
          log.warn?.(`[HDVID] Cloud AI gagal (${aiErr.message}), dialihkan ke Local FFmpeg.`);
          aiFallback = true;
          result = await enhanceVideoLocal(mediaBuffer, resolution);
        }
      } else {
        result = await enhanceVideoLocal(mediaBuffer, resolution);
      }

      if (!result?.buffer) throw new Error("Output video kosong.");

      await sock.sendMessage(
        m.from,
        {
          video: result.buffer,
          caption:
            `*VIDEO UPSCALED [ ${result.resolution} ]*\n\n` +
            `> 📐 *Resolusi:* ${result.originalRes} ➔ ${result.targetRes}\n` +
            `> ⏱ *Durasi:* ${result.duration}\n` +
            `> ⚙ *Engine:* ${result.engine}` +
            (aiFallback ? `\n> 💡 _(Limit Cloud AI penuh, dialihkan ke Local HD Engine)_` : ""),
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
      return sock.sendMessage(m.from, { text: `*Upscale Error:*\n\`\`\`${e.message || e}\`\`\``, edit: sentLoading.key });
    }
  },
};
