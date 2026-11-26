import {
  generateMessageID,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  downloadMediaMessage,
  proto,
} from "baileys";
import protobuf from "protobufjs";
import crypto from "node:crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import WebP from "node-webpmux";
import fs from "node:fs";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { tmpdir } from "node:os";
import fetch from "node-fetch";
import { execFile } from "node:child_process";
import config from "../config.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const customTemp = path.join(process.cwd(), "data", "tmp");
if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });

export const groupCache = new Map();

export const albumCache = new Map();
global.albumCache = albumCache;

const recentMediaBurst = new Map();
const MAX_ALBUM_CACHE = 300;

function cleanAlbumCache() {
  if (albumCache.size > MAX_ALBUM_CACHE) {
    const keys = Array.from(albumCache.keys()).slice(0, albumCache.size - MAX_ALBUM_CACHE);
    for (const k of keys) albumCache.delete(k);
  }
  const now = Date.now();
  for (const [k, v] of recentMediaBurst) {
    if (now - v.lastTime > 60000) recentMediaBurst.delete(k);
  }
}

function trackAlbumMessage(msg, sock = null) {
  if (!msg || !msg.key?.id || !msg.message) return;

  const chat = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const msgId = msg.key.id;

  const assoc =
    msg.message?.messageContextInfo?.messageAssociation ||
    msg.message?.imageMessage?.contextInfo?.messageAssociation ||
    msg.message?.videoMessage?.contextInfo?.messageAssociation ||
    msg.message?.contextInfo?.messageAssociation;

  const assocParentId = assoc?.parentMessageKey?.id;
  const isAlbumHeader = Boolean(msg.message?.albumMessage);
  const expectedCount = msg.message?.albumMessage?.expectedImageCount || 0;

  const hasMedia = Boolean(
    msg.message?.imageMessage ||
    msg.message?.videoMessage ||
    msg.message?.stickerMessage
  );

  if (hasMedia && typeof msg.download !== "function") {
    msg.download = () =>
      downloadMediaMessage(
        msg,
        "buffer",
        {},
        {
          reuploadRequest: sock?.updateMediaMessage,
          logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
        }
      ).catch(() => null);
  }

  // 1. If this message is the album placeholder / header
  if (isAlbumHeader) {
    let album = albumCache.get(msgId);
    if (!album) {
      album = {
        isAlbum: true,
        parentId: msgId,
        chat,
        sender,
        expectedCount,
        messages: [],
        lastUpdated: Date.now(),
      };
      albumCache.set(msgId, album);
    } else {
      album.isAlbum = true;
      album.expectedCount = expectedCount || album.expectedCount;
      album.lastUpdated = Date.now();
    }
    return;
  }

  // 2. Explicit association
  if (assocParentId) {
    let album = albumCache.get(assocParentId);
    if (!album) {
      album = {
        isAlbum: true,
        parentId: assocParentId,
        chat,
        sender,
        expectedCount: 0,
        messages: [],
        lastUpdated: Date.now(),
      };
      albumCache.set(assocParentId, album);
    }
    if (hasMedia && !album.messages.some((m) => m.key?.id === msgId)) {
      album.messages.push(msg);
      album.lastUpdated = Date.now();
    }
    albumCache.set(msgId, album);
    return;
  }

  // 3. Media burst detection (multiple photos/videos sent within 6 seconds from same sender in chat)
  if (hasMedia) {
    const burstKey = `${chat}:${sender}`;
    const now = Date.now();
    const burst = recentMediaBurst.get(burstKey);

    if (burst && now - burst.lastTime < 6000) {
      burst.lastTime = now;
      if (!burst.messages.some((m) => m.key?.id === msgId)) {
        burst.messages.push(msg);
      }
      let album = albumCache.get(burst.parentId);
      if (!album) {
        album = {
          isAlbum: true,
          parentId: burst.parentId,
          chat,
          sender,
          expectedCount: burst.messages.length,
          messages: burst.messages,
          lastUpdated: now,
        };
        albumCache.set(burst.parentId, album);
      } else {
        album.messages = burst.messages;
        album.lastUpdated = now;
      }
      albumCache.set(msgId, album);
      albumCache.set(burst.parentId, album);
    } else {
      recentMediaBurst.set(burstKey, {
        lastTime: now,
        parentId: msgId,
        messages: [msg],
      });
    }
  }
}

