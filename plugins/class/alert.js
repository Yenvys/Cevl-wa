import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { res } from "../../src/response.js";

const prFile = path.join(process.cwd(), "data", "tugas", "pr_list.json");
const groupAlertFile = path.join(process.cwd(), "data", "tugas", "group_alerts.json");

if (!fs.existsSync(path.dirname(groupAlertFile))) {
  fs.mkdirSync(path.dirname(groupAlertFile), { recursive: true });
}
if (!fs.existsSync(groupAlertFile)) {
  fs.writeFileSync(groupAlertFile, "[]");
}

let isLoopRunning = false;

export function listenAlertSchedule(sock) {
  if (isLoopRunning) return;
  isLoopRunning = true;

  cron.schedule(
    "0 8,14,20 * * *",
    async () => {
      try {
        if (!fs.existsSync(prFile)) return;
        const daftarPR = JSON.parse(fs.readFileSync(prFile, "utf-8"));
        const daftarGrup = JSON.parse(fs.readFileSync(groupAlertFile, "utf-8"));
        if (!daftarPR.length || !daftarGrup.length) return;

        let teks = "🔔 *[PENGINGAT DAFTAR TUGAS KELAS]* 🔔\n\nDiinformasikan kepada seluruh anggota grup, berikut adalah daftar PR/Tugas yang belum diselesaikan:\n\n";
        daftarPR.forEach((v, i) => {
          teks += `*${i + 1}. [${(v.matkul || "TIDAK DIKETAHUI").toUpperCase()}]*\n`;
          teks += `   • Batas Waktu : ${v.deadline || "Tidak Ditentukan"}\n`;
          teks += `   • Detail Tugas: ${v.detail || "Tidak Ada Detail"}\n\n`;
        });
        teks += "_Harap segera menyelesaikan tugas._";

        for (const idGrup of daftarGrup) {
          await sock.sendMessage(idGrup, { text: teks }).catch(() => {});
        }
      } catch (err) {
        console.error("Alert PR Error:", err.message);
      }
    },
    { scheduled: true, timezone: "Asia/Jakarta" }
  );
}

export default {
  cmd: ["alertpr", "alert-pr", "infopr"],
  category: "class",
  desc: "Mengaktifkan/menonaktifkan pengingat otomatis daftar PR di grup",
  exec: async (m, { args, sock }) => {
    listenAlertSchedule(sock);
    if (!m.isGroup) return m.reply(res.group);

    const sub = args[0]?.toLowerCase();
    const groups = JSON.parse(fs.readFileSync(groupAlertFile, "utf-8"));
    const exists = groups.includes(m.from);

    const isEnable = ["on", "--on", "enable", "1"].includes(sub);
    const isDisable = ["off", "--off", "disable", "0"].includes(sub);

    if (!isEnable && !isDisable) {
      return m.reply(
        res.format(
          m.prefix,
          "alertpr <on/off>",
          ["on", "off"],
          `Status grup ini: ${exists ? "Aktif" : "Nonaktif"}`,
          "Mengaktifkan/menonaktifkan siaran otomatis pengingat PR di grup"
        )
      );
    }

    if (isEnable) {
      if (exists) return m.reply(res.warn("Sistem pengingat harian otomatis sudah aktif di grup ini."));
      groups.push(m.from);
      fs.writeFileSync(groupAlertFile, JSON.stringify(groups, null, 2));
      return m.reply(res.success("Fitur Pengingat Aktif! Grup ini akan menerima siaran daftar tugas setiap jam 08.00, 14.00, dan 20.00 WIB."));
    }

    if (isDisable) {
      if (!exists) return m.reply(res.warn("Sistem pengingat tidak aktif di grup ini."));
      const updated = groups.filter((g) => g !== m.from);
      fs.writeFileSync(groupAlertFile, JSON.stringify(updated, null, 2));
      return m.reply(res.success("Fitur Pengingat Dimatikan! Grup ini telah dihapus dari daftar pengingat otomatis."));
    }
  },
};
