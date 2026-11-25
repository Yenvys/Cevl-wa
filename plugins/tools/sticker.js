import { downloadMediaMessage } from "baileys";
import { res } from "../../src/response.js";

export default {
  cmd: ["sticker", "s", "stiker"],
  category: "tools",
  desc: "Mengonversi media gambar atau video menjadi stiker WhatsApp",

  exec: async (m, { sock, command }) => {
    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || q.mimetype || "";
    const type = q.type || m.type || "";
    const isMedia = /image|video/.test(mime) || /image|video/.test(type);

    if (!isMedia) {
      return m.reply(res.noMedia("gambar atau video"));
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const buffer =
        (await q.download?.()) ||
        (await downloadMediaMessage(
          {
            key: m.quoted ? { id: m.quoted.id, remoteJid: m.from } : m.key,
            message: q.message || (m.quoted ? q.msg : m.message),
          },
          "buffer",
          {},
          { logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } },
        ).catch(() => null));

      if (!buffer) throw new Error("Gagal mengunduh media");

      const isVideo = /video/.test(mime) || /video/.test(type);
      await sock.sendSticker(m.from, buffer, m, { isAnimated: isVideo });
      await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
    } catch (e) {
      console.error("[STICKER_GEN_ERR]", e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(res.error);
    }
  },
};
