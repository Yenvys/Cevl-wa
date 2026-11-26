import { res } from "../../src/response.js";

const norm = (jid) => String(jid || "").split("@")[0].split(":")[0];

export default {
  cmd: ["kickall", "kicksemua", "ratain"],
  category: "grup",
  desc: "Mengeluarkan semua member non-admin dari grup (Khusus Admin / Owner)",

  exec: async (m, { sock, isAdmin, isBotAdmin, isOwner }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!isAdmin && !isOwner) return m.reply(res.admin);
    if (!isBotAdmin) return m.reply(res.botAdmin);

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const meta = await sock.groupMetadata(m.from).catch(() => null);
      if (!meta) throw new Error("Gagal mengambil metadata grup.");

      const botNum = norm(sock.user?.id);
      const botLid = norm(sock.user?.lid);

      const targets = (meta.participants || [])
        .filter((p) => {
          const num = norm(p.id);
          const lid = norm(p.lid);
          const isBot =
            (botNum && (num === botNum || lid === botNum)) ||
            (botLid && (num === botLid || lid === botLid));
          const isGroupAdmin = p.admin === "admin" || p.admin === "superadmin";
          return !isBot && !isGroupAdmin;
        })
        .map((p) => p.id);

      if (targets.length === 0) {
        await sock.sendMessage(m.from, { react: { text: "ℹ️", key: m.key } });
        return m.reply("ℹ️ Tidak ada member non-admin yang bisa dikeluarkan.");
      }

      await m.reply(`⏳ Mengeluarkan *${targets.length}* member non-admin dari grup...`);
      await sock.groupParticipantsUpdate(m.from, targets, "remove");
      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      return m.reply(`✅ Berhasil mengeluarkan *${targets.length}* member non-admin dari grup!`);
    } catch (err) {
      console.error("[KICKALL ERROR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error(`Gagal mengeluarkan member: ${err.message}`));
    }
  },
};
