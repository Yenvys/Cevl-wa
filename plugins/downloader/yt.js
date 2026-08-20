/**
 * plugins/ytdl.js
 * Fitur cari YouTube + auto-downloader MP3/MP4 via reply format dinamis (Index -mp3/-mp4)
 */

import axios from "axios";
import crypto from "crypto";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { res } from '../src/response.js';

async function downloadToFile(url, dest) {
    const writer = fs.createWriteStream(dest);
    const response = await axios.get(url, { responseType: 'stream', maxRedirects: 5 });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}


const YT_HEADERS = {
    "content-type": "application/json",
    "x-youtube-client-name": "1",
    "x-youtube-client-version": "2.20260521.00.00",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
};

const CONTEXT = {
    context: {
        client: {
            hl: "en",
            gl: "ID",
            clientName: "WEB",
            clientVersion: "2.20260521.00.00",
            platform: "DESKTOP",
        },
    },
};

const DL_PROXY = "https://app.ytdown.to/proxy.php";
const DL_HEADERS = {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": "https://app.ytdown.to",
    "referer": "https://app.ytdown.to/en27/",
    "user-agent": "Mozilla/5.0",
    "x-requested-with": "XMLHttpRequest",
};

async function ytRequest(endpoint, body) {
    const url = `https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`;
    const { data } = await axios.post(url, body, { headers: YT_HEADERS });
    return data;
}

async function searchYoutube(query) {
    const json = await ytRequest("search", { ...CONTEXT, query });
    const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    
    return contents.flatMap((section) => {
        const items = section.itemSectionRenderer?.contents || [];
        return items
            .map((item) => item.videoRenderer)
            .filter(Boolean)
            .map((v) => ({
                videoId: v.videoId,
                title: v.title?.runs?.map((x) => x.text)?.join("") || null,
                channel: v.ownerText?.runs?.[0]?.text || null,
                views: v.viewCountText?.simpleText || null,
                duration: v.lengthText?.simpleText || null,
                thumbnail: v.thumbnail?.thumbnails?.at(-1)?.url || null,
                url: `https://youtube.com/watch?v=${v.videoId}`,
            }));
    });
}

async function fetchDownloadUrl(youtubeUrl, targetType = "mp3") {
    try {
        const apiKey = process.env.JEREXD_API_KEY;
        if (!apiKey) throw new Error("JEREXD_API_KEY tidak dikonfigurasi di .env");
        const res = await axios.get(`https://api.jerexd.my.id/api/downloader/youtube?apikey=${apiKey}&url=${encodeURIComponent(youtubeUrl)}&format=${targetType}`);
        const result = res.data?.result;
        
        if (!result || !result.download) throw new Error("Format media tidak ditemukan dari API.");
        
        return {
            type: targetType === 'mp3' ? 'audio' : 'video',
            quality: targetType === 'mp4' ? 'Unknown' : '128k',
            fileName: result.title || 'yt_download',
            fileUrl: result.download,
            size: 'Unknown'
        };
    } catch (e) {
        throw new Error(e.response?.data?.message || e.message);
    }
}

