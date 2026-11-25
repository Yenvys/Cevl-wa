import axios from "axios";
import { res } from "../../src/response.js";

export default {
  cmd: ["threads", "thread", "threadsmate"],
  category: "download",
  desc: "Download media (video/photo/GIF) dari Threads",
  exec: async (m, { sock, query, command }) => {
    if (!query) return m.reply(res.format(m.prefix, command, "https://www.threads.net/..."));
    if (!/threads\.(net|com)/i.test(query)) return m.reply(res.invalidUrl("threads.net atau threads.com"));

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const apiKey = process.env.JEREXD_API_KEY;
      if (!apiKey) return m.reply(res.warn("JEREXD_API_KEY tidak dikonfigurasi di .env"));

      const { data } = await axios.get(`https://api.jerexd.my.id/api/downloader/sssthreads?apikey=${apiKey}&url=${encodeURIComponent(query)}`);
      if (!data?.status || !data.result?.media) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error(`Gagal mengambil media: ${data?.error || "Respons API tidak valid."}`));
      }

      const medias = (data.result.media || [])
        .filter((item) => typeof item.download === "string" && item.download.startsWith("http"))
        .map((item) => ({ url: item.download, isVideo: item.type === "video" || item.download.includes(".mp4") }));

      if (!medias.length) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.empty("Media tidak ditemukan atau akun di-private."));
      }

      const authorText = data.result.author ? `*@${data.result.author.username}*: ${data.result.author.caption}\n\n` : "";
      const capt = `*THREADS DOWNLOADER*\n\n${authorText}_Diproses dari sssthreads._`;

      if (medias.length > 1) {
        await m.reply(`${capt}\n\n_Mengirim album (${medias.length} media)..._`);
        for (const item of medias) {
          await sock.sendMessage(
            m.from,
            item.isVideo ? { video: { url: item.url }, mimetype: "video/mp4" } : { image: { url: item.url }, mimetype: "image/jpeg" },
            { quoted: m }
          );
        }
      } else {
        const item = medias[0];
        await sock.sendMessage(
          m.from,
          item.isVideo ? { video: { url: item.url }, caption: capt, mimetype: "video/mp4" } : { image: { url: item.url }, caption: capt },
          { quoted: m }
        );
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[THREADS_DL_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(`_Terjadi kesalahan API:_ ${err.response?.data?.error || err.message}`);
    }
  },
};
