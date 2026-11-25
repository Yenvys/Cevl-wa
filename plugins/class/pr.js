import fs from "node:fs";
import path from "node:path";
import { res } from "../../src/response.js";

const prFile = path.join(process.cwd(), "data", "tugas", "pr_list.json");
if (!fs.existsSync(path.dirname(prFile))) fs.mkdirSync(path.dirname(prFile), { recursive: true });
if (!fs.existsSync(prFile)) fs.writeFileSync(prFile, "[]");

export default {
  cmd: ["pr", "task", "tugas"],
  category: "class",
  desc: "Manajemen daftar PR (add, list, del)",
  exec: async (m, { query, command }) => {
    const db = JSON.parse(fs.readFileSync(prFile, "utf-8"));
    const args = query.trim().split(" ");
    const action = args[0]?.toLowerCase();

    if (!query.trim() || !action) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} <aksi>`,
          [
            "add Matematika | deadline Besok | isi Hal 40",
            "list",
            "del 1",
          ],
          "Gunakan pemisah (|) antar parameter saat menambah tugas",
          "Manajemen daftar tugas / PR kelas",
        ),
      );
    }

    if (action === "add") {
      const rawContent = query.substring(args[0].length).trim();
      if (!rawContent) {
        return m.reply(res.format(m.prefix, command, "add Matematika | deadline Besok | isi Halaman 40"));
      }

      const parts = rawContent.split("|").map((p) => p.trim());
      const matkul = parts[0] || "Tidak Diketahui";
      let deadline = "Tidak Ditentukan";
      let detail = "Tidak Ada Detail";

      for (const part of parts.slice(1)) {
        if (/^deadline/i.test(part)) deadline = part.replace(/^deadline/i, "").trim() || deadline;
        else if (/^isi/i.test(part)) detail = part.replace(/^isi/i, "").trim() || detail;
        else if (deadline === "Tidak Ditentukan") deadline = part;
        else detail = part;
      }

      db.push({ id: Date.now(), matkul, deadline, detail });
      fs.writeFileSync(prFile, JSON.stringify(db, null, 2));
      return m.reply(res.success("Sukses menambahkan tugas baru ke dalam daftar PR."));
    }

    if (action === "list") {
      if (!db.length) return m.reply(res.empty("Tidak ada daftar PR yang tercatat saat ini."));

      let teks = `『 *DAFTAR PR / TUGAS AKTIF* 』\n\n`;
      db.forEach((v, i) => {
        teks += `*${i + 1}. [${(v.matkul || "TIDAK DIKETAHUI").toUpperCase()}]*\n`;
        teks += `   • Deadline : ${v.deadline}\n`;
        teks += `   • Detail   :\n ${v.detail}\n\n`;
      });
      teks += `_Ketik ${m.prefix}${command} del <nomor> untuk menghapus tugas._`;
      return m.reply(teks);
    }

    if (action === "del") {
      const index = parseInt(args[1], 10) - 1;
      if (isNaN(index) || !db[index]) {
        return m.reply(res.warn("Nomor urutan PR yang Anda masukkan tidak valid."));
      }
      db.splice(index, 1);
      fs.writeFileSync(prFile, JSON.stringify(db, null, 2));
      return m.reply(res.success("Tugas PR berhasil dihapus dari daftar."));
    }

    return m.reply(res.warn(`Aksi tidak dikenal. Ketik ${m.prefix}${command} untuk bantuan.`));
  },
};
