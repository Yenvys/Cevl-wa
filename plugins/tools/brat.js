import { bratGen } from "brat-canvas";
import { bratVid } from "brat-canvas/video";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { tmpdir } from "node:os";
import { convertToStickerWebp, cleanup } from "../../src/helper.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["brat", "bratv"],
  category: "tools",
  desc: "Membuat stiker teks Brat Album (.brat untuk statis, .bratv untuk video)",

  exec: async (m, { sock, query, command }) => {
    if (!query) {
      return m.reply(
        res.format(m.prefix, command, "teks stiker brat", `Gunakan ${m.prefix}bratv untuk versi animasi/video`),
      );
    }

    const isVideo = command.toLowerCase() === "bratv";
    const id = crypto.randomBytes(4).toString("hex");
    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      if (isVideo) {
        const tempMp4 = path.join(tmpdir(), `brat_raw_${id}.mp4`);
        const buffer = await bratVid(query, {
          outputFormat: "mp4",
          fast_progress: true,
          lyric: { maxWordPerLayer: 5, frameDuration: 0.6, lastFrameDuration: 1.2 },
          brat: { BLUR: 0 },
        });

        fs.writeFileSync(tempMp4, buffer);
        const stickerPath = await convertToStickerWebp(tempMp4, true);
        await sock.sendMessage(m.from, { sticker: fs.readFileSync(stickerPath) }, { quoted: m });
        cleanup(tempMp4, stickerPath);
      } else {
        const tempPng = path.join(tmpdir(), `brat_raw_${id}.png`);
        const buffer = await bratGen(query, { BLUR: 0 });

        fs.writeFileSync(tempPng, buffer);
        const stickerPath = await convertToStickerWebp(tempPng, false);
        await sock.sendMessage(m.from, { sticker: fs.readFileSync(stickerPath) }, { quoted: m });
        cleanup(tempPng, stickerPath);
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[BRAT_GEN_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(res.error);
    }
  },
};
