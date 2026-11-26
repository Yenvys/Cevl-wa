import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import pb from "protobufjs/minimal.js";
import {
  proto as WAProto,
  downloadContentFromMessage,
  generateMessageIDV2,
  writeRandomPadMax16,
} from "baileys";
import { res } from "../../src/response.js";

const WRITER = pb.Writer || pb.default?.Writer;

const SWATCHES = Object.freeze({
  pink: "ff69b4",
  biru: "1e90ff",
  ungu: "9b59b6",
  hitam: "121212",
  hijau: "2ecc71",
  merah: "e74c3c",
  kuning: "f1c40f",
  oren: "e67e22",
  putih: "f5f6fa",
});

function scanImagePayload(root) {
  if (!root) return null;
  const queue = [{ node: root, hint: "" }];
  const visited = new Set();

  while (queue.length > 0) {
    const { node, hint } = queue.shift();
    if (!node || typeof node !== "object" || visited.has(node)) continue;
    visited.add(node);

    if (node.mediaKey && (node.directPath || node.url)) {
      const mime = String(node.mimetype || "");
      if (hint === "image" || /^image\//i.test(mime)) {
        const kind = hint || (mime && !/^image\/(jpeg|jpg|png|webp)$/i.test(mime) ? "document" : "image");
        return { node, kind };
      }
    }

    if (node.imageMessage) queue.push({ node: node.imageMessage, hint: "image" });
    if (node.documentMessage && /^image\//i.test(node.documentMessage.mimetype || "")) {
      queue.push({ node: node.documentMessage, hint: "document" });
    }

    const wrappers = [
      node.viewOnceMessage?.message,
      node.viewOnceMessageV2?.message,
      node.viewOnceMessageV2Extension?.message,
      node.ephemeralMessage?.message,
      node.documentWithCaptionMessage?.message,
      node.editedMessage?.message,
      node.msg,
      node.message,
      node.fakeObj?.message,
    ];

    for (const next of wrappers) {
      if (next && typeof next === "object") {
        const nextHint = /document/i.test(node.mtype || "") ? "document" : /image/i.test(node.mtype || "") ? "image" : hint;
        queue.push({ node: next, hint: nextHint });
      }
    }
  }
  return null;
}

