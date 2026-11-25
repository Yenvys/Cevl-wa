import fetch from "node-fetch";
import { res } from "../../src/response.js";

export default {
  cmd: ["wiki", "wikipedia"],
  category: "search",
  desc: "Mencari artikel ensiklopedia di Wikipedia Indonesia.",
  exec: async (m, { sock, query, command }) => {
    if (!query) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          "Albert Einstein",
          "Masukkan topik atau kata kunci ensiklopedia yang ingin dicari",
          "Mencari artikel ensiklopedia di Wikipedia Indonesia",
        ),
      );
    }

    try {
      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

      const searchRes = await fetch(`https://id.wikipedia.org/w/api.php?action=opensearch&format=json&search=${encodeURIComponent(query)}&limit=1`);
      const searchData = await searchRes.json();

      if (!searchData[1]?.length) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.empty(`Topik "${query}" tidak ditemukan di Wikipedia.`));
      }

      const title = searchData[1][0];
      const detailRes = await fetch(`https://id.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|pageimages&exintro&explaintext&exsentences=5&pithumbsize=1000&titles=${encodeURIComponent(title)}`);
      const detailData = await detailRes.json();
      const pages = detailData.query?.pages || {};
      const result = pages[Object.keys(pages)[0]] || {};

      const thumb = result.thumbnail?.source || null;
      const articleUrl = `https://id.wikipedia.org/wiki/${encodeURIComponent(title)}`;

      const teks =
        `『 *WIKIPEDIA* 』\n\n` +
        `📌 ${result.title || title}\n` +
        `${result.extract || "Tidak ada ringkasan teks deskripsi yang tersedia."}\n\n` +
        `🔗 *Tautan Artikel:* ${articleUrl}`;

      if (thumb) {
        await sock.sendMessage(m.from, { image: { url: thumb }, caption: teks }, { quoted: m });
      } else {
        await m.reply(teks);
      }
      await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
    } catch (e) {
      console.error("[WIKI_ERR]", e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply("_Terjadi kendala teknis saat memproses data Wikipedia._");
    }
  },
};
