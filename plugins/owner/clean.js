import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { res } from "../../src/response.js";
import UserRPG from "../../src/rpg/schema.js";

const HISTORY_DIR = "./data/history";

export default {
  cmd: ["clear", "cleanup", "c", "resetdb", "wipedata", "clean"],
  category: "system",
  desc: "Pemeliharaan sistem: sampah sesi, riwayat AI, atau database.",
  exec: async (m, { sock, args, command }) => {
    if (!m.isOwner) return m.reply(res.owner);
    const cmd = command?.toLowerCase();

    if (cmd === "resetdb" || cmd === "wipedata") {
      if (args[0] !== "confirm") {
        return m.reply(`*PERINGATAN KERAS!*\n> _Menghapus *SELURUH* data user secara permanen._\n_Ketik: *${m.prefix}${cmd} confirm*_`);
      }
      try {
        await UserRPG.deleteMany({});
        if (sock.interview) sock.interview = {};
        return m.reply("_Proses wipe data selesai. Database berhasil dikosongkan._");
      } catch (err) {
        console.error("[RESET_DB_ERR]", err);
        return m.reply(res.error);
      }
    }

    const opt = args[0]?.toLowerCase();
    if (opt === "--session" || opt === "-s") {
      const sessId = sock.user?.id ? sock.user.id.split(":")[0] : "default";
      const sessionDir = path.join(process.cwd(), "data", `session_${sessId}`);
      if (!fs.existsSync(sessionDir)) return m.reply(res.error);

      // Hapus hanya berkas sync dan pre-key lama, JANGAN hapus session-* dan sender-key-* aktif agar enkripsi Baileys tidak rusak
      const files = await fsPromises.readdir(sessionDir);
      let deleted = 0;
      await Promise.all(
        files
          .filter((f) => /^(app-state-sync-|pre-key-(?!.*lock))/.test(f))
          .map(async (f) => {
            await fsPromises.unlink(path.join(sessionDir, f)).catch(() => { });
            deleted++;
          })
      );
      return m.reply(`_Pembersihan sesi selesai. Berhasil menghapus ${deleted} berkas sampah._`);
    }

    if (opt === "--history" || opt === "-h") {
      const id = m.isGroup ? m.from : m.sender;
      await fsPromises.unlink(path.join(HISTORY_DIR, `${id}.json`)).catch(() => { });
      return m.reply("_Riwayat percakapan AI pada ruang obrolan ini berhasil dibersihkan._");
    }

    return m.reply(
      res.format(
        m.prefix,
        "c <opsi>",
        [
          "--session",
          "--history",
          "resetdb",
        ],
        "Opsi: --session (-s), --history (-h), resetdb (Wipe database)",
        "Manajemen pemeliharaan dan pembersihan berkas bot",
      ),
    );
  },
};
