import { updateGroupSettings, getAutoCloseGroups } from "../../src/database.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["autoclose", "ac"],
  category: "grup",
  desc: "Pengaturan grup untuk fitur Auto Close / Open",
  exec: async (m, { args, command, handler }) => {
    if (!m.isOwner && !m.isAdmin) return m.reply(res.admin);

    const opt = args[0]?.toLowerCase();

    if (opt === "add" && m.isGroup) {
      updateGroupSettings(m.from, "autoclose", 1);
      return m.reply("_Sukses memasukkan grup ini ke dalam daftar jadwal Autoclose._");
    }

    if ((opt === "del" || opt === "off") && m.isGroup) {
      updateGroupSettings(m.from, "autoclose", 0);
      return m.reply("_Sukses menghapus grup ini dari daftar jadwal Autoclose._");
    }

    if (opt === "list") {
      const list = getAutoCloseGroups();
      if (!list.length) return m.reply("_Tidak ada grup yang terdaftar dalam jam malam saat ini._");
      return m.reply(`⌗ *DAFTAR GRUP AUTO CLOSE*\n\n${list.map((v, i) => `${i + 1}. ${v.name || v.jid}`).join("\n")}`);
    }

    if (opt === "start") {
      await handler.changeFeature("autoclose", true);
      return m.reply("_Sistem jam malam berhasil diaktifkan secara global._");
    }

    if (opt === "stop") {
      await handler.changeFeature("autoclose", false);
      return m.reply("_Sistem jam malam berhasil dinonaktifkan secara global._");
    }

    if (opt === "setclose" || opt === "setopen") {
      const time = args[1];
      const days = args[2] || "*";

      if (!/^\d{2}:\d{2}$/.test(time || "")) {
        return m.reply(res.format(m.prefix, `${command} ${opt}`, "22:30 1-5", "Format waktu HH:MM [hari 1-5 / 1-7]"));
      }

      const [hh, mm] = time.split(":");
      const cronStr = `${parseInt(mm, 10)} ${parseInt(hh, 10)} * * ${days}`;

      if (opt === "setclose") {
        await handler.changeAcTime("close", cronStr);
        return m.reply(`_Jadwal TUTUP grup berhasil diubah menjadi: ${time} WIB (Hari: ${days})._`);
      } else {
        await handler.changeAcTime("open", cronStr);
        let msg = `_Jadwal BUKA grup berhasil diubah menjadi: ${time} WIB (Hari: ${days})._`;
        if (days === "1-5") {
          msg += `\n\n*Catatan :* _Jika mengatur buka 1-5 (Senin-Jumat), grup tidak akan dibuka Sabtu pagi setelah tutup Jumat malam. Gunakan 1-6 jika ingin buka Sabtu pagi._`;
        }
        return m.reply(msg);
      }
    }

    return m.reply(
      res.format(
        m.prefix,
        `${command} <opsi>`,
        [
          "add",
          "del",
          "list",
          "start",
          "stop",
          "setclose 22:30 1-5",
          "setopen 05:00 1-5",
        ],
        `Status: ${handler.autoclose ? "Aktif" : "Nonaktif"} | Tutup: ${handler.ac_closeCron} | Buka: ${handler.ac_openCron}`,
        "Manajemen jadwal buka dan tutup grup otomatis",
      ),
    );
  },
};
