import { createDecipheriv, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import yts from "yt-search";
import sharp from "sharp";
import { prepareWAMessageMedia } from "baileys";
import { res } from "../../src/response.js";

const METADATA_DECRYPTION_KEY = Buffer.from("C5D58EF67A7584E4A29F6C35BBC4EB12", "hex");
const HEADERS = {
  "Content-Type": "application/json",
  Origin: "https://yt.savetube.me",
  "User-Agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36",
};

const MAX_ORIGINAL_AUDIO_SIZE = 25 * 1024 * 1024;
const MAX_COMPRESSED_AUDIO_SIZE = 6 * 1024 * 1024;
const MAX_BASE64_AUDIO_SIZE = 8 * 1024 * 1024;
const DEFAULT_THUMB = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iIzFhMGQxMiIvPjx0ZXh0IHg9IjIwMCIgeT0iMjEwIiBmb250LXNpemU9IjM0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+TUFJTiBQQ0xBWUVSPC90ZXh0Pjwvc3ZnPg==";

const escapeHtml = (text = "") =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const isYouTubeUrl = (text = "") => /(?:youtube\.com|youtu\.be)/i.test(text);

const extractYouTubeId = (url = "") => {
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
  return match?.[1] || null;
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `HTTP ${response.status}`);
  return data;
}

async function savetube(url, { downloadType = "audio", quality = "128kbps" } = {}) {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error("URL YouTube tidak valid");

  const cdnRes = await fetchJson("https://media.savetube.vip/api/random-cdn", { headers: HEADERS });
  if (!cdnRes?.cdn) throw new Error("CDN SaveTube tidak tersedia");

  const cdn = String(cdnRes.cdn).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const info = await fetchJson(`https://${cdn}/v2/info`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` }),
  });
  if (!info?.data) throw new Error("Metadata SaveTube kosong");

  const encrypted = Buffer.from(info.data, "base64");
  const decipher = createDecipheriv("aes-128-cbc", METADATA_DECRYPTION_KEY, encrypted.subarray(0, 16));
  const metadata = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(16)), decipher.final()]).toString("utf8"));
  if (!metadata?.key) throw new Error("Key download SaveTube tidak ditemukan");

  const download = await fetchJson(`https://${cdn}/download`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ id: videoId, downloadType, quality, key: metadata.key }),
  });
  if (!download?.data?.downloadUrl) throw new Error(download?.message || "URL audio tidak tersedia");

  return {
    title: metadata.title || "Unknown",
    duration: metadata.durationLabel || "0:00",
    thumbnail: metadata.thumbnail || "",
    url: download.data.downloadUrl,
  };
}

