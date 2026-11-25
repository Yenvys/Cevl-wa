import fs from "node:fs";
import path from "node:path";
import { res } from "../../src/response.js";
import { getDefenseConfig } from "../../src/defender.js";

const defenseFile = path.join(process.cwd(), "data", "defense.json");

function saveDefenseConfig(cfg) {
  fs.writeFileSync(defenseFile, JSON.stringify(cfg, null, 2));
}

export default {
  cmd: ["defense", "skip", "smp"],
  category: "owner",
  desc: "Mengatur status sistem pertahanan (Defense) bot",
  exec: async (m, { command, args, sock }) => {
    if (!m.isOwner) return m.reply(res.owner);
    const config = getDefenseConfig();

    if (command === "smp") {
      try {
        const data = Buffer.from(JSON.stringify(m, null, 2));
        const fileName = `${m.from}_${m.sender.split("@")[0]}_${Date.now()}.json`;
        return await sock.sendMessage(
          m.from,
          {
            document: data,
            fileName,
            mimetype: "application/json",
            caption: `*From* : ${m.pushName || "User"} (${m.sender})\n*Chat* : ${m.from}`,
          },
          { quoted: m }
        );
      } catch {
        return m.reply(res.error("Gagal membuat sample message."));
      }
    }

    if (command === "defense") {
      const action = (args[0] || "").toLowerCase();

      if (["on", "enable", "1"].includes(action)) {
        config.active = true;
        saveDefenseConfig(config);
        return m.reply(res.success("Sistem pertahanan bot berhasil diaktifkan."));
      }

      if (["off", "disable", "0"].includes(action)) {
        config.active = false;
        saveDefenseConfig(config);
        return m.reply(res.success("Sistem pertahanan bot berhasil dinonaktifkan."));
      }

      return m.reply(
        res.format(
          m.prefix,
          `${command} <on/off>`,
          ["on", "off"],
          `Status pertahanan saat ini: ${config.active ? "Aktif" : "Nonaktif ⚠️"}`,
          "Mengatur status sistem pertahanan (Defense) bot",
        ),
      );
    }

    if (command === "skip") {
      const action = (args[0] || "").toLowerCase();
      const typeArg = args[1];

      if (["add", "+"].includes(action)) {
        if (!typeArg) {
          return m.reply(
            res.format(
              m.prefix,
              "skip add <tipe>",
              "audioMessage",
              `Tipe aktif: ${config.allow_status.join(", ")}`,
              "Menambahkan tipe pesan status WhatsApp yang diizinkan",
            ),
          );
        }
        if (!config.allow_status.includes(typeArg)) {
          config.allow_status.push(typeArg);
          saveDefenseConfig(config);
        }
        return m.reply(res.success(`Tipe pesan *${typeArg}* berhasil ditambahkan ke daftar izin status.`));
      }

      if (["del", "delete", "remove", "-"].includes(action)) {
        if (!typeArg) {
          return m.reply(
            res.format(
              m.prefix,
              "skip del <tipe>",
              "audioMessage",
              `Tipe aktif: ${config.allow_status.join(", ")}`,
              "Menghapus tipe pesan status WhatsApp yang diizinkan",
            ),
          );
        }
        config.allow_status = config.allow_status.filter((t) => t !== typeArg);
        saveDefenseConfig(config);
        return m.reply(res.success(`Tipe pesan *${typeArg}* berhasil dihapus dari daftar izin status.`));
      }

      const listFormatted = config.allow_status.map((t) => `> • \`${t}\``).join("\n");
      return m.reply(
        `*🛡️ DAFTAR TIPE PESAN STATUS DIIZINKAN*\n_Pesan status dengan tipe di bawah ini tidak akan diblokir oleh defender_\n\n` +
          listFormatted +
          `\n\n*Cara Mengatur:*\n> • \`${m.prefix}skip add <tipe>\` (Tambah izin)\n> • \`${m.prefix}skip del <tipe>\` (Hapus izin)`
      );
    }
  },
};
