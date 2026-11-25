import { downloadMediaMessage } from "baileys";
import sharp from "sharp";
import { res } from "../../src/response.js";

export default {
  cmd: ["smeme", "memegen"],
  category: "tools",
  desc: "Membuat meme dari gambar dengan teks atas dan bawah",

  exec: async (m, { sock, args, command }) => {
    try {
      const quoted = m.quoted || m;
      const mime = (quoted.msg || quoted).mimetype || "";
      const text = args.join(" ");

      if (!mime.includes("image") || !text) {
        return m.reply(
          res.format(
            m.prefix,
            command,
            "ketika error | malah tambah error",
            "Kirim atau reply gambar. Gunakan pemisah | untuk teks atas & bawah",
            "Membuat gambar meme dengan teks atas dan bawah",
          ),
        );
      }

      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

      const buffer = await downloadMediaMessage(
        quoted,
        "buffer",
        {},
        { logger: console, reconnectMode: "always" },
      );
      if (!buffer) throw new Error("Gagal mengunduh gambar.");

      const [topText = "", bottomText = ""] = text.split("|").map((t) => t.trim());

      const image = sharp(buffer);
      const { width, height } = await image.metadata();

      const fontSize = Math.floor(width / 10);
      const strokeWidth = Math.max(2, Math.floor(width / 150));

      const svg = `
        <svg width="${width}" height="${height}">
          <style>
            .text { 
              fill: white; 
              font-size: ${fontSize}px; 
              font-family: Impact, Arial, sans-serif; 
              font-weight: bold; 
              stroke: black; 
              stroke-width: ${strokeWidth}px; 
              paint-order: stroke; 
              text-anchor: middle; 
            }
          </style>
          ${topText ? `<text x="50%" y="5%" class="text" dominant-baseline="hanging">${topText}</text>` : ""}
          ${bottomText ? `<text x="50%" y="95%" class="text" dominant-baseline="baseline">${bottomText}</text>` : ""}
        </svg>`;

      const memeBuffer = await image
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .jpeg({ quality: 90 })
        .toBuffer();

      await sock.sendSticker(m.from, memeBuffer, m, { isAnimated: false });
      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[MEME_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      m.reply(res.error("Terjadi kesalahan saat membuat meme. Pastikan ukuran gambar tidak terlalu besar."));
    }
  },
};