export function getAlbumMessages(chat, qId, quoted = null) {
  if (!qId && !quoted) return [];

  // 1. Direct albumCache lookup
  if (qId && albumCache.has(qId)) {
    const alb = albumCache.get(qId);
    if (alb && Array.isArray(alb.messages) && alb.messages.length > 0) {
      return alb.messages;
    }
  }

  // 2. Check quoted properties
  if (quoted) {
    if (Array.isArray(quoted.messages) && quoted.messages.length > 0) return quoted.messages;
    if (Array.isArray(quoted.medias) && quoted.medias.length > 0) return quoted.medias;
    if (Array.isArray(quoted.album) && quoted.album.length > 0) return quoted.album;
    if (quoted.albumMessage?.messages) return quoted.albumMessage.messages;
    if (quoted.fakeObj?.message?.albumMessage?.messages) return quoted.fakeObj.message.albumMessage.messages;
  }

  // 3. Check store.rawMessages for parentId
  let parentId = null;
  const rawQuoted = qId ? store.rawMessages.get(qId) : null;
  if (rawQuoted) {
    parentId =
      rawQuoted.message?.messageContextInfo?.messageAssociation?.parentMessageKey?.id ||
      rawQuoted.message?.imageMessage?.contextInfo?.messageAssociation?.parentMessageKey?.id ||
      rawQuoted.message?.videoMessage?.contextInfo?.messageAssociation?.parentMessageKey?.id;
  }

  if (parentId && albumCache.has(parentId)) {
    const alb = albumCache.get(parentId);
    if (alb?.messages?.length > 0) return alb.messages;
  }

  // 4. Scan store.rawMessages for matching parentId or qId
  const searchId = parentId || qId;
  if (searchId) {
    const matched = [];
    for (const [, raw] of store.rawMessages) {
      if (chat && raw.key?.remoteJid !== chat) continue;
      const pid =
        raw.message?.messageContextInfo?.messageAssociation?.parentMessageKey?.id ||
        raw.message?.imageMessage?.contextInfo?.messageAssociation?.parentMessageKey?.id ||
        raw.message?.videoMessage?.contextInfo?.messageAssociation?.parentMessageKey?.id;
      if (pid === searchId || raw.key?.id === searchId) {
        const hasMedia = raw.message?.imageMessage || raw.message?.videoMessage || raw.message?.stickerMessage;
        if (hasMedia && !matched.some((m) => m.key?.id === raw.key?.id)) {
          matched.push(raw);
        }
      }
    }
    if (matched.length > 0) return matched;
  }

  // 5. Album message fallback scan by timestamp & sender
  const isAlbumType =
    quoted?.type === "albumMessage" ||
    quoted?.mtype === "albumMessage" ||
    Boolean(quoted?.msg?.albumMessage) ||
    Boolean(rawQuoted?.message?.albumMessage);

  if (isAlbumType) {
    const matched = [];
    const targetSender = quoted?.sender || quoted?.participant || rawQuoted?.key?.participant;
    const refTime = rawQuoted?.messageTimestamp || (quoted?.messageTimestamp ? quoted.messageTimestamp : null);

    for (const [, raw] of store.rawMessages) {
      if (chat && raw.key?.remoteJid !== chat) continue;
      if (targetSender) {
        const sender = raw.key?.participant || raw.key?.remoteJid;
        if (sender && !sender.includes(targetSender.split("@")[0])) continue;
      }
      const hasMedia = raw.message?.imageMessage || raw.message?.videoMessage;
      if (!hasMedia) continue;

      if (refTime && raw.messageTimestamp) {
        if (Math.abs(raw.messageTimestamp - refTime) <= 60) {
          if (!matched.some((m) => m.key?.id === raw.key?.id)) matched.push(raw);
        }
      } else {
        matched.push(raw);
      }
    }

    if (matched.length > 0) return matched;
  }

  return [];
}

