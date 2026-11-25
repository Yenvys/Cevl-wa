import fs from "node:fs";
import path from "node:path";

const defenseFile = path.join(process.cwd(), "data", "defense.json");

export function getDefenseConfig() {
  try {
    if (fs.existsSync(defenseFile)) {
      return JSON.parse(fs.readFileSync(defenseFile, "utf-8"));
    }
  } catch {}
  return {
    active: true,
    allow_status: [
      "extendedTextMessage",
      "videoMessage",
      "imageMessage",
      "audioMessage",
      "protocolMessage",
      "senderKeyDistributionMessage",
      "associatedChildMessage",
      "reactionMessage",
    ],
  };
}

export async function runDefender(m, { sock, handler }) {
  if (m.fromMe) return;

  const cfg = getDefenseConfig();
  if (!cfg.active) return;

  let reason = "";

  const isStatus = m.from === "status@broadcast" || m.key?.remoteJid === "status@broadcast";
  if (isStatus && !cfg.allow_status?.includes(m.type)) {
    reason = "Pesan status dengan tipe yang tidak diizinkan";
  } else if (m.mentionedJid?.length > 1024) {
    reason = "Terlalu banyak penyebutan JID";
  } else {
    const rawMsgs = [m.message?.botInvokeMessage?.message, m.message].filter(Boolean);
    for (const msg of rawMsgs) {
      if (msg.newsletterAdminInviteMessage?.caption?.length > 256) {
        reason = "Teks berlebihan (overload caption)";
        break;
      }
      if (msg.interactiveMessage?.nativeFlowMessage?.messageParamsJson?.length > 2048) {
        reason = "Teks berlebihan (overload native flow)";
        break;
      }
    }
  }

  if (!reason) return;

  handler.log.warn("DEFENDER", `Pertahanan: ${reason} dari ${m.sender} di ${m.from}`);

  try {
    await sock.updateBlockStatus(m.sender, "block").catch(() => {});
    if (!m.isGroup || m.isBotAdmin) {
      await sock.sendMessage(m.from, { delete: m.key }).catch(() => {});
    }
    await sock.chatModify(
      { deleteForMe: { deleteMedia: true, key: m.key, timestamp: Date.now() } },
      m.from
    ).catch(() => {});

    if (m.isGroup && m.isBotAdmin) {
      await sock.groupParticipantsUpdate(m.from, [m.sender], "remove").catch(() => {});
    }
  } catch (err) {
    handler.log.error("DEFENDER_ERR", err.message);
  }
}
