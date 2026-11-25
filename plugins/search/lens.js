import axios from "axios";
import FormData from "form-data";
import { res } from "../../src/response.js";

async function uploadMedia(buffer) {
  try {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", buffer, { filename: "upload.jpg", contentType: "image/jpeg" });
    const { data } = await axios.post("https://catbox.moe/user/api.php", form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
    });
    return data?.startsWith("http") ? data : null;
  } catch (err) {
    console.error("[UPLOAD_LENS_ERROR]", err.message);
    return null;
  }
}

export default {
  cmd: ["lens", "googlelens"],
  category: "search",
  desc: "Pencarian gambar melalui Google Lens.",
  exec: async (m, { sock, command }) => {
    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || "";
    if (!/image/.test(mime)) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          "",
          "Kirim gambar dengan caption perintah ini atau reply gambar yang sudah ada",
          "Pencarian informasi objek visual melalui Google Lens",
        ),
      );
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const buffer = await q.download();
      const imageUrl = await uploadMedia(buffer);
      if (!imageUrl) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error);
      }

      const serpUrl = `https://serpapi.com/search.json?engine=google_lens&url=${encodeURIComponent(imageUrl)}&api_key=${process.env.SERPAPI_KEY}&hl=id&gl=id`;
      const { data } = await axios.get(serpUrl);

      let capt = `『 *GOOGLE LENS RESULTS* 』\n\n`;
      let hasResults = false;

      if (data.knowledge_graph?.length) {
        hasResults = true;
        const kg = data.knowledge_graph[0];
        capt += `*🧠 Knowledge Graph*\n   ◦ *Title:* ${kg.title || "-"}\n${kg.subtitle ? `   ◦ *Subtitle:* ${kg.subtitle}\n` : ""}\n`;
      }

      if (data.exact_matches?.length) {
        hasResults = true;
        capt += `*🎯 Exact Matches*\n`;
        data.exact_matches.slice(0, 3).forEach((v, i) => {
          capt += `*${i + 1}. ${v.title || "Tanpa Judul"}*\n   ◦ *Sumber:* ${v.source || "Tidak diketahui"}\n   ◦ *Tautan:* ${v.link}\n\n`;
        });
      }

      if (data.visual_matches?.length) {
        hasResults = true;
        capt += `*🔍 Visual Matches*\n`;
        data.visual_matches.slice(0, 5).forEach((v, i) => {
          capt += `*${i + 1}. ${v.title || "Tanpa Judul"}*\n   ◦ *Sumber:* ${v.source || "Tidak diketahui"}\n   ◦ *Tautan:* ${v.link}\n\n`;
        });
      }

      if (!hasResults) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply("_Pencarian selesai! Tidak ditemukan hasil yang cocok._");
      }

      await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
      return await m.reply(capt.trim());
    } catch (e) {
      console.error("[GOOGLE_LENS_ERR]", e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(`Terjadi kesalahan sistem internal: ${e.message}`);
    }
  },
};