async function savetubeRetry(url, options = {}, retry = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retry; attempt++) {
    try {
      return await savetube(url, options);
    } catch (err) {
      lastError = err;
      if (attempt < retry) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastError || new Error("SaveTube gagal");
}

async function downloadAudioBuffer(url) {
  const response = await fetch(url, { headers: { "User-Agent": HEADERS["User-Agent"] } });
  if (!response.ok) throw new Error(`Download audio gagal (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_ORIGINAL_AUDIO_SIZE) throw new Error("Audio terlalu besar.");
  return buffer;
}

function compressAudio(inputBuffer) {
  return new Promise((resolve, reject) => {
    const ffmpegProc = spawn(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-c:a", "libopus", "-b:a", "17k", "-ar", "48000", "-ac", "1", "-application", "audio", "-f", "ogg", "pipe:1"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const chunks = [];
    let outputSize = 0;
    ffmpegProc.stdout.on("data", (chunk) => {
      outputSize += chunk.length;
      if (outputSize > MAX_COMPRESSED_AUDIO_SIZE) {
        ffmpegProc.kill("SIGKILL");
        reject(new Error("Audio hasil compress terlalu besar."));
        return;
      }
      chunks.push(chunk);
    });

    ffmpegProc.on("error", reject);
    ffmpegProc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`FFmpeg error (${code})`));
      resolve(Buffer.concat(chunks));
    });

    ffmpegProc.stdin.on("error", () => {});
    ffmpegProc.stdin.end(inputBuffer);
  });
}

async function getThumb(url) {
  try {
    if (!url) return Buffer.alloc(0);
    const resp = await fetch(url);
    if (!resp.ok) return Buffer.alloc(0);
    const raw = Buffer.from(await resp.arrayBuffer());
    return await sharp(raw).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
  } catch {
    return Buffer.alloc(0);
  }
}

function createMusicPlayer({ title, artist, duration, audioSrc, imageSrc }) {
  const safeTitle = escapeHtml(title || "Unknown");
  const safeArtist = escapeHtml(artist || "YouTube");
  const safeDuration = escapeHtml(duration || "0:00");
  const safeImage = imageSrc || DEFAULT_THUMB;
  const safeAudio = String(audioSrc || "");

  return `
<style>
:root{--ink:#fff;--muted:#b9b1b6}*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{background:transparent;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh}
.wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px 12px}
.player{position:relative;width:100%;max-width:330px;border-radius:18px;overflow:hidden;background:#1a0d12;box-shadow:0 18px 40px rgba(0,0,0,.5)}
.bg{position:absolute;inset:-30%;width:160%;height:160%;object-fit:cover;filter:blur(38px) saturate(1.5);opacity:.85;z-index:0}
.veil{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(20,8,12,.55) 0%,rgba(20,8,12,.72) 45%,rgba(12,5,8,.94) 100%)}
.content{position:relative;z-index:2;padding:16px 18px 20px}
.head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}
.head__icon{width:18px;height:18px;color:var(--ink);opacity:.85;flex:none}
.head__mid{text-align:center;flex:1;min-width:0}
.head__from{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.head__album{font-size:12px;font-weight:600;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.poster{width:100%;aspect-ratio:1;border-radius:10px;overflow:hidden;background:rgba(255,255,255,.06);box-shadow:0 12px 26px rgba(0,0,0,.45);margin-bottom:18px}
.poster img{width:100%;height:100%;object-fit:cover;display:block}
.info{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px}
.info__names{min-width:0}.info__title{font-size:17px;font-weight:600;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.info__artist{font-size:12px;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar{position:relative;height:4px;border-radius:4px;background:rgba(255,255,255,.22);cursor:pointer;margin-bottom:7px;touch-action:none}
.bar__fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:4px;background:#fff;pointer-events:none}
.bar__dot{position:absolute;top:50%;left:0;width:11px;height:11px;border-radius:50%;background:#fff;transform:translate(-50%,-50%);pointer-events:none}
.time{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:14px;font-variant-numeric:tabular-nums}
.controls{display:flex;align-items:center;justify-content:center;gap:20px}
.play{width:56px;height:56px;border-radius:50%;background:#fff;color:#12070b;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.4)}
.play svg{width:26px;height:26px}.play:active{transform:scale(.93)}
</style>
<div class="wrap"><div class="player">
  <img class="bg" src="${safeImage}" alt=""><div class="veil"></div>
  <div class="content">
    <div class="head">
      <div class="head__mid"><div class="head__from">Playing from search</div><div class="head__album">${safeArtist}</div></div>
    </div>
    <div class="poster"><img src="${safeImage}" alt="${safeTitle}"></div>
    <div class="info">
      <div class="info__names"><div class="info__title">${safeTitle}</div><div class="info__artist">${safeArtist}</div></div>
    </div>
    <div class="bar" id="bar"><div class="bar__fill" id="fill"></div><div class="bar__dot" id="dot"></div></div>
    <div class="time"><span id="cur">0:00</span><span id="dur">${safeDuration}</span></div>
    <div class="controls">
      <button class="play" id="play" type="button">
        <svg id="icon-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8a.6.6 0 0 0 .92.5l10-6.4a.6.6 0 0 0 0-1l-10-6.4a.6.6 0 0 0-.92.5z"/></svg>
        <svg id="icon-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6.5" y="5" width="3.8" height="14" rx="1"/><rect x="13.7" y="5" width="3.8" height="14" rx="1"/></svg>
      </button>
    </div>
  </div>
</div></div>
<audio id="audio" preload="metadata" src="${safeAudio}"></audio>
<script>
(function(){
  const audio=document.getElementById('audio'),play=document.getElementById('play'),bar=document.getElementById('bar'),fill=document.getElementById('fill'),dot=document.getElementById('dot'),cur=document.getElementById('cur'),dur=document.getElementById('dur'),iconPlay=document.getElementById('icon-play'),iconPause=document.getElementById('icon-pause');
  if(!audio||!play)return;
  function fmt(s){if(!Number.isFinite(s)||s<0)return'0:00';return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');}
  function setPlay(p){iconPlay.style.display=p?'none':'block';iconPause.style.display=p?'block':'none';}
  play.onclick=()=>{if(audio.paused)audio.play();else audio.pause();};
  audio.onplay=()=>setPlay(true);
  audio.onpause=()=>setPlay(false);
  audio.onended=()=>{setPlay(false);fill.style.width='0%';dot.style.left='0%';if(cur)cur.textContent='0:00';};
  audio.ontimeupdate=()=>{
    if(!audio.duration)return;
    const p=(audio.currentTime/audio.duration)*100;
    fill.style.width=p+'%';dot.style.left=p+'%';
    if(cur)cur.textContent=fmt(audio.currentTime);
  };
  audio.onloadedmetadata=()=>{if(dur)dur.textContent=fmt(audio.duration);};
  bar.onpointerdown=(e)=>{
    const r=bar.getBoundingClientRect();
    audio.currentTime=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*audio.duration;
  };
})();
</script>`;
}

async function sendMusicPlayer(conn, targetJid, html) {
  const responseId = randomUUID();
  const unifiedData = {
    response_id: responseId,
    sections: [{ view_model: { primitive: { __typename: "GenAIaeacdsnwHtmlPrimitive", payload: html, trusted_sources: [] }, __typename: "GenAISingleLayoutViewModel" } }],
  };

  await conn.relayMessage(
    targetJid,
    {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2, botMetadata: { messageDisclaimerText: "", botResponseId: responseId } },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [{ messageType: 2, messageText: "Music Player" }],
            unifiedResponse: { data: Buffer.from(JSON.stringify(unifiedData)).toString("base64") },
            contextInfo: { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" }, forwardOrigin: 4 },
          },
        },
      },
    },
    { messageId: responseId }
  );
}

export default {
  cmd: ["play", "playsf"],
  category: "download",
  desc: "Putar lagu YouTube dengan player interaktif",
  exec: async (m, { sock, query, text, command, usedPrefix }) => {
    const conn = sock || m.conn;
    const inputQuery = query || text;
    if (!inputQuery?.trim()) return m.reply(res.format(m.prefix ?? usedPrefix ?? ".", command, "chase atlantic", "Cari judul lagu atau masukkan URL YouTube"));

    await conn.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    try {
      let input = inputQuery.trim();
      if (!isYouTubeUrl(input)) {
        const search = await yts(input);
        if (!search?.videos?.length) throw new Error("Lagu tidak ditemukan");
        input = search.videos[0].url;
      }

      const detail = await yts(input);
      const vid = detail?.videos?.[0];
      if (!vid) throw new Error("Video YouTube tidak ditemukan");

      const thumb = await getThumb(vid.thumbnail);
      let imageSrc = thumb?.length ? `data:image/jpeg;base64,${thumb.toString("base64")}` : "";

      const audio = await savetubeRetry(vid.url || input, { downloadType: "audio", quality: "128kbps" }, 3);
      const originalBuffer = await downloadAudioBuffer(audio.url);
      const compressedBuffer = await compressAudio(originalBuffer);

      const audioSrc = `data:audio/ogg;base64,${compressedBuffer.toString("base64")}`;
      if (Buffer.byteLength(audioSrc, "utf8") > MAX_BASE64_AUDIO_SIZE) throw new Error("Audio Base64 terlalu besar.");

      const html = createMusicPlayer({
        title: audio.title || vid.title,
        artist: vid.author?.name || "YouTube",
        duration: audio.duration || vid.timestamp,
        audioSrc,
        imageSrc,
      });

      await sendMusicPlayer(conn, m.from || m.chat, html);
      await conn.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (error) {
      console.error("[PLAY ERROR]", error);
      await conn.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await conn.sendMessage(m.from || m.chat, { text: `❌ Gagal mengambil audio: ${error.message || error}` }, { quoted: m });
    }
  },
};
