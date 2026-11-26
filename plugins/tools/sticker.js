import fs from "node:fs";
import { downloadMediaMessage } from "baileys";
import { imageToWebp, videoToWebp, writeExifImg, writeExifVid, addExif } from "../../src/lib/webp.js";
import { sendCustomStickerPack, classifySticker } from "../../src/lib/stickerpack.js";
import { config } from "../../config.js";
import { res } from "../../src/response.js";

const getMediaBuffer = async (sock, msgObj) => {
  if (!msgObj) return null;
  try {
    if (typeof msgObj.download === "function") {
      const b = await msgObj.download().catch(() => null);
      if (b && Buffer.isBuffer(b) && b.length > 0) return b;
    }

    const realMsg = msgObj.fakeObj
      ? msgObj.fakeObj
      : msgObj.message
        ? msgObj
        : { message: msgObj.msg || msgObj, key: msgObj.key || {} };

    const b = await downloadMediaMessage(
      realMsg,
      "buffer",
      {},
      {
        reuploadRequest: sock?.updateMediaMessage,
        logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
      }
    ).catch(() => null);

    if (b && Buffer.isBuffer(b) && b.length > 0) return b;

    if (typeof sock?.downloadMediaMessage === "function") {
      return await sock.downloadMediaMessage(msgObj).catch(() => null);
    }
  } catch (err) {
    console.error("[GET MEDIA BUFFER ERROR]", err.message);
  }
  return null;
};

