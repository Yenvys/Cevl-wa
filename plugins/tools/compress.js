import fs from "node:fs/promises";
import zlib from "node:zlib";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { createTemp, cleanup } from "../../src/helper.js";
import { res } from "../../src/response.js";

ffmpeg.setFfmpegPath(ffmpegInstaller?.path || "ffmpeg");

/**
 * Format bytes ke string ukuran manusiawi (B, KB, MB, GB)
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Parsing opsi level kompresi (preset / persentase)
 */
function parseCompressionLevel(input) {
  const text = (input || "").toLowerCase().trim();
  if (!text) {
    return {
      name: "Medium (Seimbang)",
      quality: 55,
      videoCrf: 30,
      audioBitrate: "96k",
      maxDimension: 1280,
      sampleRate: 32000,
    };
  }

  if (["low", "ringan", "min"].includes(text)) {
    return {
      name: "Low (Ringan)",
      quality: 80,
      videoCrf: 26,
      audioBitrate: "128k",
      maxDimension: 1920,
      sampleRate: 44100,
    };
  }

  if (["med", "medium", "sedang", "normal"].includes(text)) {
    return {
      name: "Medium (Seimbang)",
      quality: 55,
      videoCrf: 30,
      audioBitrate: "96k",
      maxDimension: 1280,
      sampleRate: 32000,
    };
  }

  if (["high", "tinggi", "kuat"].includes(text)) {
    return {
      name: "High (Tinggi)",
      quality: 35,
      videoCrf: 34,
      audioBitrate: "64k",
      maxDimension: 960,
      sampleRate: 32000,
    };
  }

  if (["ultra", "max", "ekstrem", "maksimal"].includes(text)) {
    return {
      name: "Ultra (Maksimal)",
      quality: 20,
      videoCrf: 38,
      audioBitrate: "48k",
      maxDimension: 720,
      sampleRate: 22050,
    };
  }

  const num = parseInt(text.replace(/[^0-9]/g, ""), 10);
  if (!isNaN(num) && num >= 5 && num <= 95) {
    const crf = Math.round(42 - (num / 100) * 18);
    let aBitrate = "96k";
    if (num <= 25) aBitrate = "48k";
    else if (num <= 50) aBitrate = "64k";
    else if (num <= 75) aBitrate = "96k";
    else aBitrate = "128k";

    let maxDim = 1280;
    if (num <= 25) maxDim = 720;
    else if (num <= 50) maxDim = 960;
    else if (num <= 75) maxDim = 1280;
    else maxDim = 1920;

    return {
      name: `Custom (${num}%)`,
      quality: num,
      videoCrf: crf,
      audioBitrate: aBitrate,
      maxDimension: maxDim,
      sampleRate: num <= 30 ? 22050 : 32000,
    };
  }

  return {
    name: "Medium (Seimbang)",
    quality: 55,
    videoCrf: 30,
    audioBitrate: "96k",
    maxDimension: 1280,
    sampleRate: 32000,
  };
}

/**
 * Kompresi Gambar menggunakan Sharp (JPEG MozJPEG / PNG Palette / WebP)
 */
