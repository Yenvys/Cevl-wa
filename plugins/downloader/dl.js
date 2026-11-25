import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepareWAMessageMedia } from "baileys";
import { res } from "../../src/response.js";
import { OmDownloader } from "../../src/omdown.js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const omDownloader = new OmDownloader();
const CLOUDINARY_IMAGE = "https://files.catbox.moe/r5qcku.jpg";
const NEWSLETTER_JID = "120363401731165846@newsletter";

if (!global.dlCache) global.dlCache = {};
if (!global.dlCacheCleanupStarted) {
  global.dlCacheCleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of Object.entries(global.dlCache)) {
      if (now - (val?.timestamp || 0) > 600000) delete global.dlCache[key];
    }
  }, 300000);
}

function extractAudioFromBuffer(videoBuffer) {
  const tmpIn = path.join(os.tmpdir(), `dl_in_${Date.now()}.mp4`);
  const tmpOut = path.join(os.tmpdir(), `dl_out_${Date.now()}.mp3`);
  fs.writeFileSync(tmpIn, videoBuffer);

  return new Promise((resolve, reject) => {
    ffmpeg(tmpIn)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(192)
      .format("mp3")
      .on("end", () => {
        try { fs.unlinkSync(tmpIn); } catch {}
        resolve(tmpOut);
      })
      .on("error", (err) => {
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
        reject(err);
      })
      .save(tmpOut);
  });
}

async function sendInteractiveMedia(sock, chatId, result, sender, prefix = ".") {
  try {
    const { source = "Unknown", title = "Untitled", author = "Unknown", videos = [], audios = [], photos = [] } = result;
    const thumbnail = result.thumbnail || CLOUDINARY_IMAGE;
    const pfx = typeof prefix === "string" ? prefix : ".";

    let imageMessage;
    try {
      const imgRes = await fetch(thumbnail, { headers: { "User-Agent": omDownloader.userAgent } });
      if (imgRes.ok) {
        const arrBuf = await imgRes.arrayBuffer();
        const media = await prepareWAMessageMedia({ image: Buffer.from(arrBuf) }, { upload: sock.waUploadToServer });
        imageMessage = media.imageMessage;
      }
    } catch {}

    const buttons = [];
    if (videos.length) {
      const videoRows = videos.slice(0, 8).map((v, idx) => ({
        id: `${pfx}dl video ${idx}`,
        title: `🎬 ${v.quality || `Video ${idx + 1}`}`.slice(0, 24),
        description: (v.label || "Kualitas Terbaik").slice(0, 60),
      }));

      const rows = [...videoRows];
      if (audios.length === 0) {
        rows.push({
          id: `${pfx}dl extractaudio 0`,
          title: "🎵 Ekstrak Audio (MP3)",
          description: "Konversi suara video menjadi file MP3",
        });
      }

      buttons.push({
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "🎬 Pilih Video",
          sections: [{
            title: `Tersedia ${videos.length} Pilihan Video`,
            highlight_label: "📹",
            rows,
          }],
        }),
      });
    }

    if (audios.length) {
      const audioRows = audios.slice(0, 8).map((a, idx) => ({
        id: `${pfx}dl audio ${idx}`,
        title: `🎵 ${a.quality || `Audio ${idx + 1}`}`.slice(0, 24),
        description: (a.label || "Audio MP3").slice(0, 60),
      }));

      buttons.push({
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "🎵 Pilih Audio",
          sections: [{
            title: `Tersedia ${audios.length} Pilihan Audio`,
            highlight_label: "🎵",
            rows: audioRows,
          }],
        }),
      });
    }

    if (photos.length) {
      buttons.push({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: `🖼️ Unduh Semua Foto (${photos.length})`,
          id: `${pfx}dl photo all`,
        }),
      });
    }

    buttons.push({
      name: "cta_url",
      buttonParamsJson: JSON.stringify({
        display_text: "📢 Channel",
        url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
        merchant_url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
      }),
    });

    let bodyText = `*@${author}* - ${title}\n\n*Format Tersedia:*\n`;
    if (videos.length) bodyText += `> 📹 Video: ${videos.length} format\n`;
    if (audios.length) bodyText += `> 🎵 Audio: ${audios.length} format\n`;
    if (photos.length) bodyText += `> 🖼️ Foto: ${photos.length} slide\n`;

    const interactiveMsg = {
      interactiveMessage: {
        header: {
          title: `*♯ MEDIA DOWNLOADER [${source.toUpperCase()}]*`,
          hasMediaAttachment: !!imageMessage,
          ...(imageMessage && { imageMessage }),
        },
        body: { text: bodyText.trim() },
        footer: { text: "Pilih opsi unduhan melalui menu di bawah ini" },
        contextInfo: {
          mentionedJid: [sender],
          forwardedNewsletterMessageInfo: { newsletterJid: NEWSLETTER_JID, serverMessageId: 142, newsletterName: "Cevl" },
        },
        nativeFlowMessage: { buttons },
      },
    };

    return await sock.relayMessage(chatId, interactiveMsg, {
      additionalNodes: [{
        tag: "biz",
        attrs: {},
        content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }],
      }],
    });
  } catch (e) {
    console.error("[DL_INTERACTIVE_ERR]", e);
    return false;
  }
}

