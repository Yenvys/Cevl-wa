/**
 * plugins/download/instagram.js
 * Downloader Instagram via SiputZX API (sssinstagram + ummy fallback)
 */

import axios from "axios";
import { res } from "../../src/response.js";

async function igDL(url) {
  // Primary: sssinstagram
  try {
    const { data } = await axios.get(
      `https://api.siputzx.my.id/api/d/sssinstagram?url=${encodeURIComponent(url)}`,
      { timeout: 60000 },
    );
    if (data?.status && data?.data) return data.data;
  } catch (e) {
    console.error("[IG_PRIMARY_ERR]", e.message);
  }

  // Backup: ummy
  try {
    const { data } = await axios.get(
      `https://api.siputzx.my.id/api/d/ummy?url=${encodeURIComponent(url)}`,
      { timeout: 60000 },
    );
    if (data?.status && data?.data) return data.data;
  } catch (e) {
    console.error("[IG_BACKUP_ERR]", e.message);
  }

  return null;
}

function pickBestMedia(urlList) {
  if (!urlList || !Array.isArray(urlList) || urlList.length === 0) return null;

  // Sort by quality descending, pick highest
  const sorted = urlList.slice().sort((a, b) => (b.quality || 0) - (a.quality || 0));
  return sorted[0];
}

export default {
  cmd: ["ig", "igdl", "reels", "instagram"],
  category: "download",
  desc: "Download video/foto dari Instagram (reel/post/tv)",
  exec: async (m, { sock, query, command }) => {
    if (!query) {
      return m.reply(
        res.format(m.prefix, command, `https://instagram.com/reel/xxx`),
      );
    }

    const url = query.trim();
    if (!/instagram\.com/i.test(url)) {
      return m.reply("❌ URL harus dari Instagram (reel/post/tv).");
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const data = await igDL(url);

      if (!data || (!data.url?.length && !data.sd && !data.hd)) {
        throw new Error("Media tidak ditemukan.");
      }

      const contextInfo = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363401731165846@newsletter",
          serverMessageId: 142,
          newsletterName: "Cevl",
        },
      };

      const meta = data.meta || {};
      let capt = `*INSTAGRAM DOWNLOADER*\n`;
      if (meta.username) capt += `> @${meta.username}\n`;
      if (meta.title) capt += `> ${meta.title.substring(0, 200)}`;

      // Check if we have url array (video/photo items)
      if (data.url && Array.isArray(data.url) && data.url.length > 0) {
        const best = pickBestMedia(data.url);

        if (!best) throw new Error("Media tidak ditemukan.");

        const isVideo =
          best.type === "mp4" ||
          best.ext === "mp4" ||
          best.name?.toLowerCase().includes("mp4");

        if (isVideo) {
          await sock.sendMessage(
            m.from,
            {
              video: { url: best.url },
              caption: capt,
              mimetype: "video/mp4",
              contextInfo,
            },
            { quoted: m },
          );
        } else {
          await sock.sendMessage(
            m.from,
            {
              image: { url: best.url },
              caption: capt,
              contextInfo,
            },
            { quoted: m },
          );
        }
      } else if (data.hd || data.sd) {
        // Fallback to hd/sd fields
        const videoUrl = data.hd || data.sd;
        await sock.sendMessage(
          m.from,
          {
            video: { url: videoUrl },
            caption: capt,
            mimetype: "video/mp4",
            contextInfo,
          },
          { quoted: m },
        );
      }

      await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
    } catch (e) {
      console.error("[IG_DL_ERR]", e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply("❌ " + (e.message || "Gagal download media Instagram."));
    }
  },
};
