import { downloadContentFromMessage } from "baileys";
import { res } from "../../src/response.js";

export default {
  cmd: ["swgc"],
  category: "grup",
  desc: "Mengirim ulang pesan atau media ke dalam grup (status whatsapp)",
  exec: async (m, { sock, query }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!m.isOwner && !m.isAdmin) return m.reply(res.admin);

    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || "";
    const isMedia = /image|video|audio/.test(mime);
    const text = query || (q.msg || q).caption || "";

    await m.react("⏳");

    try {
      const content = { contextInfo: { isGroupStatus: true, remoteJid: m.from } };

      if (isMedia) {
        const downloadType = mime.split("/")[0];
        const stream = await downloadContentFromMessage(q.msg || q, downloadType);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        if (downloadType === "audio") {
          content.audio = buffer;
          content.ptt = true;
          content.mimetype = "audio/ogg; codecs=opus";
        } else {
          content[downloadType] = buffer;
          content.caption = text || undefined;
        }
      } else {
        if (!query) {
          await m.react("❌");
          return m.reply(res.format(m.prefix, "swgc", "Halo semua!", "Masukkan teks pesan atau reply media"));
        }
        content.text = query;
      }

      await sock.sendMessage(m.from, content);
      await m.react("");
    } catch (e) {
      console.error("[SWGC_ERR]", e);
      await m.react("❌");
      await m.reply(res.error);
    }
  },
};
