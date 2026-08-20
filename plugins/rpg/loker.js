import { jobs } from '../../src/rpg/jobs.js';
import { formatYen } from '../../src/rpg/core.js';

export default {
    cmd: ['bursakerja', 'loker', 'joblist'],
    category: 'rpg',
    exec: async (m, { sock }) => {
        let teks = `『 🏢 *BURSA KERJA/LOWONGAN PEKERJAAN* 』\n\n`;
        teks += `Cari loker yang sesuai kapasitas level karakter kamu.\n\n`;

        for (const key in jobs) {
            const job = jobs[key];
            teks += `> 🔑 *ID Lamaran* : \`${key}\`\n`;
            teks += `> 💼 *Profesi* : ${job.nama}\n`;
            teks += `> 📈 *Syarat* : Minimal Level ${job.reqLevel}\n`;
            teks += `> 💵 *Gaji/Task* : ${formatYen(job.gaji)}\n`;
            teks += `───────────────────\n`;
        }

        teks += `\n⚙️ *Cara Melamar*:\nKetik: \`.apply <ID Lamaran>\`\nContoh: \`.apply kuli\``;

        return m.reply(teks);
    }
};