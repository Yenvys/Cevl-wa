import {
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  downloadContentFromMessage,
  downloadMediaMessage,
} from "baileys";
import { randomBytes } from "node:crypto";
import { config } from "../../config.js";
import { res } from "../../src/response.js";
import { ensureAudioStickerPatched, audioStickerCache } from "../../src/helper.js";

const DEFAULT_NEWSLETTER_JID = "120363401731165846@newsletter";

const unwrapMessage = (obj) => {
  let cur = obj;
  for (let i = 0; i < 6 && cur; i++) {
    const next =
      cur.ephemeralMessage?.message ||
      cur.viewOnceMessageV2?.message ||
      cur.viewOnceMessageV2Extension?.message ||
      cur.viewOnceMessage?.message ||
      cur.documentWithCaptionMessage?.message ||
      cur.editedMessage?.message;
    if (!next) break;
    cur = next;
  }
  return cur || {};
};

const dlStream = async (msgNode, type) => {
  const stream = await downloadContentFromMessage(msgNode, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

export default {
  cmd: ["tochannel", "tch", "saluran", "toch"],
  category: "owner",
  desc: "Meneruskan pesan, media, atau stiker audio ke saluran (newsletter)",

  exec: async (m, { sock, command }) => {
    if (!m.quoted) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          ["", "caption baru", "120363xxx@newsletter"],
          "Reply pesan, media, atau stiker audio yang ingin diteruskan ke saluran",
          "Meneruskan pesan, media, atau stiker audio ke saluran (newsletter)"
        )
      );
    }

    const defaultChannel = config.newsletterJid || global.idch || DEFAULT_NEWSLETTER_JID;
    let chJid = defaultChannel;
    let customCaption = (m.query || "").trim();

    const firstArg = (m.args[0] || "").trim();
    if (firstArg.endsWith("@newsletter")) {
      chJid = firstArg;
      customCaption = m.args.slice(1).join(" ").trim();
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const q = m.quoted;
      const rawMessage = q.message || {};
      const unwrapped = unwrapMessage(rawMessage);
      const qMsg = q.msg || unwrapped[q.type] || unwrapped;

      // 1. Deteksi Stiker Audio (saudio) atau Stiker Biasa
      let stc =
        unwrapped.stickerMessage ||
        (q.type === "stickerMessage" ? qMsg : null) ||
        unwrapped.audioStickerMessage?.message?.stickerMessage ||
        rawMessage.stickerMessage;

      let aud =
        stc?.audioMessage ||
        unwrapped.audioStickerMessage?.message?.stickerMessage?.audioMessage ||
        rawMessage.audioStickerMessage?.message?.stickerMessage?.audioMessage ||
        qMsg?.audioMessage;

      // Cek audioStickerCache jika aud belum ditemukan
      let cachedAudioInfo = null;
      if (stc) {
        if (q.id && (audioStickerCache?.has(q.id) || global.audioStickerCache?.has(q.id))) {
          cachedAudioInfo = audioStickerCache?.get(q.id) || global.audioStickerCache?.get(q.id);
        }
        const sha = stc.fileSha256;
        if (!cachedAudioInfo && sha) {
          const shaHex = Buffer.isBuffer(sha)
            ? sha.toString("hex")
            : Buffer.from(sha, "base64").toString("hex");
          if (audioStickerCache?.has(shaHex) || global.audioStickerCache?.has(shaHex)) {
            cachedAudioInfo = audioStickerCache?.get(shaHex) || global.audioStickerCache?.get(shaHex);
          }
        }
      }

      if (cachedAudioInfo) {
        stc = cachedAudioInfo.stickerMessage || stc;
        aud = cachedAudioInfo.audioMessage || aud;
      }

      if (stc) {
        let sBuf = cachedAudioInfo?.stickerBuffer || null;
        if (!sBuf) {
          try {
            sBuf = await dlStream(stc, "sticker");
          } catch {
            sBuf = await q.download?.();
          }
          if (!sBuf) {
            try {
              sBuf = await downloadMediaMessage(
                { key: { remoteJid: m.from, id: q.id }, message: { stickerMessage: stc } },
                "buffer",
                {},
                { reuploadRequest: sock?.updateMediaMessage }
              );
            } catch { }
          }
        }

        let aBuf = cachedAudioInfo?.audioBuffer || null;
        if (!aBuf && aud) {
          try {
            aBuf = await dlStream(aud, "audio");
          } catch { }
          if (!aBuf) {
            try {
              aBuf = await downloadMediaMessage(
                { key: { remoteJid: m.from, id: q.id }, message: { audioMessage: aud } },
                "buffer",
                {},
                { reuploadRequest: sock?.updateMediaMessage }
              );
            } catch { }
          }
        }

        if (!sBuf) {
          throw new Error("Gagal mengunduh berkas stiker.");
        }

        const isAnimated = Boolean(stc.isAnimated || cachedAudioInfo?.isAnimated);

        // Kasus A: Stiker Audio (saudio)
        if (aud || aBuf) {
          if (!aBuf) {
            throw new Error("Gagal mengunduh audio dari stiker audio.");
          }

          await ensureAudioStickerPatched();

          const [sMed, aMed] = await Promise.all([
            prepareWAMessageMedia(
              { sticker: sBuf, isAnimated },
              { upload: sock.waUploadToServer, jid: chJid }
            ),
            prepareWAMessageMedia(
              {
                audio: aBuf,
                mimetype: aud?.mimetype || "audio/ogg; codecs=opus",
                ptt: aud?.ptt ?? true,
              },
              { upload: sock.waUploadToServer, jid: chJid }
            ),
          ]);

          sMed.stickerMessage.isAnimated = isAnimated;
          sMed.stickerMessage.audioMessage = aMed.audioMessage;

          const payload = {
            _proto_: sMed,
            audioStickerMessage: { message: sMed },
            messageContextInfo: { messageSecret: randomBytes(32) },
          };
          Object.setPrototypeOf(payload, sMed);

          await sock.relayMessage(chJid, payload, {});

          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
          return m.reply(res.success("Stiker audio berhasil diteruskan ke saluran!"));
        }

        // Kasus B: Stiker Biasa (tanpa audio)
        const sMed = await prepareWAMessageMedia(
          { sticker: sBuf, isAnimated },
          { upload: sock.waUploadToServer, jid: chJid }
        );
        sMed.stickerMessage.isAnimated = isAnimated;

        const msg = generateWAMessageFromContent(
          chJid,
          { stickerMessage: sMed.stickerMessage },
          { userJid: sock.user?.id }
        );
        await sock.relayMessage(chJid, msg.message, { messageId: msg.key.id });

        await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        return m.reply(res.success("Stiker berhasil diteruskan ke saluran!"));
      }

      // 3. Deteksi Gambar
      if (q.type === "imageMessage" || unwrapped.imageMessage) {
        const imgNode = unwrapped.imageMessage || qMsg;
        const buf = await q.download?.();
        if (!buf) throw new Error("Gagal mengunduh berkas gambar.");
        const caption = customCaption || imgNode.caption || "";
        await sock.sendMessage(chJid, { image: buf, caption });
        await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        return m.reply(res.success("Gambar berhasil diteruskan ke saluran!"));
      }

      // 4. Deteksi Video / GIF
      if (q.type === "videoMessage" || unwrapped.videoMessage) {
        const vidNode = unwrapped.videoMessage || qMsg;
        const buf = await q.download?.();
        if (!buf) throw new Error("Gagal mengunduh berkas video.");
        const caption = customCaption || vidNode.caption || "";
        await sock.sendMessage(chJid, { video: buf, caption, gifPlayback: Boolean(vidNode.gifPlayback) });
        await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        return m.reply(res.success("Video berhasil diteruskan ke saluran!"));
      }

      // 5. Deteksi Audio / Voice Note
      if (q.type === "audioMessage" || unwrapped.audioMessage) {
        const audNode = unwrapped.audioMessage || qMsg;
        const buf = await q.download?.();
        if (!buf) throw new Error("Gagal mengunduh berkas audio.");
        await sock.sendMessage(chJid, {
          audio: buf,
          mimetype: audNode.mimetype || "audio/ogg; codecs=opus",
          ptt: audNode.ptt ?? true,
        });
        await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        return m.reply(res.success("Audio berhasil diteruskan ke saluran!"));
      }

      // 6. Deteksi Dokumen
      if (q.type === "documentMessage" || unwrapped.documentMessage) {
        const docNode = unwrapped.documentMessage || qMsg;
        const buf = await q.download?.();
        if (!buf) throw new Error("Gagal mengunduh berkas dokumen.");
        const caption = customCaption || docNode.caption || "";
        await sock.sendMessage(chJid, {
          document: buf,
          mimetype: docNode.mimetype || "application/octet-stream",
          fileName: docNode.fileName || "file",
          caption,
        });
        await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        return m.reply(res.success("Dokumen berhasil diteruskan ke saluran!"));
      }

      // 7. Pesan Teks
      let text = q.text || qMsg?.text || unwrapped.conversation || "";
      if (customCaption) {
        text = text ? `${customCaption}\n\n${text}` : customCaption;
      }

      if (!text) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.empty("Tidak ada teks, media, atau stiker audio yang dapat diteruskan."));
      }

      await sock.sendMessage(chJid, { text });
      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      return m.reply(res.success("Pesan teks berhasil diteruskan ke saluran!"));
    } catch (err) {
      console.error("[TOCHANNEL_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      if (err.message?.includes("not-authorized") || err.message?.includes("403")) {
        return m.reply(res.warn("Bot bukan admin di saluran tujuan! Pastikan bot sudah menjadi admin di saluran tersebut."));
      }
      return m.reply(res.error(`Gagal meneruskan ke saluran: ${err.message || "Terjadi kesalahan internal"}`));
    }
  },
};
