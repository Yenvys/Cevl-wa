import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import WebP from "node-webpmux";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegInstaller?.path || "ffmpeg";
ffmpeg.setFfmpegPath(ffmpegPath);

const tempDir = path.join(process.cwd(), "data", "tmp");
if (!fsSync.existsSync(tempDir)) {
  fsSync.mkdirSync(tempDir, { recursive: true });
}

export function buildExifPayload(packname = "Cevl", author = "Yenvys") {
  const json = {
    "sticker-pack-id": `cevl-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    "sticker-pack-name": String(packname ?? "Cevl"),
    "sticker-pack-publisher": String(author ?? "Yenvys"),
    emojis: ["✨"],
  };
  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
  const exif = Buffer.concat([exifAttr, jsonBuff]);
  exif.writeUIntLE(jsonBuff.length, 14, 4);
  return exif;
}

export function injectExifRiff(webpBuffer, exifData) {
  if (
    !Buffer.isBuffer(webpBuffer) ||
    webpBuffer.length < 16 ||
    webpBuffer.toString("ascii", 0, 4) !== "RIFF" ||
    webpBuffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return webpBuffer;
  }

  const chunks = [];
  let offset = 12;
  let hasVp8x = false;
  let isAnim = false;

  while (offset + 8 <= webpBuffer.length) {
    const id = webpBuffer.toString("ascii", offset, offset + 4);
    const size = webpBuffer.readUInt32LE(offset + 4);
    const padded = size + (size % 2);
    const end = Math.min(webpBuffer.length, offset + 8 + padded);
    const rawChunk = Buffer.from(webpBuffer.subarray(offset, end));

    if (id === "VP8X") hasVp8x = true;
    if (id === "ANIM" || id === "ANMF") isAnim = true;
    if (id !== "EXIF") chunks.push({ id, rawChunk });

    offset = end;
  }

  if (!hasVp8x) {
    const vp8x = Buffer.alloc(18);
    vp8x.write("VP8X", 0, 4, "ascii");
    vp8x.writeUInt32LE(10, 4);
    vp8x[8] = 0x18;
    vp8x.writeUIntLE(511, 12, 3);
    vp8x.writeUIntLE(511, 15, 3);
    chunks.unshift({ id: "VP8X", rawChunk: vp8x });
  } else {
    const vp8xEntry = chunks.find((c) => c.id === "VP8X");
    if (vp8xEntry && vp8xEntry.rawChunk.length >= 18) {
      vp8xEntry.rawChunk[8] |= 0x08;
      if (isAnim) vp8xEntry.rawChunk[8] |= 0x02;
    }
  }

  const padByte = exifData.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
  const exifHeader = Buffer.alloc(8);
  exifHeader.write("EXIF", 0, 4, "ascii");
  exifHeader.writeUInt32LE(exifData.length, 4);
  chunks.push({ id: "EXIF", rawChunk: Buffer.concat([exifHeader, exifData, padByte]) });

  const body = Buffer.concat(chunks.map((c) => c.rawChunk));
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, 4, "ascii");

  return Buffer.concat([header, body]);
}

export async function addExif(webpBuffer, packname = "Cevl", author = "Yenvys") {
  const exifData = buildExifPayload(packname, author);
  try {
    const WebpImage = WebP.default?.Image || WebP.Image || WebP;
    if (WebpImage) {
      const img = new WebpImage();
      await img.load(webpBuffer);
      img.exif = exifData;
      return await img.save(null);
    }
  } catch {}
  return injectExifRiff(webpBuffer, exifData);
}

export async function imageToWebp(buffer, crop = false) {
  try {
    const resizeOpts = crop
      ? { fit: "cover", position: "center" }
      : { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } };

    return await sharp(buffer, { animated: true })
      .rotate()
      .resize(512, 512, resizeOpts)
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    const tmpIn = path.join(tempDir, `img_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.jpg`);
    const tmpOut = path.join(tempDir, `img_out_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.webp`);
    try {
      await fs.writeFile(tmpIn, buffer);
      const vf = crop
        ? "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,format=rgba,setsar=1"
        : "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1";
      await execFileAsync(ffmpegPath, [
        "-y",
        "-i", tmpIn,
        "-vf", vf,
        "-c:v", "libwebp",
        "-lossless", "0",
        "-q:v", "80",
        "-an",
        tmpOut,
      ]);
      return await fs.readFile(tmpOut);
    } finally {
      await fs.unlink(tmpIn).catch(() => {});
      await fs.unlink(tmpOut).catch(() => {});
    }
  }
}

export async function videoToWebp(buffer, crop = false, maxDuration = 10) {
  const tmpIn = path.join(tempDir, `vid_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.mp4`);
  const tmpOut = path.join(tempDir, `vid_out_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.webp`);

  const vf = crop
    ? "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,format=rgba,setsar=1"
    : "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1";

  const encode = async (fps, qv) => {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", tmpIn,
      "-t", String(maxDuration),
      "-vf", `fps=${fps},${vf}`,
      "-c:v", "libwebp",
      "-lossless", "0",
      "-compression_level", "6",
      "-q:v", String(qv),
      "-loop", "0",
      "-preset", "picture",
      "-an",
      "-vsync", "0",
      tmpOut,
    ]);
    return await fs.readFile(tmpOut);
  };

  try {
    await fs.writeFile(tmpIn, buffer);
    const profiles = [
      [10, 50],
      [8, 36],
      [6, 24],
      [5, 16],
    ];
    let webp = null;
    for (const [fps, qv] of profiles) {
      webp = await encode(fps, qv);
      if (webp.length <= 880 * 1024) break;
    }
    return webp;
  } finally {
    await fs.unlink(tmpIn).catch(() => {});
    await fs.unlink(tmpOut).catch(() => {});
  }
}

export async function writeExifImg(buffer, metadata = {}) {
  const webp = await imageToWebp(buffer, Boolean(metadata.crop));
  return await addExif(webp, metadata.packname, metadata.author);
}

export async function writeExifVid(buffer, metadata = {}) {
  const webp = await videoToWebp(buffer, Boolean(metadata.crop), metadata.duration || 8);
  return await addExif(webp, metadata.packname, metadata.author);
}

export default {
  buildExifPayload,
  injectExifRiff,
  addExif,
  imageToWebp,
  videoToWebp,
  writeExifImg,
  writeExifVid,
};
