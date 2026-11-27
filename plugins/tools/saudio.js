/**
 * plugins/tools/saudio.js
 * Membuat stiker gambar/GIF bersuara (Audio Sticker) dengan sistem sesi interaktif
 */

import {
  prepareWAMessageMedia,
  proto,
  downloadMediaMessage,
  downloadContentFromMessage,
} from "baileys";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import WebP from "node-webpmux";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { config } from "../../config.js";
import { res } from "../../src/response.js";
import { store, audioStickerCache } from "../../src/helper.js";
import {
  isBufferBlacklisted,
  checkMessageAudioBlacklist,
} from "../../src/lib/audioBlacklist.js";

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegInstaller?.path || "ffmpeg";
const MAX_AUDIO_DURATION = 36;
const SESSION_SECONDS = 60;

const tempDir = path.join(process.cwd(), "data", "tmp");
if (!fsSync.existsSync(tempDir)) {
  fsSync.mkdirSync(tempDir, { recursive: true });
}

if (!globalThis.__audioStickerSessions) {
  globalThis.__audioStickerSessions = new Map();
}
const sessions = globalThis.__audioStickerSessions;

function patchProtoInstance(p) {
  const M = p?.Message;
  if (!M || M.__audioStickerPatchedV3) return;

  if (M.StickerMessage) {
    const prevStickerEncode = M.StickerMessage.encode;
    M.StickerMessage.encode = function (message, writer) {
      const audio = message?.audioMessage;
      if (audio && Object.prototype.hasOwnProperty.call(message, "audioMessage")) {
        delete message.audioMessage;
      }
      const w = prevStickerEncode.call(this, message, writer);
      if (audio && M.AudioMessage) {
        message.audioMessage = audio;
        M.AudioMessage.encode(audio, w.uint32(210).fork()).ldelim();
      }
      return w;
    };

    if (typeof M.StickerMessage.fromObject === "function") {
      const prevStickerFromObj = M.StickerMessage.fromObject;
      M.StickerMessage.fromObject = function (object) {
        const msg = prevStickerFromObj.call(this, object);
        if (object?.audioMessage) {
          msg.audioMessage = M.AudioMessage?.fromObject
            ? M.AudioMessage.fromObject(object.audioMessage)
            : object.audioMessage;
        }
        return msg;
      };
    }
  }

  const prevMsgEncode = M.encode;
  M.encode = function (message, writer) {
    const asm = message?.audioStickerMessage;
    if (asm) {
      if (Object.prototype.hasOwnProperty.call(message, "stickerMessage")) {
        delete message.stickerMessage;
      }
      if (Object.prototype.hasOwnProperty.call(message, "audioStickerMessage")) {
        delete message.audioStickerMessage;
      }
    }
    const w = prevMsgEncode.call(this, message, writer);
    if (asm && M.FutureProofMessage) {
      message.audioStickerMessage = asm;
      M.FutureProofMessage.encode(asm, w.uint32(1074).fork()).ldelim();
    }
    return w;
  };

  if (typeof M.fromObject === "function") {
    const prevMsgFromObj = M.fromObject;
    M.fromObject = function (object) {
      const msg = prevMsgFromObj.call(this, object);
      if (object?.audioStickerMessage) {
        const inner = object.audioStickerMessage.message || object.audioStickerMessage;
        if (inner?.stickerMessage && object.audioStickerMessage.message?.stickerMessage?.audioMessage) {
          inner.stickerMessage.audioMessage = object.audioStickerMessage.message.stickerMessage.audioMessage;
        }
        msg.audioStickerMessage = { message: inner };
        delete msg.stickerMessage;
        if (inner) {
          Object.setPrototypeOf(msg, inner);
        }
      }
      return msg;
    };
  }

  M.__audioStickerPatchedV3 = true;
}

async function ensurePatched() {
  patchProtoInstance(proto);
  for (const pkg of ["baileys", "@whiskeysockets/baileys"]) {
    try {
      const mod = await import(pkg);
      if (mod?.proto) patchProtoInstance(mod.proto);
      if (mod?.default?.proto) patchProtoInstance(mod.default.proto);
    } catch { }
  }
}

