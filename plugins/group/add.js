import { res } from "../../src/response.js";

export default {
  cmd: ["add", "tambah"],
  category: "grup",
  desc: "Menambahkan member ke grup",
  exec: async (m, { sock, command }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!m.isOwner && !m.isAdmin) return m.reply(res.admin);
    if (!m.isBotAdmin) return m.reply(res.botAdmin);

    let users = m.quoted ? [m.quoted.sender] : m.mentionedJid || [];
    if (m.query && !users.length) {
      users.push(`${m.query.replace(/[^0-9]/g, "")}@s.whatsapp.net`);
    }
    if (!users.length) return m.reply(res.format(m.prefix, command, "@tag/reply pesan/nomor"));

    try {
      for (const jid of users) {
        await sock.groupParticipantsUpdate(m.from, [jid], "add");
      }
      await m.react("");
    } catch (e) {
      console.error("[ADD_MEMBER_ERR]", e);
      await m.reply(res.error);
    }
  },
};
