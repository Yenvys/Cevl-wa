import axios from "axios";
import { downloadMediaMessage } from "baileys";
import { res } from '../../lib/response.js';


const MIME_MAP = {
    "image/jpeg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
    "image/bmp": "image/bmp",
    "image/tiff": "image/tiff",
    "application/pdf": "application/pdf"
};

async function ocrSpace(buffer, mime, lang = "eng", engine = 5) {
    try {
        const base64Data = `data:${mime};base64,${buffer.toString("base64")}`;

        const { data: body } = await axios.post(
            "https://api.rifkyshre.biz.id/ocr/space",
            {
                base64: base64Data,
                language: lang,
                ocrEngine: engine
            },
            {
                timeout: 120000,
                headers: { "Content-Type": "application/json" }
            }
        );

        return body;
    } catch (e) {
        return { status: false, error: e.message };
    }
}

export default {
    cmd: ["ocr", "scantext", "baca-gambar"],
    category: "tools",
    desc: "Mengekstrak teks didalam gambar atau dokumen PDF menggunakan OCR Space API.",

    exec: async (m, { sock, args, command }) => {
        // Cek apakah ada media yang dikirim langsung atau lewat quote/reply
        const quoted = m.quoted ? m.quoted : m;
        const mimeType = (quoted.msg || quoted).mimetype || "";

        if (!mimeType) {
            return m.reply(res.format(m.prefix, command, `\n\n_Kirim gambar atau reply gambar/PDF dengan caption perintah_\n\n*Opsi Bahasa (Opsional):*\n> .ocr ind (Teks Indo)\n> .ocr eng (Teks Inggris)`));
        }

        const targetMime = MIME_MAP[mimeType];
        if (!targetMime) {
            return m.reply(`_Format berkas media tidak didukung! Sistem hanya menerima ekstensi: JPG, JPEG, PNG, WEBP, BMP, TIF, atau PDF._`);
        }

        // Atur bahasa deteksi (Default: eng, jika dimasukkan parameter seperti 'ind' maka akan berubah)
        const customLang = args[0]?.toLowerCase() || "eng";

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        try {
            // Download biner media langsung dari WhatsApp server hulu
            const mediaBuffer = await downloadMediaMessage(
                quoted,
                "buffer",
                {},
                {
                    logger: console,
                    reconnectMode: "always"
                }
            );

            if (!mediaBuffer) {
                throw new Error("Gagal mengambil biner buffer dari WhatsApp server.");
            }

            // Hit ke API Shre OCR
            const response = await ocrSpace(mediaBuffer, targetMime, customLang, 5);

            if (!response || !response.status) {
                await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
                return m.reply(`_Gagal memproses OCR. Log:* \`\`\`${response?.error || "Respons API tidak valid."}\`\`\``);
            }

            const d = response.data;
            if (!d.text || !d.text.trim()) {
                await sock.sendMessage(m.from, { react: { text: "⚠", key: m.key } });
                return m.reply(`_Sistem berhasil memindai media, namun tidak ada karakter teks atau tulisan yang terdeteksi._`);
            }

            const teksHasil = d.text.trim();

            await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
            return m.reply(teksHasil);

        } catch (err) {
            console.error(err);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            return m.reply(res.error);
        }
    }
};
