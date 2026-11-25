import { res } from "../../src/response.js";

export default {
  cmd: ["del", "delete"],
  category: "grup",
  desc: "Hapus pesan di grup (reply pesan yang ingin dihapus)",
  exec: async (m, { sock }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!m.isOwner && !m.isAdmin) return m.reply(res.admin);
    if (!m.isBotAdmin) return m.reply(res.botAdmin);
    if (!m.quoted) return m.reply(res.warn("Reply pesan yang ingin dihapus!"));

    try {
      await sock.sendMessage(m.from, {
        delete: {
          remoteJid: m.from,
          fromMe: false,
          id: m.quoted.id,
          participant: m.quoted.sender,
        },
      });
    } catch {
      m.reply(res.error("Gagal menghapus pesan. Pastikan bot adalah admin grup."));
    }
  },
};
