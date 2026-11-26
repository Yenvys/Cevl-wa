import UserRPG from "../../src/rpg/schema.js";
import { formatYen } from "../../src/rpg/core.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["daftar", "register", "reg"],
  category: "rpg",
  desc: "Mendaftar akun RPG baru",
  exec: async (m) => {
    try {
      const isRegistered = await UserRPG.findOne({ noWa: m.sender });
      if (isRegistered) return m.reply(`_Kamu sudah daftar. Cek di *${m.prefix ?? "."}me*_`);

      const newUser = new UserRPG({ noWa: m.sender });
      await newUser.save();

      const teks =
        `『 REGISTRASI 』\n\n` +
        `> 🎫 *Status:* Aktif / Terdaftar\n` +
        `> 📱 *Nomor:* @${m.sender.split("@")[0]}\n` +
        `> 💼 *Pekerjaan:* Pengangguran Sukses\n` +
        `> 💵 *Modal Awal:* ${formatYen(10000)}\n\n` +
        `*Catatan :* _Ketik *${m.prefix ?? "."}bursakerja* untuk mencari pekerjaan!_`;

      return m.reply(teks, { mentions: [m.sender] });
    } catch (error) {
      console.error(error);
      return m.reply(res.error);
    }
  },
};
