import { createTemp, cleanup, toGif, toMp3, stickerToImage, convertToMp4 } from "../../src/helper.js";
import fs from "node:fs";
import axios from "axios";
import FormData from "form-data";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import sharp from "sharp";
import { res } from "../../src/response.js";

ffmpeg.setFfmpegPath(ffmpegInstaller?.path || "ffmpeg");

const GOTENBERG_CONVERT_URL = "https://demo.gotenberg.dev/forms/libreoffice/convert";
const GOTENBERG_URL_TO_PDF = "https://demo.gotenberg.dev/forms/chromium/convert/url";

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
  cmd: ["convert", "conv", "topdf", "tomp3", "toimg", "tovideo", "togif", "totxt", "towav", "toogg", "tovn"],
  category: "tools",
  desc: "Konversi berkas dokumen (Word, Excel, PPT ke PDF) dan aneka media",

  exec: async (m, { sock, args, command }) => {
    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || q.mimetype || "";

    // Support direct command shortcuts like .topdf, .tomp3, .toimg, etc.
    let flag = (args[0] || "").toLowerCase();
    if (command && !["convert", "conv"].includes(command.toLowerCase())) {
      flag = `-${command.toLowerCase()}`;
    }

    if (flag && !flag.startsWith("-")) {
      flag = `-${flag}`;
    }

    if (!flag) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} <opsi>`,
          [
            "-topdf (Word/Excel/PPT/Gambar ke PDF)",
            "-toimg (Stiker WebP ke Gambar PNG)",
            "-tojpg (Stiker/Gambar ke JPG)",
            "-towebp (Gambar ke Stiker WebP)",
            "-tomp4 (Video/GIF/Stiker ke MP4)",
            "-togif (Video/Stiker ke GIF animasi)",
            "-tomp3 (Video/Voice ke Audio MP3)",
            "-towav (Audio/Video ke Audio WAV)",
            "-tovn (Audio ke Voice Note PTT)",
            "-totxt (Ekstrak isi teks dokumen)",
            "-tourl (Upload media ke tautan URL)",
          ],
          `Reply berkas target sebelum menjalankan perintah, atau gunakan shortcut seperti ${m.prefix ?? "."}topdf / ${m.prefix ?? "."}tomp3`,
          "Konversi berbagai jenis berkas dokumen dan media"
        )
      );
    }

    // Khusus konversi URL Web ke PDF (.topdf https://example.com)
    const urlMatch = (m.query || args[0] || "").trim().match(/^https?:\/\/\S+$/i);
    if (["-topdf", "-pdf"].includes(flag) && urlMatch) {
      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
      try {
        const form = new FormData();
        form.append("url", urlMatch[0]);
        const resData = await axios.post(GOTENBERG_URL_TO_PDF, form, {
          headers: form.getHeaders(),
          responseType: "arraybuffer",
          timeout: 45000,
        });

        await sock.sendMessage(
          m.from,
          {
            document: Buffer.from(resData.data),
            mimetype: "application/pdf",
            fileName: "webpage.pdf",
            caption: "_Konversi halaman web ke PDF berhasil (webpage.pdf)_",
          },
          { quoted: m }
        );
        await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        return;
      } catch (err) {
        console.error("[CONV_WEB_PDF_ERR]", err.message);
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error(`Gagal mengonversi web ke PDF: ${err.message}`));
      }
    }

    if (!mime) {
      return m.reply(res.noMedia("berkas dokumen atau media target konversi"));
    }

    switch (flag) {
      // 1. Dokumen (Word, Excel, PPT, Txt, Gambar) ke PDF
      case "-topdf":
      case "-pdf": {
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        try {
          const buffer = await q.download?.();
          if (!buffer || !buffer.length) {
            throw new Error("Gagal mengunduh berkas.");
          }

          const docName = q.msg?.fileName || q.fileName || "";
          let originalName = docName || "document";

          if (!originalName.includes(".")) {
            let ext = "docx";
            if (/image\/(jpeg|jpg)/i.test(mime)) ext = "jpg";
            else if (/image\/png/i.test(mime)) ext = "png";
            else if (/image\/webp/i.test(mime)) ext = "webp";
            else if (/sheet|excel/i.test(mime)) ext = "xlsx";
            else if (/presentation|powerpoint/i.test(mime)) ext = "pptx";
            else if (/text\/plain/i.test(mime)) ext = "txt";
            else if (/text\/csv/i.test(mime)) ext = "csv";
            else if (/rtf/i.test(mime)) ext = "rtf";
            else if (/html/i.test(mime)) ext = "html";
            originalName = `${originalName}.${ext}`;
          }

          const form = new FormData();
          form.append("files", buffer, { filename: originalName });

          const resData = await axios.post(GOTENBERG_CONVERT_URL, form, {
            headers: form.getHeaders(),
            responseType: "arraybuffer",
            timeout: 60000,
          });

          const baseName = originalName.replace(/\.[^/.]+$/, "");
          const pdfName = `${baseName}.pdf`;

          await sock.sendMessage(
            m.from,
            {
              document: Buffer.from(resData.data),
              mimetype: "application/pdf",
              fileName: pdfName,
              caption: `_Konversi ke PDF berhasil (${pdfName})_`,
            },
            { quoted: m }
          );
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        } catch (e) {
          console.error("[CONV_PDF_ERR]", e.message);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          return m.reply(res.error(`Gagal mengonversi ke PDF: ${e.response?.statusText || e.message}`));
        }
        break;
      }

      // 2. Video / GIF / Stiker ke MP4
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
            const buffer = await q.download?.();
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
            await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
          } catch (e) {
            console.error("[CONV_MP4_ERR]", e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
          } finally {
            cleanup(tmpIn, tmpOut);
          }
        } else {
          try {
            const buffer = await q.download?.();
            const mp4Buffer = await convertToMp4(buffer);
            await sock.sendMessage(m.from, { video: mp4Buffer }, { quoted: m });
            await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
          } catch (e) {
            console.error("[CONV_MP4_ERR]", e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
          }
        }
        break;
      }

      // 3. Video / Stiker ke GIF
      case "-togif": {
        if (!/video|webp|sticker/.test(mime)) {
          return m.reply(res.warn("Target harus berupa video atau stiker animasi untuk diubah ke GIF."));
        }
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        if (/webp|sticker/.test(mime)) {
          const tmpIn = createTemp("gif");
          const tmpOut = tmpIn.replace(".gif", "_out.mp4");
          try {
            const buffer = await q.download?.();
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
            await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
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
            const buffer = await q.download?.();
            fs.writeFileSync(tmpIn, buffer);
            await toGif(tmpIn, tmpOut);

            await sock.sendMessage(m.from, { video: fs.readFileSync(tmpOut), gifPlayback: true }, { quoted: m });
            await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
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

      // 4. Stiker / WebP ke Gambar PNG
      case "-toimg":
      case "-toimage":
      case "-topng": {
        if (!/webp|sticker/.test(mime)) {
          return m.reply(res.warn("Target harus berupa stiker WebP untuk diubah menjadi gambar PNG."));
        }
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        try {
          const buffer = await q.download?.();
          const imageBuffer = await stickerToImage(buffer);
          await sock.sendMessage(m.from, { image: imageBuffer, mimetype: "image/png" }, { quoted: m });
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        } catch (e) {
          console.error("[CONV_IMG_ERR]", e);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          await m.reply(res.error);
        }
        break;
      }

      // 5. Stiker / PNG ke Gambar JPG
      case "-tojpg":
      case "-tojpeg": {
        if (!/image|webp|sticker/.test(mime)) {
          return m.reply(res.warn("Target harus berupa stiker atau gambar untuk diubah ke format JPG."));
        }
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        try {
          const buffer = await q.download?.();
          const jpgBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
          await sock.sendMessage(m.from, { image: jpgBuffer, mimetype: "image/jpeg" }, { quoted: m });
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        } catch (e) {
          console.error("[CONV_JPG_ERR]", e);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          await m.reply(res.error);
        }
        break;
      }

      // 6. Gambar ke Stiker WebP
      case "-towebp":
      case "-tosticker": {
        if (!/image/.test(mime)) {
          return m.reply(res.warn("Target harus berupa gambar untuk diubah ke stiker WebP."));
        }
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        try {
          const buffer = await q.download?.();
          const webpBuffer = await sharp(buffer)
            .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 90 })
            .toBuffer();
          await sock.sendMessage(m.from, { sticker: webpBuffer }, { quoted: m });
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        } catch (e) {
          console.error("[CONV_WEBP_ERR]", e);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          await m.reply(res.error);
        }
        break;
      }

      // 7. Video / Voice / Audio ke Audio MP3
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
          const buffer = await q.download?.();
          fs.writeFileSync(tmpIn, buffer);
          await toMp3(tmpIn, tmpOut);

          await sock.sendMessage(
            m.from,
            { audio: fs.readFileSync(tmpOut), mimetype: "audio/mpeg", fileName: "audio.mp3" },
            { quoted: m }
          );
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        } catch (e) {
          console.error("[CONV_MP3_ERR]", e);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          await m.reply(res.error);
        } finally {
          cleanup(tmpIn, tmpOut);
        }
        break;
      }

      // 8. Audio / Video ke Audio WAV
      case "-towav": {
        if (!/video|audio/.test(mime)) {
          return m.reply(res.warn("Target harus berupa video atau audio untuk diubah menjadi WAV."));
        }
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        const ext = mime.split("/")[1]?.split(";")[0] || "mp4";
        const tmpIn = createTemp(ext);
        const tmpOut = createTemp("wav");
        try {
          const buffer = await q.download?.();
          fs.writeFileSync(tmpIn, buffer);

          await new Promise((resolve, reject) => {
            ffmpeg(tmpIn)
              .toFormat("wav")
              .on("end", resolve)
              .on("error", reject)
              .save(tmpOut);
          });

          await sock.sendMessage(
            m.from,
            { document: fs.readFileSync(tmpOut), mimetype: "audio/wav", fileName: "audio.wav" },
            { quoted: m }
          );
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        } catch (e) {
          console.error("[CONV_WAV_ERR]", e);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          await m.reply(res.error);
        } finally {
          cleanup(tmpIn, tmpOut);
        }
        break;
      }

      // 9. Audio / Video ke Voice Note OGG Opus (PTT)
      case "-toogg":
      case "-tovn": {
        if (!/video|audio/.test(mime)) {
          return m.reply(res.warn("Target harus berupa video atau rekaman audio untuk dijadikan Voice Note."));
        }
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        const ext = mime.split("/")[1]?.split(";")[0] || "mp4";
        const tmpIn = createTemp(ext);
        const tmpOut = createTemp("opus");
        try {
          const buffer = await q.download?.();
          fs.writeFileSync(tmpIn, buffer);

          await new Promise((resolve, reject) => {
            ffmpeg(tmpIn)
              .audioCodec("libopus")
              .toFormat("ogg")
              .outputOptions(["-avoid_negative_ts", "make_zero"])
              .on("end", resolve)
              .on("error", reject)
              .save(tmpOut);
          });

          await sock.sendMessage(
            m.from,
            { audio: fs.readFileSync(tmpOut), mimetype: "audio/ogg; codecs=opus", ptt: true },
            { quoted: m }
          );
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        } catch (e) {
          console.error("[CONV_VN_ERR]", e);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          await m.reply(res.error);
        } finally {
          cleanup(tmpIn, tmpOut);
        }
        break;
      }

      // 10. Ekstrak Isi Teks Dokumen
      case "-totxt":
      case "-totext": {
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        try {
          const buffer = await q.download?.();
          if (!buffer || !buffer.length) throw new Error("Gagal mengunduh berkas.");

          let extractedText = buffer.toString("utf-8");
          if (extractedText.length > 3000) {
            extractedText = extractedText.slice(0, 3000) + "\n\n_... (teks dipotong karena batas panjang pesan)_";
          }
          await m.reply(`*ISI DOKUMEN TEKS:*\n\n${extractedText}`);
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        } catch (e) {
          console.error("[CONV_TXT_ERR]", e.message);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          return m.reply(res.error(`Gagal membaca isi teks: ${e.message}`));
        }
        break;
      }

      // 11. Upload Media ke URL
      case "-tourl":
      case "-tolink": {
        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        try {
          const buffer = await q.download?.();
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
          const ext =
            Object.keys(extMap).find((k) => mime.includes(k))
              ? extMap[Object.keys(extMap).find((k) => mime.includes(k))]
              : "bin";
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
          await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        } catch (e) {
          console.error("[CONV_URL_ERR]", e);
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          await m.reply(res.error);
        }
        break;
      }

      default:
        return m.reply(
          res.warn(
            `Opsi flag "${flag}" tidak valid! Ketik *${m.prefix ?? "."}${command}* untuk melihat panduan opsi konversi.`
          )
        );
    }
  },
};
