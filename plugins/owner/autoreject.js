import { res } from "../../src/response.js";

export default {
  cmd: ["autoreject", "reject"],
  category: "owner",
  desc: "Menolak panggilan suara / video masuk secara otomatis (Auto Reject)",
  exec: async (m, { command, args, handler }) => {
    if (!m.isOwner) return m.reply(res.owner);

    const action = (args[0] || "").toLowerCase();

    if (["on", "enable", "1"].includes(action)) {
      await handler.changeFeature("autoreject", true);
      return m.reply(res.success("Fitur tolak panggilan otomatis (*Auto Reject*) berhasil diaktifkan."));
    }

    if (["off", "disable", "0"].includes(action)) {
      await handler.changeFeature("autoreject", false);
      return m.reply(res.success("Fitur tolak panggilan otomatis (*Auto Reject*) berhasil dinonaktifkan."));
    }

    return m.reply(
      res.format(
        m.prefix,
        `${command} <on/off>`,
        ["on", "off"],
        `Status tolak panggilan saat ini: ${handler.autoreject ? "Aktif" : "Nonaktif"}`,
        "Menolak panggilan suara / video masuk secara otomatis",
      ),
    );
  },
};
