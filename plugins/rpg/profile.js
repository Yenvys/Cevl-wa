import UserRPG from "../../src/rpg/schema.js";
import { refreshUser, formatYen } from "../../src/rpg/core.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["me", "stat", "profile"],
  category: "rpg",
  desc: "Cek profil dan status statistik RPG kamu",
  exec: async (m) => {
    try {
      let user = await UserRPG.findOne({ noWa: m.sender });
      if (!user) return m.reply(`_Kamu belum terdaftar! Silakan ketik ${m.prefix ?? "."}daftar terlebih dahulu._`);

      user = await refreshUser(user);
      const currentExp = Number(user.exp || 0);
      const xpNeeded = user.level * 100;
      const progress = Math.min((currentExp / xpNeeded) * 100, 100);

      let displayStatus = "BEBAS";
      try {
        const parsed = JSON.parse(user.statusBermain);
        if (parsed?.mode) displayStatus = parsed.mode.toUpperCase();
      } catch {
        if (user.statusBermain) displayStatus = user.statusBermain.split("|")[0].toUpperCase();
      }

      const teks =
        `『 👤 *USER STATUS* 』\n\n` +
        `> 👤 *Nama* : ${m.pushName || "Anonim"}\n` +
        `> 🏷️ *Profesi* : ${user.pekerjaan}\n` +
        `> 🆙 *Level* : ${user.level}\n` +
        `> ✨ *XP* : ${currentExp} / ${xpNeeded} (${progress.toFixed(1)}%)\n` +
        `> ⚡ *Stamina* : ${user.stamina} / 100\n` +
        `> 💵 *Dompet* : ${formatYen(user.yen)}\n` +
        `> 🏦 *Bank* : ${formatYen(user.bank)}\n` +
        `───────────────────\n` +
        `> 🎮 *Status* : ${displayStatus}\n`;

      return m.reply(teks);
    } catch (e) {
      console.error(e);
      m.reply(res.error);
    }
  },
};
