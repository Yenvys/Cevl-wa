import fetch from "node-fetch";
import { convertToOpus } from "../../src/helper.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["text2speech", "tts", "gtts"],
  category: "tools",
  desc: "Mengonversi teks ke audio suara (Text to Speech)",

  exec: async (m, { sock, args, command }) => {
    let lang = "id";
    let text = "";

    if (args.length >= 2 && args[0].length === 2) {
      lang = args[0].toLowerCase();
      text = args.slice(1).join(" ");
    } else {
      text = args.join(" ");
    }

    if (!text && m.quoted?.text) text = m.quoted.text;

    if (!text) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          ["id Halo semuanya", "en Hello world"],
          "Kode bahasa bersifat opsional (default: id)",
        ),
      );
    }

    if (text.length > 250) return m.reply(res.warn("Teks terlalu panjang! Maksimal 250 karakter."));

    await sock.sendMessage(m.from, { react: { text: "🗣️", key: m.key } });

    try {
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;
      const res = await fetch(ttsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36",
          Referer: "https://translate.google.com/",
        },
      });

      if (!res.ok) throw new Error(`Google TTS HTTP ${res.status}`);

      const mp3Buffer = Buffer.from(await res.arrayBuffer());
      const opusBuffer = await convertToOpus(mp3Buffer);

      await sock.sendMessage(
        m.from,
        { audio: opusBuffer, mimetype: "audio/ogg; codecs=opus", ptt: true },
        { quoted: m },
      );
    } catch (e) {
      console.error("[TTS_ERR]", e.message);
      await m.reply(res.error("Terjadi kesalahan saat memproses text-to-speech."));
    }
  },
};
