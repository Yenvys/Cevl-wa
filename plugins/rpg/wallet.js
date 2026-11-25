import UserRPG from "../../src/rpg/schema.js";
import { formatYen } from "../../src/rpg/core.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["wallet", "dompet", "bal", "bank"],
  category: "rpg",
  desc: "Lihat informasi saldo dompet dan bank",
  exec: async (m) => {
    try {
      const user = await UserRPG.findOne({ noWa: m.sender });
      if (!user) return m.reply(`_Anda belum terdaftar. Silakan ketik ${m.prefix ?? "."}daftar terlebih dahulu._`);

      const teks =
        `『 *INFORMASI KEUANGAN* 』\n\n` +
        `> 💵 *Dompet* : ${formatYen(user.yen)}\n` +
        `> 🏦 *Bank* : ${formatYen(user.bank)}\n\n` +
        `_Gunakan perintah :_\n` +
        `> _*${m.prefix ?? "."}deposit* untuk menyimpan dana ke bank._\n` +
        `> _*${m.prefix ?? "."}withdraw* untuk mengambil dana dari bank_`;

      return m.reply(teks);
    } catch (err) {
      console.error(err);
      return m.reply(res.error);
    }
  },
};
