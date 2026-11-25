import axios from "axios";
import { downloadMediaMessage } from "baileys";
import { res } from "../../src/response.js";

const MIME_MAP = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/bmp": "image/bmp",
  "image/tiff": "image/tiff",
  "application/pdf": "application/pdf",
};

async function ocrSpace(buffer, mime, lang = "eng", engine = 5) {
  try {
    const { data } = await axios.post(
      "https://api.rifkyshre.biz.id/ocr/space",
      {
        base64: `data:${mime};base64,${buffer.toString("base64")}`,
        language: lang,
        ocrEngine: engine,
      },
      { timeout: 120000, headers: { "Content-Type": "application/json" } },
    );
    return data;
  } catch (e) {
    return { status: false, error: e.message };
  }
}

export default {
  cmd: ["ocr", "scantext", "baca-gambar"],
  category: "tools",
  desc: "Mengekstrak teks di dalam gambar atau dokumen PDF",

  exec: async (m, { sock, args, command }) => {
    const quoted = m.quoted || m;
    const mimeType = (quoted.msg || quoted).mimetype || "";

    if (!mimeType) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          "ind",
          "Kirim atau reply gambar/PDF. Opsi: ind (Indonesia), eng (Inggris)",
        ),
      );
    }

    const targetMime = MIME_MAP[mimeType];
    if (!targetMime) {
      return m.reply(res.warn("Format tidak didukung! Format diterima: JPG, JPEG, PNG, WEBP, BMP, TIF, PDF."));
    }

    const lang = args[0]?.toLowerCase() || "eng";
    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const mediaBuffer = await downloadMediaMessage(
        quoted,
        "buffer",
        {},
        { logger: console, reconnectMode: "always" },
      );
      if (!mediaBuffer) throw new Error("Gagal mengambil media dari server.");

      const response = await ocrSpace(mediaBuffer, targetMime, lang, 5);
      if (!response?.status) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error(`Gagal memproses OCR: ${response?.error || "Respons API tidak valid."}`));
      }

      const text = response.data?.text?.trim();
      if (!text) {
        await sock.sendMessage(m.from, { react: { text: "⚠", key: m.key } });
        return m.reply(res.empty("Media berhasil dipindai, tetapi tidak ada karakter teks yang terdeteksi."));
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      return m.reply(text);
    } catch (err) {
      console.error("[OCR_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error);
    }
  },
};
