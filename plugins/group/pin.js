import { proto } from "baileys";
import { res } from "../../src/response.js";

export default {
  cmd: ["pin", "sematkan", "unpin", "lepassemat"],
  category: "grup",
  desc: "Sematkan (pin) atau lepas sematan (unpin) pesan di obrolan grup",

  exec: async (m, { sock, command, args }) => {
    if (!m.isGroup) return m.reply(res.group);
    if (!m.isOwner && !m.isAdmin) return m.reply(res.admin);
    if (!m.isBotAdmin) return m.reply(res.botAdmin);

    const isUnpin =
      command === "unpin" ||
      command === "lepassemat" ||
      args[0]?.toLowerCase() === "unpin" ||
      args[0]?.toLowerCase() === "lepas";

    if (!m.quoted) {
      if (isUnpin) {
        return m.reply(
          res.format(
            m.prefix,
            "unpin",
            [""],
            "• Balas (reply) pesan yang ingin dilepas dari sematan grup\n" +
            "• Bot akan langsung melepas sematan pesan tersebut",
            "Melepas sematan (unpin) pesan di grup"
          )
        );
      }

      return m.reply(
        res.format(
          m.prefix,
          "pin [24h|7d|30d]",
          ["24h", "7d", "30d", "unpin"],
          "• Balas (reply) pesan yang ingin disematkan atau dilepas sematannya\n" +
          "• *24h* : Sematkan pesan selama 24 Jam (1 hari)\n" +
          "• *7d*  : Sematkan pesan selama 7 Hari (1 minggu)\n" +
          "• *30d* / *always* : Sematkan pesan selama 30 Hari (maksimal WhatsApp / selamanya)\n" +
          "• Gunakan *.unpin* untuk melepas sematan pesan",
          "Sematkan (pin) atau lepas sematan (unpin) pesan di grup"
        )
      );
    }

    let duration = 86400; // default 24h
    let durationText = "24 Jam";

    const opt = (args[0] || "").toLowerCase();
    if (opt === "7d" || opt === "7" || opt === "7hari" || opt === "seminggu") {
      duration = 604800;
      durationText = "7 Hari";
    } else if (
      opt === "30d" ||
      opt === "30" ||
      opt === "30hari" ||
      opt === "always" ||
      opt === "selamanya" ||
      opt === "sebulan"
    ) {
      duration = 2592000;
      durationText = "30 Hari (Selamanya)";
    } else if (opt === "24h" || opt === "24" || opt === "24jam" || opt === "sehari") {
      duration = 86400;
      durationText = "24 Jam";
    }

    const targetKey = {
      remoteJid: m.from,
      fromMe: Boolean(m.quoted.fromMe),
      id: m.quoted.id,
      participant: m.quoted.sender || m.quoted.participant,
    };

    try {
      if (isUnpin) {
        await sock.sendMessage(m.from, {
          pin: targetKey,
          type: proto.PinInChat?.Type?.UNPIN_FOR_ALL || 2,
        });
        await sock.sendMessage(m.from, { react: { text: "🔓", key: m.key } }).catch(() => {});
        return m.reply("✅ Pesan berhasil dilepas dari sematan grup!");
      } else {
        await sock.sendMessage(m.from, {
          pin: targetKey,
          type: proto.PinInChat?.Type?.PIN_FOR_ALL || 1,
          time: duration,
        });
        await sock.sendMessage(m.from, { react: { text: "📌", key: m.key } }).catch(() => {});
        return m.reply(`📌 Pesan berhasil disematkan di grup selama *${durationText}*!`);
      }
    } catch (err) {
      console.error("[PIN MESSAGE ERROR]", err);
      return m.reply(res.error(`Gagal ${isUnpin ? "melepas sematan" : "menyematkan pesan"}: ${err.message}`));
    }
  },
};
