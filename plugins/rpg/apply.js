import UserRPG from "../../src/rpg/schema.js";
import { jobs } from "../../src/rpg/jobs.js";
import { sendButton } from "../../src/button.js";
import { res } from "../../src/response.js";

const parseState = (raw) => {
  try { return JSON.parse(raw); } catch { return null; }
};

export default {
  cmd: ["apply", "lamar"],
  category: "rpg",
  desc: "Lamar pekerjaan yang tersedia",
  exec: async (m, { args, sock }) => {
    try {
      const user = await UserRPG.findOne({ noWa: m.sender });
      if (!user) return m.reply(`_Kamu belum daftar, ketik *${m.prefix ?? "."}daftar*_`);

      const jobId = args[0]?.toLowerCase();
      if (user.pekerjaan && user.pekerjaan.toLowerCase() !== "pengangguran") {
        return m.reply(`_Kamu sudah memiliki pekerjaan sebagai *${user.pekerjaan}*!_\n\n_Ketik *${m.prefix ?? "."}resign* jika ingin keluar sebelum melamar baru._`);
      }

      if (jobId === "cancel") {
        const state = parseState(user.statusBermain);
        if (!state || state.mode !== "interview") return m.reply(res.error);
        user.statusBermain = "bebas";
        await user.save();
        return m.reply("*Interview digagalkan!* 🚪\n\nStatus kamu balik bebas. Stamina kamu yang kepotong hangus!");
      }

      const jobData = jobs[jobId];
      if (!jobData) return m.reply(`_Loker fiktif itu! Cek *${m.prefix ?? "."}bursakerja* untuk loker yang benar!_`);
      if (user.statusBermain !== "bebas") return m.reply("_Selesaikan dulu urusan/job/interview kamu yang sebelumnya!_");
      if (user.level < jobData.reqLevel) return m.reply(`Skill/Level mu kurang memadai (Lv.${user.level})! Minimal butuh Lv.${jobData.reqLevel}`);
      if (user.stamina < 30) return m.reply(`_Kamu terlalu lelah. Pergi *${m.prefix ?? "."}tidur* dulu untuk mengisi stamina!_`);

      const pool = [...jobData.interview];
      const soalTerpilih = [];
      for (let i = 0; i < 2; i++) {
        soalTerpilih.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      }

      user.statusBermain = JSON.stringify({
        mode: "interview",
        jobId,
        index: 0,
        nyawa: 2,
        soalIndex0: jobData.interview.indexOf(soalTerpilih[0]),
        soalIndex1: jobData.interview.indexOf(soalTerpilih[1]),
      });
      user.stamina -= 10;
      await user.save();

      const soal1 = soalTerpilih[0];
      const listButtons = [
        { name: "quick_reply", displayText: `A. ${soal1.opsi[0]}`, id: "a" },
        { name: "quick_reply", displayText: `B. ${soal1.opsi[1]}`, id: "b" },
        { name: "quick_reply", displayText: `C. ${soal1.opsi[2]}`, id: "c" },
      ];

      await sendButton(
        sock,
        m.from,
        `📋 *DIVISI INTERVIEW: ${jobData.nama.toUpperCase()}*`,
        `*Pertanyaan 1:* ${soal1.soal}\n\n❤️ Sisa kesempatan: 2\n_(Ketik *cancel* jika ingin membatalkan)_`,
        "_Pilih satu opsi jawaban yang benar dari tombol di bawah ini!_",
        listButtons
      );
    } catch (err) {
      console.error(err);
      m.reply(res.error);
    }
  },

  async after(m, { sock }) {
    try {
      const choice = (m.text || m.body || "").toLowerCase().trim();
      if (!["a", "b", "c", "cancel"].includes(choice)) return;

      const user = await UserRPG.findOne({ noWa: m.sender });
      if (!user || !user.statusBermain) return;

      const state = parseState(user.statusBermain);
      if (!state || state.mode !== "interview") return;

      if (choice === "cancel") {
        user.statusBermain = "bebas";
        await user.save();
        return m.reply("*Interview digagalkan!* 🚪\n\nStatus kamu balik bebas. Stamina kamu yang kepotong hangus!");
      }

      const { jobId, index, nyawa, soalIndex0, soalIndex1 } = state;
      const jobData = jobs[jobId];
      if (!jobData) {
        user.statusBermain = "bebas";
        await user.save();
        return m.reply("Data hangus. Sesi interview ditutup.");
      }

      const currentSoal = jobData.interview[index === 0 ? soalIndex0 : soalIndex1];
      if (!currentSoal) {
        user.statusBermain = "bebas";
        await user.save();
        return m.reply(res.error);
      }

      if (choice === currentSoal.jawaban) {
        if (index === 0) {
          user.statusBermain = JSON.stringify({ ...state, index: 1 });
          await user.save();

          const soal2 = jobData.interview[soalIndex1];
          const nextButtons = [
            { name: "quick_reply", displayText: `A. ${soal2.opsi[0]}`, id: "a" },
            { name: "quick_reply", displayText: `B. ${soal2.opsi[1]}`, id: "b" },
            { name: "quick_reply", displayText: `C. ${soal2.opsi[2]}`, id: "c" },
          ];

          await sendButton(
            sock,
            m.from,
            "✅ *JAWABAN BENAR!*",
            `*Pertanyaan 2 (Terakhir):* ${soal2.soal}\n\nSisa Kesempatan: ❤️ ${nyawa}\n_(Ketik *cancel* jika ingin membatalkan)_`,
            "Pilih jawaban yang benar!",
            nextButtons
          );
        } else {
          user.pekerjaan = jobData.nama;
          user.statusBermain = "bebas";
          await user.save();
          return m.reply(
            `🎉 *CONGRATS! KAMU DITERIMA!*\n` +
            `> Mulai sekarang kamu sah kerja sebagai *${user.pekerjaan}*.\n` +
            `> Kontrak upah per task: *¥${jobData.gaji}*.\n` +
            `_💡 Ketik *${m.prefix ?? "."}kerja* untuk langsung menyelesaikan tugas mu!_`
          );
        }
      } else {
        const nyawaSisa = nyawa - 1;
        if (nyawaSisa <= 0) {
          user.statusBermain = "bebas";
          await user.save();
          return m.reply(`💀 *GAGAL TOTAL / REJECTED!*\n> _IQ/Skill kamu tidak memadai untuk menjadi ${jobData.nama}!_`);
        }
        user.statusBermain = JSON.stringify({ ...state, nyawa: nyawaSisa });
        await user.save();
        return m.reply(`❌ *SALAH!* \nKesempatan interview lu sisa: ❤️ ${nyawaSisa}\n> _Pilih ulang tombol jawaban yang benar di atas!_`);
      }
    } catch (err) {
      console.error(err);
      m.reply(res.error);
    }
  },
};
