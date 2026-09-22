/**
 * plugins/download/tiktok.js
 * Downloader TikTok via SiputZX API v2
 */

import axios from "axios";
import { res } from "../../src/response.js";

async function tiktokDL(url) {
  try {
    const { data } = await axios.get(
      `https://api.siputzx.my.id/api/d/tiktok/v2?url=${encodeURIComponent(url)}`,
      { timeout: 60000 },
    );

    if (!data?.status || !data?.data) return null;

    const d = data.data;
    const result = {
      title: d.text || "TikTok Content",
      author: d.author_nickname || "Unknown",
      cover: d.cover_link || null,
      duration: d.duration || null,
      stats: {
        plays: d.play_count || 0,
        likes: d.like_count || 0,
        comments: d.comment_count || 0,
        shares: d.share_count || 0,
      },
      links: [],
    };

    // Cek slideshow (images)
    if (d.slides && Array.isArray(d.slides) && d.slides.length > 0) {
      result.links = d.slides.map((img) => ({ text: "photo", link: img }));
    } else {
      // Video links
      if (d.no_watermark_link_hd) {
        result.links.push({ text: "hd", link: d.no_watermark_link_hd });
      }
      if (d.no_watermark_link) {
        result.links.push({ text: "sd", link: d.no_watermark_link });
      }
      if (d.watermark_link) {
        result.links.push({ text: "wm", link: d.watermark_link });
      }
    }

    // Music link
    if (d.music_link) {
      result.music = d.music_link;
    }

    return result;
  } catch (e) {
    console.error("[TT_API_ERR]", e.message);
    return null;
  }
}

export default {
  cmd: ["tiktok", "tt", "ttdl"],
  category: "download",
  desc: "Download TikTok Video / Photo Slideshow",
  exec: async (m, { sock, query, command }) => {
    if (!query) {
      return m.reply(
        res.format(m.prefix, command, `https://vt.tiktok.com/...`),
      );
    }
    if (!query.match(/tiktok\.com/gi)) {
      return m.reply("❌ Link tidak valid!");
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const data = await tiktokDL(query);

      if (!data || data.links.length === 0) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error);
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

      let capt = `*TIKTOK DOWNLOADER*\n`;
      capt += `> ${data.title?.substring(0, 200) || ""}`;

      const photoLinks = data.links.filter((l) =>
        l.text.toLowerCase().includes("photo"),
      );

      if (photoLinks.length > 0) {
        await m.reply(
          `${capt}\n\n_Mengirim berkas slideshow (${photoLinks.length} foto)..._`,
        );

        for (let photo of photoLinks) {
          await sock.sendMessage(
            m.from,
            {
              image: { url: photo.link },
              caption: "",
              contextInfo,
            },
            { quoted: m },
          );
        }
      } else {
        const videoUrl =
          data.links.find((l) => l.text.toLowerCase().includes("hd"))?.link ||
          data.links[0].link;

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
    } catch (err) {
      console.error("[TIKTOK_DL_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(res.error);
    }
  },
};
