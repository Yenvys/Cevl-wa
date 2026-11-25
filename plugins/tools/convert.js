import { createTemp, cleanup, toGif, toMp3, stickerToImage, convertToMp4 } from "../../src/helper.js";
import fs from "node:fs";
import axios from "axios";
import FormData from "form-data";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { res } from "../../src/response.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function uploadToCatbox(buffer, filename) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", buffer, { filename });
  const { data } = await axios.post("https://catbox.moe/user/api.php", form, {
    headers: form.getHeaders(),
    timeout: 60000,
  });
  return data;
}

async function uploadToTmpfiles(buffer, filename) {
  const form = new FormData();
  form.append("file", buffer, { filename });
  const { data } = await axios.post("https://tmpfiles.org/api/v1/upload", form, {
    headers: form.getHeaders(),
    timeout: 60000,
  });
  return data?.data?.url ? data.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/") : null;
}

export default {
  cmd: ["convert", "conv"],
  category: "tools",
  desc: "Konversi berkas media dengan parameter flag",

  exec: async (m, { sock, args, command }) => {
    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || q.mimetype || "";

    if (!args[0]) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} <opsi>`,
          [
            "-toimg (Stiker ke Gambar PNG)",
            "-tomp4 (Video/GIF/Stiker ke MP4)",
            "-togif (Video/Stiker ke GIF animasi)",
            "-tomp3 (Video/Voice ke Audio MP3)",
            "-tourl (Upload media ke tautan URL)",
          ],
          "Reply berkas media terlebih dahulu sebelum menjalankan perintah",
          "Konversi berbagai jenis format berkas media",
        ),
      );
    }
    if (!mime) return m.reply(res.noMedia("berkas media target konversi"));

    const flag = args[0].toLowerCase();

    switch (flag) {
      case "-tomp4":
      case "-tovideo": {
        if (!/video|gif|webp|sticker/.test(mime)) {
          return m.reply(res.warn("Target harus berupa video, gif, atau stiker animasi."));
        }
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        if (/webp|sticker/.test(mime)) {
          const tmpIn = createTemp("gif");
          const tmpOut = tmpIn.replace(".gif", "_out.mp4");
          try {
            const buffer = await q.download();
            const sharp = (await import("sharp")).default;
            const gifBuffer = await sharp(buffer, { animated: true }).gif().toBuffer();
            fs.writeFileSync(tmpIn, gifBuffer);

            await new Promise((resolve, reject) => {
              ffmpeg(tmpIn)
                .outputOptions(["-vf", "scale=480:-1:flags=lanczos", "-pix_fmt", "yuv420p"])
                .toFormat("mp4")
                .on("end", resolve)
                .on("error", reject)
                .save(tmpOut);
            });

            await sock.sendMessage(m.from, { video: fs.readFileSync(tmpOut), mimetype: "video/mp4" }, { quoted: m });
            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
          } catch (e) {
            console.error("[CONV_MP4_ERR]", e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
          } finally {
            cleanup(tmpIn, tmpOut);
          }
        } else {
          try {
            const buffer = await q.download();
            const mp4Buffer = await convertToMp4(buffer);
            await sock.sendMessage(m.from, { video: mp4Buffer }, { quoted: m });
            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
          } catch (e) {
            console.error("[CONV_MP4_ERR]", e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
          }
        }
        break;
      }

      case "-togif": {
        if (!/video|webp|sticker/.test(mime)) {
          return m.reply(res.warn("Target harus berupa video atau stiker animasi untuk diubah ke GIF."));
        }
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        if (/webp|sticker/.test(mime)) {
          const tmpIn = createTemp("gif");
          const tmpOut = tmpIn.replace(".gif", "_out.mp4");
          try {
            const buffer = await q.download();
            const sharp = (await import("sharp")).default;
            const gifBuffer = await sharp(buffer, { animated: true }).gif().toBuffer();
            fs.writeFileSync(tmpIn, gifBuffer);

            await new Promise((resolve, reject) => {
              ffmpeg(tmpIn)
                .outputOptions(["-vf", "scale=480:-1:flags=lanczos,fps=12", "-loop", "0", "-pix_fmt", "yuv420p"])
                .toFormat("mp4")
                .on("end", resolve)
                .on("error", reject)
                .save(tmpOut);
            });

            await sock.sendMessage(m.from, { video: fs.readFileSync(tmpOut), gifPlayback: true }, { quoted: m });
            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
          } catch (e) {
            console.error("[CONV_GIF_ERR]", e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
          } finally {
            cleanup(tmpIn, tmpOut);
          }
        } else {
          const tmpIn = createTemp("mp4");
          const tmpOut = tmpIn.replace(".mp4", "_out.mp4");
          try {
            const buffer = await q.download();
            fs.writeFileSync(tmpIn, buffer);
            await toGif(tmpIn, tmpOut);

            await sock.sendMessage(m.from, { video: fs.readFileSync(tmpOut), gifPlayback: true }, { quoted: m });
            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
          } catch (e) {
            console.error("[CONV_GIF_ERR]", e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
          } finally {
            cleanup(tmpIn, tmpOut);
          }
        }
        break;
      }

      case "-toimg":
      case "-toimage": {
        if (!/webp|sticker/.test(mime)) {
          return m.reply(res.warn("Target harus berupa stiker WebP untuk diubah menjadi gambar."));
        }
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        try {
          const buffer = await q.download();
          const imageBuffer = await stickerToImage(buffer);
          await sock.sendMessage(m.from, { image: imageBuffer, mimetype: "image/png" }, { quoted: m });
          await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
        } catch (e) {
          console.error("[CONV_IMG_ERR]", e);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          await m.reply(res.error);
        }
        break;
      }

      case "-tomp3":
      case "-toaudio": {
        if (!/video|audio/.test(mime)) {
          return m.reply(res.warn("Target harus berupa video atau rekaman suara untuk diubah menjadi audio MP3."));
        }
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        const ext = mime.split("/")[1]?.split(";")[0] || "mp4";
        const tmpIn = createTemp(ext);
        const tmpOut = createTemp("mp3");
        try {
          const buffer = await q.download();
          fs.writeFileSync(tmpIn, buffer);
          await toMp3(tmpIn, tmpOut);

          await sock.sendMessage(
            m.from,
            { audio: fs.readFileSync(tmpOut), mimetype: "audio/mpeg", fileName: "audio.mp3" },
            { quoted: m },
          );
          await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
        } catch (e) {
          console.error("[CONV_MP3_ERR]", e);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          await m.reply(res.error);
        } finally {
          cleanup(tmpIn, tmpOut);
        }
        break;
      }

      case "-tourl":
      case "-tolink": {
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        try {
          const buffer = await q.download();
          const extMap = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
            video: "mp4",
            "audio/mpeg": "mp3",
            "audio/ogg": "ogg",
            audio: "mp3",
            pdf: "pdf",
          };
          const ext = Object.keys(extMap).find((k) => mime.includes(k)) ? extMap[Object.keys(extMap).find((k) => mime.includes(k))] : "bin";
          const filename = `upload_${Date.now()}.${ext}`;

          let url;
          try {
            url = await uploadToCatbox(buffer, filename);
          } catch {
            url = await uploadToTmpfiles(buffer, filename);
          }

          if (!url) {
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            return m.reply(res.error("Gagal mengunggah media ke server."));
          }

          await m.reply(res.success(`*Upload Berhasil*\n> ${url}`));
          await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
        } catch (e) {
          console.error("[CONV_URL_ERR]", e);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          await m.reply(res.error);
        }
        break;
      }

      default:
        return m.reply(res.warn(`Opsi "${flag}" tidak valid! Ketik ${m.prefix}${command} untuk melihat panduan.`));
    }
  },
};
