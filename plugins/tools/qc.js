import axios from "axios";
import sharp from "sharp";
import db from "../../src/database.js";
import { res } from "../../src/response.js";

const DEFAULT_AVATAR = "https://i.ibb.co/30Z3b14/profile.jpg";

const escapeXml = (str = "") =>
  String(str).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

function wrapText(text, maxChars = 30) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length <= maxChars) {
      current = (current + " " + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
      while (current.length > maxChars) {
        lines.push(current.slice(0, maxChars));
        current = current.slice(maxChars);
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export default {
  cmd: ["qc", "quote"],
  category: "tools",
  desc: "Membuat stiker Quote Chat WhatsApp dengan rendering cepat (Sharp Engine)",

  exec: async (m, { sock, args }) => {
    const target = m.quoted || m;
    let text = args.join(" ");
    if (!text && m.quoted) text = m.quoted.text || m.quoted.body || m.quoted.query || "";

    const isImage = target.type === "imageMessage" || (target.mimetype && target.mimetype.startsWith("image/"));
    if (!text && !isImage) return m.reply(res.format(m.prefix, "qc", "Halo dunia", "Kirim atau reply pesan (teks/gambar) untuk dibuat stiker quote"));

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const jid = target.sender;
      let name = target.pushName;
      if (!name) {
        const contact = db.prepare("SELECT pushname FROM contacts WHERE jid = ?").get(jid);
        name = contact?.pushname && contact.pushname !== "null" ? contact.pushname : jid.split("@")[0];
      }

      const time = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

      // 1. Unduh Avatar
      let avatarUrl;
      try {
        avatarUrl = await sock.profilePictureUrl(jid, "image");
      } catch {
        avatarUrl = DEFAULT_AVATAR;
      }

      let avatarBuffer;
      try {
        const { data } = await axios.get(avatarUrl, { responseType: "arraybuffer", timeout: 10000 });
        avatarBuffer = Buffer.from(data);
      } catch {
        const { data } = await axios.get(DEFAULT_AVATAR, { responseType: "arraybuffer", timeout: 10000 });
        avatarBuffer = Buffer.from(data);
      }

      const avatarCircleMask = Buffer.from(
        '<svg width="48" height="48"><circle cx="24" cy="24" r="24" fill="#fff"/></svg>'
      );
      const circleAvatar = await sharp(avatarBuffer)
        .resize(48, 48, { fit: "cover" })
        .composite([{ input: avatarCircleMask, blend: "dest-in" }])
        .png()
        .toBuffer();

      // 2. Unduh Gambar Terlampir (jika ada)
      let attachedBuffer = null;
      let attachedHeight = 0;
      if (isImage && target.download) {
        try {
          const raw = await target.download();
          if (raw) {
            const meta = await sharp(raw).metadata();
            const w = Math.min(280, meta.width || 280);
            const h = Math.round((w / (meta.width || 1)) * (meta.height || 1));
            attachedHeight = Math.min(200, h);
            attachedBuffer = await sharp(raw)
              .resize(w, attachedHeight, { fit: "cover" })
              .png()
              .toBuffer();
          }
        } catch (err) {
          console.error("[QC_ATTACH_IMG_ERR]", err.message);
        }
      }

      // 3. Hitung dimensi Bubble
      const textLines = text ? wrapText(text, 32) : [];
      const lineHeight = 22;
      const textHeight = textLines.length * lineHeight;
      const longestLine = Math.max(...textLines.map((l) => l.length), name.length, 12);
      const bubbleWidth = Math.max(180, Math.min(360, longestLine * 10 + 40));
      const bubbleHeight = 30 + (attachedBuffer ? attachedHeight + 10 : 0) + textHeight + 20;

      const canvasWidth = bubbleWidth + 80;
      const canvasHeight = Math.max(64, bubbleHeight + 16);

      const bubbleX = 64;
      const bubbleY = 8;

      let tspans = "";
      let currentY = bubbleY + 44 + (attachedBuffer ? attachedHeight + 8 : 0);
      for (const line of textLines) {
        tspans += `<text x="${bubbleX + 14}" y="${currentY}" fill="#e9edef" font-size="15" font-family="Roboto, Arial, sans-serif">${escapeXml(line)}</text>`;
        currentY += lineHeight;
      }

      const svgBubble = `
        <svg width="${canvasWidth}" height="${canvasHeight}">
          <!-- Ekor Bubble -->
          <polygon points="${bubbleX},${bubbleY} ${bubbleX - 8},${bubbleY} ${bubbleX},${bubbleY + 12}" fill="#202c33" />
          <!-- Badan Bubble -->
          <rect x="${bubbleX}" y="${bubbleY}" width="${bubbleWidth}" height="${bubbleHeight}" rx="10" ry="10" fill="#202c33" />
          <!-- Nama Pengirim -->
          <text x="${bubbleX + 14}" y="${bubbleY + 22}" fill="#53bdeb" font-size="13.5" font-weight="bold" font-family="Roboto, Arial, sans-serif">${escapeXml(name)}</text>
          <!-- Teks Pesan -->
          ${tspans}
          <!-- Waktu -->
          <text x="${bubbleX + bubbleWidth - 12}" y="${bubbleY + bubbleHeight - 8}" text-anchor="end" fill="#8696a0" font-size="11" font-family="Roboto, Arial, sans-serif">${time}</text>
        </svg>
      `;

      const composites = [
        { input: Buffer.from(svgBubble), top: 0, left: 0 },
        { input: circleAvatar, top: bubbleY, left: 8 },
      ];

      if (attachedBuffer) {
        composites.push({ input: attachedBuffer, top: bubbleY + 28, left: bubbleX + 14 });
      }

      const finalImage = await sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite(composites)
        .webp({ quality: 90 })
        .toBuffer();

      await sock.sendSticker(m.from, finalImage, m);
      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[QC_SHARP_ERROR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error(err.message));
    }
  },
};
