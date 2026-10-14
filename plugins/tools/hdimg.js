/**
 * plugins/tools/hdimg.js
 * Meningkatkan resolusi serta kualitas gambar (Upscaling HD) via API iLoveIMG & Sharp Fallback
 */

import axios from "axios";
import * as cheerio from "cheerio";
import FormData from "form-data";
import sharp from "sharp";
import { downloadMediaMessage } from "baileys";
import { res } from "../../src/response.js";

async function getConfig() {
  const { data } = await axios.get("https://www.iloveimg.com/upscale-image", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    timeout: 15000,
  });

  const $ = cheerio.load(data);
  let configJson = null;
  let taskId = null;

  $("script").each((_, el) => {
    const text = $(el).html() || "";
    if (text.includes("var ilovepdfConfig =")) {
      const jsonStr = text
        .split("var ilovepdfConfig =")[1]
        .split(";\n")[0]
        .split(";")[0];
      try {
        configJson = JSON.parse(jsonStr);
      } catch (e) {}
    }
    const match = text.match(/ilovepdfConfig\.taskId\s*=\s*'([^']+)'/);
    if (match) {
      taskId = match[1];
    }
  });

  const csrf = $('meta[name="csrf-token"]').attr("content");
  if (!configJson || !taskId) {
    throw new Error("Gagal mengekstrak konfigurasi atau taskId dari iLoveIMG.");
  }

  return {
    token: configJson.token,
    csrf,
    taskId,
    servers: configJson.servers || [
      "api1g",
      "api2g",
      "api8g",
      "api11g",
      "api21g",
      "api26g",
      "api27g",
    ],
  };
}

async function uploader(server, headers, taskId, buffer) {
  const form = new FormData();
  form.append("name", "hd.jpg");
  form.append("chunk", "0");
  form.append("chunks", "1");
  form.append("task", taskId);
  form.append("preview", "1");
  form.append("file", buffer, {
    filename: "hd.jpg",
    contentType: "image/jpeg",
  });

  const { data } = await axios.post(
    `https://${server}.iloveimg.com/v1/upload`,
    form,
    {
      headers: { ...headers, ...form.getHeaders() },
      timeout: 30000,
    },
  );
  return data;
}

async function upscaleImage(buffer, scale = 2) {
  let jpegBuffer;
  try {
    jpegBuffer = await sharp(buffer)
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch {
    jpegBuffer = buffer;
  }

  try {
    const { token, csrf, taskId, servers } = await getConfig();

    const headers = {
      Authorization: `Bearer ${token}`,
      Origin: "https://www.iloveimg.com/",
      Cookie: `_csrf=${csrf}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };

    const shuffledServers = [...servers].sort(() => 0.5 - Math.random());
    const candidates = shuffledServers.slice(0, 3);
    let lastError;

    for (const server of candidates) {
      try {
        const upload = await uploader(server, headers, taskId, jpegBuffer);
        if (!upload?.server_filename) {
          throw new Error("Gagal mengunggah gambar ke server iLoveIMG.");
        }

        const form = new FormData();
        form.append("task", taskId);
        form.append("server_filename", upload.server_filename);
        form.append("scale", scale);

        const resData = await axios.post(
          `https://${server}.iloveimg.com/v1/upscale`,
          form,
          {
            headers: { ...headers, ...form.getHeaders() },
            responseType: "arraybuffer",
            timeout: 45000,
          },
        );

        if (resData.data && resData.data.byteLength > 0) {
          return Buffer.from(resData.data);
        }
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;
  } catch (err) {
    // Fallback menggunakan Sharp Lanczos3 jika server eksternal sedang bermasalah
    const metadata = await sharp(jpegBuffer).metadata();
    const width = metadata.width ? Math.round(metadata.width * scale) : null;
    const height = metadata.height ? Math.round(metadata.height * scale) : null;
    if (width && height) {
      return await sharp(jpegBuffer)
        .resize(width, height, {
          kernel: sharp.kernel.lanczos3,
          fit: "fill",
        })
        .sharpen()
        .jpeg({ quality: 95 })
        .toBuffer();
    }
    throw err;
  }
}

export default {
  cmd: ["hd", "hdimg", "upscale", "remini"],
  category: "tools",
  desc: "Meningkatkan resolusi serta memperjelas ketajaman kualitas piksel gambar (AI Upscaler).",
  async exec(m, { sock, args, handler, command }) {
    const log = handler?.log || console;
    const q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || q.mimetype || "";

    if (!/image/.test(mime)) {
      return m.reply(
        `*Format Salah!*\n\n` +
          `Kirim atau reply gambar dengan perintah:\n` +
          `• \`${m.prefix}${command}\` (Skala 2x - Cepat)\n` +
          `• \`${m.prefix}${command} 4\` (Skala 4x - Ultra HD)\n\n` +
          `_Contoh: Reply gambar lalu ketik *${m.prefix}${command}* atau *${m.prefix}${command} 4*_`,
      );
    }

    const opt = (args[0] || "").toLowerCase().trim();
    const scale = ["4", "4x", "ultra", "high", "2"].includes(opt) ? 4 : 2;

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const buffer =
        (await q.download?.()) ||
        (await downloadMediaMessage(
          {
            key: m.quoted ? { id: m.quoted.id, remoteJid: m.from } : m.key,
            message: q.message || q,
          },
          "buffer",
        ).catch(() => null));

      if (!buffer || !buffer.length) {
        throw new Error(
          "_Gagal mengunduh berkas gambar dari server WhatsApp._",
        );
      }

      log.info?.(`Processing HD Image: ${m.sender} | Scale: ${scale}x`);

      const result = await upscaleImage(buffer, scale);

      await sock.sendMessage(
        m.from,
        {
          image: result,
          caption: `*IMAGE UPSCALED*\n\n> *Rasio:* ${scale === 4 ? "4x (400% Ultra HD)" : "2x (200% HD)"}`,
        },
        { quoted: m },
      );
      await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
    } catch (e) {
      log.error?.("HD_EXEC_ERR", e.message);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(res.error);
    }
  },
};
