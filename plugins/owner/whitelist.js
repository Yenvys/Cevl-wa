import { getWhitelistedGroups, updateGroupSettings } from "../../src/database.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["whitelist", "wl"],
  category: "owner",
  desc: "Atur whitelist grup (Support Index)",
  exec: async (m, { sock }) => {
    if (!m.isOwner) return m.reply(res.owner);

    const action = m.args[0]?.toLowerCase();
    const input = m.args[1];
    global.whitelistCache = global.whitelistCache || [];

    switch (action) {
      case "add": {
        const jidAdd = input || m.from;
        if (!jidAdd.endsWith("@g.us")) return m.reply(res.warn("Target harus berupa JID grup (@g.us)."));

        const meta = await sock.groupMetadata(jidAdd).catch(() => ({ subject: "Grup Tidak Dikenal" }));
        await updateGroupSettings(jidAdd, "whitelist", 1, meta.subject);
        return m.reply(`*BERHASIL MENAMBAHKAN WHITELIST*\n\n> *Grup:* ${meta.subject}\n> *JID:* ${jidAdd}`);
      }

      case "remove":
      case "del": {
        if (!input) return m.reply(res.format(m.prefix, `${command} ${action}`, "<indeks | JID_grup>", "Masukkan nomor urut list atau JID grup (@g.us)", "Menghapus grup dari daftar izin whitelist"));
        const targetJid = !isNaN(input) && global.whitelistCache[parseInt(input) - 1]
          ? global.whitelistCache[parseInt(input) - 1].jid
          : input;

        await updateGroupSettings(targetJid, "whitelist", 0);
        return m.reply(`_Sukses menghapus grup dengan JID: \`${targetJid}\` dari Whitelist._`);
      }

      case "list": {
        const list = await getWhitelistedGroups();
        if (!list.length) return m.reply(res.empty("Tidak ada grup yang terdaftar dalam izin Whitelist saat ini."));

        global.whitelistCache = list;
        const txt = list.map((v, i) => `${i + 1}. *${v.name || "Grup Tidak Diketahui"}*\n     └ ${v.jid}`).join("\n\n");
        return m.reply(`⌗ *DAFTAR GRUP WHITELIST*\n\n${txt}`);
      }

      default:
        return m.reply(
          res.format(
            m.prefix,
            "wl <aksi>",
            [
              "add <jid_grup>",
              "del <indeks/jid_grup>",
              "list",
            ],
            "Kelola daftar grup yang diizinkan saat mode groupwl",
            "Manajemen whitelist grup bot",
          ),
        );
    }
  },
};