export default {
  cmd: ["sticker", "stiker", "s", "spack", "stickerpack"],
  category: "tools",
  desc: "Mengonversi media gambar, video, atau album menjadi stiker / sticker pack",

  exec: async (m, { sock, command, args, query }) => {
    let packName = config.botName || "Cevl";
    let authorName = config.ownerName || "Yenvys";

    const text = String(query || args.join(" ") || "").trim();
    if (text) {
      const parts = text.split("|");
      packName = parts[0]?.trim() || packName;
      authorName = parts[1]?.trim() || authorName;
    }

    let targetMessages = [];

    if (m.quoted) {
      const qId = m.quoted.id || m.quoted.key?.id;
      const qFake = m.quoted.fakeObj || {};
      const qFakeMsg = qFake.message || qFake.msg || {};
      const qMsgObj = m.quoted.message || m.quoted.msg || {};

      const cachedAlbum = qId ? global.albumCache?.get?.(qId) : null;
      const isExplicitSpackCmd = command === "spack" || command === "stickerpack";

      // Cek apakah pesan quoted adalah ALBUM
      const isAlbumReply =
        m.quoted.mtype === "albumMessage" ||
        Boolean(qMsgObj?.albumMessage) ||
        Boolean(qFakeMsg?.albumMessage) ||
        Boolean(m.quoted.albumMessage) ||
        (Array.isArray(m.quoted.messages) && m.quoted.messages.length > 1) ||
        (Array.isArray(m.quoted.medias) && m.quoted.medias.length > 1) ||
        (Array.isArray(m.quoted.album) && m.quoted.album.length > 1) ||
        (Boolean(cachedAlbum?.isAlbum) &&
          (cachedAlbum.parentId === qId || m.quoted.mtype === "albumMessage" || isExplicitSpackCmd));

      if (isAlbumReply) {
        if (cachedAlbum && Array.isArray(cachedAlbum.messages) && cachedAlbum.messages.length > 0) {
          targetMessages = cachedAlbum.messages;
        } else if (Array.isArray(m.quoted.messages) && m.quoted.messages.length > 0) {
          targetMessages = m.quoted.messages;
        } else if (Array.isArray(m.quoted.medias) && m.quoted.medias.length > 0) {
          targetMessages = m.quoted.medias;
        } else if (Array.isArray(m.quoted.album) && m.quoted.album.length > 0) {
          targetMessages = m.quoted.album;
        } else if (qFakeMsg?.albumMessage?.messages || qMsgObj?.albumMessage?.messages) {
          targetMessages = qFakeMsg?.albumMessage?.messages || qMsgObj?.albumMessage?.messages;
        } else {
          targetMessages = [m.quoted];
        }
      } else {
        // Reply tunggal
        targetMessages = [m.quoted];
      }
    } else {
      // Pesan langsung dengan caption
      targetMessages = [m];
    }

    const validMediaList = [];
    for (const msg of targetMessages) {
      const msgBody = msg.message || msg.msg || msg;
      const imgMsg = msgBody.imageMessage || msg.imageMessage;
      const vidMsg = msgBody.videoMessage || msg.videoMessage;
      const stcMsg = msgBody.stickerMessage || msg.stickerMessage;

      const mtype =
        msg.mtype ||
        (imgMsg ? "imageMessage" : vidMsg ? "videoMessage" : stcMsg ? "stickerMessage" : "");

      const mime =
        msgBody.mimetype ||
        msg.mimetype ||
        imgMsg?.mimetype ||
        vidMsg?.mimetype ||
        (mtype === "imageMessage"
          ? "image/jpeg"
          : mtype === "videoMessage"
            ? "video/mp4"
            : mtype === "stickerMessage"
              ? "image/webp"
              : "");

      if (
        /image|video|sticker/.test(mime) ||
        /imageMessage|videoMessage|stickerMessage/.test(mtype) ||
        imgMsg ||
        vidMsg ||
        stcMsg
      ) {
        validMediaList.push({ msgObj: msg, mime: mime || "image/jpeg" });
      }
    }

    if (validMediaList.length === 0) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} [PackName|Author]`,
          ["", "PackName|Author"],
          "Cara Penggunaan:\n" +
          "• Kirim foto/video dengan caption perintah ini\n" +
          "• Balas (reply) foto/video/stiker dengan perintah ini\n" +
          "• Balas (reply) Album foto/video untuk membuat Sticker Pack (spack) otomatis 📦✨",
          "Membuat stiker atau sticker pack WhatsApp dari gambar/video/album"
        )
      );
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const stickerBuffers = [];

      for (const { msgObj, mime } of validMediaList) {
        const inner = msgObj.message || msgObj.msg || msgObj;
        if (/video/.test(mime) && (inner.seconds || msgObj.seconds || 0) > 15) {
          continue;
        }

        const buff = await getMediaBuffer(sock, msgObj);
        if (!buff || !Buffer.isBuffer(buff) || buff.length === 0) continue;

        let webpRes = null;
        if (/image/.test(mime)) {
          webpRes = await writeExifImg(buff, { packname: packName, author: authorName }).catch(() => null);
        } else if (/video/.test(mime)) {
          webpRes = await writeExifVid(buff, { packname: packName, author: authorName }).catch(() => null);
        } else if (/sticker|webp/.test(mime)) {
          webpRes = await addExif(buff, packName, authorName).catch(() => buff);
        }

        if (webpRes) {
          let finalWebpBuffer = null;
          if (Buffer.isBuffer(webpRes)) {
            finalWebpBuffer = webpRes;
          } else if (typeof webpRes === "string" && fs.existsSync(webpRes)) {
            finalWebpBuffer = fs.readFileSync(webpRes);
            try {
              fs.unlinkSync(webpRes);
            } catch {}
          }

          if (finalWebpBuffer) {
            const info = classifySticker(finalWebpBuffer, inner);
            stickerBuffers.push({
              buffer: finalWebpBuffer,
              ...info,
            });
          }
        }
      }

      if (stickerBuffers.length === 0) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error("Gagal mengonversi media menjadi stiker."));
      }

      if (stickerBuffers.length > 1) {
        await sendCustomStickerPack(sock, m.from, stickerBuffers, {
          name: packName,
          publisher: authorName,
          quoted: m,
        });
      } else {
        await sock.sendMessage(
          m.from,
          {
            sticker: stickerBuffers[0].buffer,
            isAnimated: Boolean(stickerBuffers[0].isAnimated),
          },
          { quoted: m }
        );
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[STICKER ERROR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error(`Terjadi kesalahan saat membuat stiker: ${err.message}`));
    }
  },
};
