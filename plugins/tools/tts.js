/**
 * Adapted from Ginko project (https://github.com/ginkohub/mushi)
 * Credits to Google Translate TTS for text-to-speech API.
 */

import fetch from "node-fetch";
import { convertToOpus } from "../../src/helper.js";

export default {
  cmd: ["tts", "gtts"],
  category: "tools",
  desc: "Convert text to speech audio",
  exec: async (m, { sock, args, command }) => {
    let lang = "id";
    let text = "";

    // Cek jika argumen pertama adalah kode bahasa (misal: en, id, jp)
    if (args.length >= 2 && args[0].length === 2) {
      lang = args[0].toLowerCase();
      text = args.slice(1).join(" ");
    } else {
      text = args.join(" ");
    }

    // Jika tidak ada teks, coba ambil dari pesan yang di-reply
    const quoted = m.quoted ? m.quoted : null;
    if (!text && quoted?.text) {
      text = quoted.text;
    }

    if (!text) {
      return m.reply(
        `*Cara Penggunaan:*\n> ${m.prefix}${command} [bahasa] [teks]\n\n*Contoh:*\n> ${m.prefix}${command} id Halo semuanya\n> ${m.prefix}${command} en Hello world\n\n_Catatan: Kode bahasa bersifat opsional (default: id). Kamu juga bisa me-reply pesan teks dengan perintah ini._`,
      );
    }

    if (text.length > 250) {
      return m.reply("_Teks terlalu panjang! Maksimal 250 karakter._");
    }

    await sock.sendMessage(m.from, { react: { text: "🗣️", key: m.key } });

    try {
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;

      // Download audio MP3 dari Google TTS sebagai buffer
      const res = await fetch(ttsUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Referer: "https://translate.google.com/",
        },
      });

      if (!res.ok) throw new Error(`Google TTS HTTP ${res.status}`);

      const mp3Buffer = Buffer.from(await res.arrayBuffer());

      // Convert MP3 -> OGG Opus agar kompatibel di WA Mobile
      const opusBuffer = await convertToOpus(mp3Buffer);

      await sock.sendMessage(
        m.from,
        {
          audio: opusBuffer,
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
        },
        { quoted: m },
      );
    } catch (e) {
      console.error("[TTS_ERR]", e.message);
      await m.reply("_Terjadi kesalahan saat memproses text-to-speech._");
    }
  },
};

