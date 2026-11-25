import { jobs } from "../../src/rpg/jobs.js";
import { formatYen } from "../../src/rpg/core.js";

export default {
  cmd: ["bursakerja", "loker", "joblist"],
  category: "rpg",
  desc: "Lihat daftar lowongan pekerjaan yang tersedia",
  exec: async (m) => {
    let teks = `『 🏢 *BURSA KERJA/LOWONGAN PEKERJAAN* 』\n\nCari loker yang sesuai kapasitas level karakter kamu.\n\n`;
    for (const [key, job] of Object.entries(jobs)) {
      teks += `> 🔑 *ID Lamaran* : \`${key}\`\n> 💼 *Profesi* : ${job.nama}\n> 📈 *Syarat* : Minimal Level ${job.reqLevel}\n> 💵 *Gaji/Task* : ${formatYen(job.gaji)}\n───────────────────\n`;
    }
    teks += `\n⚙️ *Cara Melamar*:\nKetik: \`${m.prefix ?? "."}apply <ID Lamaran>\`\nContoh: \`${m.prefix ?? "."}apply kuli\``;
    return m.reply(teks);
  },
};
