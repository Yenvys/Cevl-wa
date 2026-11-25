import axios from "axios";
import { prepareWAMessageMedia } from "baileys";
import { res } from "../../src/response.js";

const CLOUDINARY_IMAGE = "https://files.catbox.moe/r5qcku.jpg";
const API_BASE = "https://api.omegatech.app/api/movie/Akwam";

async function fetchAkwam(params) {
  const { data } = await axios.get(API_BASE, { params, timeout: 45000, validateStatus: () => true });
  return data?.success ? data.data : null;
}

async function sendInteractiveFlow(sock, chatId, title, bodyText, buttons, imageBuffer, taggedUsers = []) {
  let imageMessage;
  if (imageBuffer) {
    try {
      const media = await prepareWAMessageMedia({ image: imageBuffer }, { upload: sock.waUploadToServer });
      imageMessage = media.imageMessage;
    } catch {}
  }

  const interactiveMsg = {
    interactiveMessage: {
      header: { title, hasMediaAttachment: !!imageMessage, ...(imageMessage && { imageMessage }) },
      body: { text: bodyText },
      footer: { text: "_Cevl_" },
      contextInfo: {
        mentionedJid: taggedUsers,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363401731165846@newsletter",
          serverMessageId: 142,
          newsletterName: "Cevl",
        },
      },
      nativeFlowMessage: { buttons },
    },
  };

  return await sock.relayMessage(chatId, interactiveMsg, {
    additionalNodes: [{
      tag: "biz",
      attrs: {},
      content: [{
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
      }],
    }],
  });
}

const ctaChannelBtn = {
  name: "cta_url",
  buttonParamsJson: JSON.stringify({
    display_text: "📢 Channel",
    url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
    webview_interaction: true,
    icon: "default",
  }),
};

