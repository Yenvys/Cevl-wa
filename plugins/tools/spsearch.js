import { res } from "../../src/response.js";
import {
  searchStickerPacks,
  getStickerPackDetails,
  downloadAndProcessPack,
} from "../../src/lib/stickerly.js";
import { sendCustomStickerPack } from "../../src/lib/stickerpack.js";

const sessions = new Map();

export default {
  cmd: ["spsearch", "stickerly", "sps", "caristicker", "spacksearch"],
  category: "tools",
  desc: "Mencari dan mengunduh sticker pack dari Sticker.ly secara interaktif",

  exec: async (m, { sock, args, query, command }) => {
    const q = String(query || args.join(" ") || "").trim();

    if (!q) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} <kata kunci | link>`,
          ["kucing", "lucu", "https://sticker.ly/s/WTKUQD"],
          "• Bot akan mencari sticker pack di Sticker.ly\n" +
          "• Balas (reply) pesan hasil pencarian dengan nomor urut (1 - 10) untuk mengunduh sticker pack secara otomatis 📦✨",
          "Mencari dan mengunduh sticker pack dari Sticker.ly"
        )
      );
    }

    // Cek apakah input berupa link langsung Sticker.ly atau pack code (5-8 karakter alfanumerik)
    let directPackId = null;
    if (q.includes("sticker.ly/s/")) {
      const parts = q.split("sticker.ly/s/")[1];
      directPackId = parts?.split(/[\/\?#\s]/)[0]?.trim().toUpperCase();
    } else if (/^[A-Za-z0-9]{5,8}$/.test(q) && !q.includes(" ")) {
      // Potensi direct pack ID
      const directCheck = await getStickerPackDetails(q).catch(() => null);
      if (directCheck && directCheck.stickers?.length > 0) {
        directPackId = q.toUpperCase();
      }
    }

    // Jika link atau direct ID valid, langsung unduh pack tersebut
    if (directPackId) {
      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } }).catch(() => {});

      const packDetails = await getStickerPackDetails(directPackId).catch(() => null);
      if (!packDetails || (packDetails.stickers?.length === 0 && packDetails.resourceFiles?.length === 0)) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return m.reply(res.error(`Gagal menemukan sticker pack dengan ID/link *${directPackId}*.`));
      }

      await sock.sendMessage(
        m.from,
        {
          text: `📦 Menyiapkan dan mengunduh sticker pack *"${packDetails.name}"* (${packDetails.count} stiker) oleh *${packDetails.author}*...\nHarap tunggu sebentar ✨`,
        },
        { quoted: m }
      );

      const stickerBuffers = await downloadAndProcessPack(packDetails, { maxStickers: 30, concurrency: 5 });
      if (!stickerBuffers || stickerBuffers.length === 0) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return m.reply(res.error(`Gagal mengunduh atau mengonversi stiker dari pack *${packDetails.name}*.`));
      }

      await sendCustomStickerPack(sock, m.from, stickerBuffers, {
        name: packDetails.name,
        publisher: packDetails.author,
        quoted: m,
      });

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } }).catch(() => {});
      return;
    }

    // Pencarian normal berdasarkan kata kunci
    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } }).catch(() => {});

    const packs = await searchStickerPacks(q, 10);
    if (!packs || packs.length === 0) {
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => {});
      return m.reply(res.error(`Tidak ditemukan sticker pack dengan kata kunci *"${q}"* di Sticker.ly. Silakan coba kata kunci lain.`));
    }

    let listText = `📦 *HASIL PENCARIAN STICKER.LY*\n`;
    listText += `> Kata Kunci: *${q}*\n`;
    listText += `> Ditemukan: *${packs.length} Sticker Pack*\n\n`;

    packs.forEach((p, idx) => {
      const type = p.isAnimated ? "🎞️ Animasi" : "🖼️ Statis";
      listText += `*${idx + 1}.* *${p.name}*\n`;
      listText += `   • Author: *${p.author}*\n`;
      listText += `   • Tipe: ${type} (${p.count} stiker)\n`;
      listText += `   • ID: \`${p.id}\`\n\n`;
    });

    listText += `────────────────────────\n`;
    listText += `> 💬 *Balas (reply) pesan ini* dengan nomor pilihan (*1 - ${packs.length}*) untuk mengunduh sticker pack!\n`;
    listText += `> ⏱️ _Sesi pemilihan berlaku selama 3 menit._`;

    const sent = await sock.sendMessage(m.from, { text: listText }, { quoted: m });

    if (sessions.has(m.from)) {
      clearTimeout(sessions.get(m.from).timeout);
    }

    const timeout = setTimeout(() => {
      sessions.delete(m.from);
    }, 180000);

    sessions.set(m.from, {
      messageId: sent?.key?.id,
      sender: m.sender,
      keyword: q,
      packs,
      timeout,
    });

    await sock.sendMessage(m.from, { react: { text: "🔍", key: m.key } }).catch(() => {});
  },

  after: async (m, { sock }) => {
    if (!sessions.has(m.from)) return;
    const session = sessions.get(m.from);

    const quotedId = m.quoted?.id || m.quoted?.key?.id;
    if (!quotedId || quotedId !== session.messageId) return;

    const rawText = String(m.body || "").trim();
    const choice = parseInt(rawText, 10);

    if (isNaN(choice) || choice < 1 || choice > session.packs.length) {
      return m.reply(res.warn(`Pilihan tidak valid! Balas dengan nomor urut antara *1 sampai ${session.packs.length}*.`));
    }

    // Bersihkan sesi aktif
    clearTimeout(session.timeout);
    sessions.delete(m.from);

    const selected = session.packs[choice - 1];
    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } }).catch(() => {});

    await sock.sendMessage(
      m.from,
      {
        text: `📦 Menyiapkan dan mengunduh sticker pack *"${selected.name}"* (${selected.count} stiker) oleh *${selected.author}*...\nHarap tunggu sebentar, stiker sedang diproses ✨`,
      },
      { quoted: m }
    );

    try {
      let packDetails = await getStickerPackDetails(selected.id).catch(() => null);
      if (!packDetails || (!packDetails.stickers?.length && !packDetails.resourceFiles?.length)) {
        packDetails = selected;
      }

      const stickerBuffers = await downloadAndProcessPack(packDetails, {
        maxStickers: 30,
        concurrency: 5,
      });

      if (!stickerBuffers || stickerBuffers.length === 0) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return m.reply(res.error(`Gagal mengunduh atau mengonversi stiker dari pack *"${selected.name}"*. Silakan coba pilihan lain.`));
      }

      await sendCustomStickerPack(sock, m.from, stickerBuffers, {
        name: packDetails.name || selected.name,
        publisher: packDetails.author || selected.author,
        quoted: m,
      });

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } }).catch(() => {});
    } catch (err) {
      console.error("[STICKERLY DOWNLOAD ERROR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => {});
      return m.reply(res.error(`Terjadi kesalahan saat memproses sticker pack: ${err.message}`));
    }
  },
};
