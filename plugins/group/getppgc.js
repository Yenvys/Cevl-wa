import { res } from "../../src/response.js";

export default {
  cmd: ["getppgc"],
  category: "grup",
  desc: "Ambil foto profil grup saat ini",
  exec: async (m, { sock }) => {
    if (!m.isGroup) return m.reply(res.group);
    await m.react("⏳");

    try {
      const ppUrl = await sock.profilePictureUrl(m.from, "image").catch(() => null);
      if (!ppUrl) {
        await m.react("❌");
        return m.reply("_Grup ini tidak menggunakan foto profil atau bot tidak memiliki akses._");
      }

      await sock.sendMessage(
        m.from,
        { image: { url: ppUrl }, caption: `*GROUP PROFILE PICTURE*\n\n> *Grup:* ${m.groupName || "Grup"}\n> ${ppUrl}` },
        { quoted: m }
      );
      await m.react("");
    } catch (e) {
      console.error("[PPGC_ERR]", e);
      await m.react("❌");
      await m.reply("Terjadi kesalahan saat mengambil foto profil grup.");
    }
  },
};
