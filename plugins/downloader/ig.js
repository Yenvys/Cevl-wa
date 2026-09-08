/**
 * plugins/download/instagram.js
 * Downloader Instagram (Universal Chat Style & Auto-Clear React)
 */

import axios from "axios";
import { config } from "../../config.js";
import { res } from "../../src/response.js";

import puppeteer from "puppeteer";

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return browserInstance;
}

async function cloudHostIG(url) {
  if (!url) return null;

  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );

    await page.goto("https://indown.io/", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await new Promise((r) => setTimeout(r, 8000));

    await page.type("#link", url, { delay: 30 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
      page.click("#downloadForm button[type=submit]"),
    ]);

    await new Promise((r) => setTimeout(r, 5000));

    const data = await page.evaluate(() => {
      const getAttr = (sel, attr) =>
        document
          .querySelector(sel)
          ?.getAttribute(attr)
          ?.replace(/&amp;/g, "&") || null;
      const getHrefByText = (text) => {
        const links = Array.from(document.querySelectorAll("a"));
        const match = links.find((a) => a.textContent.includes(text));
        return match?.href?.replace(/&amp;/g, "&") || null;
      };
      return {
        video_url: getAttr("video source", "src"),
        thumbnail: getAttr("video", "poster"),
        download_server1: getHrefByText("Download Server 1"),
        download_server2: getHrefByText("Download Server 2"),
      };
    });

    if (!data.video_url && !data.download_server1) {
      throw new Error("Video tidak ditemukan atau URL tidak valid");
    }

    const mediaUrl = data.video_url || data.download_server1;

    return {
      medias: [
        {
          url: mediaUrl,
          type: "video", // Default ke video berdasarkan data scraper
        },
      ],
      caption: "Instagram Downloader",
      user: "user",
      isVideo: true,
    };
  } catch (error) {
    console.error("[IG_API_ERR]", error.message);
    return null;
  } finally {
    if (page) await page.close();
  }
}

export default {
  cmd: ["ig", "igdl", "reels", "instagram"],
  category: "download",
  exec: async (m, { sock, query, command }) => {
    if (!query) {
      return m.reply(
        res.format(m.prefix, command, `https://instagram.com/...`),
      );
    }
    if (!/instagram\.com/i.test(query)) {
      return m.reply("Link tidak valid!");
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    const data = await cloudHostIG(query);

    if (!data || data.medias.length === 0) {
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error);
    }

    let capt = `*INSTAGRAM DOWNLOADER*\n`;
    capt += `*@${data.user}*\n`;
    capt += `${data.caption}`;

    try {
      if (data.medias.length > 1) {
        const albumMedia = [];
        for (let mediaObj of data.medias) {
          const finalUrl = mediaObj.url.replace(/\\/g, "");
          const isVideo = mediaObj.type === "video";

          albumMedia.push({
            [isVideo ? "video" : "image"]: { url: finalUrl },
            mimetype: isVideo ? "video/mp4" : "image/jpeg",
          });
        }

        await m.reply(
          capt + `\n\n_Mengirim berkas album (${data.medias.length} media)..._`,
        );

        for (let media of albumMedia) {
          await sock.sendMessage(m.from, media, { quoted: m });
        }
      } else {
        const mediaObj = data.medias[0];
        const finalUrl = mediaObj.url.replace(/\\/g, "");
        const isVideo = mediaObj.type === "video";

        await sock.sendMessage(
          m.from,
          {
            [isVideo ? "video" : "image"]: { url: finalUrl },
            caption: capt,
            mimetype: isVideo ? "video/mp4" : "image/jpeg",
          },
          { quoted: m },
        );
      }

      await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
    } catch (err) {
      console.error("[IG_DL_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply("Terjadi kesalahan saat memproses pengiriman media.");
    }
  },
};
