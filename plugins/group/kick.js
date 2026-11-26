import { config } from "../../config.js";
import { res } from "../../src/response.js";

const norm = (jid) => String(jid || "").split("@")[0].split(":")[0];

const isOwnerJid = (jid) => {
  const num = norm(jid);
  const owners = Array.isArray(config.ownerNumbers) ? config.ownerNumbers : [];
  return owners.some((o) => norm(o) === num);
};

export default {
  cmd: ["kick", "tendang", "kickall", "kicksemua", "ratain"],
  category: "grup",
  desc: "Mengeluarkan member atau semua member non-admin dari grup",

  exec: async (m, { sock, command }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!m.isOwner && !m.isAdmin) return m.reply(res.admin);
    if (!m.isBotAdmin) return m.reply(res.botAdmin);

    const isAll =
      ["kickall", "kicksemua", "ratain"].includes(command) ||
      m.query?.trim()?.toLowerCase() === "all";

    // 1. Kick All Non-Admin
    if (isAll) {
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
            const isOwner = isOwnerJid(p.id);
            return !isBot && !isGroupAdmin && !isOwner;
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
    }

    // 2. Kick Member Tertentu (Tag / Reply / Nomor)
    const botNum = norm(sock.user?.id);
    const botLid = norm(sock.user?.lid);

    let targets = [];
    if (m.mentionedJid && m.mentionedJid.length > 0) {
      targets = m.mentionedJid;
    } else if (m.quoted?.sender) {
      targets = [m.quoted.sender];
    } else if (m.query && m.query.replace(/[^0-9]/g, "").length >= 10) {
      targets = [`${m.query.replace(/[^0-9]/g, "")}@s.whatsapp.net`];
    }

    if (!targets.length) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} [@tag/reply/all]`,
          ["@user", "all"],
          "Gunakan 'all' atau perintah 'kickall' untuk mengeluarkan semua member non-admin sekaligus.",
          "Mengeluarkan member atau semua member non-admin dari grup"
        )
      );
    }

    // Filter agar bot dan owner tidak ikut ter-kick
    const validTargets = targets.filter((t) => {
      const n = norm(t);
      return n !== botNum && n !== botLid && !isOwnerJid(t);
    });

    if (validTargets.length === 0) {
      return m.reply(res.owner);
    }

    try {
      await sock.groupParticipantsUpdate(m.from, validTargets, "remove");
      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (e) {
      console.error("[KICK_MEMBER_ERR]", e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(res.error);
    }
  },
};
