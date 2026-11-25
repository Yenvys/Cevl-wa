import { createDecipheriv, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import yts from "yt-search";
import sharp from "sharp";
import { prepareWAMessageMedia } from "baileys";

const METADATA_KEY = Buffer.from("C5D58EF67A7584E4A29F6C35BBC4EB12", "hex");
const HEADERS = {
  "Content-Type": "application/json",
  Origin: "https://yt.savetube.me",
  "User-Agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36",
};
const MAX_ORIGINAL_SIZE = 25 * 1024 * 1024;
const MAX_COMPRESSED_SIZE = 6 * 1024 * 1024;
const MAX_BASE64_SIZE = 8 * 1024 * 1024;
const DEFAULT_THUMB = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iIzFhMGQxMiIvPjx0ZXh0IHg9IjIwMCIgeT0iMjEwIiBmb250LXNpemU9IjM0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+VFJPTVBFVCBQTEFZRVI8L3RleHQ+PC9zdmc+";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeHtml = (text = "") =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const isYouTubeUrl = (url = "") => /(?:youtube\.com|youtu\.be)/i.test(url);
const extractYouTubeId = (url = "") => String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/)?.[1] || null;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
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
  const decipher = createDecipheriv("aes-128-cbc", METADATA_KEY, encrypted.subarray(0, 16));
  const decrypted = Buffer.concat([decipher.update(encrypted.subarray(16)), decipher.final()]);
  const metadata = JSON.parse(decrypted.toString("utf8"));

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
  for (let i = 1; i <= retry; i++) {
    try {
      return await savetube(url, options);
    } catch (err) {
      lastError = err;
      if (i < retry) await sleep(1500);
    }
  }
  throw lastError || new Error("SaveTube gagal");
}

