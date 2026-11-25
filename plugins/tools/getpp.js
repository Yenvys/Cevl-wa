import { res } from "../../src/response.js";

const DEFAULT_PP = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png";

export default {
  cmd: ["getpp", "pp", "foto"],
  category: "tools",
  desc: "Mengambil foto profil target WhatsApp",

  exec: async (m, { sock }) => {
    const target = m.quoted ? m.quoted.sender : m.mentionedJid?.[0] || m.sender;
    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      let ppUrl;
      try {
        ppUrl = await sock.profilePictureUrl(target, "image");
      } catch {
        ppUrl = DEFAULT_PP;
      }

      await sock.sendMessage(
        m.from,
        {
          image: { url: ppUrl },
          caption: `_JID:* @${target.split("@")[0]}_`,
          mentions: [target],
        },
        { quoted: m },
      );
      await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
    } catch (e) {
      console.error("[GETPP_ERR]", e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(res.error);
    }
  },
};
