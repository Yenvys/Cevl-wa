import axios from "axios";
import * as cheerio from "cheerio";
import zlib from "zlib";
import { config } from "../../config.js";
import { res } from '../../src/response.js';


async function fbDownloader(url) {
  try {
    const res = await axios.post(
      "https://savefbs.com/api/v1/aio/html",
      {
        vid: url,
        prefix: "savefbs.com",
        ex: "",
        format: ""
      },
      {
        responseType: "arraybuffer",
        headers: {
          "content-type": "application/json",
          "accept-encoding": "gzip, deflate, br",
          "user-agent": "Mozilla/5.0",
          "origin": "https://savefbs.com",
          "referer": "https://savefbs.com/"
        }
      }
    );

    let html;
    try {
      html = zlib.gunzipSync(res.data).toString();
    } catch {
      html = res.data.toString();
    }

    const $ = cheerio.load(html);

    const result = {
      title: $("h3").first().text().trim() || "Facebook Video",
      thumbnail: $("img.aio-thumbnail").attr("src"),
      links: []
    };

    $("a.download-btn").each((i, el) => {
      const text = $(el).text().trim();
      const link = $(el).attr("href");

      if (link && link.startsWith("http")) {
        result.links.push({
          quality: text,
          url: link
        });
      }
    });

    return result;
  } catch (e) {
    return null;
  }
}

export default {
  cmd: ["fb", "facebook", "fesnuk"],
  category: "download",
  exec: async (m, { sock, query }) => {
    if (!query) return m.reply(res.format(m.prefix, command, `https://facebook.com/..`));
    if (!/facebook\.com|fb\.watch/i.test(query)) return m.adReply("Link tidak valid!");

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    const data = await fbDownloader(query);

    if (!data || data.links.length === 0) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error);
    }

    const videoUrl = data.links[0].url;
    const quality = data.links[0].quality;
      
    await sock.sendMessage(m.from, {
        video: { url: videoUrl },
        caption: ``,
        mimetype: "video/mp4"
    }, { quoted: m });

    await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
  }
};