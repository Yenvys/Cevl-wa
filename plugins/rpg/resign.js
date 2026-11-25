import UserRPG from "../../src/rpg/schema.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["resign", "berhenti"],
  category: "rpg",
  desc: "Berhenti dari pekerjaanmu saat ini",
  exec: async (m) => {
    try {
      const user = await UserRPG.findOne({ noWa: m.sender });
      if (!user) return m.reply(`_Kamu belum terdaftar! Silakan ketik ${m.prefix ?? "."}daftar terlebih dahulu._`);

      const currentJob = user.pekerjaan;
      if (!currentJob || currentJob.toLowerCase() === "pengangguran") {
        return m.reply(`_Kamu saat ini tidak memiliki pekerjaan! Gunakan *${m.prefix ?? "."}bursakerja* untuk mencari lowongan._`);
      }

      user.pekerjaan = "Pengangguran";
      await user.save();

      return m.reply(
        `📝 *RESIGN BERHASIL*\n\nKamu telah resmi berhenti dari pekerjaanmu sebagai *${currentJob}*.\nSekarang kamu adalah seorang *Pengangguran*.\n\n_Gunakan *${m.prefix ?? "."}bursakerja* jika ingin mencari pekerjaan baru._`
      );
    } catch (err) {
      console.error("[RESIGN ERROR]", err);
      m.reply(res.error);
    }
  },
};
