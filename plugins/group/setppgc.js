import { getMedia } from "../../src/helper.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["setppgc", "setppgroup"],
  category: "grup",
  desc: "Ganti foto profil grup (Admin Only)",
  exec: async (m, { sock, isAdmin, isBotAdmin, command }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!m.isOwner && !isAdmin) return m.reply(res.admin);
    if (!isBotAdmin) return m.reply(res.botAdmin);

    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || "";
    if (!/image/.test(mime)) return m.reply(res.noMedia("gambar"));

    await m.react("⏳");

    try {
      const { buffer } = await getMedia(m, sock);
      if (!buffer) {
        await m.react("❌");
        return m.reply(res.error);
      }

      await sock.updateProfilePicture(m.from, buffer);
      await m.react("");
    } catch (e) {
      console.error("[SETPPGC_ERR]", e);
      await m.react("❌");
      await m.reply(res.error);
    }
  },
};