function getSessionKey(m) {
  const chat = m.from || m.chat || "";
  const sender = m.sender || "";
  return `${chat}:${sender}`;
}

function clearUserSession(key) {
  const existing = sessions.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  sessions.delete(key);
}

function unwrapMessageContainer(raw) {
  let cur = raw;
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
}

function detectMediaInfo(node) {
  if (!node) return { kind: null, mime: "", seconds: 0, mediaObj: null, dlType: null };

  const container = unwrapMessageContainer(node.message || node.fakeObj?.message || {});
  const mtype =
    node.type ||
    node.mtype ||
    Object.keys(container).find((k) =>
      /imageMessage|videoMessage|stickerMessage|audioMessage|documentMessage/i.test(k)
    ) ||
    "";

  const directMsg =
    node.msg && typeof node.msg === "object" && (node.msg.mediaKey || node.msg.url || node.msg.directPath || node.msg.mimetype)
      ? node.msg
      : null;

  const mediaObj =
    directMsg ||
    container[mtype] ||
    container.videoMessage ||
    container.imageMessage ||
    container.stickerMessage ||
    container.audioMessage ||
    container.documentMessage ||
    (node.mediaKey || node.url || node.directPath ? node : null);

  const mime = String(node.mimetype || mediaObj?.mimetype || "").toLowerCase();
  const seconds = Number(mediaObj?.seconds || node.seconds || node.msg?.seconds || 0);

  if (/video/i.test(mime) || /videoMessage/i.test(mtype)) {
    const dlType = /documentMessage/i.test(mtype) ? "document" : "video";
    return { kind: "video", mime: mime || "video/mp4", seconds, mediaObj, dlType };
  }
  if (/webp/i.test(mime) || /stickerMessage/i.test(mtype)) {
    const isAnim = Boolean(mediaObj?.isAnimated);
    return { kind: "webp", mime: "image/webp", seconds, isAnimated: isAnim, mediaObj, dlType: "sticker" };
  }
  if (/image/i.test(mime) || /imageMessage/i.test(mtype)) {
    const dlType = /documentMessage/i.test(mtype) ? "document" : "image";
    return { kind: "image", mime: mime || "image/jpeg", seconds: 0, mediaObj, dlType };
  }
  if (/audio|ogg|opus|mpeg|mp3|wav|m4a|aac/i.test(mime) || /audioMessage/i.test(mtype)) {
    const dlType = /documentMessage/i.test(mtype) ? "document" : "audio";
    return { kind: "audio", mime: mime || "audio/mpeg", seconds, mediaObj, dlType };
  }
  return { kind: null, mime: "", seconds: 0, mediaObj: null, dlType: null };
}

async function downloadBuffer(node, info, sock) {
  if (!node) return null;

  if (typeof node.download === "function") {
    try {
      const buf = await node.download();
      if (buf && buf.length) return buf;
    } catch { }
  }

  if (info?.mediaObj && info?.dlType && (info.mediaObj.mediaKey || info.mediaObj.directPath || info.mediaObj.url)) {
    try {
      const stream = await downloadContentFromMessage(info.mediaObj, info.dlType);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buf = Buffer.concat(chunks);
      if (buf.length) return buf;
    } catch { }
  }

  if (node.fakeObj?.message || node.message) {
    try {
      const msgObj = node.fakeObj?.message ? node.fakeObj : node;
      const buf = await downloadMediaMessage(
        msgObj,
        "buffer",
        {},
        {
          logger: { info: () => { }, error: () => { }, warn: () => { }, debug: () => { } },
          reuploadRequest: sock?.updateMediaMessage,
        }
      );
      if (buf?.length) return buf;
    } catch { }
  }

  if (info?.mediaObj && info?.dlType) {
    try {
      const synthetic = {
        key: node.key || { remoteJid: node.chat || "status@broadcast", id: "0" },
        message: { [`${info.dlType}Message`]: info.mediaObj },
      };
      const buf = await downloadMediaMessage(
        synthetic,
        "buffer",
        {},
        {
          logger: { info: () => { }, error: () => { }, warn: () => { }, debug: () => { } },
          reuploadRequest: sock?.updateMediaMessage,
        }
      );
      if (buf?.length) return buf;
    } catch { }
  }

  return null;
}

