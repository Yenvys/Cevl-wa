import { res } from "../../src/response.js";
import { getGroupMessages } from "../../src/database.js";

export default {
  cmd: ["totalchat", "tc", "topchat"],
  category: "grup",
  desc: "Melihat klasemen total pesan (chat) member di grup",
  exec: async (m, { sock }) => {
    if (!m.isGroup) return m.reply(res.group);

    try {
      const messages = getGroupMessages(m.from);
      if (!messages?.length) return m.reply("_Belum ada data chat yang terekam di grup ini._");

      const metadata = await sock.groupMetadata(m.from).catch(() => ({ subject: "Grup Ini" }));
      const medals = [" 🥇", " 🥈", " 🥉"];

      let tagText = `*📊 TOTAL CHAT LEADERBOARD*\n*Grup:* ${metadata.subject}\n\n`;
      const mentions = messages.map((row, i) => {
        const medal = medals[i] || "";
        tagText += `*${i + 1}.* @${row.user_jid.split("@")[0]}${medal} : ${row.count} pesan\n`;
        return row.user_jid;
      });

      tagText += `\n*Catatan :* _Data ini mulai dihitung sejak bot aktif merekam chat._`;
      await sock.sendMessage(m.from, { text: tagText, mentions }, { quoted: m });
    } catch (e) {
      console.error("[TOTALCHAT_ERR]", e);
      m.reply("_Gagal memuat data total chat._");
    }
  },
};
