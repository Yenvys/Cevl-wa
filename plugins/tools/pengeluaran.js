import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { res } from "../../src/response.js";

const dataDir = path.join(process.cwd(), "data");
const expenseFile = path.join(dataDir, "pengeluaran.json");
const whitelistFile = path.join(dataDir, "pengeluaran_whitelist.json");

function loadJSON(file, defaultData = {}) {
  if (!fs.existsSync(file)) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function formatRupiah(angka) {
  return "Rp" + angka.toLocaleString("id-ID");
}

function generateTable(title, data, total) {
  if (data.length === 0) return `*${title}*\n\n_Tidak ada pengeluaran._`;

  let str = `*${title}*\n\`\`\`\nID      | Nominal      | Ket\n--------+--------------+-----------\n`;
  for (const item of data) {
    const id = item.id.padEnd(7);
    const nominal = item.amount.toLocaleString("id-ID").padEnd(12);
    const note = item.note.substring(0, 10).padEnd(10);
    str += `${id} | ${nominal} | ${note}\n`;
  }
  str += `--------+--------------+-----------\nTotal   | ${total.toLocaleString("id-ID").padEnd(12)} |\n\`\`\``;
  return str;
}

export default {
  cmd: ["pengeluaran", "kas"],
  category: "tools",
  desc: "Dashboard pencatatan pengeluaran",

  exec: async (m, { args, command }) => {
    const opt = args[0]?.toLowerCase();

    if (opt === "on" || (opt === "add" && (args[1] === "whitelist" || args[1] === "wl"))) {
      const wl = loadJSON(whitelistFile, []);
      if (wl.includes(m.from)) return m.reply(res.warn("Chat ini sudah masuk daftar whitelist pengeluaran."));
      wl.push(m.from);
      saveJSON(whitelistFile, wl);
      return m.reply(res.success("Berhasil menambahkan chat ke whitelist. Ketik nominal dan keterangan (contoh: 15000 Nasi Goreng) untuk mencatat."));
    }

    if (opt === "off" || opt === "del") {
      let wl = loadJSON(whitelistFile, []);
      if (opt === "off" || args[1] === "whitelist" || args[1] === "wl") {
        if (!wl.includes(m.from)) return m.reply(res.warn("Chat ini belum terdaftar di whitelist."));
        saveJSON(whitelistFile, wl.filter((x) => x !== m.from));
        return m.reply(res.success("Chat ini telah dihapus dari whitelist pengeluaran."));
      }

      if (opt === "del" && args[1]) {
        const idToDelete = args[1];
        const expenses = loadJSON(expenseFile, {});
        if (!expenses[m.from]) return m.reply(res.empty("Data pengeluaran tidak ditemukan."));

        const idx = expenses[m.from].findIndex((x) => x.id === idToDelete);
        if (idx === -1) return m.reply(res.empty(`ID ${idToDelete} tidak ditemukan.`));

        expenses[m.from].splice(idx, 1);
        saveJSON(expenseFile, expenses);
        return m.reply(res.success(`Berhasil menghapus catatan dengan ID ${idToDelete}.`));
      }

      if (opt === "del") return m.reply(res.format(m.prefix, `${command} del`, "12345", "Masukkan ID transaksi yang ingin dihapus"));
    }

    if (opt === "whitelist" || opt === "wl") {
      const wl = loadJSON(whitelistFile, []);
      return m.reply(wl.includes(m.from) ? "_Chat ini TERDAFTAR dalam whitelist._" : "_Chat ini TIDAK berada dalam whitelist._");
    }

    const expenses = loadJSON(expenseFile, {});
    const chatExpenses = expenses[m.from] || [];

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(yyyy, now.getMonth(), diff, 0, 0, 0, 0);
    const startOfMonth = new Date(yyyy, now.getMonth(), 1);

    const toWIB = (d) => new Date(new Date(d).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const toWIBDateStr = (d) => {
      const dt = toWIB(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    };

    const todayData = chatExpenses.filter((x) => toWIBDateStr(x.date) === todayStr);
    const weekData = chatExpenses.filter((x) => toWIB(x.date) >= startOfWeek);
    const monthData = chatExpenses.filter((x) => toWIB(x.date) >= startOfMonth);

    const sum = (arr) => arr.reduce((acc, curr) => acc + curr.amount, 0);

    let txt = `*REKAP PENGELUARAN*\n\n` +
      generateTable("Hari Ini", todayData, sum(todayData)) + "\n\n" +
      generateTable("Minggu Ini", weekData, sum(weekData)) + "\n\n" +
      generateTable("Bulan Ini", monthData, sum(monthData)) + "\n\n" +
      `> ${m.prefix}${command} add whitelist / del whitelist\n` +
      `> ${m.prefix}${command} del <ID> - hapus catatan\n`;

    m.reply(txt);
  },

  after: async function (m) {
    if (!m.body) return;

    const wl = loadJSON(whitelistFile, []);
    if (!wl.includes(m.from)) return;

    const prefixes = (this?.prefix || [".", "!", "/"]).filter(Boolean);
    if (prefixes.some((p) => m.body.startsWith(p))) return;

    const match = m.body.match(/^(\d+)\s+(.+)$/);
    if (!match) return;

    const amount = parseInt(match[1]);
    const note = match[2].trim();
    if (amount <= 0 || isNaN(amount)) return;

    const expenses = loadJSON(expenseFile, {});
    if (!expenses[m.from]) expenses[m.from] = [];

    const id = crypto.randomBytes(3).toString("hex").substring(0, 5);
    expenses[m.from].push({
      id,
      amount,
      note,
      date: new Date().toISOString(),
      sender: m.sender,
    });

    saveJSON(expenseFile, expenses);
    m.reply(`_Tercatat: ${formatRupiah(amount)} - ${note} (${id})_`);
  },
};
