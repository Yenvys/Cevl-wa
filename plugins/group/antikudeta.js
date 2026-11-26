import { config } from "../../config.js";

const norm = (jid) => String(jid || "").split("@")[0].split(":")[0];
const raidTracker = new Map();
const KUDETA_CMD_REGEX = /^[./!#]?\s*(kudeta|kudet|kickall|kicksemua|bantai|ratain|culikall)\b/i;

const isOwnerJid = (jid) => {
  const num = norm(jid);
  const owners = Array.isArray(config.ownerNumbers) ? config.ownerNumbers : [];
  return owners.some((o) => norm(o) === num);
};

function setupParticipantListener(sock) {
  if (sock.__antiKudetaAttached) return;
  sock.__antiKudetaAttached = true;

  sock.ev.on("group-participants.update", async (update) => {
    try {
      const { id: groupJid, author, participants = [], action } = update || {};
      if (!groupJid?.endsWith("@g.us")) return;
      if (!["remove", "demote"].includes(action)) return;
      if (!author) return;

      const botNum = norm(sock.user?.id);
      const botLid = norm(sock.user?.lid);
      const authorNum = norm(author);
      if (!authorNum || authorNum === botNum || authorNum === botLid) return;

      if (isOwnerJid(author)) return;

      const meta = await sock.groupMetadata(groupJid).catch(() => null);
      if (!meta) return;

      const botIsAdmin = meta.participants?.some(
        (p) => (norm(p.id) === botNum || norm(p.lid) === botLid) && (p.admin === "admin" || p.admin === "superadmin")
      );
      if (!botIsAdmin) return;

      const now = Date.now();
      const events = (raidTracker.get(groupJid) || []).filter((t) => now - t < 10000);
      events.push(now);
      raidTracker.set(groupJid, events);

      // Keluarkan pelaku yang melakukan kick / demote tanpa izin owner
      await sock.groupParticipantsUpdate(groupJid, [author], "remove").catch(() => {});

      // Kembalikan member yang dikeluarkan
      if (action === "remove" && participants.length > 0) {
        await sock.groupParticipantsUpdate(groupJid, participants, "add").catch(() => {});
      }

      // Jika terdeteksi raid massal (>= 2 aksi dalam 10 detik), demote admin lain untuk lockdown
      if (events.length >= 2) {
        const otherAdmins = (meta.participants || [])
          .filter((p) => {
            const n = norm(p.id);
            const isAdm = p.admin === "admin" || p.admin === "superadmin";
            const isBot = n === botNum || norm(p.lid) === botLid;
            const own = isOwnerJid(p.id);
            return isAdm && !isBot && !own && n !== authorNum;
          })
          .map((p) => p.id);

        if (otherAdmins.length > 0) {
          await sock.groupParticipantsUpdate(groupJid, otherAdmins, "demote").catch(() => {});
        }
      }

      await sock.sendMessage(groupJid, {
        text: `*ANTI-KUDETA / ANTI-KICK-ALL*\n@${authorNum} dikeluarkan karena melakukan *${action}* tanpa izin Owner.`,
        mentions: [author],
      });
    } catch (err) {
      console.error("[ANTI-KUDETA ERROR]", err.message);
    }
  });
}

export default {
  cmd: ["antikudeta", "kudeta"],
  category: "group",
  desc: "Sistem keamanan anti-kudeta dan anti-kickall grup",

  exec: async (m) => {
    return m.reply(
      `*ANTI-KUDETA & ANTI-RAID AKTIF*\n\n` +
      `Sistem proteksi otomatis grup:\n` +
      `> • Mendeteksi perintah terlarang (kudeta, kickall, bantai, ratain, dll)\n` +
      `> • Mengeluarkan admin nakal yang melakukan kick/demote tanpa izin\n` +
      `> • Otomatis memasukkan kembali member yang dikeluarkan\n` +
      `> • Mengunci (demote) admin lain jika terjadi raid massal (>= 2 tindakan / 10 detik)`
    );
  },

  attach: async (sock) => {
    setupParticipantListener(sock);
  },

  before: async (m, { sock, isOwner, isBotAdmin }) => {
    if (!sock) return false;
    setupParticipantListener(sock);

    if (m?.isGroup && !m.fromMe && !isOwner && isBotAdmin) {
      const body = String(m.body || m.text || "").trim();
      if (KUDETA_CMD_REGEX.test(body)) {
        try {
          await sock.groupParticipantsUpdate(m.from, [m.sender], "remove");
          await sock.sendMessage(m.from, {
            text: `*ANTI-KUDETA*\n@${norm(m.sender)} dikeluarkan karena mencoba menjalankan perintah terlarang.`,
            mentions: [m.sender],
          });
        } catch (err) {
          console.error("[ANTI-KUDETA CMD ERROR]", err.message);
        }
        return true;
      }
    }
    return false;
  },
};
