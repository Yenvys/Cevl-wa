import crypto from "node:crypto";
import zlib from "node:zlib";
import fs from "node:fs/promises";
import sharp from "sharp";
import { proto, MEDIA_PATH_MAP, MEDIA_HKDF_KEY_MAPPING, encryptedStream } from "baileys";

// Daftarkan endpoint dan mapping HKDF untuk media type sticker-pack di Baileys
MEDIA_PATH_MAP["sticker-pack"] = "/mms/sticker-pack";
MEDIA_PATH_MAP["thumbnail-sticker-pack"] = "/mms/thumbnail-sticker-pack";
MEDIA_HKDF_KEY_MAPPING["sticker-pack"] = "Sticker Pack";
MEDIA_HKDF_KEY_MAPPING["thumbnail-sticker-pack"] = "Sticker Pack Thumbnail";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Buat ZIP buffer tanpa kompresi (Store method 0) sesuai spesifikasi WhatsApp sticker pack
 * @param {Array<{ name: string, data: Buffer }>} files
 * @returns {Buffer}
 */
export function createZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = zlib.crc32(dataBuf);
    const size = dataBuf.length;

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.write("PK\x03\x04", 0, 4, "ascii");
    localHeader.writeUInt16LE(20, 4); // version needed (2.0)
    localHeader.writeUInt16LE(0, 6);  // flags
    localHeader.writeUInt16LE(0, 8);  // compression method (0 = store)
    localHeader.writeUInt16LE(0, 10); // time
    localHeader.writeUInt16LE(0, 12); // date
    localHeader.writeUInt32LE(crc, 14); // crc32
    localHeader.writeUInt32LE(size, 18); // compressed size
    localHeader.writeUInt32LE(size, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, dataBuf);

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.write("PK\x01\x02", 0, 4, "ascii");
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8);  // flags
    centralHeader.writeUInt16LE(0, 10); // compression method (0 = store)
    centralHeader.writeUInt16LE(0, 12); // time
    centralHeader.writeUInt16LE(0, 14); // date
    centralHeader.writeUInt32LE(crc, 16); // crc32
    centralHeader.writeUInt32LE(size, 20); // compressed size
    centralHeader.writeUInt32LE(size, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // file name length
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(0, 38); // external file attributes
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header
    nameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + dataBuf.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((acc, h) => acc + h.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.write("PK\x05\x06", 0, 4, "ascii");
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(files.length, 8); // total records on disk
  eocd.writeUInt16LE(files.length, 10); // total records in central dir
  eocd.writeUInt32LE(centralDirSize, 12); // size of central dir
  eocd.writeUInt32LE(centralDirOffset, 16); // offset of central dir
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/**
 * Klasifikasi apakah stiker WebP adalah animasi atau statis
 */
export function classifySticker(webpBuffer, msgObj = {}) {
  let isAnimated = false;
  if (Buffer.isBuffer(webpBuffer) && webpBuffer.length > 20) {
    if (webpBuffer.toString("ascii", 12, 16) === "VP8X" && (webpBuffer[20] & 0x02) !== 0) {
      isAnimated = true;
    } else if (webpBuffer.includes(Buffer.from("ANIM"))) {
      isAnimated = true;
    }
  }
  if (msgObj?.isAnimated || msgObj?.message?.stickerMessage?.isAnimated) {
    isAnimated = true;
  }
  return {
    isAnimated,
    mimetype: "image/webp",
  };
}

/**
 * Kirim stiker pack sebagai pesan resmi WhatsApp Sticker Pack (single card / stickerPackMessage)
 * @param {Object} sock Baileys socket instance
 * @param {string} jid Target JID (chat/group)
 * @param {Array} stickerBuffers Array of { buffer, isAnimated } atau Buffers
 * @param {Object} options { name, publisher, cover, quoted, packId }
 */
export async function sendCustomStickerPack(sock, jid, stickerBuffers, options = {}) {
  const {
    name = "Cevl Pack",
    publisher = "Yenvys",
    quoted = null,
    packId = `cevl-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
  } = options;

  if (!Array.isArray(stickerBuffers) || stickerBuffers.length === 0) {
    throw new Error("Sticker pack must contain at least one sticker.");
  }

  // Batasi maksimal 60 stiker (WhatsApp sticker pack standard limit)
  const maxStickers = Math.min(stickerBuffers.length, 60);
  const items = stickerBuffers.slice(0, maxStickers);

  try {
    // 1. Siapkan semua berkas stiker dan metadata
    const zipFiles = [];
    const stickerMetadata = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const buf = item.buffer || item;
      const isAnim = Boolean(item.isAnimated);

      // Hitung hash untuk nama berkas stiker
      const hash = crypto.createHash("sha256").update(buf).digest("base64").replace(/\//g, "-");
      const fileName = `${hash}.webp`;

      zipFiles.push({ name: fileName, data: buf });
      stickerMetadata.push({
        fileName,
        mimetype: "image/webp",
        isAnimated: isAnim,
        emojis: ["✨"],
        accessibilityLabel: `${name} sticker ${i + 1}`,
      });
    }

    // 2. Siapkan tray icon / cover (252x252 WebP)
    const firstBuf = items[0].buffer || items[0];
    const trayIconFileName = `${packId}.webp`;

    const coverWebp = await sharp(firstBuf)
      .resize(252, 252, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 85 })
      .toBuffer()
      .catch(() => firstBuf);

    zipFiles.push({ name: trayIconFileName, data: coverWebp });

    // Thumbnail JPEG 252x252 untuk pesan WA
    const thumbnailJpeg = await sharp(firstBuf)
      .resize(252, 252, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .jpeg({ quality: 80 })
      .toBuffer()
      .catch(() => null);

    // 3. Bangun berkas ZIP uncompressed (Store level 0)
    const zipBuffer = createZip(zipFiles);

    // 4. Upload berkas ZIP ke WhatsApp MMS server
    const packUpload = await encryptedStream(zipBuffer, "sticker-pack", {
      logger: sock.logger,
    });

    const uploadResult = await sock.waUploadToServer(packUpload.encFilePath, {
      fileEncSha256B64: packUpload.fileEncSha256.toString("base64"),
      mediaType: "sticker-pack",
      timeoutMs: 60000,
    });

    await fs.unlink(packUpload.encFilePath).catch(() => {});

    // 5. Upload thumbnail (jika ada)
    let thumbUpload = null;
    let thumbResult = null;
    if (thumbnailJpeg) {
      try {
        thumbUpload = await encryptedStream(thumbnailJpeg, "thumbnail-sticker-pack", {
          logger: sock.logger,
          mediaKey: packUpload.mediaKey,
        });

        thumbResult = await sock.waUploadToServer(thumbUpload.encFilePath, {
          fileEncSha256B64: thumbUpload.fileEncSha256.toString("base64"),
          mediaType: "thumbnail-sticker-pack",
          timeoutMs: 60000,
        });

        await fs.unlink(thumbUpload.encFilePath).catch(() => {});
      } catch (err) {
        console.warn("[STICKER PACK THUMB UPLOAD WARNING]", err.message);
      }
    }

    // 6. Buat struktur proto.Message.StickerPackMessage
    const stickerPackMsg = {
      name: String(name || "Sticker Pack"),
      publisher: String(publisher || "Cevl"),
      stickerPackId: packId,
      packDescription: String(name || "Sticker Pack"),
      stickerPackOrigin: proto.Message.StickerPackMessage.StickerPackOrigin.USER_CREATED,
      stickerPackSize: zipBuffer.length,
      stickers: stickerMetadata,

      fileSha256: packUpload.fileSha256,
      fileEncSha256: packUpload.fileEncSha256,
      mediaKey: packUpload.mediaKey,
      directPath: uploadResult.directPath,
      fileLength: packUpload.fileLength,
      mediaKeyTimestamp: Math.floor(Date.now() / 1000),

      trayIconFileName,
    };

    if (thumbResult && thumbUpload && thumbnailJpeg) {
      Object.assign(stickerPackMsg, {
        thumbnailDirectPath: thumbResult.directPath,
        thumbnailSha256: thumbUpload.fileSha256,
        thumbnailEncSha256: thumbUpload.fileEncSha256,
        thumbnailHeight: 252,
        thumbnailWidth: 252,
        imageDataHash: crypto.createHash("sha256").update(thumbnailJpeg).digest("base64"),
      });
    }

    // 7. Kirim dengan sock.relayMessage sebagai SATU PESAN UTUH (Sticker Pack Card)
    const msgId = (sock.generateMessageTag ? sock.generateMessageTag() : `cevl_${Date.now()}`);
    await sock.relayMessage(
      jid,
      { stickerPackMessage: stickerPackMsg },
      { messageId: msgId, quoted: quoted || undefined }
    );

    return { success: true, count: items.length };
  } catch (err) {
    console.error("[NATIVE STICKER PACK ERROR]", err.message);

    // Fallback: Jika native stickerPackMessage tidak didukung oleh akun/server,
    // jangan spam 50 pesan! Kirimkan berkas pack ZIP sebagai dokumen WA agar rapi,
    // atau kirim 1-3 sampel stiker utama saja.
    const zipFallback = createZip(
      items.map((it, idx) => ({
        name: `sticker_${idx + 1}.webp`,
        data: it.buffer || it,
      }))
    );

    await sock.sendMessage(
      jid,
      {
        document: zipFallback,
        mimetype: "application/zip",
        fileName: `${name.replace(/[^a-zA-Z0-9_\-]/g, "_")}.wastickers`,
        caption: `📦 *STICKER PACK: ${name}*\n> • Author: ${publisher}\n> • Total: ${items.length} Stiker\n> _Berkas pack stiker dapat langsung diimpor ke aplikasi stiker WhatsApp!_`,
      },
      { quoted: quoted || undefined }
    ).catch(() => {});

    return { success: false, fallback: true };
  }
}

export default {
  classifySticker,
  sendCustomStickerPack,
  createZip,
};
