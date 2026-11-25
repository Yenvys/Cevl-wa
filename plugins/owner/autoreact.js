import { res } from "../../src/response.js";

export default {
  cmd: ["autoreact", "areact"],
  category: "owner",
  desc: "Memberikan reaksi emoji secara otomatis pada pesan masuk (Auto React)",
  exec: async (m, { command, args, handler }) => {
    if (!m.isOwner) return m.reply(res.owner);

    const action = (args[0] || "").toLowerCase();

    if (["on", "enable", "1"].includes(action)) {
      await handler.changeFeature("autoreact", true);
      return m.reply(res.success("Fitur reaksi otomatis (*Auto React*) berhasil diaktifkan."));
    }

    if (["off", "disable", "0"].includes(action)) {
      await handler.changeFeature("autoreact", false);
      return m.reply(res.success("Fitur reaksi otomatis (*Auto React*) berhasil dinonaktifkan."));
    }

    return m.reply(
      res.format(
        m.prefix,
        `${command} <on/off>`,
        ["on", "off"],
        `Status reaksi otomatis saat ini: ${handler.autoreact ? "Aktif" : "Nonaktif"}`,
        "Memberikan reaksi emoji secara otomatis pada pesan yang masuk",
      ),
    );
  },
};
