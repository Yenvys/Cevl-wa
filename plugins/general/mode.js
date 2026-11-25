import { res } from "../../src/response.js";

const MODE_DESCRIPTIONS = {
  group: "Bot hanya akan merespons di dalam obrolan Grup.",
  private: "Bot hanya akan merespons lewat Chat Pribadi (PC).",
  self: "Bot hanya merespons perintah dari Owner.",
  public: "Akses dibuka penuh (Grup & Chat Pribadi).",
  groupwl: "Bot hanya merespons di dalam Grup yang terdaftar di Whitelist.",
  userwl: "Bot hanya merespons perintah dari User yang terdaftar di Whitelist.",
};

export default {
  cmd: ["mode", "m"],
  category: "system",
  desc: "Mengubah cakupan mode operasional bot (group/private/self/public/groupwl/userwl)",
  exec: async (m, { handler, args }) => {
    if (!m.isOwner) return m.reply(res.owner);

    const targetMode = args[0]?.toLowerCase();
    if (!targetMode || !MODE_DESCRIPTIONS[targetMode]) {
      return m.reply(
        res.format(
          m.prefix,
          "mode <opsi>",
          Object.keys(MODE_DESCRIPTIONS),
          `Mode aktif saat ini: ${handler.mode.toUpperCase()}`,
          "Mengubah cakupan mode operasional bot",
        ),
      );
    }

    await handler.changeMode(targetMode);
    return m.reply(
      `_Sukses! Mode bot berhasil diubah ke: *${targetMode.toUpperCase()}*_\n> _${MODE_DESCRIPTIONS[targetMode]}_`
    );
  },
};
