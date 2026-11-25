import { getContentType, jidNormalizedUser, downloadMediaMessage } from "baileys";
import db, { getLidMapping, saveContact, saveMetadata, syncParticipants } from "./database.js";
import fs from "node:fs";
import path from "node:path";
import { getMessageFromStoreById, groupCache } from "./helper.js";

const GROUP_CACHE_TTL = 300000;
const VIEW_ONCE_TYPES = new Set(["viewOnceMessageV2", "viewOnceMessage", "ephemeralMessage"]);

function unwrapMessage(msg) {
  let content = msg;
  while (content) {
    const type = getContentType(content);
    if (VIEW_ONCE_TYPES.has(type)) {
      content = content[type]?.message || content[type];
    } else break;
  }
  return content;
}

export async function serialize(sock, m) {
  if (!m) return m;

  if (m.key) {
    m.id = m.key.id;
    m.from = jidNormalizedUser(m.key.remoteJid);
    m.isGroup = m.from.endsWith("@g.us");
    m.isNewsletter = m.from.endsWith("@newsletter");

    let participant = m.isGroup ? m.key.participant : m.from;
    if (participant?.endsWith("@lid")) {
      participant = (await getLidMapping(participant)) || participant;
    }
    m.sender = jidNormalizedUser(participant);
    m.fromMe = m.key.fromMe;
  }

  if (m.message) {
    m.message = unwrapMessage(m.message) || m.message;
    m.type = getContentType(m.message);
    m.isViewOnce = ["viewOnceMessageV2", "viewOnceMessage"].includes(m.type);

    const msgContent = m.message[m.type] || {};
    m.msg = msgContent;
    m.mimetype = msgContent?.mimetype || "";
    const contextInfo = msgContent?.contextInfo || m.message?.extendedTextMessage?.contextInfo || {};

    m.newsletterName = contextInfo?.forwardedNewsletterMessageInfo?.newsletterName || null;
    m.pushName = m.pushName || msgContent?.senderName || contextInfo?.externalAdReply?.title || "Unknown";

    let body = "";
    if (m.type === "conversation") body = m.message.conversation;
    else if (m.type === "extendedTextMessage") body = msgContent?.text;
    else if (m.type === "imageMessage" || m.type === "videoMessage") body = msgContent?.caption;
    else if (m.type === "templateButtonReplyMessage") body = msgContent?.selectedId;
    else if (m.type === "buttonsResponseMessage") body = msgContent?.selectedButtonId;
    else if (m.type === "listResponseMessage") body = msgContent?.singleSelectReply?.selectedRowId;
    else if (m.type === "interactiveResponseMessage") {
      try {
        const nf = msgContent?.nativeFlowResponseMessage;
        const p = JSON.parse(nf?.paramsJson || nf?.responseJson || "{}");
        body = p?.id || nf?.name || "";
      } catch {
        body = "";
      }
    }
    m.body = body || "";

    if (m.isNewsletter && m.newsletterName) m.groupName = m.newsletterName;

    m.args = m.body.trim().split(/ +/).slice(1);
    m.query = m.args.join(" ");
    m.expiration = contextInfo?.expiration || 0;
    m.mentionedJid = contextInfo?.mentionedJid || [];
    m.download = () => downloadMediaMessage(m, "buffer").catch(() => null);

    const quotedHeader = contextInfo?.quotedMessage;
    if (quotedHeader) {
      const stanzaId = contextInfo.stanzaId;
      const qMessage = unwrapMessage(getMessageFromStoreById(stanzaId) || quotedHeader);
      const qType = getContentType(qMessage);
      const qMsg = qMessage?.[qType] || qMessage;

      let qJid = contextInfo.participant;
      if (qJid?.endsWith("@lid")) qJid = (await getLidMapping(qJid)) || qJid;

      m.quoted = {
        id: stanzaId,
        participant: contextInfo.participant,
        type: qType,
        isViewOnce: ["viewOnceMessageV2", "viewOnceMessage"].includes(qType),
        message: qMessage,
        msg: qMsg,
        mimetype: qMsg?.mimetype || "",
        text:
          qType === "conversation"
            ? qMessage.conversation
            : qType === "extendedTextMessage"
              ? qMsg?.text
              : ["imageMessage", "videoMessage"].includes(qType)
                ? qMsg?.caption
                : "",
        sender: jidNormalizedUser(qJid),
        download: () =>
          downloadMediaMessage(
            {
              key: { remoteJid: m.from, id: stanzaId, participant: contextInfo.participant },
              message: qMessage,
            },
            "buffer"
          ).catch(() => null),
      };
    }
  }

  m.isAdmin = false;
  m.isBotAdmin = false;

  if (m.isGroup) {
    const cached = groupCache.get(m.from);
    let metadata = cached && Date.now() - cached._cachedAt < GROUP_CACHE_TTL ? cached : null;

    if (!metadata) {
      metadata = await sock.groupMetadata(m.from).catch(() => null);
      if (metadata) {
        metadata._cachedAt = Date.now();
        groupCache.set(m.from, metadata);
        setImmediate(() => {
          saveMetadata(m.from, metadata.subject, metadata.desc?.toString(), metadata.participants);
        });
      }
    }

    if (metadata) {
      m.groupName = metadata.subject;
      const botJid = jidNormalizedUser(sock.user.id);
      const senderJid = jidNormalizedUser(m.sender);

      for (const p of metadata.participants || []) {
        const pJid = jidNormalizedUser(p.id?.endsWith("@lid") ? (await getLidMapping(p.id)) || p.id : p.id);
        const isAdmin = p.admin === "admin" || p.admin === "superadmin";
        if (pJid === senderJid && isAdmin) m.isAdmin = true;
        if (pJid === botJid && isAdmin) m.isBotAdmin = true;
      }
    }
  }

  setImmediate(() => {
    if (m.sender && !m.fromMe) {
      saveContact(m.sender, m.key?.participant?.endsWith("@lid") ? m.key.participant : null, m.pushName);
    }
  });

  m.getResolvedText = (text) => {
    if (!text) return "";
    const matches = [...text.matchAll(/@(\d+)/g)];
    if (!matches.length) return text;

    const jids = [...new Set(matches.map((v) => `${v[1]}@s.whatsapp.net`))];
    const rows = db.prepare(`SELECT jid, pushname FROM contacts WHERE jid IN (${jids.map(() => "?").join(",")})`).all(...jids);
    const map = new Map(rows.filter((r) => r.pushname && r.pushname !== "null").map((r) => [r.jid, r.pushname]));

    return text.replace(/@(\d+)/g, (match, p1) => {
      const name = map.get(`${p1}@s.whatsapp.net`);
      return name ? `@${name}` : match;
    });
  };

  m.reply = (text, options = {}) =>
    sock.sendMessage(
      m.from,
      {
        text: String(text),
        mentions: options.mentions || [...String(text).matchAll(/@(\d+)/g)].map((v) => `${v[1]}@s.whatsapp.net`),
        ...options,
      },
      { quoted: m }
    );

  m.react = (emoji) =>
    sock.sendMessage(m.from, { react: { text: emoji, key: m.key } });

  m.tree = (dir = ".") => {
    try {
      const root = path.resolve(dir);
      const build = (currentDir, prefix = "") => {
        let res = "";
        const items = fs
          .readdirSync(currentDir, { withFileTypes: true })
          .filter((i) => !/node_modules|\.git|data.*|tmp/i.test(i.name))
          .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));

        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const isLast = idx === items.length - 1;
          res += `${prefix}${isLast ? "└── " : "├── "}${item.name}${item.isDirectory() ? "/" : ""}\n`;
          if (item.isDirectory()) {
            res += build(path.join(currentDir, item.name), prefix + (isLast ? "    " : "│   "));
          }
        }
        return res;
      };
      return `${path.basename(root) || "."}/\n` + (build(root) || "(empty)");
    } catch {
      return "Gagal membaca direktori";
    }
  };

  return m;
}
