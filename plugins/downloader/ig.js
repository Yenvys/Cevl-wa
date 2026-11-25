import { res } from "../../src/response.js";
import { OmDownloader } from "../../src/omdown.js";

const omDownloader = new OmDownloader();
const NEWSLETTER_JID = "120363401731165846@newsletter";

export default {
  cmd: ["ig", "igdl", "reels", "instagram"],
  category: "download",
  desc: "Download video/foto dari Instagram (reel/post/tv)",
  exec: async (m, { sock, query, command }) => {
    const urlMatch = (query || "").match(/(https?:\/\/[^\s]+)/i);
    if (!urlMatch) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} <url>`,
          "https://www.instagram.com/reel/...",
          "Mendukung reels, post, video, dan carousel/slide foto",
          "Download video/foto dari Instagram"
        )
      );
    }

    const url = urlMatch[0];
    if (!/instagram\.com/i.test(url)) return m.reply(res.invalidUrl("Instagram (reel/post/tv)"));

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const data = await omDownloader.resolve(url);
      if (!data?.success) throw new Error("Gagal mengambil media Instagram.");

      const contextInfo = {
        forwardedNewsletterMessageInfo: { newsletterJid: NEWSLETTER_JID, serverMessageId: 142, newsletterName: "Cevl" },
      };

      let capt = `*INSTAGRAM DOWNLOADER*\n`;
      if (data.author) capt += `> *Author:* ${data.author}\n`;
      if (data.title) capt += `> *Deskripsi:* ${data.title.slice(0, 300)}\n`;

      const videoFmt = (data.formats || []).find((f) => f.dl && (f.kind === "video" || f.id.includes("video") || f.id.includes("sd") || f.id.includes("hd")));

      if (videoFmt) {
        const videoBuffer = await omDownloader.downloadBuffer(videoFmt.dl, { cookies: data.sessionCookies });
        await sock.sendMessage(
          m.from,
          { video: videoBuffer, caption: capt.trim(), mimetype: "video/mp4", contextInfo },
          { quoted: m }
        );
      } else if (data.slides?.length) {
        for (let i = 0; i < data.slides.length; i++) {
          const slide = data.slides[i];
          const imgUrl = slide.downloadUrl || slide.imageUrl;
          const imgBuffer = await omDownloader.downloadBuffer(imgUrl, { cookies: data.sessionCookies });
          await sock.sendMessage(
            m.from,
            { image: imgBuffer, caption: i === 0 ? capt.trim() : undefined, contextInfo },
            { quoted: i === 0 ? m : undefined }
          );
        }
      } else {
        throw new Error("Tidak ada berkas video atau foto yang dapat diunduh.");
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (e) {
      console.error("[IG_DL_ERR]", e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(res.error(`Gagal download media Instagram: ${e.message}`));
    }
  },
};
