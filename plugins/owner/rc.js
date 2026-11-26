import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import sharp from "sharp";
import { prepareWAMessageMedia, generateMessageIDV2 } from "baileys";
import { res } from "../../src/response.js";

const DB_PATH = path.join(process.cwd(), "data", "rc-sticker.json");

const toWebp = (input) =>
  sharp(input, { animated: true })
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toBuffer();

const loadSticker = () => {
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    const s = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    for (const k of ["mediaKey", "fileSha256", "fileEncSha256"]) {
      if (s[k]) s[k] = Buffer.from(s[k], "base64");
    }
    if (s.audioMessage) {
      for (const k of ["mediaKey", "fileSha256", "fileEncSha256"]) {
        if (s.audioMessage[k]) s.audioMessage[k] = Buffer.from(s.audioMessage[k], "base64");
      }
    }
    return s;
  } catch {
    return null;
  }
};

const saveSticker = (st) => {
  const serializeNode = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || k === "contextInfo" || k === "pngThumbnail") continue;
      if (k === "audioMessage" && typeof v === "object") {
        out[k] = serializeNode(v);
      } else {
        out[k] = Buffer.isBuffer(v) || v instanceof Uint8Array ? Buffer.from(v).toString("base64") : v;
      }
    }
    return out;
  };

  const data = serializeNode(st);
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

const getQuotedSticker = (q) => {
  if (!q) return null;
  if (q.type === "stickerMessage" && q.msg) return q.msg;
  const raw = q.message || {};
  return (
    raw.stickerMessage ||
    q.msg?.stickerMessage ||
    raw.audioStickerMessage?.message?.stickerMessage ||
    (q.mimetype?.includes("webp") ? q.msg : null)
  );
};

export default {
  cmd: ["rc"],
  category: "owner",
  desc: "Kirim stiker reply (messageAssociation 11) ke pesan target",

  exec: async (m, { sock, command }) => {
    if (!m.isOwner) return m.reply(res.owner);

    let input = (m.query || "").trim();
    let count = 1;

    const mc = input.match(/(?:^|\s)(\d{1,3})x?(?=\s|$)/i);
    if (mc && !/^set$/i.test(input)) {
      count = Math.min(Math.max(parseInt(mc[1], 10), 1), 50);
      input = input.replace(mc[0], " ").trim();
    }

    if (/^set$/i.test(input)) {
      const st = getQuotedSticker(m.quoted);
      if (!st) {
        return m.reply(
          res.warn(`Reply stiker yang ingin disimpan sebagai default dengan perintah *${m.prefix ?? "."}${command} set*`)
        );
      }
      try {
        saveSticker(st);
        return m.reply(res.success("Stiker default .rc berhasil disimpan!"));
      } catch (e) {
        return m.reply(res.error(`Gagal menyimpan stiker: ${e.message}`));
      }
    }

    if (!m.quoted) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          [
            "",
            "5",
            "https://.../stiker.webp",
            "set",
          ],
          `Reply pesan target untuk mengirim stiker reply (messageAssociation 11).\nGunakan "${m.prefix ?? "."}${command} set" sambil mereply stiker untuk mengatur stiker default.`,
          "Kirim stiker reply ke pesan parent"
        )
      );
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      let stickerMessage;
      if (/^https?:\/\//i.test(input)) {
        if (/mmg\.whatsapp\.net|\.enc(\?|$)/i.test(input)) {
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          return m.reply(
            res.warn("Tautan .enc WhatsApp terenkripsi (membutuhkan mediaKey). Kirim stiker ke chat lalu reply dengan .rc set.")
          );
        }

        const resp = await axios.get(input, {
          responseType: "arraybuffer",
          timeout: 30000,
          headers: { "User-Agent": "Mozilla/5.0" },
        });

        let webp;
        try {
          webp = await toWebp(Buffer.from(resp.data));
        } catch {
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          return m.reply(res.warn("Berkas dari URL bukan berkas gambar atau stiker yang valid."));
        }

        const media = await prepareWAMessageMedia({ sticker: webp }, { upload: sock.waUploadToServer });
        stickerMessage = media.stickerMessage;
      } else {
        stickerMessage = loadSticker();
        if (!stickerMessage) {
          await sock.sendMessage(m.from, { react: { text: "⚠️", key: m.key } });
          return m.reply(
            res.warn(`Belum ada stiker default. Reply sebuah stiker lalu ketik *${m.prefix ?? "."}${command} set* terlebih dahulu.`)
          );
        }
      }

      const parentKey = {
        remoteJid: m.quoted.key?.remoteJid || m.quoted.remoteJid || m.from,
        fromMe: Boolean(m.quoted.key?.fromMe ?? m.quoted.fromMe),
        id: m.quoted.key?.id || m.quoted.id,
      };

      const participant = m.quoted.key?.participant || m.quoted.participant || m.quoted.sender;
      if (m.isGroup && participant) {
        parentKey.participant = participant;
      }

      for (let i = 0; i < count; i++) {
        const messageId = typeof generateMessageIDV2 === "function" ? generateMessageIDV2(sock.user?.id) : undefined;
        await sock.relayMessage(
          m.from,
          {
            stickerMessage,
            messageContextInfo: {
              messageAssociation: { associationType: 11, parentMessageKey: parentKey },
            },
          },
          messageId ? { messageId } : {}
        );
        if (i < count - 1) await new Promise((r) => setTimeout(r, 700));
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[RC_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error(`Gagal mengirim reply stiker: ${err.message || ""}`));
    }
  },
};