export const store = {
  messages: new Map(),
  rawMessages: new Map(),
  isDirty: false,
  limit: 2000,

  bind(ev, sock = null) {
    ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify" && type !== "append") return;
      let added = false;
      for (const msg of messages) {
        if (!msg.key?.id || !msg.message) continue;
        this.messages.set(msg.key.id, msg.message);
        this.rawMessages.set(msg.key.id, msg);
        added = true;

        try {
          trackAlbumMessage(msg, sock);
        } catch (e) {
          console.error("[ALBUM TRACK ERROR]", e);
        }
      }
      if (added) {
        this.isDirty = true;
        this._cleanOldMessages();
        cleanAlbumCache();
      }
    });

    ev.on("messages.update", (updates) => {
      let updated = false;
      for (const update of updates) {
        if (!update.key?.id || !update.message) continue;
        if (this.messages.has(update.key.id)) {
          this.messages.set(update.key.id, {
            ...this.messages.get(update.key.id),
            ...update.message,
          });
          updated = true;
        }
        if (this.rawMessages.has(update.key.id)) {
          const prev = this.rawMessages.get(update.key.id);
          this.rawMessages.set(update.key.id, {
            ...prev,
            message: {
              ...(prev.message || {}),
              ...update.message,
            },
          });
        }
      }
      if (updated) this.isDirty = true;
    });
  },

  _cleanOldMessages() {
    if (this.messages.size > this.limit) {
      const keys = Array.from(this.messages.keys()).slice(0, this.messages.size - this.limit);
      for (const k of keys) {
        this.messages.delete(k);
        this.rawMessages.delete(k);
      }
    }
  },

  async writeToFile(filePath) {
    if (!this.isDirty) return;
    this.isDirty = false;
    try {
      await fs.promises.writeFile(filePath, JSON.stringify(Object.fromEntries(this.messages)));
    } catch (e) {
      this.isDirty = true;
      throw e;
    }
  },

  writeToFileSync(filePath) {
    if (!this.isDirty) return;
    fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(this.messages)));
    this.isDirty = false;
  },

  readFromFile(filePath) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      for (const [id, msg] of Object.entries(raw)) this.messages.set(id, msg);
      this._cleanOldMessages();
    } catch {}
  },
};

export const getMessageFromStoreById = (id) => (id ? store.messages.get(id) || null : null);

export const convertToOpus = (input) =>
  new Promise((resolve, reject) => {
    const output = new PassThrough();
    const buffers = [];
    const source = Buffer.isBuffer(input) ? Readable.from(input) : input;

    ffmpeg(source)
      .audioCodec("libopus")
      .audioChannels(1)
      .audioFrequency(16000)
      .toFormat("opus")
      .addOutputOptions(["-avoid_negative_ts make_zero", "-map_metadata -1"])
      .on("error", reject)
      .pipe(output);

    output.on("data", (chunk) => buffers.push(chunk));
    output.on("end", () => resolve(Buffer.concat(buffers)));
  });

export const toMp3 = (input, output, bitrate = 128) =>
  new Promise((res, rej) => {
    ffmpeg(input)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(bitrate)
      .format("mp3")
      .on("end", res)
      .on("error", rej)
      .save(output);
  });

export const convertToStickerWebp = (inputFile, isVideo = false) =>
  new Promise((resolve, reject) => {
    const outputFile = path.join(tmpdir(), `yenvy_canvas_sticker_${crypto.randomBytes(4).toString("hex")}.webp`);
    const args = [
      "-i",
      inputFile,
      "-vcodec",
      "libwebp",
      "-vf",
      "scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000",
    ];

    if (isVideo) args.push("-loop", "0", "-preset", "default", "-r", "15", "-t", "5");
    args.push("-y", outputFile);

    execFile(ffmpegInstaller.path, args, (err) => {
      if (err) return reject(err);
      resolve(outputFile);
    });
  });

export const stickerToImage = async (buf) => {
  const sharp = (await import("sharp")).default;
  return sharp(buf).trim().png().toBuffer();
};

export const getMedia = async (m, sock) => {
  const q = m.quoted || m;
  const mime = (q.msg || q).mimetype || "";
  const buffer = (await q.download?.()) || (sock ? await downloadMediaMessage(q, "buffer").catch(() => null) : null);
  return { mime, buffer };
};

export const createTemp = (ext) => path.join(tmpdir(), `yenvy_${Date.now()}.${ext}`);

export const cleanup = (...files) => {
  for (const f of files) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {}
  }
};

export const toGif = (input, output) =>
  new Promise((res, rej) => {
    ffmpeg(input)
      .outputOptions(["-vf", "scale=480:-1:flags=lanczos,fps=12", "-loop", "0", "-t", "10", "-pix_fmt", "yuv420p"])
      .toFormat("mp4")
      .on("end", res)
      .on("error", rej)
      .save(output);
  });

export const convertToMp4 = async (input) => {
  const tmpIn = path.join(customTemp, `vid_in_${Date.now()}.webm`);
  const tmpOut = path.join(customTemp, `vid_out_${Date.now()}.mp4`);

  try {
    if (Buffer.isBuffer(input)) {
      fs.writeFileSync(tmpIn, input);
    } else {
      const buffer = await new Promise((res, rej) => {
        const chunks = [];
        input.on("data", (c) => chunks.push(c));
        input.on("end", () => res(Buffer.concat(chunks)));
        input.on("error", rej);
      });
      fs.writeFileSync(tmpIn, buffer);
    }

    return await new Promise((resolve, reject) => {
      ffmpeg(tmpIn)
        .outputOptions([
          "-vcodec libx264",
          "-pix_fmt yuv420p",
          "-preset ultrafast",
          "-movflags +faststart",
          "-acodec aac",
        ])
        .toFormat("mp4")
        .on("error", (err) => {
          cleanup(tmpIn, tmpOut);
          reject(err);
        })
        .on("end", () => {
          const result = fs.readFileSync(tmpOut);
          cleanup(tmpIn, tmpOut);
          resolve(result);
        })
        .save(tmpOut);
    });
  } catch (e) {
    cleanup(tmpIn, tmpOut);
    throw e;
  }
};

