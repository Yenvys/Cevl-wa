import axios from "axios";
import { res } from "../../src/response.js";
import { OmDownloader } from "../../src/omdown.js";

const omDownloader = new OmDownloader();
const NEWSLETTER_JID = "120363401731165846@newsletter";

async function fallbackTiktokDL(url) {
  try {
    const { data } = await axios.get(`https://api.siputzx.my.id/api/d/tiktok/v2?url=${encodeURIComponent(url)}`, { timeout: 30000 });
    if (!data?.status || !data?.data) return null;
    const d = data.data;

    const links = [];
    if (d.slides?.length) {
      d.slides.forEach((img) => links.push({ text: "photo", link: img }));
    } else {
      if (d.no_watermark_link_hd) links.push({ text: "hd", link: d.no_watermark_link_hd });
      if (d.no_watermark_link) links.push({ text: "sd", link: d.no_watermark_link });
      if (d.watermark_link) links.push({ text: "wm", link: d.watermark_link });
    }

    return {
      title: d.text || "TikTok Content",
      author: d.author_nickname || "Unknown",
      links,
      music: d.music_link,
    };
  } catch {
    return null;
  }
}

export default {
  cmd: ["tiktok", "tt", "ttdl"],
  category: "download",
  desc: "Download TikTok Video / Photo Slideshow",
  exec: async (m, { sock, query, command }) => {
    const urlMatch = (query || "").match(/(https?:\/\/[^\s]+)/i);
    if (!urlMatch) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} <url>`,
          "https://vt.tiktok.com/...",
          "Mendukung video tanpa watermark dan slideshow foto",
          "Download video/foto TikTok"
        )
      );
    }

    const url = urlMatch[0];
    if (!/tiktok\.com|douyin\.com/i.test(url)) return m.reply(res.invalidUrl("TikTok"));

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    const contextInfo = {
      forwardedNewsletterMessageInfo: { newsletterJid: NEWSLETTER_JID, serverMessageId: 142, newsletterName: "Cevl" },
    };

    // 1. Coba via OmDownloader
    try {
      const data = await omDownloader.resolve(url);
      if (data?.success) {
        const capt = `*TIKTOK DOWNLOADER*\n> *Author:* ${data.author || "Unknown"}\n> ${data.title ? data.title.slice(0, 300) : ""}`;

        const videoFmt = (data.formats || []).find((f) => f.dl && (f.kind === "video" || f.id.includes("sd") || f.id.includes("hd")));

        if (videoFmt) {
          const buf = await omDownloader.downloadBuffer(videoFmt.dl, { cookies: data.sessionCookies });
          await sock.sendMessage(m.from, { video: buf, caption: capt.trim(), mimetype: "video/mp4", contextInfo }, { quoted: m });
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
          return;
        }

        if (data.slides?.length) {
          await m.reply(`*TIKTOK SLIDESHOW*\n_Mengirim ${data.slides.length} foto slideshow..._`);
          for (let i = 0; i < data.slides.length; i++) {
            const slide = data.slides[i];
            const imgUrl = slide.downloadUrl || slide.imageUrl;
            const imgBuffer = await omDownloader.downloadBuffer(imgUrl, { cookies: data.sessionCookies });
            await sock.sendMessage(m.from, { image: imgBuffer, caption: i === 0 ? capt.trim() : undefined, contextInfo }, { quoted: i === 0 ? m : undefined });
          }
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
          return;
        }
      }
    } catch (omErr) {
      console.warn("[TT_OMDOWN_FALLBACK]", omErr.message);
    }

    // 2. Fallback jika OmDownloader bermasalah
    try {
      const data = await fallbackTiktokDL(url);
      if (!data?.links?.length) throw new Error("Media tidak ditemukan.");

      const capt = `*TIKTOK DOWNLOADER*\n> ${data.title?.substring(0, 200) || ""}`;
      const photoLinks = data.links.filter((l) => l.text === "photo");

      if (photoLinks.length) {
        await m.reply(`${capt}\n\n_Mengirim berkas slideshow (${photoLinks.length} foto)..._`);
        for (const photo of photoLinks) {
          await sock.sendMessage(m.from, { image: { url: photo.link }, contextInfo }, { quoted: m });
        }
      } else {
        const videoUrl = data.links.find((l) => l.text === "hd")?.link || data.links[0].link;
        await sock.sendMessage(m.from, { video: { url: videoUrl }, caption: capt, mimetype: "video/mp4", contextInfo }, { quoted: m });
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[TIKTOK_DL_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(res.error(`Gagal download media TikTok: ${err.message}`));
    }
  },
};
