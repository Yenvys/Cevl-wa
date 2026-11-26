import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { res } from "../../src/response.js";

const dataDir = path.join(process.cwd(), "data");
const expenseFile = path.join(dataDir, "pengeluaran.json");
const whitelistFile = path.join(dataDir, "pengeluaran_whitelist.json");

function loadJSON(file, defaultData = {}) {
  try {
    if (!fs.existsSync(file)) {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return defaultData;
  }
}

function saveJSON(file, data) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[PENGELUARAN SAVE ERROR]", err.message);
  }
}

function formatRupiah(angka) {
  const num = typeof angka === "number" ? angka : parseInt(angka, 10) || 0;
  return "Rp" + num.toLocaleString("id-ID");
}

function formatDateWIB(dateStr) {
  const d = new Date(dateStr);
  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(d).replace(/\./g, ":");
}

function parseNominal(str) {
  if (!str) return null;
  let s = str.trim().toLowerCase().replace(/^rp\.?\s*/i, "");
  const m1 = s.match(/^(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta|m)$/i);
  if (m1) {
    let num = parseFloat(m1[1].replace(",", "."));
    const unit = m1[2].toLowerCase();
    if (unit === "k" || unit === "rb" || unit === "ribu") num *= 1000;
    else if (unit === "jt" || unit === "juta" || unit === "m") num *= 1000000;
    return Math.round(num);
  }

  const clean = s.replace(/[^0-9]/g, "");
  const val = parseInt(clean, 10);
  return isNaN(val) || val <= 0 ? null : val;
}

function parseExpense(text) {
  if (!text || typeof text !== "string") return null;
  const raw = text.trim();

  // Pattern A: [Nominal] [Keterangan]
  // Contoh: '15000 nasi goreng', '15k bensin', 'Rp 25.000 pulsa', '50rb token'
  const matchA = raw.match(
    /^(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:k|rb|ribu|jt|juta|m)?|\d{1,3}(?:[.,]\d{3})+|\d+)\s+(.+)$/i
  );
  if (matchA) {
    const nominal = parseNominal(matchA[1]);
    const note = matchA[2].trim();
    if (
      nominal &&
      note &&
      !/^(on|off|del|delete|hapus|reset|clear|wl|whitelist|list|help)$/i.test(note)
    ) {
      return { amount: nominal, note };
    }
  }

  // Pattern B: [Keterangan] [Nominal]
  // Contoh: 'nasi padang 25000', 'bensin 20k', 'beli pulsa 50rb'
  const matchB = raw.match(
    /^(.+?)\s+(?:rp\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:k|rb|ribu|jt|juta|m)?|\d{1,3}(?:[.,]\d{3})+|\d+)$/i
  );
  if (matchB) {
    const note = matchB[1].trim();
    const nominal = parseNominal(matchB[2]);
    if (
      nominal &&
      note &&
      !/^(pengeluaran|kas|tambah|add|catat|del|delete|hapus|reset|clear)$/i.test(note)
    ) {
      return { amount: nominal, note };
    }
  }

  return null;
}

function getStartOfDayWIB(now = new Date()) {
  const wibTime = now.getTime() + 7 * 3600000;
  const d = new Date(wibTime);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - 7 * 3600000;
}