export default {
  cmd: ["movie", "akwam", "film"],
  category: "search",
  desc: "Search and download movies/series from Akwam",
  exec: async (m, { sock, query, command }) => {
    if (!query) {
      return m.reply(
        res.format(
          m.prefix ?? ".",
          command,
          [
            "Inception",
            "Avatar",
          ],
          "Cari judul film atau series untuk ditonton/diunduh",
          "Pencarian film dan serial dari Akwam",
        ),
      );
    }

    try {
      let actualQuery = query;
      let selectIndex = null;
      let downloadIndex = null;
      let episodeIndex = null;

      const selM = query.match(/^(.*?)\s*--select\s+(\d+)/i);
      if (selM) { actualQuery = selM[1].trim(); selectIndex = parseInt(selM[2], 10); }

      const epM = query.match(/^(.*?)\s*--episode\s+(\d+)/i);
      if (epM) { actualQuery = epM[1].trim(); episodeIndex = parseInt(epM[2], 10); }

      const dlM = query.match(/^(.*?)\s*--download\s+(\d+)/i);
      if (dlM) { actualQuery = dlM[1].trim(); downloadIndex = parseInt(dlM[2], 10); }

      if (!global.db) global.db = { data: {} };

      if (selectIndex !== null) {
        const searchData = global.db.data.movieSearch?.[m.sender];
        if (!searchData?.results?.length) return m.reply(res.empty("Hasil pencarian tidak ditemukan. Silakan cari ulang."));
        const selected = searchData.results[selectIndex];
        if (!selected) return m.reply(res.warn("Pilihan nomor film tidak valid."));

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        const content = await fetchAkwam({ action: "content", url: selected.url });
        if (!content) throw new Error("Failed to fetch content");

        if (content.type === "series" && content.episodes?.length) {
          if (!global.db.data.movieEpisodes) global.db.data.movieEpisodes = {};
          global.db.data.movieEpisodes[m.sender] = {
            episodes: content.episodes,
            seriesTitle: content.title,
            query: actualQuery,
            timestamp: Date.now(),
          };

          const rows = content.episodes.map((ep, idx) => ({
            id: `${m.prefix ?? ""}${command} ${actualQuery} --episode ${idx}`,
            title: `Episode ${ep.number}`,
            description: ep.title || "",
          }));

          const buttons = [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "📺 Select Episode",
                sections: [{ title: `${content.title} (${content.episodes.length} episodes)`, rows }],
              }),
            },
            ctaChannelBtn,
          ];

          let imgBuff = null;
          try {
            const resp = await axios.get(CLOUDINARY_IMAGE, { responseType: "arraybuffer" });
            imgBuff = Buffer.from(resp.data);
          } catch {}

          await sendInteractiveFlow(sock, m.from, `📺 Episodes: ${content.title}`, "Select an episode to download.", buttons, imgBuff, [m.sender]);
        } else {
          const links = content.downloadLinks || [];
          if (!links.length) return m.reply("⚠️ No download links available for this title.");

          if (!global.db.data.movieCache) global.db.data.movieCache = {};
          global.db.data.movieCache[m.from] = { movieData: content, query: actualQuery };

          const rows = links.map((l, idx) => ({
            id: `${m.prefix ?? ""}${command} ${actualQuery} --download ${idx}`,
            title: `${l.quality} (${l.size})`,
            description: "Click to download",
          }));

          const buttons = [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "📥 Download",
                sections: [{ title: "Select Quality", rows }],
              }),
            },
            ctaChannelBtn,
          ];

          let posterBuff = null;
          try {
            if (content.poster) {
              const pUrl = content.poster.endsWith(".webp") ? content.poster.replace(".webp", ".jpg") : content.poster;
              const resp = await axios.get(pUrl, { responseType: "arraybuffer" });
              posterBuff = Buffer.from(resp.data);
            }
          } catch {}

          await sendInteractiveFlow(
            sock,
            m.from,
            `📥 Download: ${content.title}`,
            `🎬 *${content.title}*\n⭐ Rating: ${content.rating || "N/A"}\n🎞️ Quality: ${content.quality || "N/A"}\n\nSelect a quality to download:`,
            buttons,
            posterBuff,
            [m.sender]
          );
        }
        return;
      }

      if (episodeIndex !== null) {
        const epData = global.db.data.movieEpisodes?.[m.sender];
        if (!epData?.episodes?.length) return m.reply("⚠️ No episodes found. Please search again.");
        const selectedEpisode = epData.episodes[episodeIndex];
        if (!selectedEpisode) return m.reply("❌ Invalid episode selection.");

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        const epContent = await fetchAkwam({ action: "episode", episode: selectedEpisode.url });
        if (!epContent) throw new Error("Failed to fetch episode content");

        const links = epContent.downloadLinks || [];
        if (!links.length) return m.reply("⚠️ No download links available.");

        if (!global.db.data.movieCache) global.db.data.movieCache = {};
        global.db.data.movieCache[m.from] = { movieData: epContent, query: actualQuery };

        const rows = links.map((l, idx) => ({
          id: `${m.prefix ?? ""}${command} ${actualQuery} --download ${idx}`,
          title: `${l.quality} (${l.size})`,
          description: "Click to download",
        }));

        const buttons = [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({ title: "📥 Download", sections: [{ title: "Select Quality", rows }] }),
          },
          ctaChannelBtn,
        ];

        await sendInteractiveFlow(
          sock,
          m.from,
          `📥 Download: Episode ${epContent.number || selectedEpisode.number}`,
          `Select quality to download:`,
          buttons,
          null,
          [m.sender]
        );
        return;
      }

      if (downloadIndex !== null) {
        const cache = global.db.data.movieCache?.[m.from];
        if (!cache?.movieData) return m.reply("⚠️ Movie data not found. Please search again.");
        const movieData = cache.movieData;
        const links = movieData.downloadLinks || [];
        if (downloadIndex >= links.length) return m.reply("❌ Invalid quality selection.");

        const selectedLink = links[downloadIndex];
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        const resolved = await fetchAkwam({ action: "resolve", download: selectedLink.downloadPageUrl });
        if (!resolved?.directUrl) throw new Error("Failed to resolve download");

        await m.reply(`📤 Sending document (${selectedLink.size})... This may take a while for large files.`);
        await sock.sendMessage(
          m.from,
          {
            document: { url: resolved.directUrl },
            mimetype: "video/mp4",
            fileName: resolved.filename || `${movieData.title}.mp4`,
            caption: `🎬 *${movieData.title}*\n📥 Quality: ${selectedLink.quality}\n🔹 Source: Akwam`,
            contextInfo: {
              forwardedNewsletterMessageInfo: {
                newsletterJid: "120363401731165846@newsletter",
                serverMessageId: 142,
                newsletterName: "Cevl",
              },
            },
          },
          { quoted: m }
        );
        return await m.reply("✅ *Download Complete!* Sent as document.");
      }

      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
      const searchRes = await fetchAkwam({ action: "search", query: actualQuery });
      const results = searchRes?.results || [];
      if (!results.length) return m.reply(`❌ No results found for *${actualQuery}*`);

      if (!global.db.data.movieSearch) global.db.data.movieSearch = {};
      global.db.data.movieSearch[m.sender] = { results, query: actualQuery, timestamp: Date.now() };

      const rows = results.slice(0, 20).map((item, idx) => ({
        id: `${m.prefix ?? ""}${command} ${actualQuery} --select ${idx}`,
        title: `${item.title} (${item.year})`,
        description: `${item.type} ⭐${item.rating} 🎞️${item.quality}`,
      }));

      const buttons = [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "🎬 Select Movie/Series",
            sections: [{ title: `Results for "${actualQuery}" (${results.length})`, rows }],
          }),
        },
        ctaChannelBtn,
      ];

      let imgBuff = null;
      try {
        const resp = await axios.get(CLOUDINARY_IMAGE, { responseType: "arraybuffer" });
        imgBuff = Buffer.from(resp.data);
      } catch {}

      await sendInteractiveFlow(
        sock,
        m.from,
        `🎬 Search Results: "${actualQuery}"`,
        `📌 *Found ${results.length} results*\nSelect a movie/series from the dropdown below.`,
        buttons,
        imgBuff,
        [m.sender]
      );
    } catch (e) {
      console.error("Movie error:", e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(`❌ Error: ${e.message || "Unknown error"}`);
    }
  },
};
