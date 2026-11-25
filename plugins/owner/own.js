import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { getLidMapping } from "../../src/database.js";
import { sendMultiContact } from "../../src/helper.js";
import { res } from "../../src/response.js";

function saveOwnerConfig(filePath, newOwnerList) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const regexOwner = /(['"]?)ownerNumbers\1\s*:\s*\[[\s\S]*?\]/;
    if (!regexOwner.test(content)) return console.error("[CONFIG_SAVE_ERR] ownerNumbers tidak ditemukan di config.js");

    const backupPath = filePath + ".bak";
    fs.writeFileSync(backupPath, content, "utf-8");
    const updated = content.replace(regexOwner, `"ownerNumbers": ${JSON.stringify(newOwnerList, null, 4)}`);
    fs.writeFileSync(filePath, updated, "utf-8");
  } catch (e) {
    console.error("[CONFIG_WRITE_FATAL]", e.message);
    const backupPath = filePath + ".bak";
    if (fs.existsSync(backupPath)) {
      try { fs.copyFileSync(backupPath, filePath); } catch { }
    }
  }
}

export default {
  cmd: ["owner", "own"],
  category: "owner",
  desc: "Kelola nomor telepon akses Owner bot.",
  exec: async (m, { sock, args = [] }) => {
    const action = args[0]?.toLowerCase();
    if (action !== "list" && !m.isOwner) return m.reply(res.owner);

    if (action === "list") {
      const list = config.ownerNumbers || [];
      if (!list.length) return m.reply("_Tidak ada list nomor Owner yang tercatat._");
      const mappedOwners = list.map((num, i) => ({
        name: i === 0 ? "Yenvy" : `Owner ${i + 1}`,
        number: num,
      }));
      return await sendMultiContact(sock, m.from, mappedOwners, m);
    }

    if (action === "add" || action === "remove" || action === "del") {
      const rawJid = m.quoted ? m.quoted.sender : m.mentionedJid?.[0] || (args[1] ? `${args[1].replace(/\D/g, "")}@s.whatsapp.net` : null);
      if (!rawJid) return m.reply(res.format(m.prefix, `${command} ${action}`, "@user", "Tag target, reply pesan, atau ketik nomor telepon", "Kelola nomor telepon akses Owner bot"));

      const finalJid = rawJid.endsWith("@lid") ? (await getLidMapping(rawJid)) || rawJid : rawJid;
      const targetNum = finalJid.split("@")[0];
      const configPath = path.resolve("./config.js");

      if (!/^\d{10,15}$/.test(targetNum)) return m.reply(res.warn("Format nomor tidak valid (harus 10-15 digit angka)."));

      if (action === "add") {
        if (config.ownerNumbers.includes(targetNum)) return m.reply("_Nomor telepon tersebut sudah terdaftar sebagai Owner._");
        config.ownerNumbers.push(targetNum);
        saveOwnerConfig(configPath, config.ownerNumbers);
        return m.reply(`_Sukses! @${targetNum} resmi ditambahkan sebagai Owner bot._`, { mentions: [`${targetNum}@s.whatsapp.net`] });
      }

      if (targetNum === config.ownerNumbers[0]) return m.reply("_Tidak bisa menghapus super-owner dari daftar._");
      if (!config.ownerNumbers.includes(targetNum)) return m.reply("_Nomor tersebut tidak tercantum dalam list Owner._");

      config.ownerNumbers = config.ownerNumbers.filter((n) => n !== targetNum);
      saveOwnerConfig(configPath, config.ownerNumbers);
      return m.reply(`_Sukses! Hak Owner untuk @${targetNum} telah dicabut._`, { mentions: [`${targetNum}@s.whatsapp.net`] });
    }

    return m.reply(
      res.format(
        m.prefix,
        `${command} <aksi>`,
        [
          "add @tag/nomor",
          "del @tag/nomor",
          "list",
        ],
        "Hanya Owner yang dapat menambah atau menghapus akses Owner",
        "Kelola nomor telepon akses Owner bot",
      ),
    );
  },
};
