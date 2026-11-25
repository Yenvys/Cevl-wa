import axios from "axios";
import { prepareWAMessageMedia } from "baileys";
import { res } from "../../src/response.js";

const activeDownloads = new Set();

async function handleDownload(m, sock, query, num) {
  const downloadKey = `${m.sender}_${query}_${num}`;
  if (activeDownloads.has(downloadKey)) return m.reply(res.wait("Download sedang berlangsung, harap tunggu..."));
  activeDownloads.add(downloadKey);

  try {
    if (!global.db) global.db = { data: {} };
    const appleData = global.db.data.appleMusic?.[m.sender];
    let results = appleData?.results || [];
    let searchQuery = appleData?.query || query;

    if (!results.length) {
      const searchUrl = `https://api.omegatech.app/api/Search/Applemusic?action=search&query=${encodeURIComponent(query)}`;
      const { data } = await axios.get(searchUrl, { timeout: 30000 });
      if (!data?.success || !data.data?.results?.length) {
        return m.reply(res.empty(`Lagu "${query}" tidak ditemukan di Apple Music.`));
      }
      results = data.data.results;
      searchQuery = query;
      if (!global.db.data.appleMusic) global.db.data.appleMusic = {};
      global.db.data.appleMusic[m.sender] = { results, query, timestamp: Date.now() };
    }

    const selectedSong = results[num - 1];
    if (!selectedSong) return m.reply(res.empty(`Lagu #${num} tidak ditemukan. Silakan lakukan pencarian ulang.`));

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
    const downloadUrl = `https://api.omegatech.app/api/Search/Applemusic?action=download&query=${encodeURIComponent(searchQuery)}&url=${encodeURIComponent(selectedSong.url)}`;
    const { data: dlData } = await axios.get(downloadUrl, { timeout: 60000 });

    if (!dlData?.success || !dlData.data?.downloadUrl) throw new Error("Failed to get download URL");

    const title = dlData.data.title || selectedSong.title;
    await sock.sendMessage(
      m.from,
      {
        audio: { url: dlData.data.downloadUrl },
        mimetype: "audio/mpeg",
        ptt: false,
        fileName: `${title}.mp3`,
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

    delete global.db.data.appleMusic?.[m.sender];
  } catch (error) {
    console.error("Download error:", error);
    await m.reply(res.error("Gagal mengunduh lagu dari Apple Music."));
  } finally {
    activeDownloads.delete(downloadKey);
  }
}

export default {
  cmd: ["song", "apple"],
  category: "search",
  desc: "Search and play music from Apple Music",
  exec: async (m, { sock, query, command }) => {
    if (!query) {
      return m.reply(
        res.format(
          m.prefix ?? ".",
          command,
          "Marshmello Alone",
          "Masukkan judul lagu atau nama musisi yang ingin diputar",
          "Pencarian dan pemutar lagu dari Apple Music",
        ),
      );
    }

    const parts = query.split(" ");
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart)) {
      return await handleDownload(m, sock, parts.slice(0, -1).join(" "), parseInt(lastPart, 10));
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const searchUrl = `https://api.omegatech.app/api/Search/Applemusic?action=search&query=${encodeURIComponent(query)}`;
      const { data } = await axios.get(searchUrl, { timeout: 30000 });
      if (!data?.success || !data.data?.results?.length) {
        return m.reply(res.empty(`Lagu "${query}" tidak ditemukan di Apple Music.`));
      }

      const results = data.data.results;
      const total = data.data.total || results.length;

      if (!global.db) global.db = { data: {} };
      if (!global.db.data.appleMusic) global.db.data.appleMusic = {};
      global.db.data.appleMusic[m.sender] = { results, query, timestamp: Date.now() };

      const buttons = [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "Select a Song",
            sections: [{
              title: "Select to Download",
              rows: results.slice(0, 5).map((song, i) => ({
                id: `${m.prefix ?? ""}${command} ${query} ${i + 1}`,
                title: `${song.title} - ${song.artist}`,
              })),
            }],
          }),
        },
        {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: "📢 Channel",
            url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
            webview_interaction: true,
            icon: "default",
          }),
        },
      ];

      let imageMessage;
      try {
        if (results[0]?.cover) {
          const resp = await axios.get(results[0].cover.replace(".webp", ".jpg"), { responseType: "arraybuffer" });
          const media = await prepareWAMessageMedia({ image: Buffer.from(resp.data) }, { upload: sock.waUploadToServer });
          imageMessage = media.imageMessage;
        }
      } catch {}

      const interactiveMsg = {
        interactiveMessage: {
          header: { title: `${total} Results for "${query}"`, hasMediaAttachment: !!imageMessage, ...(imageMessage && { imageMessage }) },
          body: {
            text: `📌 *Select a song to download:*\n${results.slice(0, 5).map((s, i) => `> ${i + 1}. *${s.title}* - ${s.artist}`).join("\n")}`,
          },
          footer: { text: "_Cevl_" },
          contextInfo: {
            mentionedJid: [m.sender],
            forwardedNewsletterMessageInfo: {
              newsletterJid: "120363401731165846@newsletter",
              serverMessageId: 142,
              newsletterName: "Cevl",
            },
          },
          nativeFlowMessage: { buttons },
        },
      };

      await sock.relayMessage(m.from, interactiveMsg, {
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
    } catch (error) {
      console.error("Apple Music Error:", error);
      await m.reply("❌ Error searching Apple Music. Please try again later.");
    }
  },
};
