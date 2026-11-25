import axios from "axios";
import * as cheerio from "cheerio";
import zlib from "node:zlib";
import { res } from "../../src/response.js";
import { OmDownloader } from "../../src/omdown.js";

const omDownloader = new OmDownloader();
const NEWSLETTER_JID = "120363401731165846@newsletter";

async function fallbackFbDownloader(url) {
  try {
    const response = await axios.post(
      "https://savefbs.com/api/v1/aio/html",
      { vid: url, prefix: "savefbs.com", ex: "", format: "" },
      {
        responseType: "arraybuffer",
        headers: {
          "content-type": "application/json",
          "accept-encoding": "gzip, deflate, br",
          "user-agent": "Mozilla/5.0",
          origin: "https://savefbs.com",
          referer: "https://savefbs.com/",
        },
        timeout: 30000,
      }
    );

    let html;
    try {
      html = zlib.gunzipSync(response.data).toString();
    } catch {
      html = response.data.toString();
    }

    const $ = cheerio.load(html);
    const links = [];
    $("a.download-btn").each((_, el) => {
      const link = $(el).attr("href");
      if (link?.startsWith("http")) {
        links.push({ quality: $(el).text().trim(), url: link });
      }
    });

    return links.length ? { links } : null;
  } catch {
    return null;
  }
}

export default {
  cmd: ["fb", "facebook", "fesnuk"],
  category: "download",
  desc: "Download video Facebook (Reels, Watch, Post)",
  exec: async (m, { sock, query, command }) => {
    const urlMatch = (query || "").match(/(https?:\/\/[^\s]+)/i);
    if (!urlMatch) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} <url>`,
          "https://www.facebook.com/watch?v=...",
          "Mendukung reels, video feed, dan video watch Facebook",
          "Download video Facebook"
        )
      );
    }

    const url = urlMatch[0];
    if (!/facebook\.com|fb\.watch/i.test(url)) return m.reply(res.invalidUrl("Facebook"));

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    const contextInfo = {
      forwardedNewsletterMessageInfo: { newsletterJid: NEWSLETTER_JID, serverMessageId: 142, newsletterName: "Cevl" },
    };

    // 1. Coba via OmDownloader
    try {
      const data = await omDownloader.resolve(url);
      if (data?.success) {
        const capt = `*FACEBOOK DOWNLOADER*\n> *Title:* ${data.title?.slice(0, 200) || "Video Facebook"}\n${data.author ? `> *Author:* ${data.author}\n` : ""}`;
        const videoFmt = (data.formats || []).find((f) => f.dl && (f.kind === "video" || f.id.includes("sd") || f.id.includes("hd")));

        if (videoFmt) {
          const buf = await omDownloader.downloadBuffer(videoFmt.dl, { cookies: data.sessionCookies });
          await sock.sendMessage(m.from, { video: buf, caption: capt.trim(), mimetype: "video/mp4", contextInfo }, { quoted: m });
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
          return;
        }
      }
    } catch (omErr) {
      console.warn("[FB_OMDOWN_FALLBACK]", omErr.message);
    }

    // 2. Fallback via SaveFBS
    try {
      const data = await fallbackFbDownloader(url);
      if (!data?.links?.length) throw new Error("Media tidak ditemukan.");

      await sock.sendMessage(m.from, { video: { url: data.links[0].url }, mimetype: "video/mp4", contextInfo }, { quoted: m });
      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[FB_DL_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(res.error(`Gagal download video Facebook: ${err.message}`));
    }
  },
};
