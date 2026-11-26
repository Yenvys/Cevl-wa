import fs from "node:fs/promises";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { createTemp, cleanup } from "../../src/helper.js";
import { res } from "../../src/response.js";

ffmpeg.setFfmpegPath(ffmpegInstaller?.path || "ffmpeg");

/**
 * Format bytes ke ukuran yang mudah dibaca
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export default {
  cmd: ["crop", "square", "kotak", "cropcenter", "crop11"],
  category: "tools",
  desc: "Crop media gambar atau video lonjong menjadi kotak presisi (1:1 / 2:2)",

  exec: async (m, { sock, args, command }) => {
    const q = m.quoted || m;
    const msg = q.msg || q;
    const mime = msg.mimetype || q.mimetype || "";
    const mtype = q.type || q.mtype || "";

    const isImage = mime.startsWith("image/") || mtype === "imageMessage";
    const isVideo = mime.startsWith("video/") || mtype === "videoMessage";
    const isSticker = mime === "image/webp" || mtype === "stickerMessage";

    if (!isImage && !isVideo && !isSticker) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} [opsi/durasi]`,
          [
            "",
            "10",
            "-s",
            "5 -s",
          ],
          "Reply gambar atau video yang lonjong (persegi panjang / 2:3 / 9:16 / 16:9) untuk di-crop menjadi kotak (rasio 1:1).\n" +
          "Pilihan opsi:\n" +
          "• angka : Memotong durasi video (contoh: 10 untuk memotong ke 10 detik)\n" +
          "• -s    : Langsung mengonversi hasil crop menjadi stiker WhatsApp",
          "Crop media gambar atau video lonjong menjadi kotak presisi (1:1)"
        )
      );
    }

    const rawArgs = args.join(" ").toLowerCase();
    const asSticker = rawArgs.includes("-s") || rawArgs.includes("--sticker") || rawArgs.includes("stiker");
    const durMatch = rawArgs.match(/\b(\d{1,3})\b/);
    const targetDuration = durMatch ? parseInt(durMatch[1], 10) : null;

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      const buffer = await q.download?.();
      if (!buffer || !buffer.length) {
        throw new Error("Gagal mengunduh berkas media target.");
      }

      // 1. Gambar & Stiker Statis
      if ((isImage && !isVideo) || isSticker) {
        const meta = await sharp(buffer, { animated: true }).metadata().catch(() => ({}));
        const width = meta.width || 0;
        const height = meta.height || 0;
        const isAnimated = (meta.pages || 1) > 1;

        if (isAnimated) {
          // Animated GIF / Animated Webp -> crop via ffmpeg
          const tmpIn = createTemp("in_anim.webp");
          const tmpOut = createTemp("out_anim.webp");
          await fs.writeFile(tmpIn, buffer);

          try {
            await new Promise((resolve, reject) => {
              ffmpeg(tmpIn)
                .outputOptions([
                  "-vf", "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,format=rgba,setsar=1",
                  "-c:v", "libwebp",
                  "-lossless", "0",
                  "-q:v", "75",
                  "-loop", "0",
                  "-an",
                ])
                .save(tmpOut)
                .on("end", resolve)
                .on("error", reject);
            });

            const croppedBuf = await fs.readFile(tmpOut);
            if (asSticker || isSticker) {
              await sock.sendSticker(m.from, croppedBuf, m, { isAnimated: true });
            } else {
              await sock.sendMessage(
                m.from,
                {
                  video: croppedBuf,
                  gifPlayback: true,
                  caption: `*CROP MEDIA SELESAI*\n> • Tipe: GIF Animasi\n> • Rasio: Kotak Presisi (1:1)\n> • Pemotongan: Tengah (Center Crop)`,
                },
                { quoted: m }
              );
            }
          } finally {
            cleanup(tmpIn, tmpOut);
          }
        } else {
          // Statis Image
          const side = Math.min(width, height) || 512;
          const croppedBuf = await sharp(buffer)
            .rotate()
            .resize(side, side, { fit: "cover", position: "center" })
            .toBuffer();

          if (asSticker || isSticker) {
            await sock.sendSticker(m.from, croppedBuf, m, { isAnimated: false });
          } else {
            const caption =
              `*CROP MEDIA SELESAI*\n` +
              `> • Tipe      : Gambar\n` +
              `> • Dimensi   : ${width}x${height} ➔ ${side}x${side} (Kotak 1:1)\n` +
              `> • Pemotongan: Tengah (Center Crop)\n` +
              `> • Ukuran    : ${formatBytes(croppedBuf.length)}`;

            await sock.sendMessage(
              m.from,
              {
                image: croppedBuf,
                caption,
              },
              { quoted: m }
            );
          }
        }
      }
      // 2. Video
      else if (isVideo) {
        const tmpIn = createTemp("in_crop.mp4");
        const tmpOut = createTemp(asSticker ? "out_crop.webp" : "out_crop.mp4");
        await fs.writeFile(tmpIn, buffer);

        try {
          const ffOpts = [
            "-vf", "crop=min(iw\\,ih):min(iw\\,ih),setsar=1",
          ];

          if (targetDuration && targetDuration > 0) {
            ffOpts.unshift("-t", String(targetDuration));
          }

          if (asSticker) {
            const stickerDuration = targetDuration ? Math.min(targetDuration, 8) : 7;
            ffOpts.unshift("-t", String(stickerDuration));
            ffOpts[ffOpts.indexOf("-vf") + 1] = "fps=10,crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,format=rgba,setsar=1";
            ffOpts.push("-c:v", "libwebp", "-lossless", "0", "-q:v", "45", "-loop", "0", "-an");
          } else {
            ffOpts.push(
              "-vcodec", "libx264",
              "-pix_fmt", "yuv420p",
              "-preset", "faster",
              "-acodec", "aac",
              "-b:a", "128k",
              "-movflags", "+faststart"
            );
          }

          await new Promise((resolve, reject) => {
            ffmpeg(tmpIn)
              .outputOptions(ffOpts)
              .save(tmpOut)
              .on("end", resolve)
              .on("error", reject);
          });

          const croppedBuf = await fs.readFile(tmpOut);

          if (asSticker) {
            await sock.sendSticker(m.from, croppedBuf, m, { isAnimated: true });
          } else {
            let caption =
              `*CROP MEDIA SELESAI*\n` +
              `> • Tipe      : Video\n` +
              `> • Rasio     : Kotak Presisi (1:1 / Center)\n` +
              `> • Pemotongan: Tengah (Center Crop)`;

            if (targetDuration) {
              caption += `\n> • Durasi    : Dipotong ke ${targetDuration} detik`;
            }

            await sock.sendMessage(
              m.from,
              {
                video: croppedBuf,
                caption,
              },
              { quoted: m }
            );
          }
        } finally {
          cleanup(tmpIn, tmpOut);
        }
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[CROP_ERR]", err);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error(`Gagal melakukan crop media: ${err.message}`));
    }
  },
};
