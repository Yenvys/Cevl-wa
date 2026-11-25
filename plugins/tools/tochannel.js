import { res } from "../../src/response.js";

const NEWSLETTER_JID = "120363401731165846@newsletter";

export default {
  cmd: ["tochannel", "tch", "saluran", "toch"],
  category: "tools",
  desc: "Meneruskan pesan/caption ke saluran (newsletter)",

  exec: async (m, { sock, command }) => {
    if (!m.quoted) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          ["", "caption baru"],
          "Reply pesan atau media yang ingin diteruskan ke saluran",
        ),
      );
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const { type = "", msg } = m.quoted;
      const customCaption = m.query || "";
      let text = "";

      if (["conversation", "extendedTextMessage"].includes(type)) {
        text = m.quoted.text || msg?.text || "";
      } else if (["imageMessage", "videoMessage", "documentMessage", "documentWithCaptionMessage"].includes(type)) {
        text = msg?.caption || m.quoted.text || "";
      }

      if (customCaption) {
        text = text ? `${customCaption}\n\n${text}` : customCaption;
      }

      if (!text) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.empty("Tidak ada teks atau caption yang dapat diteruskan."));
      }

      await sock.sendMessage(NEWSLETTER_JID, { text });
      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });

      if (!["conversation", "extendedTextMessage"].includes(type)) {
        return m.reply(res.success("Caption berhasil diteruskan ke saluran!"));
      }
      return m.reply(res.success("Pesan teks berhasil diteruskan ke saluran!"));
    } catch (err) {
      console.error("[TOCHANNEL_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      if (err.message?.includes("not-authorized") || err.message?.includes("403")) {
        return m.reply(res.warn("Bot bukan admin di saluran tujuan! Pastikan bot sudah menjadi admin."));
      }
      return m.reply(res.error(`Gagal meneruskan ke saluran: ${err.message || ""}`));
    }
  },
};