export default async function wrapSocket(sock) {
  store.bind(sock.ev, sock);
  const oldSendMessage = sock.sendMessage;
  sock.generateMessageID = generateMessageID;

  sock.sendMessage = async (jid, content, options = {}) => {
    if (!jid || !content) return;
    if (!content.contextInfo) content.contextInfo = {};

    if (typeof jid === "string" && jid.endsWith("@g.us")) {
      const duration = groupCache.get(jid);
      if (duration) content.contextInfo.expiration = duration;
    }
    return oldSendMessage.call(sock, jid, content, options);
  };

  sock.sendImage = (jid, p, cap = "", q = "", opts = {}) =>
    sock.sendMessage(jid, { image: Buffer.isBuffer(p) ? p : { url: p }, caption: cap, ...opts }, { quoted: q });

  sock.sendVideo = (jid, p, cap = "", q = "", gif = false, opts = {}) =>
    sock.sendMessage(jid, { video: Buffer.isBuffer(p) ? p : { url: p }, caption: cap, gifPlayback: gif, ...opts }, { quoted: q });

  sock.sendAudio = async (jid, p, ptt = false, q = "", opts = {}) => {
    const src = Buffer.isBuffer(p) ? p : { url: p };
    const buffer = ptt ? await convertToOpus(Buffer.isBuffer(p) ? p : p) : src;
    return sock.sendMessage(jid, { audio: buffer, ptt, mimetype: ptt ? "audio/ogg; codecs=opus" : "audio/mpeg", ...opts }, { quoted: q });
  };

  sock.sendSticker = async (jid, buffer, quoted = "", options = {}) => {
    const { packname = config.botName, author = config.ownerName, isAnimated = false } = options;
    const tmpIn = path.join(tmpdir(), `yenvy_in_${Date.now()}.${isAnimated ? "mp4" : "jpg"}`);
    const tmpOut = path.join(tmpdir(), `yenvy_out_${Date.now()}.webp`);

    fs.writeFileSync(tmpIn, buffer);

    return new Promise((resolve, reject) => {
      const ff = ffmpeg(tmpIn)
        .on("error", (e) => {
          cleanup(tmpIn, tmpOut);
          reject(e);
        })
        .on("end", async () => {
          try {
            const img = new WebP.Image();
            await img.load(fs.readFileSync(tmpOut));
            const json = {
              "sticker-pack-id": `yenvy-${Date.now()}`,
              "sticker-pack-name": packname,
              "sticker-pack-publisher": author,
            };
            const exifHeader = Buffer.from([
              0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41,
              0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
            ]);
            const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
            const exif = Buffer.concat([exifHeader, jsonBuffer]);
            exif.writeUIntLE(jsonBuffer.length, 14, 4);
            img.exif = exif;

            const final = await img.save(null);
            const res = await sock.sendMessage(jid, { sticker: final, ...options }, { quoted });
            cleanup(tmpIn, tmpOut);
            resolve(res);
          } catch (e) {
            cleanup(tmpIn, tmpOut);
            reject(e);
          }
        });

      const ffOpts = [
        "-vcodec", "libwebp",
        "-vf", "scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba",
        "-lossless", "1",
        "-loop", "0",
        "-an",
      ];
      if (isAnimated) {
        ffOpts.push("-preset", "default", "-t", "00:00:10", "-r", "15", "-qscale", "20");
      }
      ff.addOutputOptions(ffOpts).toFormat("webp").save(tmpOut);
    });
  };

  return sock;
}

