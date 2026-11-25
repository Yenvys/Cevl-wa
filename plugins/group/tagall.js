import { res } from "../../src/response.js";

export default {
  cmd: ["tagall", "everyone"],
  category: "grup",
  desc: "Tag semua member di grup (Hanya Admin/Owner)",
  exec: async (m, { sock, args }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!m.isAdmin && !m.isOwner) return m.reply(res.admin);

    let text = args.join(" ");
    if (!text && m.quoted) text = m.quoted.text || m.quoted.body || "";
    if (!text) text = "📢 Panggilan Grup!";

    try {
      const metadata = await sock.groupMetadata(m.from);
      const participants = metadata.participants || [];

      let tagText = `*📢 MENTION ALL*\n\n*Pesan:* ${text}\n\n*Daftar Member:*\n`;
      const mentions = participants.map((p) => {
        tagText += ` ◦ @${p.id.split("@")[0]}\n`;
        return p.id;
      });

      await sock.sendMessage(m.from, { text: tagText, mentions }, { quoted: m });
    } catch (e) {
      console.error("[TAGALL_ERR]", e);
      m.reply(res.error("Gagal melakukan tagall."));
    }
  },
};
