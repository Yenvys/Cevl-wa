import { exec } from "node:child_process";
import { res } from "../../src/response.js";

export default {
  cmd: ["exec", "$"],
  category: "owner",
  desc: "Execute Shell command (timeout: 30s)",
  exec: async (m, { query, command }) => {
    if (!m.isOwner) return m.reply(res.owner);
    if (!query) return m.reply(res.format(m.prefix, command, "ls -la", "Masukkan baris perintah terminal shell (Timeout: 30s)", "Mengeksekusi baris perintah shell sistem"));

    if (query.startsWith("tree")) {
      const dirTarget = query.replace(/^tree/, "").trim() || ".";
      return m.reply(`\`\`\`${m.tree(dirTarget)}\`\`\``);
    }

    exec(query, { timeout: 30000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
      if (err) {
        if (err.killed) return m.reply("```⏱️ Timeout: Eksekusi melebihi 30 detik.```");
        return m.reply(`\`\`\`ERROR\n\n${err.message}\`\`\``);
      }
      if (stderr) return m.reply(`\`\`\`STDERR\n\n${stderr}\`\`\``);

      const out = stdout?.trim();
      if (!out) return m.reply("```Eksekusi sukses tanpa Output.```");
      const truncated = out.length > 4000 ? `${out.slice(0, 4000)}\n\n... (output dipotong, terlalu panjang)` : out;
      return m.reply(`\`\`\`${truncated}\`\`\``);
    });
  },
};