function buildExifPayload(packname, author) {
  const json = {
    "sticker-pack-id": `cevl-audiosticker-${Date.now()}`,
    "sticker-pack-name": String(packname ?? ""),
    "sticker-pack-publisher": String(author ?? ""),
    emojis: ["🔊"],
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

function injectExifRiffFallback(webpBuffer, exifData) {
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

async function addStickerExif(webpBuffer, packname, author) {
  const exifData = buildExifPayload(packname, author);
  try {
    const WebpImage = WebP.default?.Image || WebP.Image || WebP;
    if (WebpImage) {
      const img = new WebpImage();
      await img.load(webpBuffer);
      img.exif = exifData;
      return await img.save(null);
    }
  } catch { }
  return injectExifRiffFallback(webpBuffer, exifData);
}

function isWebpAnimated(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) return false;
  if (buf.toString("ascii", 12, 16) === "VP8X" && (buf[20] & 0x02) !== 0) return true;
  return buf.includes(Buffer.from("ANIM"));
}

function parseDurationFromStderr(stderr) {
  const match = String(stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function videoBufferToAnimatedWebp(buffer, shouldCrop = false, videoSeconds = 0) {
  const tmpId = randomBytes(6).toString("hex");
  const inPath = path.join(tempDir, `as_vid_${tmpId}.mp4`);
  const outPath = path.join(tempDir, `as_out_${tmpId}.webp`);

  const vf = shouldCrop
    ? `crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,format=rgba,setsar=1`
    : `scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1`;

  const encodeAttempt = async (fps, qv, duration) => {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", inPath,
      "-t", String(duration),
      "-vf", `fps=${fps},${vf}`,
      "-c:v", "libwebp",
      "-lossless", "0",
      "-compression_level", "6",
      "-q:v", String(qv),
      "-loop", "0",
      "-preset", "picture",
      "-an",
      "-vsync", "0",
      outPath,
    ]);
    return await fs.readFile(outPath);
  };

  try {
    await fs.writeFile(inPath, buffer);

    let realDuration = Number(videoSeconds) || 0;
    if (realDuration <= 0) {
      try {
        await execFileAsync(ffmpegPath, ["-i", inPath]);
      } catch (e) {
        realDuration = parseDurationFromStderr(e?.stderr);
      }
    }

    // Maksimalkan durasi animasi stiker: jika video >= 10s, targetkan 10-12 detik
    const targetDur = realDuration > 0 ? Math.min(realDuration, 12) : 10;

    const profiles = [];
    if (targetDur >= 10) {
      profiles.push(
        { dur: targetDur, fps: 10, qv: 45 },
        { dur: targetDur, fps: 8, qv: 35 },
        { dur: 10, fps: 10, qv: 40 },
        { dur: 10, fps: 8, qv: 30 },
        { dur: 10, fps: 6, qv: 24 },
        { dur: 8, fps: 6, qv: 20 },
        { dur: 7, fps: 6, qv: 16 }
      );
    } else {
      profiles.push(
        { dur: targetDur, fps: 10, qv: 50 },
        { dur: targetDur, fps: 8, qv: 36 },
        { dur: targetDur, fps: 6, qv: 24 },
        { dur: targetDur, fps: 5, qv: 16 }
      );
    }

    let webp = null;
    for (const p of profiles) {
      webp = await encodeAttempt(p.fps, p.qv, p.dur);
      if (webp && webp.length <= 880 * 1024) break;
    }
    return webp;
  } finally {
    await fs.unlink(inPath).catch(() => { });
    await fs.unlink(outPath).catch(() => { });
  }
}

async function imageBufferToWebp(buffer, shouldCrop = false) {
  try {
    const resizeOpts = shouldCrop
      ? { fit: "cover", position: "center" }
      : { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } };
    return await sharp(buffer, { animated: true })
      .rotate()
      .resize(512, 512, resizeOpts)
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    const tmpId = randomBytes(6).toString("hex");
    const inPath = path.join(tempDir, `as_img_${tmpId}.jpg`);
    const outPath = path.join(tempDir, `as_img_out_${tmpId}.webp`);
    try {
      await fs.writeFile(inPath, buffer);
      const vf = shouldCrop
        ? "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,format=rgba,setsar=1"
        : "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1";
      await execFileAsync(ffmpegPath, [
        "-y",
        "-i", inPath,
        "-vf", vf,
        "-c:v", "libwebp",
        "-lossless", "0",
        "-q:v", "80",
        "-an",
        outPath,
      ]);
      return await fs.readFile(outPath);
    } finally {
      await fs.unlink(inPath).catch(() => { });
      await fs.unlink(outPath).catch(() => { });
    }
  }
}

async function buildStickerWithExif(buffer, kind, packname, author, shouldCrop = false, videoSeconds = 0) {
  let rawWebp = buffer;
  if (kind === "video") {
    rawWebp = await videoBufferToAnimatedWebp(buffer, shouldCrop, videoSeconds);
  } else if (kind === "image") {
    rawWebp = await imageBufferToWebp(buffer, shouldCrop);
  }
  return await addStickerExif(rawWebp, packname, author);
}

function parseFfmpegDuration(stderrText) {
  const matches = [...String(stderrText || "").matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (!matches.length) return 0;
  const last = matches[matches.length - 1];
  const sec = Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
  return Number.isFinite(sec) ? sec : 0;
}

function generateWaveform(seedBuf, length = 64) {
  const wf = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    const b = seedBuf && seedBuf.length ? seedBuf[(i * 19 + 7) % seedBuf.length] : i * 11;
    wf[i] = 18 + (b % 76);
  }
  return wf;
}

async function convertToOggOpus(buffer, ext = "mp3") {
  const tmpId = randomBytes(6).toString("hex");
  const inPath = path.join(tempDir, `ptt_in_${tmpId}.${ext}`);
  const outPath = path.join(tempDir, `ptt_out_${tmpId}.ogg`);
  try {
    await fs.writeFile(inPath, buffer);
    const { stderr } = await execFileAsync(ffmpegPath, [
      "-y",
      "-i", inPath,
      "-vn",
      "-map", "0:a:0",
      "-t", String(MAX_AUDIO_DURATION),
      "-af", "aresample=48000:async=1:first_pts=0",
      "-c:a", "libopus",
      "-b:a", "48k",
      "-vbr", "on",
      "-compression_level", "10",
      "-ac", "1",
      "-ar", "48000",
      "-application", "audio",
      "-avoid_negative_ts", "make_zero",
      "-f", "ogg",
      outPath,
    ]);
    const oggBuffer = await fs.readFile(outPath);
    if (!oggBuffer || oggBuffer.length < 200) {
      throw new Error("Jalur audio kosong atau terlalu pendek.");
    }
    const realSeconds = parseFfmpegDuration(stderr);
    return { oggBuffer, realSeconds };
  } finally {
    await fs.unlink(inPath).catch(() => { });
    await fs.unlink(outPath).catch(() => { });
  }
}

async function buildAudioMessageFromBuffer(sock, buffer, ext, fallbackSeconds = 0) {
  const { oggBuffer, realSeconds } = await convertToOggOpus(buffer, ext);

  const blOgg = isBufferBlacklisted(oggBuffer);
  if (blOgg && blOgg.isBlacklisted) {
    throw new Error(`Audio ini masuk dalam daftar blacklist (${blOgg.note}).`);
  }

  const { audioMessage } = await prepareWAMessageMedia(
    { audio: oggBuffer, mimetype: "audio/ogg; codecs=opus", ptt: true },
    { upload: sock.waUploadToServer }
  );

  const chosenSec = realSeconds > 0 ? realSeconds : fallbackSeconds > 0 ? fallbackSeconds : 5;
  const finalSeconds = Math.max(1, Math.min(MAX_AUDIO_DURATION, Math.round(chosenSec)));

  audioMessage.seconds = finalSeconds;
  audioMessage.ptt = true;
  audioMessage.mimetype = "audio/ogg; codecs=opus";
  if (!audioMessage.waveform || !audioMessage.waveform.length) {
    audioMessage.waveform = generateWaveform(oggBuffer);
  }

  return audioMessage;
}

async function sendCombinedAudioSticker(sock, chat, stickerBuffer, isAnimated, audioMsg) {
  await ensurePatched();

  const prepared = await prepareWAMessageMedia(
    { sticker: stickerBuffer, isAnimated },
    { upload: sock.waUploadToServer }
  );

  prepared.stickerMessage.isAnimated = Boolean(isAnimated);
  prepared.stickerMessage.audioMessage = audioMsg;

  const payload = {
    _proto_: prepared,
    audioStickerMessage: { message: prepared },
    messageContextInfo: { messageSecret: randomBytes(32) },
  };
  Object.setPrototypeOf(payload, prepared);

  const sentId = await sock.relayMessage(chat, payload, {});
  const msgId = typeof sentId === "string" ? sentId : sentId?.id;

  try {
    const sha = prepared.stickerMessage?.fileSha256;
    const shaHex = sha
      ? Buffer.isBuffer(sha)
        ? sha.toString("hex")
        : Buffer.from(sha, "base64").toString("hex")
      : null;

    const cacheEntry = {
      msgId,
      stickerMessage: prepared.stickerMessage,
      audioMessage: audioMsg,
      stickerBuffer,
      isAnimated: Boolean(isAnimated),
      timestamp: Date.now(),
    };

    if (msgId) {
      store.messages.set(msgId, payload);
      store.rawMessages.set(msgId, {
        key: { remoteJid: chat, id: msgId, fromMe: true },
        message: payload,
      });
      audioStickerCache.set(msgId, cacheEntry);
    }
    if (shaHex) {
      audioStickerCache.set(shaHex, cacheEntry);
    }
  } catch (e) {
    console.error("[CACHE AUDIO STICKER ERROR]", e.message);
  }
}

function startStickerSession({ m, sock, stickerBuffer, isAnimated, packname, author, usedPrefix, command, notice = "" }) {
  const key = getSessionKey(m);
  clearUserSession(key);

  const timer = setTimeout(() => {
    if (sessions.has(key)) {
      sessions.delete(key);
      if (sock?.sendMessage) {
        sock.sendMessage(
          m.from,
          {
            text: `⏰ *SESI AUDIO STICKER BERAKHIR*\n> _Waktu tunggu ${SESSION_SECONDS} detik telah habis. Silakan kirim ulang foto jika ingin membuat Audio Sticker._`,
          },
          { quoted: m }
        ).catch(() => { });
      }
    }
  }, SESSION_SECONDS * 1000);

  sessions.set(key, {
    stickerBuffer,
    isAnimated,
    packname,
    author,
    expiresAt: Date.now() + SESSION_SECONDS * 1000,
    processing: false,
    timer,
  });

  let replyMsg =
    `*✦ SESI AUDIO STICKER AKTIF ✦*\n` +
    `_Media stiker berhasil disimpan ke dalam sesi sementara._\n\n` +
    `*Detail Sesi:*\n` +
    `> • *Pack:* ${packname}\n` +
    `> • *Author:* ${author}\n` +
    `> • *Tipe:* ${isAnimated ? "Animated GIF" : "Static Image"}\n` +
    `> • *Batas Durasi:* ${MAX_AUDIO_DURATION} Detik\n` +
    `> • *Waktu Tunggu:* ${SESSION_SECONDS} Detik\n`;

  if (notice) {
    replyMsg += `${notice}\n`;
  }

  replyMsg +=
    `\n*Langkah Selanjutnya:*\n` +
    `> 1. Kirim *Audio MP3 / Voice Note / Video* langsung ke chat ini\n` +
    `> 2. Atau *Reply Audio / Voice Note / Video* dengan \`${usedPrefix}${command}\`\n` +
    `> 3. Ketik \`${usedPrefix}${command} batal\` untuk membatalkan`;

  return m.reply(replyMsg);
}

async function consumeSessionWithAudio(m, sock, session, audioNode, audioInfo) {
  const key = getSessionKey(m);
  session.processing = true;
  await m.react("⏳");

  try {
    const audioBuf = await downloadBuffer(audioNode, audioInfo, sock);
    if (!audioBuf || !audioBuf.length) {
      throw new Error("Gagal mengunduh file audio/video.");
    }

    const blCheck = checkMessageAudioBlacklist(audioNode) || isBufferBlacklisted(audioBuf);
    if (blCheck && blCheck.isBlacklisted) {
      clearUserSession(key);
      await m.react("❌");
      return m.reply(res.error(`Audio ini dilarang karena masuk dalam daftar blacklist (${blCheck.note}). Pembuatan Audio Sticker dibatalkan.`));
    }

    const ext =
      audioInfo.kind === "video"
        ? "mp4"
        : /ogg|opus/i.test(audioInfo.mime)
          ? "ogg"
          : /mp4|m4a|aac/i.test(audioInfo.mime)
            ? "m4a"
            : "mp3";

    const audioMsg = await buildAudioMessageFromBuffer(
      sock,
      audioBuf,
      ext,
      audioInfo.seconds
    );

    await sendCombinedAudioSticker(
      sock,
      m.from,
      session.stickerBuffer,
      session.isAnimated,
      audioMsg
    );

    clearUserSession(key);
    await m.react("✅");
  } catch (err) {
    session.processing = false;
    console.error("[AUDIOSTICKER SESSION ERROR]", err);
    await m.react("❌");
    await m.reply(res.error(`Gagal menggabungkan suara ke stiker: ${err?.message || String(err)}`));
  }
}

export default {
  cmd: ["stickeraudio", "saudio", "audiosticker", "sa"],
  category: "tools",
  desc: "Membuat stiker gambar atau GIF bersuara (Audio Sticker) audio maks 36 detik & animasi s.d. 10-12 detik",

  exec: async (m, { sock, command, args, query }) => {
    const key = getSessionKey(m);
    const activeSession = sessions.get(key);
    const rawText = String(query || args.join(" ") || "").trim();

    if (/^(batal|cancel|stop)$/i.test(rawText)) {
      if (!activeSession) return m.reply(res.warn("Tidak ada sesi Audio Sticker yang sedang aktif."));
      clearUserSession(key);
      await m.react("✅");
      return m.reply(res.success("Sesi Audio Sticker berhasil dibatalkan."));
    }

    const ownInfo = detectMediaInfo(m);
    const quoted = m.quoted;
    const quotedInfo = detectMediaInfo(quoted);

    const hasOwnVisual = ownInfo.kind === "video" || ownInfo.kind === "image" || ownInfo.kind === "webp";
    const hasQuotedVisual = quotedInfo.kind === "video" || quotedInfo.kind === "image" || quotedInfo.kind === "webp";
    const hasOwnAudio = ownInfo.kind === "audio";
    const hasQuotedAudio = quotedInfo.kind === "audio";

    // Jika sedang dalam sesi dan user mengirim/reply audio dengan command
    if (activeSession && !activeSession.processing && (hasOwnAudio || hasQuotedAudio) && !hasOwnVisual) {
      const targetAudioNode = hasOwnAudio ? m : quoted;
      const targetAudioInfo = hasOwnAudio ? ownInfo : quotedInfo;
      return await consumeSessionWithAudio(m, sock, activeSession, targetAudioNode, targetAudioInfo);
    }

    // Jika tidak ada media visual dan tidak ada audio
    if (!hasOwnVisual && !hasQuotedVisual && !hasOwnAudio && !hasQuotedAudio) {
      if (activeSession) {
        const remSec = Math.max(1, Math.ceil((activeSession.expiresAt - Date.now()) / 1000));
        return m.reply(
          `⏳ *SESI MASIH AKTIF (${remSec} DETIK)*\n\n` +
          `Silakan kirim *Audio MP3 / Voice Note* atau reply sebuah audio dengan \`${m.prefix}${command}\`.\n` +
          `Ketik \`${m.prefix}${command} batal\` untuk membatalkan sesi.`
        );
      }

      return m.reply(
        res.format(
          m.prefix,
          command,
          [
            "",
            "crop",
            "PackName|Author",
            "PackName|Author crop",
          ],
          "Kirim atau reply foto/video (durasi audio video > 36 detik otomatis dipotong, animasi stiker dimaksimalkan s.d. 10-12 detik).\n" +
          "Opsi:\n" +
          "• Tambahkan 'crop' atau '-c' agar video/foto lonjong di-crop menjadi kotak 1:1.\n" +
          "• Jika foto statis, kirim/reply audio setelah bot merespon sesi.",
          "Membuat stiker gambar atau GIF bersuara (Audio Sticker)"
        )
      );
    }

    // Jika hanya audio tapi belum ada visual dan tidak ada sesi
    if (!hasOwnVisual && !hasQuotedVisual && (hasOwnAudio || hasQuotedAudio)) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          "",
          "Kirim atau reply Foto/Stiker terlebih dahulu, lalu bot akan membuka sesi untuk memasukkan audio ini",
          "Foto atau Stiker belum dipilih",
        ),
      );
    }

    await m.react("⏳");

    try {
      await ensurePatched();

      let parsedText = rawText;
      let shouldCrop = false;
      if (/\b(--crop|-c|crop|kotak|square)\b/i.test(parsedText)) {
        shouldCrop = true;
        parsedText = parsedText.replace(/\b(--crop|-c|crop|kotak|square)\b/gi, "").trim();
      }

      const [customPack, customAuth] = parsedText.includes("|")
        ? parsedText.split("|").map((s) => s.trim())
        : [parsedText, ""];

      const packname = customPack || config.botName || "Cevl";
      const author = customAuth || config.ownerName || "Yenvys";

      const visualNode = hasOwnVisual ? m : quoted;
      const visualInfo = hasOwnVisual ? ownInfo : quotedInfo;
      const isVideo = visualInfo.kind === "video";
      const videoSeconds = visualInfo.seconds || 0;

      let durationNotice = "";
      if (isVideo && videoSeconds > MAX_AUDIO_DURATION) {
        durationNotice = `*Catatan :* _Durasi audio video (${Math.round(videoSeconds)}s) otomatis dipotong ke ${MAX_AUDIO_DURATION}s agar sesuai batas WhatsApp._`;
      }

      const visualData = await downloadBuffer(visualNode, visualInfo, sock);
      if (!visualData || !visualData.length) {
        throw new Error("Gagal mengunduh media foto/video.");
      }

      const stickerBuffer = await buildStickerWithExif(visualData, visualInfo.kind, packname, author, shouldCrop, videoSeconds);
      const isAnimated = isVideo || isWebpAnimated(stickerBuffer);

      // Kasus: Visual + Quoted Audio (Sekaligus langsung jadi)
      if (hasOwnVisual && hasQuotedAudio) {
        const blDirect = checkMessageAudioBlacklist(quoted);
        if (blDirect && blDirect.isBlacklisted) {
          await m.react("❌");
          return m.reply(res.error(`Audio ini dilarang karena masuk dalam daftar blacklist (${blDirect.note}). Pembuatan Audio Sticker ditolak!`));
        }

        const audioBuf = await downloadBuffer(quoted, quotedInfo, sock);
        if (!audioBuf || !audioBuf.length) throw new Error("Gagal mengunduh audio yang di-reply.");

        const blBuf = isBufferBlacklisted(audioBuf);
        if (blBuf && blBuf.isBlacklisted) {
          await m.react("❌");
          return m.reply(res.error(`Audio ini dilarang karena masuk dalam daftar blacklist (${blBuf.note}). Pembuatan Audio Sticker ditolak!`));
        }

        const ext = /ogg|opus/i.test(quotedInfo.mime) ? "ogg" : /mp4|m4a|aac/i.test(quotedInfo.mime) ? "m4a" : "mp3";
        const audioMsg = await buildAudioMessageFromBuffer(sock, audioBuf, ext, quotedInfo.seconds);
        await sendCombinedAudioSticker(sock, m.from, stickerBuffer, isAnimated, audioMsg);
        clearUserSession(key);
        await m.react("✅");
        if (durationNotice) await m.reply(durationNotice);
        return;
      }

      // Kasus: Video (Mencoba ekstrak audio langsung dari file video)
      if (isVideo) {
        const blVid = isBufferBlacklisted(visualData);
        if (blVid && blVid.isBlacklisted) {
          await m.react("❌");
          return m.reply(res.error(`Audio dalam video ini masuk dalam daftar blacklist (${blVid.note}). Pembuatan Audio Sticker ditolak!`));
        }
        try {
          const audioMsg = await buildAudioMessageFromBuffer(sock, visualData, "mp4", videoSeconds);
          await sendCombinedAudioSticker(sock, m.from, stickerBuffer, true, audioMsg);
          clearUserSession(key);
          await m.react("✅");
          if (durationNotice) await m.reply(durationNotice);
          return;
        } catch {
          await m.react("⏳");
          return startStickerSession({
            m,
            sock,
            stickerBuffer,
            isAnimated: true,
            packname,
            author,
            usedPrefix: m.prefix,
            command,
            notice: durationNotice,
          });
        }
      }

      // Kasus: Foto / Gambar / Webp statis -> Membuka sesi interaktif
      return startStickerSession({
        m,
        sock,
        stickerBuffer,
        isAnimated,
        packname,
        author,
        usedPrefix: m.prefix,
        command,
        notice: durationNotice,
      });
    } catch (e) {
      console.error("[AUDIOSTICKER ERROR]", e);
      await m.react("❌");
      await m.reply(res.error(`Gagal memproses media: ${e?.message || String(e)}`));
    }
  },

  after: async (m, { sock, handler }) => {
    if (!m || m.fromMe) return false;
    const key = getSessionKey(m);
    const session = sessions.get(key);
    if (!session || session.processing) return false;

    if (Date.now() > session.expiresAt) {
      clearUserSession(key);
      return false;
    }

    const bodyText = String(m.body || "").trim();

    // Jika user mengetik batal/cancel tanpa prefix saat sesi aktif
    if (/^(batal|cancel|stop)$/i.test(bodyText)) {
      clearUserSession(key);
      await m.react("✅");
      await m.reply(res.success("Sesi Audio Sticker berhasil dibatalkan."));
      return true;
    }

    // Jika diawali prefix command bot lain, jangan diintercept sebagai audio
    const sortedPrefixes = handler?.prefix || [".", "/"];
    const hasPrefix = sortedPrefixes.some((p) => p && bodyText.startsWith(p));
    if (hasPrefix) {
      return false;
    }

    const ownInfo = detectMediaInfo(m);
    const quoted = m.quoted;
    const quotedInfo = detectMediaInfo(quoted);

    const isDirectAudio = ownInfo.kind === "audio" || ownInfo.kind === "video";
    const isReplyToAudio = !bodyText && (quotedInfo.kind === "audio" || quotedInfo.kind === "video");

    if (!isDirectAudio && !isReplyToAudio) return false;

    const targetNode = isDirectAudio ? m : quoted;
    const targetInfo = isDirectAudio ? ownInfo : quotedInfo;

    await consumeSessionWithAudio(m, sock, session, targetNode, targetInfo);
    return true;
  },
};
