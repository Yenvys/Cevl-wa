import axios from "axios";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { res } from "../../src/response.js";

async function downloadToFile(url, dest) {
  const writer = fs.createWriteStream(dest);
  const response = await axios.get(url, { responseType: "stream", maxRedirects: 5 });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

const YT_HEADERS = {
  "content-type": "application/json",
  "x-youtube-client-name": "1",
  "x-youtube-client-version": "2.20260521.00.00",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/148.0.0.0 Safari/537.36",
};

async function searchYoutube(query) {
  const { data } = await axios.post(
    "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
    { context: { client: { hl: "en", gl: "ID", clientName: "WEB", clientVersion: "2.20260521.00.00", platform: "DESKTOP" } }, query },
    { headers: YT_HEADERS }
  );

  const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  return contents.flatMap((s) => s.itemSectionRenderer?.contents || [])
    .map((item) => item.videoRenderer)
    .filter(Boolean)
    .map((v) => ({
      videoId: v.videoId,
      title: v.title?.runs?.map((x) => x.text)?.join("") || null,
      channel: v.ownerText?.runs?.[0]?.text || null,
      duration: v.lengthText?.simpleText || null,
      url: `https://youtube.com/watch?v=${v.videoId}`,
    }));
}

async function fetchDownloadUrl(youtubeUrl, targetType = "mp3") {
  const apiKey = process.env.JEREXD_API_KEY;
  if (!apiKey) throw new Error("JEREXD_API_KEY tidak dikonfigurasi di .env");
  const { data } = await axios.get(`https://api.jerexd.my.id/api/downloader/youtube?apikey=${apiKey}&url=${encodeURIComponent(youtubeUrl)}&format=${targetType}`);
  const result = data?.result;
  if (!result?.download) throw new Error("Format media tidak ditemukan dari API.");

  return {
    type: targetType === "mp3" ? "audio" : "video",
    fileName: result.title || "yt_download",
    fileUrl: result.download,
  };
}

export default {
  cmd: ["ytdl", "ytsearch"],
  category: "download",
  desc: "Mencari video YouTube dan download format MP3/MP4 via reply",
  exec: async (m, { sock, query, command }) => {
    if (!query) return m.reply(res.format(m.prefix, command, "Vivarium"));

    const start = Date.now();
    await m.reply(`_*Searching "${query}" on YouTube... Please wait..*_`);

    try {
      const results = await searchYoutube(query);
      const tracks = results.slice(0, 5);
      if (!tracks.length) return m.reply(res.empty(`Video "${query}" tidak ditemukan.`));

      const speed = ((Date.now() - start) / 1000).toFixed(2);
      let txt = `*YOUTUBE DOWNLOADER*\n> _Query: "${query}"_\n> Speed: ${speed}s | Total: ${tracks.length}\n\n`;
      tracks.forEach((t, i) => {
        txt += `*${i + 1}. ${t.title} (${t.duration || "Live"})*\n> 👤 *Channel:* ${t.channel}\n`;
      });
      txt += `\n_📌 *Cara Download:*_\n> Reply *[nomor] -mp3* untuk format *MP3*\n> Reply *[nomor] -mp4* untuk format *MP4*`;

      if (!sock.ytdlSession) sock.ytdlSession = {};
      sock.ytdlSession[m.sender] = { tracks, expired: Date.now() + 60000, isDone: false };
      await m.reply(txt);
    } catch (err) {
      console.error("[YT_SEARCH_ERR]", err);
      await m.reply(res.error);
    }
  },

  async after(m, { sock }) {
    const session = sock.ytdlSession?.[m.sender];
    if (!session || session.isDone) return;

    const input = (m.text || m.body || "").toLowerCase().trim();
    if (!input || Date.now() > session.expired) {
      if (Date.now() > session.expired) delete sock.ytdlSession[m.sender];
      return;
    }

    const args = input.split(" ");
    const index = parseInt(args[0], 10) - 1;
    const downloadType = args.includes("-mp4") ? "mp4" : "mp3";

    if (!isNaN(index) && index >= 0 && index < session.tracks.length) {
      const targetTrack = session.tracks[index];
      session.isDone = true;
      delete sock.ytdlSession[m.sender];

      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

      try {
        const fileData = await fetchDownloadUrl(targetTrack.url, downloadType);

        if (downloadType === "mp3") {
          const randomId = crypto.randomBytes(4).toString("hex");
          const rawFile = path.join(tmpdir(), `raw_${randomId}.mp3`);
          const compressedFile = path.join(tmpdir(), `ready_${randomId}.mp3`);

          try {
            await downloadToFile(fileData.fileUrl, rawFile);
          } catch {
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            return m.reply(res.error("Gagal mengunduh audio dari server."));
          }

          exec(`"${ffmpegInstaller.path}" -i "${rawFile}" -b:a 128k -map a "${compressedFile}" -y`, async (err) => {
            const sendPath = err ? rawFile : compressedFile;
            await sock.sendMessage(m.from, { audio: fs.readFileSync(sendPath), ptt: false, mimetype: "audio/mpeg" }, { quoted: m });
            try {
              if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile);
              if (fs.existsSync(compressedFile)) fs.unlinkSync(compressedFile);
            } catch {}
          });
        } else {
          await sock.sendMessage(
            m.from,
            { video: { url: fileData.fileUrl }, caption: `🎬 *${targetTrack.title}*`, mimetype: "video/mp4" },
            { quoted: m }
          );
        }

        await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
      } catch (err) {
        console.error("[YT_DL_ERR]", err);
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        await m.reply(res.error);
      }
    }
  },
};