export async function buildCarouselMessage(sock, jid, pins, title = "Pinterest") {
  const sharp = (await import("sharp")).default;
  const cards = [];

  for (let i = 0; i < pins.length; i++) {
    try {
      const res = await fetch(pins[i].image);
      if (!res.ok) continue;

      const raw = Buffer.from(await res.arrayBuffer());
      const finalBuffer = await sharp(raw).jpeg({ quality: 80 }).toBuffer();
      const media = await prepareWAMessageMedia({ image: finalBuffer }, { upload: sock.waUploadToServer });

      cards.push({
        header: { title: `Result ${i + 1}/${pins.length}`, hasMediaAttachment: true, ...media },
        body: { text: `Pinterest Image: ${title}` },
        footer: { text: "Pinterest search" },
        nativeFlowMessage: {
          buttons: [
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "Source",
                url: pins[i].link,
                merchant_url: pins[i].link,
              }),
            },
          ],
        },
      });
    } catch {}
  }

  if (!cards.length) throw new Error("Semua gambar gagal diproses");

  return generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: `*PINTEREST SEARCH*\nResults for: ${title}` },
            footer: { text: "Swipe to see more" },
            carouselMessage: { cards },
            contextInfo: {
              forwardedNewsletterMessageInfo: {
                newsletterJid: "120363200000000000@newsletter",
                newsletterName: "Pinterest",
                serverMessageId: 1,
              },
            },
          },
        },
      },
    },
    { userJid: sock.user.id }
  );
}

export function pickRandomPins(pins, total = 5) {
  return [...pins].sort(() => 0.5 - Math.random()).slice(0, total);
}

export const sendMultiContact = async (sock, jid, contactList = [], quoted = "") => {
  try {
    const displayName = contactList[0]?.name || "Contacts";
    const processedContacts = contactList.map((person) => {
      const clean = person.number.replace(/[^0-9]/g, "");
      return {
        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${person.name}\nORG:Bot Owner;\nTEL;type=CELL;type=VOICE;waid=${clean}:+${clean}\nEND:VCARD`,
      };
    });

    return await sock.sendMessage(jid, { contacts: { displayName: `${displayName} and others`, contacts: processedContacts } }, { quoted });
  } catch (err) {
    console.error("[MULTI-CONTACT SENDER ERROR]", err);
    const lines = contactList.map((c) => `• *${c.name}:* https://wa.me/${c.number.replace(/[^0-9]/g, "")}`);
    return await sock.sendMessage(jid, { text: `*LIST OWNER/DEVELOPER*\n\n${lines.join("\n")}` }, { quoted });
  }
};

export function patchProtoInstance(p) {
  const M = p?.Message;
  if (!M || M.__audioStickerDecodePatched) return;

  const Reader = protobuf.Reader;

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

    const origStickerDecode = M.StickerMessage.decode;
    M.StickerMessage.decode = function (r, l, e) {
      const rawBytes = r instanceof Reader ? r.buf.subarray(r.pos, l === undefined ? r.len : r.pos + l) : r;
      const m = origStickerDecode.call(this, r, l, e);
      try {
        const r2 = Reader.create(rawBytes);
        const end = r2.len;
        while (r2.pos < end) {
          const tag = r2.uint32();
          const fn = tag >>> 3;
          if (fn === 26) {
            m.audioMessage = M.AudioMessage ? M.AudioMessage.decode(r2, r2.uint32()) : null;
            break;
          } else {
            r2.skipType(tag & 7);
          }
        }
      } catch {}
      return m;
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

  const origMsgDecode = M.decode;
  M.decode = function (r, l, e) {
    const rawBytes = r instanceof Reader ? r.buf.subarray(r.pos, l === undefined ? r.len : r.pos + l) : r;
    const m = origMsgDecode.call(this, r, l, e);
    try {
      const r2 = Reader.create(rawBytes);
      const end = r2.len;
      while (r2.pos < end) {
        const tag = r2.uint32();
        const fn = tag >>> 3;
        if (fn === 134) {
          const fpm = M.FutureProofMessage ? M.FutureProofMessage.decode(r2, r2.uint32()) : null;
          if (fpm?.message) {
            m.audioStickerMessage = fpm;
            if (fpm.message.stickerMessage) {
              m.stickerMessage = fpm.message.stickerMessage;
            }
          }
          break;
        } else {
          r2.skipType(tag & 7);
        }
      }
    } catch {}
    return m;
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

  M.__audioStickerDecodePatched = true;
  M.__audioStickerPatchedV3 = true;
}

export async function ensureAudioStickerPatched() {
  if (proto) patchProtoInstance(proto);
  for (const pkg of ["baileys", "@whiskeysockets/baileys"]) {
    try {
      const mod = await import(pkg);
      if (mod?.proto) patchProtoInstance(mod.proto);
      if (mod?.default?.proto) patchProtoInstance(mod.default.proto);
    } catch {}
  }
}

// Inisialisasi patch otomatis saat helper di-import
ensureAudioStickerPatched().catch(() => {});

