import { getGroupSettings, updateGroupSettings } from "../../src/database.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["gc", "open", "close", "promote", "up", "demote", "down", "antilink", "welcome", "goodbye"],
  category: "grup",
  desc: "Pusat kendali pengaturan dan administrasi grup",
  exec: async (m, { sock, args, query, command }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!m.isOwner && !m.isAdmin) return m.reply(res.admin);
    if (!m.isBotAdmin) return m.reply(res.botAdmin);

    const cmd = command.toLowerCase();

    // 1. Open / Close Group
    if (["gc", "open", "close"].includes(cmd)) {
      const sub = args[0]?.toLowerCase() || cmd;
      const mode = /open|buka/i.test(sub) ? "not_announcement" : /close|tutup/i.test(sub) ? "announcement" : "";
      if (!mode) return m.reply(res.format(m.prefix, "gc", ["open", "close"]));

      await sock.groupSettingUpdate(m.from, mode);
      return m.react("");
    }

    // 2. Promote / Demote
    if (["promote", "up", "demote", "down"].includes(cmd)) {
      const action = /promote|up/i.test(cmd) ? "promote" : "demote";
      let targets = m.quoted ? [m.quoted.sender] : m.mentionedJid || [];
      if (query && !targets.length) targets.push(`${query.replace(/[^0-9]/g, "")}@s.whatsapp.net`);
      if (!targets.length) return m.reply(res.format(m.prefix, command, "@tag/reply pesan"));

      try {
        for (const t of targets) await sock.groupParticipantsUpdate(m.from, [t], action);
        return m.react("");
      } catch (e) {
        console.error(`[${action.toUpperCase()}_ERR]`, e);
        await m.react("❌");
        return m.reply(res.error);
      }
    }

    // 3. Welcome / Goodbye
    if (["welcome", "goodbye"].includes(cmd)) {
      const sub = args[0]?.toLowerCase();
      const current = getGroupSettings(m.from);

      if (sub === "on" || sub === "off") {
        updateGroupSettings(m.from, cmd, sub === "on" ? 1 : 0);
        await m.react("");
        return m.reply(`_Sistem notif *${cmd.toUpperCase()}* diubah menjadi: *${sub.toUpperCase()}*_`);
      }

      if (sub === "set") {
        const textTemplate = args.slice(1).join(" ");
        if (!textTemplate) {
          return m.reply(res.format(m.prefix, `${cmd} set`, "Selamat Datang @pushname di grup @gcname", "Variabel: @pushname, @gcname"));
        }
        updateGroupSettings(m.from, `${cmd}Text`, textTemplate);
        await m.react("");
        return m.reply(`_Template pesan *${cmd}* berhasil diperbarui._`);
      }

      return m.reply(
        res.format(
          m.prefix,
          `${cmd} <opsi>`,
          [
            "on",
            "off",
            "set Selamat Datang @pushname di grup @gcname",
          ],
          `Status: ${current[cmd] ? "ON" : "OFF"}. Variabel: @pushname, @gcname`,
          `Pengaturan notifikasi pesan ${cmd.toUpperCase()} grup`,
        ),
      );
    }

    // 4. Antilink
    if (cmd === "antilink") {
      const sub = args[0]?.toLowerCase();
      if (!["on", "off"].includes(sub)) {
        return m.reply(res.format(m.prefix, "antilink", ["on", "off"]));
      }
      updateGroupSettings(m.from, "antilink", sub === "on" ? 1 : 0);
      await m.react("");
      return m.reply(`_*Antilink* berhasil diubah ke: *${sub.toUpperCase()}*_`);
    }
  },
};