async function sendMediaBuffer(sock, chatId, buffer, type, title, author, quoted) {
  const caption = `*${title}*\n${author ? `_Oleh: ${author}_` : ""}`;
  const contextInfo = {
    forwardedNewsletterMessageInfo: { newsletterJid: NEWSLETTER_JID, serverMessageId: 142, newsletterName: "Cevl" },
  };

  const isLarge = buffer.length > 60 * 1024 * 1024;
  if (isLarge) {
    const cdnRes = await omDownloader.upload(buffer, { fileName: `${title.slice(0, 30)}.${type === "audio" ? "mp3" : "mp4"}` });
    return await sock.sendMessage(
      chatId,
      {
        text: `📦 *UKURAN BERKAS TERLALU BESAR*\n> Ukuran: ${(buffer.length / (1024 * 1024)).toFixed(1)} MB (melebihi batas langsung WhatsApp)\n\n🔗 *Tautan Unduhan:* ${cdnRes.url}`,
        contextInfo,
      },
      { quoted }
    );
  }

  if (type === "video") {
    return await sock.sendMessage(chatId, { video: buffer, caption, mimetype: "video/mp4", contextInfo }, { quoted });
  }
  if (type === "audio") {
    return await sock.sendMessage(chatId, { audio: buffer, mimetype: "audio/mpeg", ptt: false, fileName: `${title || "audio"}.mp3`, contextInfo }, { quoted });
  }
  if (type === "photo") {
    return await sock.sendMessage(chatId, { image: buffer, caption, contextInfo }, { quoted });
  }
}

