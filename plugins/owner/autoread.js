import { res } from "../../src/response.js";

export default {
  cmd: ["autoread", "aread"],
  category: "owner",
  desc: "Membaca pesan masuk secara otomatis (Auto Read)",
  exec: async (m, { command, args, handler }) => {
    if (!m.isOwner) return m.reply(res.owner);

    const action = (args[0] || "").toLowerCase();

    if (["on", "enable", "1"].includes(action)) {
      await handler.changeFeature("autoread", true);
      return m.reply(res.success("Fitur baca otomatis (*Auto Read*) berhasil diaktifkan."));
    }

    if (["off", "disable", "0"].includes(action)) {
      await handler.changeFeature("autoread", false);
      return m.reply(res.success("Fitur baca otomatis (*Auto Read*) berhasil dinonaktifkan."));
    }

    return m.reply(
      res.format(
        m.prefix,
        `${command} <on/off>`,
        ["on", "off"],
        `Status baca otomatis saat ini: ${handler.autoread ? "Aktif" : "Nonaktif"}`,
        "Menandai pesan masuk sebagai telah dibaca secara otomatis",
      ),
    );
  },
};
