/**
 * plugins/download/instagram.js
 * Downloader Instagram via SaveFromIns API
 */

import axios from "axios";
import { res } from "../../src/response.js";

const BASE_URL = "https://api.savefromins.com";
const AUTH = "20250901majwlqo";
const DOMAIN = "api-ak.savefromins.com";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function parse(url) {
  const payload = new URLSearchParams();
  payload.append("auth", AUTH);
  payload.append("domain", DOMAIN);
  payload.append("origin", "source");
  payload.append("link", url);

  const { data } = await axios.post(
    `${BASE_URL}/api/contentsite_api/media/parse`,
    payload.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Origin: "https://savefromins.com",
        Referer: "https://savefromins.com/",
      },
      timeout: 60000,
    },
  );
  return data;
}

function collectResources(data) {
  const videos = [];
  const images = [];

  if (Array.isArray(data.media)) {
    for (const media of data.media) {
      if (media.type === "video" && Array.isArray(media.resources)) {
        for (const r of media.resources) {
          if (r.format?.toLowerCase() === "mp4" && r.download_url) {
            videos.push({
              quality: r.quality || "default",
              url: r.download_url,
              size: r.size || 0,
            });
          }
        }
      }
      if (media.type === "image" && Array.isArray(media.resources)) {
        for (const r of media.resources) {
          if (r.download_url) images.push({ url: r.download_url });
        }
      }
    }
  }

  if (Array.isArray(data.resources)) {
    for (const r of data.resources) {
      const fmt = (r.format || "").toLowerCase();
      if (fmt === "mp4" && r.download_url) {
        videos.push({
          quality: r.quality || "default",
          url: r.download_url,
          size: r.size || 0,
        });
      } else if (
        (r.type === "image" ||
          fmt === "jpg" ||
          fmt === "jpeg" ||
          fmt === "png") &&
        r.download_url
      ) {
        images.push({ url: r.download_url });
      }
    }
  }

  const seen = new Set();
  const dedupedVideos = videos.filter((v) => {
    if (seen.has(v.url)) return false;
    seen.add(v.url);
    return true;
  });

  return { videos: dedupedVideos, images };
}

function pickBestVideo(videos) {
  if (!videos.length) return null;
  const order = {
    "1080P": 6,
    "960P": 5,
    "720P": 4,
    "480P": 3,
    "360P": 2,
    "240P": 1,
  };
  return videos.slice().sort((a, b) => {
    const qa = order[(a.quality || "").toUpperCase()] || 0;
    const qb = order[(b.quality || "").toUpperCase()] || 0;
    return qb - qa;
  })[0];
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
      const data = await parse(url);

      if (!data || data.status !== 1 || !data.data) {
        throw new Error(data?.message || "Gagal memproses URL.");
      }

      const { videos, images } = collectResources(data.data);
      const video = pickBestVideo(videos);

      if (!video && !images.length) {
        throw new Error("Media tidak ditemukan pada post ini.");
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

      if (video && video.url) {
        const sizeText = video.size
          ? `Size: ${(video.size / 1024 / 1024).toFixed(2)} MB\n`
          : "";
        const qualityText = video.quality
          ? `Quality: ${video.quality}\n`
          : "";

        await sock.sendMessage(
          m.from,
          {
            video: { url: video.url },
            caption: `*INSTAGRAM DOWNLOADER*\n\n${qualityText}${sizeText}`,
            mimetype: "video/mp4",
            contextInfo,
          },
          { quoted: m },
        );
      } else if (images.length === 1) {
        await sock.sendMessage(
          m.from,
          {
            image: { url: images[0].url },
            caption: `*INSTAGRAM DOWNLOADER*`,
            contextInfo,
          },
          { quoted: m },
        );
      } else {
        for (let i = 0; i < images.length; i++) {
          await sock.sendMessage(
            m.from,
            {
              image: { url: images[i].url },
              caption:
                i === 0
                  ? `*INSTAGRAM DOWNLOADER* (${images.length} foto)`
                  : "",
              contextInfo,
            },
            { quoted: m },
          );
        }
      }

      await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
    } catch (e) {
      console.error("[IG_DL_ERR]", e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply("❌ " + (e.response?.data?.message || e.message));
    }
  },
};
