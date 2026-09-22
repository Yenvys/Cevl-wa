import fs from "fs";
import path from "path";
import crypto from "crypto";

const dataDir = path.join(process.cwd(), "data");
const expenseFile = path.join(dataDir, "pengeluaran.json");
const whitelistFile = path.join(dataDir, "pengeluaran_whitelist.json");

// Helper untuk membaca file JSON
function loadJSON(file, defaultData = {}) {
  if (!fs.existsSync(file)) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// Helper untuk menyimpan file JSON
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Helper untuk format rupiah
function formatRupiah(angka) {
  return "Rp" + angka.toLocaleString("id-ID");
}

// Helper untuk membuat tabel ASCII sederhana
function generateTable(title, data, total) {
  if (data.length === 0) return `*${title}*\n\n_Tidak ada pengeluaran._`;

  let str = `*${title}*\n`;
  str += "```\n";
  str += "ID      | Nominal      | Ket\n";
  str += "--------+--------------+-----------\n";

  for (const item of data) {
    const id = item.id.padEnd(7);
    const nominal = item.amount.toLocaleString("id-ID").padEnd(12);
    const note = item.note.substring(0, 10).padEnd(10); // potong jika kepanjangan
    str += `${id} | ${nominal} | ${note}\n`;
  }

  str += "--------+--------------+-----------\n";
  str += `Total   | ${total.toLocaleString("id-ID").padEnd(12)} |\n`;
  str += "```";
  return str;
}

export default {
  cmd: ["pengeluaran", "kas"],
  category: "tools",
  desc: "Dashboard pencatatan pengeluaran",

  exec: async (m, { sock, args, command }) => {
    const opt = args[0]?.toLowerCase();

    // Manage Whitelist
    if (opt === "on" || (opt === "add" && (args[1] === "whitelist" || args[1] === "wl"))) {
      let wl = loadJSON(whitelistFile, []);
      if (wl.includes(m.from)) return m.reply("_Chat ini sudah masuk daftar whitelist pengeluaran._");
      wl.push(m.from);
      saveJSON(whitelistFile, wl);
      return m.reply("_Berhasil menambahkan chat ini ke whitelist. Ketik nominal dan keterangan (contoh: 15000 Nasi Goreng) tanpa awalan apapun untuk mencatat._");
    }

    if (opt === "off" || opt === "del") {
      let wl = loadJSON(whitelistFile, []);

      // Hapus whitelist
      if (opt === "off" || args[1] === "whitelist" || args[1] === "wl") {
        if (!wl.includes(m.from)) return m.reply("_Chat ini belum terdaftar di whitelist._");
        let wlList = wl.filter(x => x !== m.from);
        saveJSON(whitelistFile, wlList);
        return m.reply("_Chat ini telah dihapus dari whitelist pengeluaran._");
      }

      // Hapus data (ID)
      if (opt === "del" && args[1]) {
        const idToDelete = args[1];
        const expenses = loadJSON(expenseFile, {});
        if (!expenses[m.from]) return m.reply("_Data pengeluaran tidak ditemukan._");

        const idx = expenses[m.from].findIndex(x => x.id === idToDelete);
        if (idx === -1) return m.reply(`_ID ${idToDelete} tidak ditemukan._`);

        expenses[m.from].splice(idx, 1);
        saveJSON(expenseFile, expenses);
        return m.reply(`_Berhasil menghapus catatan dengan ID ${idToDelete}._`);
      }

      if (opt === "del") {
        return m.reply(`_Pilih ID yang mau dihapus, contoh: ${m.prefix}${command} del 12345_`);
      }
    }

    if (opt === "whitelist" || opt === "wl") {
      let wl = loadJSON(whitelistFile, []);
      if (!wl.includes(m.from)) return m.reply("_Chat ini TIDAK berada dalam whitelist._");
      return m.reply("_Chat ini TERDAFTAR dalam whitelist pengeluaran._");
    }

    // Default Dashboard (if no valid options, show rekap)
    const expenses = loadJSON(expenseFile, {});
    const chatExpenses = expenses[m.from] || [];

    // Gunakan WIB (UTC+7) untuk semua perbandingan tanggal
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // Get start of week (Monday)
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(yyyy, now.getMonth(), diff, 0, 0, 0, 0);

    const startOfMonth = new Date(yyyy, now.getMonth(), 1);

    // Helper convert tanggal expense ke WIB date
    const toWIB = (dateStr) => new Date(new Date(dateStr).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const toWIBDateStr = (dateStr) => {
      const d = toWIB(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    // Filter data
    const todayData = chatExpenses.filter(x => toWIBDateStr(x.date) === todayStr);
    const weekData = chatExpenses.filter(x => toWIB(x.date) >= startOfWeek);
    const monthData = chatExpenses.filter(x => toWIB(x.date) >= startOfMonth);

    const sum = (arr) => arr.reduce((acc, curr) => acc + curr.amount, 0);

    let txt = `*REKAP PENGELUARAN*\n\n`;
    txt += generateTable("Hari Ini", todayData, sum(todayData)) + "\n\n";
    txt += generateTable("Minggu Ini", weekData, sum(weekData)) + "\n\n";
    txt += generateTable("Bulan Ini", monthData, sum(monthData)) + "\n\n";

    txt += `> ${m.prefix}${command} add whitelist/del whitelist/whitelist \n`;
    txt += `> ${m.prefix}${command} del <ID> - hapus catatan\n`;

    m.reply(txt);
  },

  after: async function (m, { sock }) {
    if (!m.body) return;

    // Cek whitelist
    const wl = loadJSON(whitelistFile, []);
    if (!wl.includes(m.from)) return;

    // Cegah command (cek semua prefix yang terdaftar di handler)
    const prefixes = this?.prefix || [".", "!", "/"];
    if (prefixes.some(p => m.body.startsWith(p))) return;

    // Regex: Angka spasi keterangan (contoh: "15000 beli galon" atau "3000 beli es")
    const match = m.body.match(/^(\d+)\s+(.+)$/);
    if (!match) return;

    const amount = parseInt(match[1]);
    const note = match[2].trim();

    if (amount <= 0 || isNaN(amount)) return;

    const expenses = loadJSON(expenseFile, {});
    if (!expenses[m.from]) expenses[m.from] = [];

    // Buat ID 5 karakter random unik (hex)
    const id = crypto.randomBytes(3).toString("hex").substring(0, 5);

    expenses[m.from].push({
      id,
      amount,
      note,
      date: new Date().toISOString(),
      sender: m.sender
    });

    saveJSON(expenseFile, expenses);

    m.reply(`_Tercatat: ${formatRupiah(amount)} - ${note} (${id})_`);
  }
};
