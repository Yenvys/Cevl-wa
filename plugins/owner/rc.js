import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import sharp from "sharp";
import {
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  jidNormalizedUser,
} from "baileys";
import { res } from "../../src/response.js";
import { store, getRawMessageFromStoreById } from "../../src/helper.js";

const STICKER_WEBP_PATH = path.join(process.cwd(), "data", "rc-sticker.webp");
const DB_PATH = path.join(process.cwd(), "data", "rc-sticker.json");

let cachedStickerMessage = null;
let cachedStickerTime = 0;

const toWebp = (input) =>
  sharp(input, { animated: true })
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toBuffer();

const loadStickerJson = () => {
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

const saveStickerJson = (st) => {
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
  cmd: ["reactsticker", "rc", "rsticker", "stikerreact"],
  category: "owner",
  desc: "Kirim stiker reply (Sticker Reaction / STICKER_ANNOTATION) ke pesan target",

  exec: async (m, { sock, command }) => {
    if (!m.isOwner) return m.reply(res.owner);

    let input = (m.query || "").trim();
    let count = 1;

    const mc = input.match(/(?:^|\s)(\d{1,3})x?(?=\s|$)/i);
    if (mc && !/^set$/i.test(input)) {
      count = Math.min(Math.max(parseInt(mc[1], 10), 1), 50);
      input = input.replace(mc[0], " ").trim();
    }

    // Set stiker default dari pesan stiker yang di-reply atau media yang dikirim
    if (/^set$/i.test(input)) {
      const targetNode = m.quoted || m;
      const isStickerMsg =
        targetNode?.type === "stickerMessage" ||
        targetNode?.mtype === "stickerMessage" ||
        Boolean(targetNode?.msg?.mimetype?.includes("webp")) ||
        Boolean(targetNode?.mimetype?.includes("webp"));

      const isImageMsg =
        targetNode?.type === "imageMessage" ||
        targetNode?.mtype === "imageMessage" ||
        Boolean(targetNode?.msg?.mimetype?.includes("image")) ||
        Boolean(targetNode?.mimetype?.includes("image"));

      const st = getQuotedSticker(targetNode);

      if (!st && !isStickerMsg && !isImageMsg) {
        return m.reply(
          res.warn(`Reply stiker atau foto yang ingin disimpan sebagai default dengan perintah *${m.prefix ?? "."}${command} set*`)
        );
      }

      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } }).catch(() => { });

      try {
        let buffer = null;
        if (typeof targetNode.download === "function") {
          buffer = await targetNode.download().catch(() => null);
        }

        if (buffer && Buffer.isBuffer(buffer) && buffer.length > 0) {
          // Jika gambar non-webp, konversi ke webp 512x512
          if (!buffer.toString("ascii", 0, 4).includes("RIFF")) {
            buffer = await toWebp(buffer);
          }

          const dir = path.dirname(STICKER_WEBP_PATH);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(STICKER_WEBP_PATH, buffer);

          const media = await prepareWAMessageMedia(
            { sticker: buffer },
            { upload: sock.waUploadToServer }
          ).catch(() => null);

          if (media?.stickerMessage) {
            cachedStickerMessage = media.stickerMessage;
            cachedStickerTime = Date.now();
            saveStickerJson(media.stickerMessage);
          } else if (st) {
            cachedStickerMessage = st;
            cachedStickerTime = Date.now();
            saveStickerJson(st);
          }
        } else if (st) {
          saveStickerJson(st);
          cachedStickerMessage = st;
          cachedStickerTime = Date.now();
        }

        await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } }).catch(() => { });
        return m.reply(res.success("Stiker default reaction (*.rc*) berhasil disimpan!"));
      } catch (e) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => { });
        return m.reply(res.error(`Gagal menyimpan stiker: ${e.message}`));
      }
    }

    if (!m.quoted) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} [jumlah / url / set]`,
          [
            "",
            "5",
            "https://.../stiker.webp",
            "set",
          ],
          "• Balas (reply) pesan target untuk mengirim stiker reply (Sticker Reaction)\n" +
          "• Balas (reply) stiker dengan `.rc set` untuk mengatur stiker default\n" +
          "• Tambahkan angka (misal `.rc 5`) untuk mengirim stiker berulang",
          "Kirim stiker reply (Sticker Reaction) ke pesan target"
        )
      );
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } }).catch(() => { });

    try {
      let stickerMessage = null;
      let stickerBuffer = null;

      // 1. Jika pengguna memberikan URL langsung
      if (/^https?:\/\//i.test(input)) {
        if (/mmg\.whatsapp\.net|\.enc(\?|$)/i.test(input)) {
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => { });
          return m.reply(
            res.warn("Tautan .enc WhatsApp terenkripsi (membutuhkan mediaKey). Kirim stiker ke chat lalu reply dengan .rc set.")
          );
        }

        const resp = await axios.get(input, {
          responseType: "arraybuffer",
          timeout: 30000,
          headers: { "User-Agent": "Mozilla/5.0" },
        });

        try {
          stickerBuffer = await toWebp(Buffer.from(resp.data));
        } catch {
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => { });
          return m.reply(res.warn("Berkas dari URL bukan berkas gambar atau stiker yang valid."));
        }

        const media = await prepareWAMessageMedia({ sticker: stickerBuffer }, { upload: sock.waUploadToServer }).catch(() => null);
        stickerMessage = media?.stickerMessage;
      }
      // 2. Gunakan stiker default yang sudah disimpan
      else {
        // A. Cek file WebP lokal terlebih dahulu
        if (fs.existsSync(STICKER_WEBP_PATH)) {
          stickerBuffer = fs.readFileSync(STICKER_WEBP_PATH);
        }

        // B. Cek cache memori (valid 24 jam)
        if (cachedStickerMessage && Date.now() - cachedStickerTime < 24 * 3600 * 1000) {
          stickerMessage = cachedStickerMessage;
        }

        // C. Cek file JSON data
        if (!stickerMessage) {
          stickerMessage = loadStickerJson();
          if (stickerMessage) {
            cachedStickerMessage = stickerMessage;
            cachedStickerTime = Date.now();
          }
        }

        // D. Re-upload dari file WebP jika belum ada JSON
        if (!stickerMessage && stickerBuffer) {
          const media = await prepareWAMessageMedia(
            { sticker: stickerBuffer },
            { upload: sock.waUploadToServer }
          ).catch(() => null);

          if (media?.stickerMessage) {
            stickerMessage = media.stickerMessage;
            cachedStickerMessage = media.stickerMessage;
            cachedStickerTime = Date.now();
            saveStickerJson(media.stickerMessage);
          }
        }

        if (!stickerBuffer && !stickerMessage) {
          await sock.sendMessage(m.from, { react: { text: "⚠️", key: m.key } }).catch(() => { });
          return m.reply(
            res.warn(`Belum ada stiker default. Reply sebuah stiker lalu ketik *${m.prefix ?? "."}${command} set* terlebih dahulu.`)
          );
        }
      }

      // 3. Susun parentKey dari pesan yang di-reply secara akurat
      const botJid = jidNormalizedUser(sock.user?.id);
      const stanzaId = m.quoted.id || m.quoted.key?.id;
      const rawStore = getRawMessageFromStoreById(stanzaId);

      let isFromMe = false;
      if (rawStore?.key?.fromMe !== undefined) {
        isFromMe = Boolean(rawStore.key.fromMe);
      } else if (typeof m.quoted.fromMe === "boolean") {
        isFromMe = m.quoted.fromMe;
      } else if (m.quoted.key?.fromMe !== undefined) {
        isFromMe = Boolean(m.quoted.key.fromMe);
      } else if (m.quoted.sender && jidNormalizedUser(m.quoted.sender) === botJid) {
        isFromMe = true;
      } else if (m.quoted.participant && jidNormalizedUser(m.quoted.participant) === botJid) {
        isFromMe = true;
      } else if (!m.isGroup) {
        isFromMe = stanzaId?.startsWith("3EB0") || stanzaId?.startsWith("BAE5") || Boolean(m.quoted.fromMe);
      }

      const parentKey = {
        remoteJid: m.from,
        fromMe: isFromMe,
        id: stanzaId,
      };

      if (m.isGroup && !isFromMe) {
        const participant = m.quoted.participant || m.quoted.sender || m.quoted.key?.participant;
        if (participant) {
          parentKey.participant = participant;
        }
      }

      // 4. Kirim stiker quote resmi via Baileys ori + relay STICKER_ANNOTATION untuk dukungan reaction WhatsApp
      const finalBuffer = stickerBuffer || (fs.existsSync(STICKER_WEBP_PATH) ? fs.readFileSync(STICKER_WEBP_PATH) : null);

      for (let i = 0; i < count; i++) {
        // Kirim via sock.sendMessage standar Baileys dengan quoted pesan yang di-reply (selalu berhasil & tampil di semua client)
        if (finalBuffer) {
          await sock.sendMessage(m.from, { sticker: finalBuffer }, { quoted: m.quoted });
        } else if (stickerMessage) {
          await sock.relayMessage(m.from, { stickerMessage }, { quoted: m.quoted }).catch(() => { });
        }

        // Kirim juga association STICKER_ANNOTATION untuk client WhatsApp yang mendukung reaction badge stiker
        if (stickerMessage && parentKey) {
          try {
            const fullMsg = generateWAMessageFromContent(
              m.from,
              {
                stickerMessage,
                messageContextInfo: {
                  messageAssociation: {
                    associationType: 11, // STICKER_ANNOTATION
                    parentMessageKey: parentKey,
                  },
                },
              },
              { userJid: sock.user?.id }
            );

            await sock.relayMessage(m.from, fullMsg.message, {
              messageId: fullMsg.key.id,
            });

            if (fullMsg.key?.id) {
              store.messages.set(fullMsg.key.id, fullMsg.message);
              store.rawMessages.set(fullMsg.key.id, fullMsg);
            }
          } catch (e) {
            // Abaikan jika relay annotation gagal, stiker utama sudah terkirim via Baileys
          }
        }

        if (i < count - 1) await new Promise((r) => setTimeout(r, 600));
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } }).catch(() => { });
    } catch (err) {
      console.error("[RC_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => { });
      return m.reply(res.error(`Gagal mengirim reply stiker: ${err.message || ""}`));
    }
  },
};