async function downloadAudioBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": HEADERS["User-Agent"] } });
  if (!res.ok) throw new Error(`Download gagal (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ORIGINAL_SIZE) throw new Error("Audio terlalu besar (maks 25 MB)");
  return buf;
}

function compressAudio(inputBuffer) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-c:a", "libopus", "-b:a", "17k", "-ar", "48000", "-ac", "1", "-application", "audio", "-f", "ogg", "pipe:1"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const chunks = [];
    const errors = [];
    let size = 0;
    let done = false;

    const fail = (err) => {
      if (done) return;
      done = true;
      try { ffmpeg.kill("SIGKILL"); } catch {}
      reject(err);
    };

    ffmpeg.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_COMPRESSED_SIZE) return fail(new Error("Audio hasil kompresi terlalu besar"));
      chunks.push(chunk);
    });
    ffmpeg.stderr.on("data", (chunk) => errors.push(chunk.toString()));
    ffmpeg.on("error", fail);
    ffmpeg.on("close", (code) => {
      if (done) return;
      if (code !== 0) return fail(new Error(`FFmpeg error (${code}): ${errors.join("").trim()}`));
      done = true;
      resolve(Buffer.concat(chunks));
    });
    ffmpeg.stdin.on("error", (e) => e.code !== "EPIPE" && fail(e));
    ffmpeg.stdin.end(inputBuffer);
  });
}

async function getThumb(url) {
  try {
    if (!url) return Buffer.alloc(0);
    const res = await fetch(url);
    if (!res.ok) return Buffer.alloc(0);
    const raw = Buffer.from(await res.arrayBuffer());
    return await sharp(raw).resize(1280, 720, { fit: "cover", position: "center" }).jpeg({ quality: 90 }).toBuffer();
  } catch {
    return Buffer.alloc(0);
  }
}

function createTrumpetPlayer({ title, artist, duration, audioSrc, imageSrc }) {
  const sTitle = escapeHtml(title || "Unknown Trumpet");
  const sArtist = escapeHtml(artist || "Trumpet Solo");
  const sDuration = escapeHtml(duration || "0:00");
  const sImage = imageSrc || DEFAULT_THUMB;
  const sAudio = String(audioSrc || "");

  return `<style>
    :root { --ink: #ffffff; --muted: #e5c158; }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    html, body { background:transparent; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; min-height:100vh; }
    .wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px 12px; }
    .player { position:relative; width:100%; max-width:330px; border-radius:18px; overflow:hidden; background:#1a1400; box-shadow:0 18px 40px rgba(0,0,0,.6); }
    .bg { position:absolute; inset:-30%; width:160%; height:160%; object-fit:cover; filter:blur(38px) saturate(1.8); opacity:.85; z-index:0; }
    .veil { position:absolute; inset:0; z-index:1; background:linear-gradient(180deg,rgba(30,22,5,.6) 0%,rgba(20,15,2,.8) 45%,rgba(10,8,0,.96) 100%); }
    .content { position:relative; z-index:2; padding:16px 18px 20px; }
    .head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:16px; }
    .head__icon { width:18px; height:18px; color:#ffd700; opacity:.85; flex:none; }
    .head__mid { text-align:center; flex:1; min-width:0; }
    .head__from { font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
    .head__album { font-size:12px; font-weight:600; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#fff; }
    .poster { width:100%; aspect-ratio:1; border-radius:10px; overflow:hidden; background:rgba(255,255,255,.06); box-shadow:0 12px 26px rgba(0,0,0,.5); margin-bottom:18px; }
    .poster img { width:100%; height:100%; object-fit:cover; display:block; }
    .info { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:14px; }
    .info__names { min-width:0; }
    .info__title { font-size:17px; font-weight:600; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .info__artist { font-size:12px; color:var(--muted); margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .bar { position:relative; height:4px; border-radius:4px; background:rgba(255,255,255,.22); cursor:pointer; margin-bottom:7px; touch-action:none; }
    .bar__fill { position:absolute; left:0; top:0; bottom:0; width:0; border-radius:4px; background:#ffd700; pointer-events:none; }
    .bar__dot { position:absolute; top:50%; left:0; width:11px; height:11px; border-radius:50%; background:#ffd700; transform:translate(-50%,-50%); pointer-events:none; }
    .time { display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-bottom:14px; font-variant-numeric:tabular-nums; }
    .controls { display:flex; align-items:center; justify-content:center; gap:20px; }
    .play { width:56px; height:56px; border-radius:50%; background:#ffd700; color:#12070b; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(0,0,0,.4); }
    .play svg { width:26px; height:26px; }
    .note { margin-top:14px; text-align:center; font-size:10px; color:var(--muted); }
  </style>
  <div class="wrap"><div class="player">
    <img class="bg" src="${sImage}"><div class="veil"></div>
    <div class="content">
      <div class="head">
        <div class="head__mid"><div class="head__from">TRUMPET SOLO PLAYER</div><div class="head__album">${sArtist}</div></div>
      </div>
      <div class="poster"><img src="${sImage}" alt="${sTitle}"></div>
      <div class="info"><div class="info__names"><div class="info__title">${sTitle}</div><div class="info__artist">${sArtist}</div></div></div>
      <div class="bar" id="bar"><div class="bar__fill" id="fill"></div><div class="bar__dot" id="dot"></div></div>
      <div class="time"><span id="cur">0:00</span><span id="dur">${sDuration}</span></div>
      <div class="controls">
        <button class="play" id="play" type="button" aria-label="Putar">
          <svg id="icon-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8a.6.6 0 0 0 .92.5l10-6.4a.6.6 0 0 0 0-1l-10-6.4a.6.6 0 0 0-.92.5z"/></svg>
          <svg id="icon-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6.5" y="5" width="3.8" height="14" rx="1"/><rect x="13.7" y="5" width="3.8" height="14" rx="1"/></svg>
        </button>
      </div>
      <div class="note">🎺 Special Trumpet Player</div>
    </div>
  </div></div>
  <audio id="audio" preload="metadata" src="${sAudio}"></audio>
  <script>
    (function () {
      const a = document.getElementById('audio'), p = document.getElementById('play'), b = document.getElementById('bar'),
        f = document.getElementById('fill'), d = document.getElementById('dot'), c = document.getElementById('cur'),
        du = document.getElementById('dur'), ip = document.getElementById('icon-play'), ipa = document.getElementById('icon-pause');
      if (!a || !p || !b || !f || !d) return;
      const fmt = (s) => (!Number.isFinite(s) || s < 0) ? '0:00' : Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2, '0');
      const prog = () => {
        if (!Number.isFinite(a.duration) || a.duration <= 0) return;
        const pc = Math.max(0, Math.min(100, (a.currentTime / a.duration) * 100));
        f.style.width = pc + '%'; d.style.left = pc + '%';
        if (c) c.textContent = fmt(a.currentTime);
      };
      p.onclick = () => a.paused ? a.play() : a.pause();
      b.onpointerdown = (e) => {
        const r = b.getBoundingClientRect();
        a.currentTime = Math.max(0, Math.min(e.clientX - r.left, r.width)) / r.width * a.duration;
        prog();
      };
      a.onloadedmetadata = () => { if (du) du.textContent = fmt(a.duration); };
      a.ontimeupdate = prog;
      a.onplay = () => { ip.style.display = 'none'; ipa.style.display = 'block'; };
      a.onpause = () => { ip.style.display = 'block'; ipa.style.display = 'none'; };
      a.onended = () => { a.onpause(); f.style.width = '0%'; d.style.left = '0%'; if (c) c.textContent = '0:00'; };
    })();
  </script>`;
}

async function sendMusicPlayer(conn, m, html) {
  const targetJid = m.from || m.chat;
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
            submessages: [{ messageType: 2, messageText: "Trumpet Player" }],
            unifiedResponse: { data: Buffer.from(JSON.stringify(unifiedData)).toString("base64") },
            contextInfo: { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" }, forwardOrigin: 4 },
          },
        },
      },
    },
    { messageId: responseId },
  );
}

export default {
  cmd: ["trompet", "trumpet", "playtrompet"],
  category: "download",
  desc: "Memutar instrumen trompet dengan player HTML gold",

  exec: async (m, { sock, query, text }) => {
    const conn = sock || m.conn;
    let inputQuery = query || text;

    if (!inputQuery?.trim()) {
      inputQuery = "trumpet solo instrument";
    } else if (!isYouTubeUrl(inputQuery) && !inputQuery.toLowerCase().includes("trumpet") && !inputQuery.toLowerCase().includes("trompet")) {
      inputQuery = `${inputQuery} trumpet cover`;
    }

    const react = (emoji) => conn.sendMessage(m.from || m.chat, { react: { text: emoji, key: m.key } });
    await react("🎺");

    try {
      let input = inputQuery.trim();
      if (!isYouTubeUrl(input)) {
        const search = await yts(input);
        if (!search?.videos?.length) throw new Error("Lagu trompet tidak ditemukan");
        input = search.videos[0].url;
      }

      const detail = await yts(input);
      const vid = detail?.videos?.[0];
      if (!vid) throw new Error("Video YouTube tidak ditemukan");

      const thumb = await getThumb(vid.thumbnail);
      if (thumb?.length && typeof prepareWAMessageMedia === "function") {
        await prepareWAMessageMedia({ image: thumb }, { upload: conn.waUploadToServer, mediaTypeOverride: "thumbnail-link" }).catch(() => null);
      }

      const imageSrc = thumb?.length ? `data:image/jpeg;base64,${thumb.toString("base64")}` : "";
      const audio = await savetubeRetry(vid.url || input, { downloadType: "audio", quality: "128kbps" }, 3);
      if (!audio?.url) throw new Error("URL audio tidak tersedia");

      const originalBuffer = await downloadAudioBuffer(audio.url);
      const compressedBuffer = await compressAudio(originalBuffer);
      const audioSrc = "data:audio/ogg;base64," + compressedBuffer.toString("base64");

      if (Buffer.byteLength(audioSrc, "utf8") > MAX_BASE64_SIZE) {
        throw new Error("Audio Base64 melebihi batas maksimal");
      }

      const html = createTrumpetPlayer({
        title: audio.title || vid.title || "Unknown Trumpet",
        artist: vid.author?.name || "Trumpet Artist",
        duration: audio.duration || vid.timestamp || "0:00",
        audioSrc,
        imageSrc,
      });

      await sendMusicPlayer(conn, m, html);
      await react("✅");
    } catch (error) {
      console.error("[TROMPET_ERR]", error);
      await react("❌");
      await conn.sendMessage(
        m.from || m.chat,
        { text: `❌ Gagal memuat trompet:\n> ${error.message || String(error)}` },
        { quoted: m },
      ).catch(() => {});
    }
  },
};