function getStartOfWeekWIB(now = new Date()) {
  const wibTime = now.getTime() + 7 * 3600000;
  const d = new Date(wibTime);
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(wibTime);
  monday.setUTCDate(d.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.getTime() - 7 * 3600000;
}

function getStartOfMonthWIB(now = new Date()) {
  const wibTime = now.getTime() + 7 * 3600000;
  const d = new Date(wibTime);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - 7 * 3600000;
}

export default {
  cmd: ["pengeluaran", "kas"],
  category: "tools",
  desc: "Pencatatan dan dashboard monitoring pengeluaran",

  exec: async (m, { args, command, query }) => {
    const opt = (args[0] || "").toLowerCase();
    const sub = (args[1] || "").toLowerCase();

    // 1. Mode On (Aktifkan Auto-Catat)
    if (opt === "on" || (opt === "add" && (sub === "whitelist" || sub === "wl"))) {
      if (m.isGroup && !m.isAdmin && !m.isOwner) return m.reply(res.admin);
      const wl = loadJSON(whitelistFile, []);
      if (wl.includes(m.from)) {
        return m.reply(res.warn("Auto-catat di chat ini sudah aktif!"));
      }
      wl.push(m.from);
      saveJSON(whitelistFile, wl);
      return m.reply(
        `✅ *Auto-Catat Pengeluaran DIAKTIFKAN!*\n\n` +
        `> Sekarang kamu bisa langsung kirim nominal & keterangan tanpa perintah awalan.\n` +
        `> *Contoh:* \`15k Nasi Goreng\` atau \`Beli Bensin 20rb\``
      );
    }

    // 2. Mode Off (Nonaktifkan Auto-Catat)
    if (opt === "off" || (opt === "del" && (sub === "whitelist" || sub === "wl"))) {
      if (m.isGroup && !m.isAdmin && !m.isOwner) return m.reply(res.admin);
      let wl = loadJSON(whitelistFile, []);
      if (!wl.includes(m.from)) {
        return m.reply(res.warn("Auto-catat di chat ini memang belum aktif."));
      }
      saveJSON(whitelistFile, wl.filter((x) => x !== m.from));
      return m.reply(
        `✅ *Auto-Catat Pengeluaran DINONAKTIFKAN!*\n\n` +
        `> Pencatatan manual tetap bisa dilakukan dengan perintah:\n` +
        `> \`${m.prefix}${command} [nominal] [keterangan]\``
      );
    }

    // 3. Status Whitelist
    if (opt === "whitelist" || opt === "wl") {
      const wl = loadJSON(whitelistFile, []);
      const isWl = wl.includes(m.from);
      return m.reply(
        `⚙️ *Status Auto-Catat Chat Ini:* ${isWl ? "*AKTIF* ✅" : "*NONAKTIF* ❌"}\n\n` +
        `> Ketik \`${m.prefix}${command} on\` untuk mengaktifkan.\n` +
        `> Ketik \`${m.prefix}${command} off\` untuk menonaktifkan.`
      );
    }

    // 4. Hapus Catatan berdasarkan ID
    if (opt === "del" || opt === "delete" || opt === "hapus") {
      const idToDelete = (args[1] || "").toLowerCase().trim();
      if (!idToDelete) {
        return m.reply(
          res.format(
            m.prefix,
            `${command} del <ID>`,
            [`${command} del a1b2c`],
            "Masukkan 5 karakter ID transaksi yang ingin dihapus.",
            "Menghapus riwayat transaksi pengeluaran"
          )
        );
      }

      const expenses = loadJSON(expenseFile, {});
      const list = expenses[m.from] || [];
      const idx = list.findIndex((x) => x.id.toLowerCase() === idToDelete);

      if (idx === -1) {
        return m.reply(res.empty(`ID transaksi \`${idToDelete}\` tidak ditemukan!`));
      }

      const removed = list.splice(idx, 1)[0];
      saveJSON(expenseFile, expenses);
      return m.reply(
        `✅ *Catatan Berhasil Dihapus!*\n\n` +
        `> • *ID:* \`${removed.id}\`\n` +
        `> • *Nominal:* ${formatRupiah(removed.amount)}\n` +
        `> • *Keterangan:* ${removed.note}`
      );
    }

    // 5. Reset Seluruh Riwayat Pengeluaran
    if (opt === "reset" || opt === "clear") {
      if (m.isGroup && !m.isAdmin && !m.isOwner) return m.reply(res.admin);
      const expenses = loadJSON(expenseFile, {});
      if (!expenses[m.from] || expenses[m.from].length === 0) {
        return m.reply(res.empty("Belum ada data pengeluaran yang tersimpan di chat ini."));
      }

      const totalHapus = expenses[m.from].length;
      delete expenses[m.from];
      saveJSON(expenseFile, expenses);
      return m.reply(`✅ *Berhasil Me-reset!* ${totalHapus} riwayat pengeluaran di chat ini telah dibersihkan.`);
    }

    // 6. Pencatatan Manual / Cepat via Command
    // e.g. .pengeluaran 15000 nasi goreng OR .pengeluaran add 15k bensin
    let textToParse = query.trim();
    if (/^(add|tambah|catat)$/i.test(opt)) {
      textToParse = args.slice(1).join(" ").trim();
    }

    const directExpense = parseExpense(textToParse);
    if (directExpense) {
      const expenses = loadJSON(expenseFile, {});
      if (!expenses[m.from]) expenses[m.from] = [];

      const id = crypto.randomBytes(3).toString("hex").substring(0, 5);
      const now = new Date().toISOString();

      expenses[m.from].push({
        id,
        amount: directExpense.amount,
        note: directExpense.note,
        date: now,
        sender: m.sender,
      });

      saveJSON(expenseFile, expenses);
      return m.reply(
        `✅ *Pengeluaran Berhasil Dicatat!*\n\n` +
        `> • *Nominal:* ${formatRupiah(directExpense.amount)}\n` +
        `> • *Keterangan:* ${directExpense.note}\n` +
        `> • *ID Transaksi:* \`${id}\``
      );
    }

    // 7. Tampilkan Daftar / Riwayat (List)
    if (opt === "list" || opt === "riwayat" || opt === "daftar") {
      const expenses = loadJSON(expenseFile, {});
      const list = expenses[m.from] || [];

      if (list.length === 0) {
        return m.reply(`_Belum ada catatan pengeluaran di chat ini._`);
      }

      const now = new Date();
      const startDay = getStartOfDayWIB(now);
      const startWeek = getStartOfWeekWIB(now);
      const startMonth = getStartOfMonthWIB(now);

      let filtered = [...list];
      let filterTitle = "Semua Riwayat";

      if (sub === "hari" || sub === "today") {
        filtered = list.filter((x) => new Date(x.date).getTime() >= startDay);
        filterTitle = "Hari Ini";
      } else if (sub === "minggu" || sub === "week") {
        filtered = list.filter((x) => new Date(x.date).getTime() >= startWeek);
        filterTitle = "Minggu Ini";
      } else if (sub === "bulan" || sub === "month") {
        filtered = list.filter((x) => new Date(x.date).getTime() >= startMonth);
        filterTitle = "Bulan Ini";
      }

      if (filtered.length === 0) {
        return m.reply(`_Tidak ada pengeluaran pada periode ${filterTitle}._`);
      }

      // Urutkan dari yang terbaru
      filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const totalAmount = filtered.reduce((acc, curr) => acc + curr.amount, 0);

      let out = `📋 *DAFTAR PENGELUARAN (${filterTitle.toUpperCase()})*\n`;
      out += `Total: *${formatRupiah(totalAmount)}* (${filtered.length} transaksi)\n\n`;

      const displayList = filtered.slice(0, 30);
      for (const item of displayList) {
        out += `> • \`${item.id}\` | *${formatRupiah(item.amount)}* - ${item.note} _(${formatDateWIB(item.date)})_\n`;
      }

      if (filtered.length > 30) {
        out += `\n_...dan ${filtered.length - 30} transaksi lainnya._\n`;
      }

      return m.reply(out);
    }

    // 8. Dashboard Rekap Pengeluaran (Default)
    const expenses = loadJSON(expenseFile, {});
    const chatExpenses = expenses[m.from] || [];
    const wl = loadJSON(whitelistFile, []);
    const isWl = wl.includes(m.from);

    const now = new Date();
    const startDay = getStartOfDayWIB(now);
    const startWeek = getStartOfWeekWIB(now);
    const startMonth = getStartOfMonthWIB(now);

    const todayData = chatExpenses.filter((x) => new Date(x.date).getTime() >= startDay);
    const weekData = chatExpenses.filter((x) => new Date(x.date).getTime() >= startWeek);
    const monthData = chatExpenses.filter((x) => new Date(x.date).getTime() >= startMonth);

    const sum = (arr) => arr.reduce((acc, curr) => acc + curr.amount, 0);
    const totalSemua = sum(chatExpenses);

    // Ambil 5 transaksi terakhir
    const recent = [...chatExpenses]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    let txt = `📊 *DASHBOARD PENGELUARAN*\n\n`;
    txt += `💵 *Hari Ini:* ${formatRupiah(sum(todayData))} _(${todayData.length} transaksi)_\n`;
    txt += `📅 *Minggu Ini:* ${formatRupiah(sum(weekData))} _(${weekData.length} transaksi)_\n`;
    txt += `🗓️ *Bulan Ini:* ${formatRupiah(sum(monthData))} _(${monthData.length} transaksi)_\n`;
    txt += `💰 *Total Keseluruhan:* *${formatRupiah(totalSemua)}* _(${chatExpenses.length} transaksi)_\n\n`;

    if (recent.length > 0) {
      txt += `📝 *Transaksi Terakhir:*\n`;
      for (const item of recent) {
        txt += `> • \`${item.id}\` | *${formatRupiah(item.amount)}* - ${item.note} _(${formatDateWIB(item.date)})_\n`;
      }
      txt += `\n`;
    }

    txt += `⚙️ *Auto-Catat:* ${isWl ? "Aktif ✅" : "Nonaktif ❌"}\n\n`;
    txt += `💡 *Panduan Perintah:*\n`;
    txt += `> • \`${m.prefix}${command} [nominal] [ket]\` : Catat cepat\n`;
    txt += `> • \`${m.prefix}${command} on\` / \`off\` : Auto-catat pesan chat\n`;
    txt += `> • \`${m.prefix}${command} list\` : Riwayat detail transaksi\n`;
    txt += `> • \`${m.prefix}${command} del <ID>\` : Hapus transaksi`;

    return m.reply(txt);
  },

  after: async function (m) {
    if (!m.body || m.fromMe) return;

    const wl = loadJSON(whitelistFile, []);
    if (!wl.includes(m.from)) return;

    const prefixes = (this?.prefix || [".", "!", "/", "#"]).filter(Boolean);
    if (prefixes.some((p) => m.body.startsWith(p))) return;

    const parsed = parseExpense(m.body);
    if (!parsed) return;

    const expenses = loadJSON(expenseFile, {});
    if (!expenses[m.from]) expenses[m.from] = [];

    const id = crypto.randomBytes(3).toString("hex").substring(0, 5);
    const now = new Date().toISOString();

    expenses[m.from].push({
      id,
      amount: parsed.amount,
      note: parsed.note,
      date: now,
      sender: m.sender,
    });

    saveJSON(expenseFile, expenses);
    await m.reply(
      `✅ *Pengeluaran Tercatat!*\n` +
      `> • *Nominal:* ${formatRupiah(parsed.amount)}\n` +
      `> • *Keterangan:* ${parsed.note}\n` +
      `> • *ID Transaksi:* \`${id}\``
    );
  },
};