async function compressImage(buffer, options) {
  const meta = await sharp(buffer).metadata();
  const format = (meta.format || "jpeg").toLowerCase();
  const isAnimated = (meta.pages || 1) > 1;

  let pipeline = sharp(buffer, { animated: isAnimated }).rotate();

  const maxDim = options.maxDimension || 1280;
  if (meta.width > maxDim || meta.height > maxDim) {
    pipeline = pipeline.resize({
      width: meta.width > meta.height ? maxDim : null,
      height: meta.height >= meta.width ? maxDim : null,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const q = Math.max(10, Math.min(100, options.quality || 55));

  if (format === "png") {
    if (meta.hasAlpha) {
      const out = await pipeline.png({ quality: q, compressionLevel: 9, palette: true }).toBuffer();
      const newMeta = await sharp(out).metadata().catch(() => ({}));
      return { buffer: out, mimetype: "image/png", ext: "png", width: newMeta.width, height: newMeta.height, origMeta: meta };
    }
    const [compPng, compJpg] = await Promise.all([
      pipeline.clone().png({ quality: q, compressionLevel: 9, palette: true }).toBuffer().catch(() => null),
      pipeline.clone().jpeg({ quality: q, mozjpeg: true, progressive: true }).toBuffer().catch(() => null),
    ]);
    if (compJpg && compPng) {
      const chosen = compJpg.length <= compPng.length
        ? { buffer: compJpg, mimetype: "image/jpeg", ext: "jpg" }
        : { buffer: compPng, mimetype: "image/png", ext: "png" };
      const newMeta = await sharp(chosen.buffer).metadata().catch(() => ({}));
      return { ...chosen, width: newMeta.width, height: newMeta.height, origMeta: meta };
    }
    const finalBuf = compPng || compJpg || buffer;
    const newMeta = await sharp(finalBuf).metadata().catch(() => ({}));
    return { buffer: finalBuf, mimetype: "image/png", ext: "png", width: newMeta.width, height: newMeta.height, origMeta: meta };
  }

  if (format === "webp") {
    const out = await pipeline.webp({ quality: q, effort: 6 }).toBuffer();
    const newMeta = await sharp(out).metadata().catch(() => ({}));
    return { buffer: out, mimetype: "image/webp", ext: "webp", width: newMeta.width, height: newMeta.height, origMeta: meta };
  }

  const out = await pipeline.jpeg({ quality: q, mozjpeg: true, progressive: true }).toBuffer();
  const newMeta = await sharp(out).metadata().catch(() => ({}));
  return { buffer: out, mimetype: "image/jpeg", ext: "jpg", width: newMeta.width, height: newMeta.height, origMeta: meta };
}

/**
 * Kompresi Video menggunakan FFmpeg (H.264 CRF + AAC + Scale)
 */
async function compressVideo(buffer, options) {
  const tmpIn = createTemp("in_vid.mp4");
  const tmpOut = createTemp("out_vid.mp4");
  await fs.writeFile(tmpIn, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(tmpIn)
        .outputOptions([
          "-vcodec libx264",
          `-crf ${options.videoCrf}`,
          "-preset faster",
          "-pix_fmt yuv420p",
          `-vf scale='min(${options.maxDimension},iw)':-2`,
          "-acodec aac",
          `-b:a ${options.audioBitrate}`,
          "-movflags +faststart",
        ])
        .toFormat("mp4")
        .on("error", (err) => reject(err))
        .on("end", () => resolve())
        .save(tmpOut);
    });

    const resultBuf = await fs.readFile(tmpOut);
    return {
      buffer: resultBuf,
      mimetype: "video/mp4",
      ext: "mp4",
    };
  } finally {
    cleanup(tmpIn, tmpOut);
  }
}

/**
 * Kompresi Audio / Voice Note menggunakan FFmpeg
 */
async function compressAudio(buffer, options, isPtt = false) {
  const tmpIn = createTemp("in_aud.bin");
  const tmpOut = createTemp(isPtt ? "out_aud.opus" : "out_aud.mp3");
  await fs.writeFile(tmpIn, buffer);

  try {
    await new Promise((resolve, reject) => {
      const ff = ffmpeg(tmpIn).noVideo();
      if (isPtt) {
        ff.audioCodec("libopus")
          .audioChannels(1)
          .audioFrequency(16000)
          .outputOptions(["-avoid_negative_ts make_zero", "-map_metadata -1", "-b:a 32k"])
          .toFormat("opus");
      } else {
        ff.audioCodec("libmp3lame")
          .audioBitrate(options.audioBitrate)
          .audioFrequency(options.sampleRate)
          .toFormat("mp3");
      }
      ff.on("error", (err) => reject(err))
        .on("end", () => resolve())
        .save(tmpOut);
    });

    const resultBuf = await fs.readFile(tmpOut);
    return {
      buffer: resultBuf,
      mimetype: isPtt ? "audio/ogg; codecs=opus" : "audio/mpeg",
      ext: isPtt ? "opus" : "mp3",
      ptt: isPtt,
    };
  } finally {
    cleanup(tmpIn, tmpOut);
  }
}

/**
 * Kompresi Stiker WebP
 */
async function compressSticker(buffer, options) {
  const meta = await sharp(buffer).metadata().catch(() => ({}));
  const isAnimated = (meta.pages || 1) > 1;
  const q = Math.min(Math.max(10, options.quality || 50), 65);

  let pipeline = sharp(buffer, { animated: isAnimated });
  pipeline = pipeline.resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const out = await pipeline.webp({ quality: q, effort: 6 }).toBuffer();
  return {
    buffer: out,
    mimetype: "image/webp",
    ext: "webp",
  };
}

/**
 * Kompresi Dokumen / File sembarang menjadi arsip ZIP standar PKZip
 */
function makeZipBuffer(fileName, fileBuffer) {
  const comp = zlib.deflateRawSync(fileBuffer);
  const nameBuf = Buffer.from(fileName, "utf8");
  const crc = zlib.crc32 ? zlib.crc32(fileBuffer) : 0;

  // Local File Header (30 byte + nama)
  const lfh = Buffer.alloc(30 + nameBuf.length);
  lfh.writeUInt32LE(0x04034b50, 0);
  lfh.writeUInt16LE(20, 4);
  lfh.writeUInt16LE(0, 6);
  lfh.writeUInt16LE(8, 8); // Deflate
  lfh.writeUInt16LE(0, 10);
  lfh.writeUInt16LE(0, 12);
  lfh.writeUInt32LE(crc, 14);
  lfh.writeUInt32LE(comp.length, 18);
  lfh.writeUInt32LE(fileBuffer.length, 22);
  lfh.writeUInt16LE(nameBuf.length, 26);
  lfh.writeUInt16LE(0, 28);
  nameBuf.copy(lfh, 30);

  // Central Directory (46 byte + nama)
  const cd = Buffer.alloc(46 + nameBuf.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(0, 12);
  cd.writeUInt16LE(0, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(fileBuffer.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(0, 38);
  cd.writeUInt32LE(0, 42);
  nameBuf.copy(cd, 46);

  // End of Central Directory (22 byte)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(lfh.length + comp.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([lfh, comp, cd, eocd]);
}

export default {
  cmd: ["compress", "kompres", "compressor", "kecilkan"],
  category: "tools",
  desc: "Kompres dan perkecil ukuran berkas gambar, video, audio, stiker, atau dokumen",

  exec: async (m, { sock, args, command }) => {
    const q = m.quoted || m;
    const msg = q.msg || q;
    const mime = msg.mimetype || q.mimetype || "";
    const mtype = q.type || q.mtype || "";

    const hasMedia =
      mime ||
      ["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(mtype) ||
      msg.image ||
      msg.video ||
      msg.audio ||
      msg.sticker ||
      msg.document;

    if (!hasMedia) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} [level]`,
          ["50", "low", "high", "ultra"],
          "Reply berkas media (gambar, video, audio, stiker, atau dokumen) yang ingin diperkecil ukurannya.\n" +
          "Pilihan tingkat kompresi:\n" +
          "• low    : Kualitas tinggi, kompresi ringan (hemat ~20-40%)\n" +
          "• medium : Kompresi seimbang (default) (hemat ~40-70%)\n" +
          "• high   : Kompresi kuat, ukuran jauh lebih kecil (hemat ~60-85%)\n" +
          "• ultra  : Kompresi maksimal, hemat kuota ekstrem (hemat ~75-95%)\n" +
          "• angka  : 10 - 90 (persentase kualitas target)",
          "Perkecil ukuran berkas gambar, video, audio, stiker, atau dokumen"
        )
      );
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const origBuffer = await q.download?.();
      if (!origBuffer || !origBuffer.length) {
        throw new Error("Gagal mengunduh berkas media target.");
      }

      const options = parseCompressionLevel(args[0]);
      const origSize = origBuffer.length;
      let targetType = "Media";
      let compressedResult = null;

      // 1. Stiker WebP
      if (mtype === "stickerMessage" || (mime === "image/webp" && !msg.fileName)) {
        targetType = "Stiker WebP";
        compressedResult = await compressSticker(origBuffer, options);
      }
      // 2. Gambar (JPEG, PNG, WebP)
      else if (mime.startsWith("image/") || mtype === "imageMessage") {
        targetType = "Gambar";
        compressedResult = await compressImage(origBuffer, options);
      }
      // 3. Video (MP4, MKV, dsb)
      else if (mime.startsWith("video/") || mtype === "videoMessage") {
        targetType = "Video";
        compressedResult = await compressVideo(origBuffer, options);
      }
      // 4. Audio / Voice Note
      else if (mime.startsWith("audio/") || mtype === "audioMessage") {
        const isPtt = Boolean(msg.ptt);
        targetType = isPtt ? "Voice Note (PTT)" : "Audio";
        compressedResult = await compressAudio(origBuffer, options, isPtt);
      }
      // 5. Dokumen
      else if (mtype === "documentMessage" || mime.startsWith("application/") || msg.fileName) {
        const rawFileName = msg.fileName || "document";

        if (mime.startsWith("image/")) {
          targetType = "Dokumen Gambar";
          const resImg = await compressImage(origBuffer, options);
          compressedResult = {
            buffer: resImg.buffer,
            document: true,
            fileName: rawFileName,
            mimetype: resImg.mimetype,
          };
        } else if (mime.startsWith("video/")) {
          targetType = "Dokumen Video";
          const resVid = await compressVideo(origBuffer, options);
          compressedResult = {
            buffer: resVid.buffer,
            document: true,
            fileName: rawFileName.replace(/\.[^.]+$/, ".mp4"),
            mimetype: "video/mp4",
          };
        } else if (mime.startsWith("audio/")) {
          targetType = "Dokumen Audio";
          const resAud = await compressAudio(origBuffer, options, false);
          compressedResult = {
            buffer: resAud.buffer,
            document: true,
            fileName: rawFileName.replace(/\.[^.]+$/, ".mp3"),
            mimetype: "audio/mpeg",
          };
        } else {
          targetType = "Dokumen (ZIP)";
          const zipName = rawFileName.endsWith(".zip") ? rawFileName : `${rawFileName}.zip`;
          const zipBuf = makeZipBuffer(rawFileName, origBuffer);
          compressedResult = {
            buffer: zipBuf,
            document: true,
            fileName: zipName,
            mimetype: "application/zip",
          };
        }
      } else {
        // Fallback coba kompres sebagai gambar atau zip
        try {
          const resImg = await compressImage(origBuffer, options);
          targetType = "Gambar";
          compressedResult = resImg;
        } catch {
          targetType = "Arsip ZIP";
          const zipBuf = makeZipBuffer("file.bin", origBuffer);
          compressedResult = {
            buffer: zipBuf,
            document: true,
            fileName: "compressed.zip",
            mimetype: "application/zip",
          };
        }
      }

      if (!compressedResult || !compressedResult.buffer) {
        throw new Error("Gagal melakukan kompresi berkas.");
      }

      const newSize = compressedResult.buffer.length;
      const savedBytes = origSize - newSize;
      const savedPercent = ((savedBytes / origSize) * 100).toFixed(1);
      const isSmaller = newSize < origSize;

      let infoText = `*KOMPRESI SELESAI*\n`;
      infoText += `> • Tipe Berkas : ${targetType}\n`;
      infoText += `> • Tingkat     : ${options.name}\n`;
      if (compressedResult.width && compressedResult.height && compressedResult.origMeta) {
        infoText += `> • Resolusi    : ${compressedResult.origMeta.width}x${compressedResult.origMeta.height} ➔ ${compressedResult.width}x${compressedResult.height}\n`;
      }
      infoText += `> • Ukuran Awal : ${formatBytes(origSize)}\n`;
      infoText += `> • Ukuran Akhir: ${formatBytes(newSize)}\n`;

      if (isSmaller) {
        infoText += `> • Penghematan : ${savedPercent}% (${formatBytes(savedBytes)} lebih hemat)`;
      } else {
        infoText += `_Catatan: Berkas asli sudah sangat padat/terkompresi._`;
      }

      // Pengiriman hasil kompresi sesuai tipe media
      if (compressedResult.document) {
        await sock.sendMessage(
          m.from,
          {
            document: compressedResult.buffer,
            mimetype: compressedResult.mimetype || "application/octet-stream",
            fileName: compressedResult.fileName || "compressed_file",
            caption: infoText,
          },
          { quoted: m }
        );
      } else if (targetType === "Stiker WebP") {
        await sock.sendMessage(m.from, { sticker: compressedResult.buffer }, { quoted: m });
        await m.reply(infoText);
      } else if (targetType.startsWith("Voice") || targetType === "Audio") {
        await sock.sendMessage(
          m.from,
          {
            audio: compressedResult.buffer,
            mimetype: compressedResult.mimetype,
            ptt: Boolean(compressedResult.ptt),
          },
          { quoted: m }
        );
        await m.reply(infoText);
      } else if (targetType === "Video") {
        await sock.sendMessage(
          m.from,
          {
            video: compressedResult.buffer,
            caption: infoText,
            mimetype: "video/mp4",
          },
          { quoted: m }
        );
      } else {
        await sock.sendMessage(
          m.from,
          {
            image: compressedResult.buffer,
            caption: infoText,
            mimetype: compressedResult.mimetype || "image/jpeg",
          },
          { quoted: m }
        );
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[COMPRESS_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error(`Gagal mengompres berkas: ${err.message}`));
    }
  },
};