async function resolveImageBytes(sock, m, urlText) {
  if (urlText) {
    const resp = await fetch(urlText);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const ct = resp.headers.get("content-type") || "";
    if (!/^image\//i.test(ct)) throw new Error("URL bukan berkas gambar yang valid.");
    return { bytes: Buffer.from(await resp.arrayBuffer()), label: "Wallpaper dari URL" };
  }

  const sourceMsg = m.quoted || m;
  const hit = scanImagePayload(sourceMsg);
  if (!hit) return null;

  let bytes = null;
  if (typeof sourceMsg.download === "function") {
    bytes = await sourceMsg.download().catch(() => null);
  }
  if (!Buffer.isBuffer(bytes)) {
    const stream = await downloadContentFromMessage(hit.node, hit.kind);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    bytes = Buffer.concat(chunks);
  }

  return { bytes, label: `Wallpaper (${hit.kind})` };
}

async function prepareWallpaperAsset(sock, rawBytes) {
  const key = crypto.randomBytes(32);
  const derived = Buffer.from(
    crypto.hkdfSync("sha256", key, Buffer.alloc(32), Buffer.from("WhatsApp Chat Wallpaper Keys"), 112)
  );
  const cipher = crypto.createCipheriv("aes-256-cbc", derived.subarray(16, 48), derived.subarray(0, 16));
  const body = Buffer.concat([cipher.update(rawBytes), cipher.final()]);
  const mac = crypto
    .createHmac("sha256", derived.subarray(48, 80))
    .update(Buffer.concat([derived.subarray(0, 16), body]))
    .digest()
    .subarray(0, 10);
  const encrypted = Buffer.concat([body, mac]);
  const shaPlain = crypto.createHash("sha256").update(rawBytes).digest();
  const shaEnc = crypto.createHash("sha256").update(encrypted).digest();

  const connInfo =
    (await sock.refreshMediaConn?.(false).catch(() => null)) ||
    (await sock.refreshMediaConn?.(true).catch(() => null));

  if (connInfo?.auth) {
    const token = shaEnc.toString("base64url");
    const servers = connInfo.hosts?.length ? connInfo.hosts : [{ hostname: "mmg.whatsapp.net" }];
    for (const srv of servers) {
      const endpoint = `https://${srv.hostname || srv}/mms/chat-wallpaper-image/${encodeURIComponent(token)}?auth=${encodeURIComponent(connInfo.auth)}&token=${encodeURIComponent(token)}`;
      try {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", Origin: "https://web.whatsapp.com" },
          body: encrypted,
        });
        if (!r.ok) continue;
        const j = await r.json().catch(() => null);
        if (j?.direct_path || j?.directPath) {
          return {
            directPath: j.direct_path || j.directPath,
            mediaKey: key,
            fileEncSha256: shaEnc,
            fileSha256: shaPlain,
            dimLevel: 0,
          };
        }
      } catch {}
    }
  }

  const tmp = path.join(os.tmpdir(), `wp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.enc`);
  try {
    fs.writeFileSync(tmp, encrypted);
    const cdn = await sock.waUploadToServer(tmp, {
      fileEncSha256B64: shaEnc.toString("base64"),
      mediaType: "image",
    });
    if (!cdn?.directPath) throw new Error("Gagal mengunggah berkas wallpaper ke server.");
    return {
      directPath: cdn.directPath,
      mediaKey: key,
      fileEncSha256: shaEnc,
      fileSha256: shaPlain,
      dimLevel: 0,
    };
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function buildThemeNodeBytes(spec) {
  const ProtoClass = WAProto?.Message?.ChatThemeSetting;
  if (ProtoClass?.encode) return ProtoClass.encode(ProtoClass.create(spec)).finish();

  const w = WRITER.create().uint32(8).int64(spec.settingTimestampMs);
  if (spec.clearTheme) {
    w.uint32(16).bool(true);
    w.uint32(82)
      .fork()
      .uint32(8)
      .bool(true)
      .ldelim();
  } else if (spec.solidColor) {
    w.uint32(90)
      .fork()
      .uint32(13)
      .fixed32(spec.solidColor.backgroundLightArgb)
      .uint32(21)
      .fixed32(spec.solidColor.backgroundDarkArgb)
      .uint32(24)
      .bool(true)
      .ldelim();
  } else if (spec.customImage) {
    const img = spec.customImage;
    w.uint32(106)
      .fork()
      .uint32(10)
      .string(img.directPath)
      .uint32(18)
      .bytes(img.mediaKey)
      .uint32(26)
      .bytes(img.fileEncSha256)
      .uint32(34)
      .bytes(img.fileSha256)
      .uint32(45)
      .float(0)
      .ldelim();
  }
  return w.finish();
}

export default {
  cmd: ["tema", "settema", "theme", "temagc", "resettheme", "resettema", "cleartheme", "cleartema", "deltheme", "deltema"],
  category: "grup",
  desc: "Mengubah atau mereset tema warna & wallpaper obrolan grup ke awal",

  exec: async (m, { sock, command }) => {
    if (!m.isGroup) return m.reply(res.group);

    const groupMeta = await sock.groupMetadata(m.from).catch(() => null);
    if (!groupMeta) return m.reply(res.error("Gagal mengambil metadata grup."));

    if (!m.isAdmin && !m.isOwner) {
      return m.reply(res.admin);
    }

    if (groupMeta.restrict && !m.isBotAdmin) {
      return m.reply(res.botAdmin);
    }

    const self = sock.authState?.creds?.me || sock.user || {};
    const arg = (m.query || "").trim();
    const urlMatch = arg.match(/^(https?:\/\/\S+)$/i);
    const hasMedia = Boolean(scanImagePayload(m.quoted || m));

    const isResetCmd = ["resettheme", "resettema", "cleartheme", "cleartema", "deltheme", "deltema"].includes(command.toLowerCase());
    const isResetArg = /^(reset|hapus|clear|bawaan|default|awal|kembali)$/i.test(arg);

    if (!isResetCmd && !isResetArg && !arg && !hasMedia) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          [
            "pink",
            "#ff69b4",
            "reset",
            "https://.../gambar.jpg",
          ],
          `Pilihan warna: ${Object.keys(SWATCHES).join(", ")}\n` +
          `• Reset ke awal: ${m.prefix ?? "."}${command} reset atau ${m.prefix ?? "."}resettheme\n` +
          `• Reply gambar/foto untuk wallpaper kustom grup.`,
          "Mengubah atau mereset tema warna & wallpaper obrolan grup ke awal"
        )
      );
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const spec = { settingTimestampMs: Date.now() };
      const hexCode = SWATCHES[arg.toLowerCase()] || (/^#?[0-9a-f]{6}$/i.test(arg) ? arg.replace("#", "") : null);
      let summary = "";

      if (isResetCmd || isResetArg) {
        spec.clearTheme = true;
        summary = "Reset ke tema & wallpaper bawaan standar (awal)";
      } else if (hexCode) {
        const argb = (0xff000000 | parseInt(hexCode, 16)) >>> 0;
        spec.solidColor = { backgroundLightArgb: argb, backgroundDarkArgb: argb, isDoodleEnabled: true };
        summary = `Warna #${hexCode.toUpperCase()}`;
      } else if (hasMedia || urlMatch) {
        const img = await resolveImageBytes(sock, m, urlMatch?.[1]);
        if (!img?.bytes?.length) throw new Error("Buffer berkas gambar kosong atau gagal diunduh.");
        spec.customImage = await prepareWallpaperAsset(sock, img.bytes);
        summary = img.label;
      } else {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(
          res.warn(
            `Format tidak valid! Masukkan kode hex (*#ff69b4*), warna (*pink*, *biru*, dll), reply gambar, atau ketik *${m.prefix ?? "."}${command} reset* / *${m.prefix ?? "."}resettheme*.`
          )
        );
      }

      const envelope = WRITER.create()
        .uint32(98)
        .fork()
        .uint32(16)
        .int32(34)
        .uint32(242)
        .bytes(buildThemeNodeBytes(spec))
        .ldelim()
        .finish();

      const mode = groupMeta.addressingMode || "lid";
      const meId = mode === "lid" && self.lid ? self.lid : self.id;
      const { ciphertext } = await sock.signalRepository.encryptGroupMessage({
        group: m.from,
        data: writeRandomPadMax16(envelope),
        meId,
      });

      await sock.sendNode({
        tag: "message",
        attrs: { id: generateMessageIDV2(self.id), to: m.from, type: "media", addressing_mode: mode },
        content: [{ tag: "enc", attrs: { v: "2", type: "skmsg", mediatype: "chat_theme" }, content: ciphertext }],
      });

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      if (spec.clearTheme) {
        return m.reply(
          res.success(
            `Berhasil mereset tema grup kembali ke awal!\n> 🎨 *Status:* Tema & Wallpaper bawaan standar WhatsApp`
          )
        );
      }
      return m.reply(res.success(`Berhasil mengubah tema grup!\n> 🎨 *Tema:* ${summary}`));
    } catch (err) {
      console.error("[SETTEMA_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error(`Gagal mengubah/mereset tema grup: ${err.message}`));
    }
  },
};
