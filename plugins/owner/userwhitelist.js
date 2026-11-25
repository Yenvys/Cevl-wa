import { getWhitelistedUsers, updateUserWhitelist } from "../../src/database.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["userwhitelist", "uwl"],
  category: "owner",
  desc: "Atur whitelist pengguna (User Whitelist)",
  exec: async (m, { command }) => {
    if (!m.isOwner) return m.reply(res.owner);

    const action = m.args[0]?.toLowerCase();
    const input = m.args[1];
    global.userWhitelistCache = global.userWhitelistCache || [];

    switch (action) {
      case "add": {
        const targetUser = m.quoted?.sender || m.mentions?.[0] || (input ? `${input.replace(/\D/g, "")}@s.whatsapp.net` : "");
        if (!targetUser) return m.reply(res.format(m.prefix, `${command} add`, "@tag/628xxx", "Tag user atau masukkan nomor telepon target", "Menambahkan user ke daftar izin whitelist"));

        await updateUserWhitelist(targetUser, 1);
        return m.reply(`✅ *BERHASIL MENAMBAHKAN USER KE WHITELIST*\n\n> *JID:* ${targetUser}`);
      }

      case "remove":
      case "del": {
        if (!input) return m.reply(res.format(m.prefix, `${command} del`, "<nomor_urut/jid>", "Masukkan nomor urut dari list atau JID user", "Menghapus user dari daftar izin whitelist"));
        const targetJid = !isNaN(input) && global.userWhitelistCache[parseInt(input) - 1]
          ? global.userWhitelistCache[parseInt(input) - 1].jid
          : `${input.replace(/\D/g, "")}@s.whatsapp.net`;

        await updateUserWhitelist(targetJid, 0);
        return m.reply(`_Sukses menghapus user dengan JID: \`${targetJid}\` dari Whitelist._`);
      }

      case "list": {
        const list = await getWhitelistedUsers();
        if (!list.length) return m.reply("_Tidak ada user yang terdaftar dalam izin Whitelist saat ini._");

        global.userWhitelistCache = list;
        const txt = list.map((v, i) => `${i + 1}. *${v.pushname || "User Tidak Diketahui"}*\n     └ ${v.jid}`).join("\n\n");
        return m.reply(`⌗ *DAFTAR USER WHITELIST*\n\n${txt}`);
      }

      default:
        return m.reply(
          res.format(
            m.prefix,
            "uwl <aksi>",
            [
              "add @tag/nomor",
              "del <indeks/nomor>",
              "list",
            ],
            "Kelola daftar pengguna yang diizinkan saat mode userwl",
            "Manajemen whitelist pengguna bot",
          ),
        );
    }
  },
};