export default {
  cmd: ["dl", "download", "downloader"],
  category: "download",
  desc: "Download media dari berbagai platform (TikTok, IG, YouTube, FB, X, dll.) via OmDown",
  exec: async (m, { sock, query, command }) => {
    if (!query) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} <url>`,
          "https://vt.tiktok.com/...",
          "Mendukung TikTok, Instagram, YouTube, Facebook, X/Twitter, Threads, CapCut, dll.",
          "Download media dari berbagai platform",
        )
      );
    }

    const parts = query.split(" ");
    const subCommand = parts[0]?.toLowerCase() || "";
    const dlCache = global.dlCache?.[m.sender];

    if (subCommand === "video" && parts[1] !== undefined) {
      const idx = parseInt(parts[1], 10);
      if (!dlCache?.result) return m.reply(res.empty("Media tidak ditemukan atau sesi telah kedaluwarsa. Silakan kirim URL ulang."));
      const selected = dlCache.result.videos?.[idx];
      if (!selected) return m.reply(res.warn("Pilihan video tidak valid."));

      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
      try {
        const buffer = await omDownloader.downloadBuffer(selected.url, { cookies: dlCache.result.sessionCookies });
        await sendMediaBuffer(sock, m.from, buffer, "video", dlCache.result.title, dlCache.result.author, m);
        return await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      } catch (err) {
        console.error("[DL_VIDEO_ERR]", err);
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error(`Gagal mengunduh video: ${err.message}`));
      }
    }

    if (subCommand === "audio" && parts[1] !== undefined) {
      const idx = parseInt(parts[1], 10);
      if (!dlCache?.result) return m.reply(res.empty("Media tidak ditemukan atau sesi telah kedaluwarsa. Silakan kirim URL ulang."));
      const selected = dlCache.result.audios?.[idx];
      if (!selected) return m.reply(res.warn("Pilihan audio tidak valid."));

      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
      try {
        const buffer = await omDownloader.downloadBuffer(selected.url, { cookies: dlCache.result.sessionCookies });
        await sendMediaBuffer(sock, m.from, buffer, "audio", dlCache.result.title, dlCache.result.author, m);
        return await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      } catch (err) {
        console.error("[DL_AUDIO_ERR]", err);
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error(`Gagal mengunduh audio: ${err.message}`));
      }
    }

    if (subCommand === "extractaudio" && parts[1] !== undefined) {
      const idx = parseInt(parts[1], 10);
      if (!dlCache?.result) return m.reply(res.empty("Media tidak ditemukan atau sesi telah kedaluwarsa. Silakan kirim URL ulang."));
      const selected = dlCache.result.videos?.[idx];
      if (!selected) return m.reply(res.warn("Pilihan video tidak valid."));

      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
      try {
        const videoBuffer = await omDownloader.downloadBuffer(selected.url, { cookies: dlCache.result.sessionCookies });
        const audioPath = await extractAudioFromBuffer(videoBuffer);
        const audioBuffer = fs.readFileSync(audioPath);
        await sendMediaBuffer(sock, m.from, audioBuffer, "audio", dlCache.result.title, dlCache.result.author, m);
        try { fs.unlinkSync(audioPath); } catch {}
        return await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      } catch (err) {
        console.error("[DL_EXTRACT_ERR]", err);
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error(`Gagal mengekstrak audio: ${err.message}`));
      }
    }

    if (subCommand === "photo" && parts[1] !== undefined) {
      if (!dlCache?.result) return m.reply(res.empty("Media tidak ditemukan atau sesi telah kedaluwarsa. Silakan kirim URL ulang."));
      const photos = dlCache.result.photos || [];
      if (!photos.length) return m.reply(res.empty("Tidak ada foto pada tautan ini."));

      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
      try {
        if (parts[1] === "all") {
          for (const p of photos) {
            const buf = await omDownloader.downloadBuffer(p.url, { cookies: dlCache.result.sessionCookies });
            await sock.sendMessage(m.from, { image: buf });
          }
        } else {
          const idx = parseInt(parts[1], 10);
          const selected = photos[idx];
          if (!selected) return m.reply(res.warn("Pilihan foto tidak valid."));
          const buf = await omDownloader.downloadBuffer(selected.url, { cookies: dlCache.result.sessionCookies });
          await sendMediaBuffer(sock, m.from, buf, "photo", dlCache.result.title, dlCache.result.author, m);
        }
        return await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      } catch (err) {
        console.error("[DL_PHOTO_ERR]", err);
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error(`Gagal mengunduh foto: ${err.message}`));
      }
    }

    if (subCommand === "all") {
      if (!dlCache?.result) return m.reply(res.empty("Media tidak ditemukan atau sesi telah kedaluwarsa. Silakan kirim URL ulang."));
      const { result } = dlCache;
      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

      let sent = 0;
      for (const v of (result.videos || []).slice(0, 2)) {
        try {
          const buf = await omDownloader.downloadBuffer(v.url, { cookies: result.sessionCookies });
          await sendMediaBuffer(sock, m.from, buf, "video", result.title, result.author, m);
          sent++;
        } catch {}
      }
      for (const p of result.photos || []) {
        try {
          const buf = await omDownloader.downloadBuffer(p.url, { cookies: result.sessionCookies });
          await sock.sendMessage(m.from, { image: buf });
          sent++;
        } catch {}
      }
      for (const a of (result.audios || []).slice(0, 1)) {
        try {
          const buf = await omDownloader.downloadBuffer(a.url, { cookies: result.sessionCookies });
          await sendMediaBuffer(sock, m.from, buf, "audio", result.title, result.author, m);
          sent++;
        } catch {}
      }

      await sock.sendMessage(m.from, { react: { text: sent ? "✅" : "❌", key: m.key } });
      return m.reply(sent ? res.success(`Berhasil mengirim ${sent} berkas media.`) : res.error("Gagal mengirim media."));
    }

    const urlMatch = query.match(/(https?:\/\/[^\s]+)/i);
    if (!urlMatch) return m.reply(res.invalidUrl);

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const data = await omDownloader.resolve(urlMatch[0]);
      if (!data?.success) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error("Gagal menyelesaikan tautan media."));
      }

      const rawFormats = data.formats || [];
      const videos = rawFormats
        .filter((f) => (f.kind === "video" || (f.dl && !f.id.includes("audio") && !f.id.includes("thumbnail"))))
        .map((f) => ({
          id: f.id,
          label: f.label || "Video",
          quality: f.quality || "HD",
          url: f.dl || f.downloadUrl,
        }));

      const audios = rawFormats
        .filter((f) => f.kind === "audio" || f.id.includes("audio"))
        .map((f) => ({
          id: f.id,
          label: f.label || "Audio MP3",
          quality: f.quality || "320 kbps",
          url: f.dl || f.downloadUrl,
        }));

      if (data.music?.playUrl) {
        audios.push({
          id: "music",
          label: "Audio Musik / Backsound",
          quality: "Original",
          url: data.music.playUrl,
        });
      }

      const photos = (data.slides || []).map((s) => ({
        url: s.downloadUrl || s.imageUrl,
      }));

      if (!videos.length && !audios.length && !photos.length) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.empty("Tidak ditemukan media yang dapat diunduh dari tautan ini."));
      }

      const normalized = {
        source: data.platform || "Media",
        title: data.title || "Untitled",
        author: data.author || "Unknown",
        thumbnail: data.thumbnailUrl || CLOUDINARY_IMAGE,
        videos,
        audios,
        photos,
        sessionCookies: data.sessionCookies,
      };

      global.dlCache[m.sender] = { result: normalized, timestamp: Date.now() };

      const interactiveSent = await sendInteractiveMedia(sock, m.from, normalized, m.sender, m.prefix);
      if (!interactiveSent) {
        // Fallback jika interactive menu tidak didukung
        if (videos.length > 0) {
          const v = videos[0];
          const buffer = await omDownloader.downloadBuffer(v.url, { cookies: normalized.sessionCookies });
          await sendMediaBuffer(sock, m.from, buffer, "video", normalized.title, normalized.author, m);
        } else if (photos.length > 0) {
          for (const p of photos.slice(0, 5)) {
            const buffer = await omDownloader.downloadBuffer(p.url, { cookies: normalized.sessionCookies });
            await sock.sendMessage(m.from, { image: buffer });
          }
        } else if (audios.length > 0) {
          const a = audios[0];
          const buffer = await omDownloader.downloadBuffer(a.url, { cookies: normalized.sessionCookies });
          await sendMediaBuffer(sock, m.from, buffer, "audio", normalized.title, normalized.author, m);
        }
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[OMDOWN_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error(`Gagal memproses tautan: ${err.message}`));
    }
  },
};
