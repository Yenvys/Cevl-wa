import { res } from "../../src/response.js";

export default {
  cmd: ["setprefix", "prefix"],
  category: "owner",
  desc: "Mengubah prefix (awalan) perintah bot.",
  exec: async (m, { handler, args }) => {
    if (!m.isOwner) return m.reply(res.owner);

    if (!args[0]) {
      return m.reply(
        res.format(
          m.prefix,
          "setprefix <simbol>",
          [
            "!",
            "!,.,#",
            "none",
          ],
          `Prefix aktif saat ini: ${handler.prefix?.filter(Boolean).join(", ") || "none"}`,
          "Mengubah awalan (prefix) perintah bot",
        ),
      );
    }

    let newPrefixes;
    if (m.query.toLowerCase() === "none") {
      newPrefixes = [""];
    } else {
      newPrefixes = m.query.split(",").map((p) => p.trim()).filter(Boolean);
      if (m.query.trim().startsWith(",")) newPrefixes.unshift(",");
    }

    await handler.changePrefix(newPrefixes);
    return m.reply(`_Sukses! Prefix bot berhasil diubah ke: *${newPrefixes.join(", ") || "Tanpa Prefix (none)"}*_`);
  },
};
