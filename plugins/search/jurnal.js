import axios from "axios";
import * as cheerio from "cheerio";
import { res } from "../../src/response.js";

export default {
  cmd: ["jurnal", "gscholar", "scholar"],
  category: "search",
  desc: "Mencari referensi jurnal akademis di Google Scholar.",
  exec: async (m, { sock, query, command }) => {
    if (!query) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          "data driven ui/ux design",
          "Pencarian referensi jurnal ilmiah dan publikasi akademis dari Google Scholar",
          "Cari artikel atau topik penelitian ilmiah",
        ),
      );
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const { data } = await axios.get(`https://scholar.google.com/scholar?q=${encodeURIComponent(query)}&hl=id`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "id,en-US;q=0.7,en;q=0.3",
        },
      });

      const $ = cheerio.load(data);
      const results = [];

      $(".gs_r.gs_or.gs_scl").each((i, el) => {
        if (i < 5) {
          const title = $(el).find(".gs_rt a").text() || $(el).find(".gs_rt").text();
          const link = $(el).find(".gs_rt a").attr("href") || "#";
          const info = $(el).find(".gs_a").text();
          if (title) results.push({ title, link, info });
        }
      });

      if (!results.length) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.empty(`Jurnal penelitian dengan topik "${query}" tidak ditemukan.`));
      }

      let teks = `『 *GOOGLE SCHOLAR RESULTS* 』\n\n> *Kata Kunci:* "${query}"\n\n`;
      results.forEach((r, i) => {
        teks += `*${i + 1}. ${r.title}*\n   ◦ *Penerbit:* _${r.info}_\n   ◦ *Tautan:* ${r.link}\n\n`;
      });
      teks += `*Catatan :* _Beberapa dokumen mungkin membutuhkan akses institusi untuk Full PDF._`;

      await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
      return m.reply(teks);
    } catch (e) {
      console.error("[SCHOLAR_ERR]", e.message);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error);
    }
  },
};
