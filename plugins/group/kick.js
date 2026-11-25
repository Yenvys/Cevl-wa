import { res } from "../../src/response.js";

export default {
  cmd: ["kick"],
  category: "grup",
  desc: "Mengeluarkan member dari grup",
  exec: async (m, { sock, command }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!m.isOwner && !m.isAdmin) return m.reply(res.admin);
    if (!m.isBotAdmin) return m.reply(res.botAdmin);

    let target =
      m.mentionedJid?.[0] ||
      m.quoted?.sender ||
      (m.query ? `${m.query.replace(/[^0-9]/g, "")}@s.whatsapp.net` : null);

    if (!target || target.length < 10) return m.reply(res.format(m.prefix, command, "@tag/reply pesan"));
    if (target.includes(sock.user.id.split(":")[0])) return m.reply(res.owner);

    try {
      await sock.groupParticipantsUpdate(m.from, [target], "remove");
      await m.react("");
    } catch (e) {
      console.error("[KICK_MEMBER_ERR]", e);
      await m.reply(res.error);
    }
  },
};
