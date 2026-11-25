import axios from "axios";
import { res } from "../../src/response.js";

const LANGUAGES = {
  id: "Indonesia",
  en: "Inggris",
  ja: "Jepang",
  ko: "Korea",
  zh: "Mandarin",
  ar: "Arab",
  es: "Spanyol",
  fr: "Prancis",
  de: "Jerman",
  ru: "Rusia",
  jw: "Jawa",
  su: "Sunda",
  it: "Italia",
  pt: "Portugis",
  nl: "Belanda",
  th: "Thailand",
  vi: "Vietnam",
  tr: "Turki",
  hi: "Hindi",
  ms: "Melayu",
};

async function translateText(text, targetLang = "id", sourceLang = "autodetect") {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
  const { data } = await axios.get(url, { timeout: 15000 });
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error("Terjemahan tidak menghasilkan teks.");
  return translated;
}

export default {
  cmd: ["translate", "tr", "tr?"],
  category: "tools",
  desc: "Menerjemahkan teks ke berbagai bahasa",
  exec: async (m, { command, args, query, sock }) => {
    if (command === "tr?" || command === "translate?" || query === "?" || query === "list") {
      const list = Object.entries(LANGUAGES)
        .map(([code, name]) => `> • \`${code}\` : ${name}`)
        .join("\n");
      return m.reply(
        `*🌐 DAFTAR BAHASA PENERJEMAH*\n_Gunakan kode bahasa di bawah ini saat menerjemahkan_\n\n` +
          list +
          `\n\n_Contoh: ${m.prefix}tr en Selamat pagi_`
      );
    }

    let targetLang = "id";
    let textToTranslate = "";

    const firstArg = (args[0] || "").toLowerCase();
    if (LANGUAGES[firstArg]) {
      targetLang = firstArg;
      textToTranslate = args.slice(1).join(" ").trim();
    } else {
      textToTranslate = query;
    }

    if (!textToTranslate && m.quoted) {
      textToTranslate = m.quoted.text || m.quoted.body || m.quoted.caption || "";
    }

    if (!textToTranslate) {
      return m.reply(
        res.format(
          m.prefix,
          "tr [bahasa] <teks>",
          [
            "en Halo dunia",
            "id Good morning",
            "ja (sambil reply pesan)",
            "? (melihat daftar kode bahasa)",
          ],
          "Bisa langsung mengetik teks atau me-reply pesan yang ingin diterjemahkan",
          "Menerjemahkan teks ke berbagai bahasa",
        )
      );
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const translated = await translateText(textToTranslate, targetLang);
      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      return m.reply(
        `*🌐 HASIL TERJEMAHAN [${targetLang.toUpperCase()}]*\n\n` +
          `> ${translated}\n\n` +
          `_Bahasa tujuan: ${LANGUAGES[targetLang] || targetLang}_`
      );
    } catch (err) {
      console.error("[TRANSLATE_ERR]", err.message);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error(`Gagal menerjemahkan teks: ${err.message}`));
    }
  },
};
