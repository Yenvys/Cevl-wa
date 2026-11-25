import { res } from "../../src/response.js";

export default {
  cmd: ["hidetag", "ht", "pengumuman"],
  category: "grup",
  desc: "Tag semua member secara tersembunyi (Admin/Owner)",
  exec: async (m, { sock, args }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!m.isAdmin && !m.isOwner) return m.reply(res.admin);

    let target = m;
    let text = args.join(" ");

    if (!text && m.quoted) {
      text = m.quoted.text || m.quoted.body || "";
      target = m.quoted;
    }
    if (!text) text = "📢 Pengumuman!";

    try {
      const groupMetadata = await sock.groupMetadata(m.from);
      const mentions = groupMetadata.participants.map((v) => v.id);

      const mime = target.mimetype || "";
      const isMedia = /image|video/.test(mime);

      if (isMedia && target.download) {
        const media = await target.download();
        if (media) {
          const isVid = /video/.test(mime);
          return await sock.sendMessage(m.from, {
            [isVid ? "video" : "image"]: media,
            caption: text,
            mentions,
          });
        }
      }

      await sock.sendMessage(m.from, { text, mentions });
    } catch (e) {
      console.error("[HIDETAG_ERR]", e);
      m.reply("_Gagal melakukan hidetag._");
    }
  },
};
