function createReply(emoji, title, defaultText) {
  const fn = (customText) => `${emoji} *${title}*\n> ${customText || defaultText}`;
  fn.toString = () => `${emoji} *${title}*\n> ${defaultText}`;
  fn.valueOf = () => `${emoji} *${title}*\n> ${defaultText}`;
  return fn;
}

const noMediaFn = (type = "media (gambar/video)") => `📁 *Media Diperlukan!*\n> Kirim atau reply ${type} untuk menggunakan fitur ini.`;
noMediaFn.toString = () => "📁 *Media Diperlukan!*\n> Kirim atau reply media (gambar/video) untuk menggunakan fitur ini.";
noMediaFn.valueOf = noMediaFn.toString;

const formatWithPrefix = (str, pfx) => {
  if (!str || typeof str !== "string") return str;
  return str.replace(/(?<![a-zA-Z0-9_\$])\.([a-zA-Z][a-zA-Z0-9_-]*)\b/g, (match, word) => {
    if (/^(mp3|mp4|jpg|jpeg|png|webp|gif|json|js|ts|pdf|docx|zip|rar|ogg|opus|html|txt|com|net|org|id|io|ai|us|me)$/i.test(word)) {
      return match;
    }
    return `${pfx}${word}`;
  });
};

export const res = {
  // Status templates (Bisa dipanggil res.error / res.error("pesan khusus"))
  wait: createReply("⏳", "Mohon Tunggu!", "Sedang diproses, silakan tunggu sebentar..."),
  error: createReply("❌", "Terjadi Kesalahan!", "Silakan coba beberapa saat lagi."),
  owner: createReply("⛔", "Akses Ditolak!", "Fitur ini khusus untuk Owner bot."),
  admin: createReply("⛔", "Akses Ditolak!", "Perintah ini hanya dapat digunakan oleh Admin grup."),
  botAdmin: createReply("⚠️", "Peringatan!", "Bot harus menjadi Admin grup terlebih dahulu."),
  group: createReply("⚠️", "Peringatan!", "Perintah ini hanya dapat digunakan di dalam grup."),
  private: createReply("⚠️", "Peringatan!", "Perintah ini hanya dapat digunakan di chat pribadi."),
  success: createReply("✅", "Berhasil!", "Operasi telah sukses dilakukan."),
  warn: createReply("⚠️", "Peringatan!", "Format atau parameter yang dimasukkan tidak valid."),
  empty: createReply("🔍", "Tidak Ditemukan!", "Data atau media yang dicari tidak ditemukan."),
  noResult: createReply("🔍", "Tidak Ditemukan!", "Tidak ada hasil ditemukan. Coba kata kunci lain."),
  invalidUrl: createReply("🔗", "Tautan Tidak Valid!", "Harap masukkan URL tautan yang benar."),
  cooldown: createReply("⏱️", "Harap Tenang!", "Tunggu beberapa detik sebelum memakai perintah lagi."),
  noMedia: noMediaFn,
  tooLarge: createReply("📦", "Ukuran Terlalu Besar!", "Ukuran berkas melebihi batas maksimal yang diizinkan."),

  // Format Standar Penggunaan Perintah
  format: (prefix, cmd, example, note = "", desc = "") => {
    const pfx = typeof prefix === "string" ? prefix : ".";
    const cleanDesc = formatWithPrefix(desc, pfx);
    const cleanNote = formatWithPrefix(note, pfx);

    let out = `*♯ FORMAT PENGGUNAAN*\n`;
    if (cleanDesc) {
      out += `_${cleanDesc}_\n\n`;
    } else {
      out += `\n`;
    }

    const cleanCmd = String(cmd).startsWith(".") ? String(cmd).slice(1) : String(cmd);
    out += `*Perintah:* \`${pfx}${cleanCmd}\`\n`;

    const baseCmd = cleanCmd.replace(/\s*[<\[].*?[>\]]/g, "").trim();

    if (example !== null && example !== undefined && example !== false) {
      const processEx = (ex) => {
        let clean = String(ex).trim();
        if (clean.startsWith(".")) clean = `${pfx}${clean.slice(1)}`;
        clean = formatWithPrefix(clean, pfx);

        const hasCmd = pfx ? clean.startsWith(`${pfx}${baseCmd}`) : clean.startsWith(baseCmd);
        if (hasCmd) return clean;

        return `${pfx}${baseCmd}${clean ? ` ${clean}` : ""}`;
      };

      if (Array.isArray(example)) {
        out += `> *Contoh:*\n`;
        for (const ex of example) {
          out += `> • \`${processEx(ex)}\`\n`;
        }
      } else if (String(example).includes("\n")) {
        out += `> *Contoh:*\n`;
        const lines = String(example).split("\n");
        for (const l of lines) {
          const clean = l.replace(/^[>•\s\-_]+/, "").trim();
          if (clean) out += `> • \`${processEx(clean)}\`\n`;
        }
      } else {
        out += `> *Contoh:* \`${processEx(example)}\`\n`;
      }
    }

    if (cleanNote) {
      let raw = cleanNote.trim();
      if (raw.startsWith("_") && raw.endsWith("_")) {
        raw = raw.slice(1, -1).trim();
      }
      raw = raw.replace(/^Catatan\s*:\s*/i, "").trim();

      const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length) {
        const mainLines = [];
        const restLines = [];
        let foundPoint = false;

        for (const l of lines) {
          const isBullet = /^[•\-\*]\s+/.test(l);
          const isSubHeader = /^[A-Za-z0-9\s]+:\s*$/.test(l);
          if (isBullet || isSubHeader || foundPoint) {
            foundPoint = true;
            restLines.push(l);
          } else {
            mainLines.push(l);
          }
        }

        let mainText = mainLines.join(" ").trim();
        if (mainText.startsWith("_") && mainText.endsWith("_")) {
          mainText = mainText.slice(1, -1).trim();
        }

        if (mainText) {
          out += `*Catatan :* _${mainText}_\n`;
        } else {
          out += `*Catatan :*\n`;
        }

        for (const l of restLines) {
          if (/^[•\-\*]\s+/.test(l)) {
            const cleanBullet = l.replace(/^[•\-\*]\s*/, "").trim();
            out += `> • ${cleanBullet}\n`;
          } else if (l.startsWith(">")) {
            out += `${l}\n`;
          } else {
            out += `${l}\n`;
          }
        }
      }
    }

    return out.trim();
  },

  // Panduan opsi / flag yang diselaraskan dengan format standar (tanpa simbol box)
  guide: (prefix, cmd, desc, options = [], example = "", note = "") => {
    const list = [];
    if (example) list.push(example);
    if (options && options.length) {
      for (const opt of options) {
        if (typeof opt === "string") {
          list.push(opt);
        } else {
          const flagStr = opt.flag ? ` ${opt.flag}` : "";
          list.push(`${flagStr}${opt.desc ? ` (${opt.desc})` : ""}`);
        }
      }
    }
    return res.format(prefix, cmd, list.length ? list : "", note, desc);
  },
};

export default res;
