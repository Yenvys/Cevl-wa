import { downloadMediaMessage } from "baileys";
import sharp from "sharp";
import { res } from "../src/response.js";

export default {
    cmd: ["smeme", "memegen"],
    category: "tools",
    desc: "Membuat meme dari gambar dengan teks atas dan bawah",

    exec: async (m, { sock, args, command }) => {
        try {
            const quoted = m.quoted ? m.quoted : m;
            const mimeType = (quoted.msg || quoted).mimetype || "";

            if (!mimeType.includes("image")) {
                return m.reply(`_Kirim/Reply gambar dengan caption:_\n*${m.prefix}${command} teks atas | teks bawah*`);
            }

            const text = args.join(" ");
            if (!text) {
                return m.reply(`_Format salah!_\n\n*Contoh:* ${m.prefix}${command} ketika error | malah tambah error`);
            }

            await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

            // Unduh buffer gambar lokal dari WhatsApp
            const buffer = await downloadMediaMessage(
                quoted,
                "buffer",
                {},
                { logger: console, reconnectMode: "always" }
            );

            if (!buffer) throw new Error("Gagal mengunduh gambar.");

            // Pisahkan teks atas dan bawah
            let [topText, bottomText] = text.split("|").map(t => t ? t.trim() : "");

            // Generate meme lokal menggunakan Sharp
            const image = sharp(buffer);
            const metadata = await image.metadata();

            const width = metadata.width;
            const height = metadata.height;

            const fontSize = Math.floor(width / 10);
            const strokeWidth = Math.max(2, Math.floor(width / 150));

            // Render text as SVG Overlay
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

            // Kirim gambar hasil meme sebagai stiker
            await sock.sendSticker(m.from, memeBuffer, m, {
                isAnimated: false
            });

            await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });

        } catch (err) {
            console.error("[MEME_ERR]", err);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            m.reply(`_Terjadi kesalahan saat membuat meme. Pastikan ukuran gambar tidak terlalu besar._`);
        }
    }
};