export default {
    cmd: ['ytdl', 'ytsearch'],
    category: 'download',
    desc: 'Mencari video YouTube dan mendownload format MP3/MP4 berdasarkan suffix argumen reply.',
    
    exec: async (m, { sock, query, command }) => {
        if (!query) {
            return m.reply(res.format(m.prefix, command, `Vivarium`));
        }

        const start = Date.now();
        await m.reply(`_*Searching "${query}" on YouTube... Please wait..*_`);

        try {
            const results = await searchYoutube(query);
            const tracks = results.slice(0, 5);

            if (tracks.length === 0) {
                return m.reply(`_Video *"${query}"* tidak ditemukan._`);
            }

            const speed = ((Date.now() - start) / 1000).toFixed(2);
            let txt = `*YOUTUBE DOWNLOADER*\n`;
            txt += `> _Query: "${query}"_\n`;
            txt += `> Speed: ${speed}s | Total: ${tracks.length}\n\n`;

            const savedData = [];

            tracks.forEach((track, i) => {
                txt += `*${i + 1}. ${track.title} (${track.duration || "Live"})*\n`;
                txt += `> 👤 *Channel:* ${track.channel}\n`;
                savedData.push({ url: track.url, title: track.title });
            });

            txt += `\n_📌 *Cara Download:*_\n`;
            txt += `> Reply *[nomor] -mp3* untuk format *MP3*\n`;
            txt += `> Reply *[nomor] -mp4* untuk format *MP4*`;

            if (!sock.ytdlSession) sock.ytdlSession = {};
            sock.ytdlSession[m.sender] = {
                tracks: savedData,
                expired: Date.now() + 60000,
                isDone: false
            };

            await m.reply(txt);

        } catch (err) {
            console.error('[YT_SEARCH_ERR]', err);
            await m.reply(res.error);
        }
    },

    async after(m, { sock }) {
        const session = sock.ytdlSession?.[m.sender];
        if (!session || session.isDone) return;

        const input = (m.text || m.body || "").toLowerCase().trim();
        if (!input) return;

        if (Date.now() > session.expired) {
            delete sock.ytdlSession[m.sender];
            return;
        }

        const args = input.split(" ");
        const index = parseInt(args[0]) - 1;
        
        let downloadType = "mp3";
        if (args.includes("-mp4")) {
            downloadType = "mp4";
        }

        if (!isNaN(index) && index >= 0 && index < session.tracks.length) {
            const targetTrack = session.tracks[index];
            if (!targetTrack) return m.reply("Data track hilang dari sesi.");

            session.isDone = true;
            delete sock.ytdlSession[m.sender];

            await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

            try {
                const fileData = await fetchDownloadUrl(targetTrack.url, downloadType);

                if (downloadType === "mp3") {
                    const randomId = crypto.randomBytes(4).toString('hex');
                    const rawFile = path.join(tmpdir(), `raw_${randomId}.mp3`);
                    const compressedFile = path.join(tmpdir(), `ready_${randomId}.mp3`);

                    // Download the file locally first using Axios to bypass FFmpeg 'overlong headers' and Baileys Boom crash
                    try {
                        await downloadToFile(fileData.fileUrl, rawFile);
                    } catch (dlErr) {
                        console.error("[AXIOS_DL_ERR]", dlErr);
                        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
                        return m.reply("_Gagal mengunduh audio dari server._");
                    }

                    exec(`"${ffmpegInstaller.path}" -i "${rawFile}" -b:a 128k -map a "${compressedFile}" -y`, async (err) => {
                        if (err) {
                            console.error("[FFMPEG_ERR]", err);
                            // Fallback to sending the raw file if compression fails
                            await sock.sendMessage(m.from, { 
                                audio: fs.readFileSync(rawFile), 
                                ptt: false, 
                                mimetype: 'audio/mpeg'
                            }, { quoted: m });
                        } else {
                            // Send the compressed file
                            await sock.sendMessage(m.from, { 
                                audio: fs.readFileSync(compressedFile), 
                                ptt: false, 
                                mimetype: 'audio/mpeg'
                            }, { quoted: m });
                        }
                        
                        // Cleanup temp files
                        try {
                            if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile);
                            if (fs.existsSync(compressedFile)) fs.unlinkSync(compressedFile);
                        } catch (e) {}
                    });

                } else {
                    let videoCaption = `『 *YOUTUBE VIDEO DOWNLOADER* 』\n\n` +
                                       ` *Judul:* ${targetTrack.title}\n` +
                                       ` *Nama :* ${fileData.fileName}\n` +
                                       ` *Ukuran:* ${fileData.size || "Unknown"}\n` +
                                       ` *Resolusi:* ${fileData.quality}\n\n` +
                                       `_Sukses mengekstrak video dari YouTube._`;

                    await sock.sendMessage(m.from, { 
                        video: { url: fileData.fileUrl }, 
                        caption: videoCaption,
                        mimetype: 'video/mp4'
                    }, { quoted: m });
                }

                await sock.sendMessage(m.from, { react: { text: "", key: m.key } });

            } catch (err) {
                console.error('[YT_DL_ERR]', err);
                await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
                await m.reply(res.error);
            }
        }
    }
};