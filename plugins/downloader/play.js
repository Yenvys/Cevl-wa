// plugins/downloader/kk.js
// YouTube Play + SaveTube + FFmpeg Compress + Base64 HTML Music Player
// ESM Plugin - Christy MD
'use strict'
import { createDecipheriv, randomUUID } from 'crypto'
import { spawn } from 'child_process'
import yts from 'yt-search'
import sharp from 'sharp'
import { prepareWAMessageMedia } from 'baileys'

/* =========================================================
 * CONFIG
 * ========================================================= */
const METADATA_DECRYPTION_KEY = Buffer.from(
  'C5D58EF67A7584E4A29F6C35BBC4EB12',
  'hex'
)
const HEADERS = {
  'Content-Type': 'application/json',
  Origin: 'https://yt.savetube.me',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'
}
const FFMPEG_CODEC = 'libopus'
const FFMPEG_BITRATE = '17k'
const FFMPEG_SAMPLE_RATE = '48000'
const FFMPEG_CHANNELS = '1'
const FFMPEG_FORMAT = 'ogg'
const MAX_ORIGINAL_AUDIO_MB = 25
const MAX_ORIGINAL_AUDIO_SIZE = MAX_ORIGINAL_AUDIO_MB * 1024 * 1024
const MAX_COMPRESSED_AUDIO_MB = 6
const MAX_COMPRESSED_AUDIO_SIZE = MAX_COMPRESSED_AUDIO_MB * 1024 * 1024
const MAX_BASE64_AUDIO_MB = 8
const MAX_BASE64_AUDIO_SIZE = MAX_BASE64_AUDIO_MB * 1024 * 1024
const DEFAULT_THUMB =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iIzFhMGQxMiIvPjx0ZXh0IHg9IjIwMCIgeT0iMjEwIiBmb250LXNpemU9IjM0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+TUFJTiBQQ0xBWUVSPC90ZXh0Pjwvc3ZnPg=='

/* =========================================================
 * HELPERS
 * ========================================================= */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
function formatError(error) {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  return error.message || String(error)
}
function isYouTubeUrl(text = '') {
  return /(?:youtube\.com|youtu\.be)/i.test(text)
}
function extractYouTubeId(url = '') {
  const match = String(url).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/
  )
  return match?.[1] || null
}
function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2)
}

/* =========================================================
 * SAVETUBE
 * ========================================================= */
async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  if (!response.ok) {
    throw new Error(
      data?.message || `HTTP ${response.status} ${response.statusText}`
    )
  }
  return data
}
async function savetube(url, { downloadType = 'audio', quality = '128kbps' } = {}) {
  const videoId = extractYouTubeId(url)
  if (!videoId) throw new Error('URL YouTube tidak valid')
  const cdnRes = await fetchJson('https://media.savetube.vip/api/random-cdn', {
    headers: HEADERS
  })
  if (!cdnRes?.cdn) throw new Error('CDN SaveTube tidak tersedia')
  const cdn = String(cdnRes.cdn)
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  const info = await fetchJson(`https://${cdn}/v2/info`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      url: `https://www.youtube.com/watch?v=${videoId}`
    })
  })
  if (!info?.data) throw new Error('Metadata SaveTube kosong')
  let metadata
  try {
    const encrypted = Buffer.from(info.data, 'base64')
    if (encrypted.length <= 16) {
      throw new Error('Encrypted metadata tidak valid')
    }
    const iv = encrypted.subarray(0, 16)
    const ciphertext = encrypted.subarray(16)
    const decipher = createDecipheriv(
      'aes-128-cbc',
      METADATA_DECRYPTION_KEY,
      iv
    )
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ])
    metadata = JSON.parse(decrypted.toString('utf8'))
  } catch (error) {
    console.error('[SAVETUBE DECRYPT]', error)
    throw new Error('Decrypt metadata SaveTube gagal')
  }
  if (!metadata?.key) {
    throw new Error('Key download SaveTube tidak ditemukan')
  }
  const download = await fetchJson(`https://${cdn}/download`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      id: videoId,
      downloadType,
      quality,
      key: metadata.key
    })
  })
  if (!download?.data?.downloadUrl) {
    throw new Error(
      download?.message || 'URL download audio tidak tersedia'
    )
  }
  return {
    title: metadata.title || 'Unknown',
    duration: metadata.durationLabel || '0:00',
    thumbnail: metadata.thumbnail || '',
    url: download.data.downloadUrl
  }
}
async function savetubeRetry(url, options = {}, retry = 3) {
  let lastError
  for (let attempt = 1; attempt <= retry; attempt++) {
    try {
      return await savetube(url, options)
    } catch (error) {
      lastError = error
      console.log(
        `[SAVETUBE] Retry ${attempt}/${retry}: ${formatError(error)}`
      )
      if (attempt < retry) await sleep(1500)
    }
  }
  throw lastError || new Error('SaveTube gagal')
}

/* =========================================================
 * DOWNLOAD + COMPRESS
 * ========================================================= */
async function downloadAudioBuffer(url) {
  if (!url) throw new Error('URL audio kosong')
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'
    }
  })
  if (!response.ok) {
    throw new Error(`Download audio gagal (${response.status})`)
  }
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_ORIGINAL_AUDIO_SIZE) {
    throw new Error(
      `Audio terlalu besar. Maksimal ${MAX_ORIGINAL_AUDIO_MB} MB`
    )
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) throw new Error('Buffer audio kosong')
  if (buffer.length > MAX_ORIGINAL_AUDIO_SIZE) {
    throw new Error(
      `Audio terlalu besar. Maksimal ${MAX_ORIGINAL_AUDIO_MB} MB`
    )
  }
  return buffer
}
async function compressAudio(inputBuffer) {
  if (!Buffer.isBuffer(inputBuffer) || !inputBuffer.length) {
    throw new Error('Input audio buffer kosong')
  }
  return new Promise((resolve, reject) => {
    let ffmpeg
    try {
      ffmpeg = spawn(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel', 'error',
          '-i', 'pipe:0',
          '-vn',
          '-c:a', FFMPEG_CODEC,
          '-b:a', FFMPEG_BITRATE,
          '-ar', FFMPEG_SAMPLE_RATE,
          '-ac', FFMPEG_CHANNELS,
          '-application', 'audio',
          '-f', FFMPEG_FORMAT,
          'pipe:1'
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      )
    } catch (error) {
      reject(error)
      return
    }
    const chunks = []
    const errors = []
    let outputSize = 0
    let finished = false
    const fail = error => {
      if (finished) return
      finished = true
      try { ffmpeg.kill('SIGKILL') } catch { }
      reject(error)
    }
    ffmpeg.stdout.on('data', chunk => {
      outputSize += chunk.length
      if (outputSize > MAX_COMPRESSED_AUDIO_SIZE) {
        fail(
          new Error(
            `Audio hasil compress terlalu besar. Maksimal ${MAX_COMPRESSED_AUDIO_MB} MB`
          )
        )
        return
      }
      chunks.push(chunk)
    })
    ffmpeg.stderr.on('data', chunk => {
      errors.push(chunk.toString())
    })
    ffmpeg.on('error', error => {
      if (error?.code === 'ENOENT') {
        fail(
          new Error(
            'FFmpeg tidak ditemukan. Install FFmpeg terlebih dahulu.'
          )
        )
        return
      }
      fail(error)
    })
    ffmpeg.on('close', code => {
      if (finished) return
      if (code !== 0) {
        fail(
          new Error(
            `FFmpeg gagal (${code}): ${errors.join('').trim() || 'unknown error'}`
          )
        )
        return
      }
      const output = Buffer.concat(chunks)
      if (!output.length) {
        fail(new Error('FFmpeg menghasilkan audio kosong'))
        return
      }
      finished = true
      resolve(output)
    })
    ffmpeg.stdin.on('error', error => {
      if (error?.code === 'EPIPE') return
      fail(error)
    })
    ffmpeg.stdin.end(inputBuffer)
  })
}

/* =========================================================
 * THUMBNAIL
 * ========================================================= */
async function getThumb(url) {
  try {
    if (!url) return Buffer.alloc(0)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Thumbnail gagal (${response.status})`)
    }
    const raw = Buffer.from(await response.arrayBuffer())
    if (!raw.length) return Buffer.alloc(0)
    return await sharp(raw)
      .resize(1280, 720, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 90 })
      .toBuffer()
  } catch (error) {
    console.error('[THUMB ERROR]', formatError(error))
    return Buffer.alloc(0)
  }
}
async function createHighQualityThumbnail(conn, thumbnail) {
  try {
    if (!thumbnail?.length) return null
    if (typeof prepareWAMessageMedia !== 'function') {
      console.warn('[THUMB] prepareWAMessageMedia tidak tersedia')
      return null
    }
    const result = await prepareWAMessageMedia(
      { image: thumbnail },
      {
        upload: conn.waUploadToServer,
        mediaTypeOverride: 'thumbnail-link'
      }
    )
    const imageMessage = result?.imageMessage
    if (imageMessage) {
      imageMessage.width = 1280
      imageMessage.height = 720
    }
    return imageMessage || null
  } catch (error) {
    console.error('[HQ THUMB ERROR]', formatError(error))
    return null
  }
}

/* =========================================================
 * MUSIC PLAYER
 * ========================================================= */
function createMusicPlayer({ title, artist, duration, audioSrc, imageSrc }) {
  const safeTitle = escapeHtml(title || 'Unknown')
  const safeArtist = escapeHtml(artist || 'YouTube')
  const safeDuration = escapeHtml(duration || '0:00')
  const safeImage = imageSrc || DEFAULT_THUMB
  const safeAudio = String(audioSrc || '')
  return `
<style>
:root {
  --ink: #ffffff;
  --muted: #b9b1b6;
}
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}
html,
body {
  background: transparent;
  color: var(--ink);
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
.wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 12px;
}
.player {
  position: relative;
  width: 100%;
  max-width: 330px;
  border-radius: 18px;
  overflow: hidden;
  background: #1a0d12;
  box-shadow:
    0 18px 40px
    rgba(0, 0, 0, .5);
}
.bg {
  position: absolute;
  inset: -30%;
  width: 160%;
  height: 160%;
  object-fit: cover;
  filter:
    blur(38px)
    saturate(1.5);
  opacity: .85;
  z-index: 0;
}
.veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(
      180deg,
      rgba(20, 8, 12, .55) 0%,
      rgba(20, 8, 12, .72) 45%,
      rgba(12, 5, 8, .94) 100%
    );
}
.content {
  position: relative;
  z-index: 2;
  padding:
    16px
    18px
    20px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 16px;
}
.head__icon {
  width: 18px;
  height: 18px;
  color: var(--ink);
  opacity: .85;
  flex: none;
}
.head__mid {
  text-align: center;
  flex: 1;
  min-width: 0;
}
.head__from {
  font-size: 9px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--muted);
}
.head__album {
  font-size: 12px;
  font-weight: 600;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.poster {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background:
    rgba(255,255,255,.06);
  box-shadow:
    0 12px 26px
    rgba(0,0,0,.45);
  margin-bottom: 18px;
}
.poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.info {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.info__names {
  min-width: 0;
}
.info__title {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info__artist {
  font-size: 12px;
  color: var(--muted);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info__heart {
  width: 34px;
  height: 34px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 0;
}
.info__heart svg {
  width: 19px;
  height: 19px;
}
.info__heart.is-on {
  color: #ff5c8a;
}
.info__heart.is-on svg {
  fill: currentColor;
}
.bar {
  position: relative;
  height: 4px;
  border-radius: 4px;
  background:
    rgba(255,255,255,.22);
  cursor: pointer;
  margin-bottom: 7px;
  touch-action: none;
}
.bar__fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0;
  border-radius: 4px;
  background: #fff;
  pointer-events: none;
}
.bar__dot {
  position: absolute;
  top: 50%;
  left: 0;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
  transform:
    translate(-50%, -50%);
  pointer-events: none;
}
.time {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 14px;
  font-variant-numeric:
    tabular-nums;
}
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ctrl {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.ctrl svg {
  width: 21px;
  height: 21px;
}
.ctrl.is-off {
  opacity: .32;
  cursor: default;
}
.play {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #fff;
  color: #12070b;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: 0;
  box-shadow:
    0 6px 16px
    rgba(0,0,0,.4);
  transition:
    transform .15s ease;
}
.play svg {
  width: 26px;
  height: 26px;
}
.play:active {
  transform: scale(.93);
}
.note {
  margin-top: 14px;
  text-align: center;
  font-size: 10px;
  color: var(--muted);
  line-height: 1.6;
}
</style>
<div class="wrap">
  <div class="player">
    <img
      class="bg"
      src="${safeImage}"
      alt=""
    >
    <div class="veil"></div>
    <div class="content">
      <div class="head">
        <svg
          class="head__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m6 9 6 6 6-6"/>
        </svg>
        <div class="head__mid">
          <div class="head__from">
            Playing from search
          </div>
          <div class="head__album">
            ${safeArtist}
          </div>
        </div>
        <svg
          class="head__icon"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle
            cx="12"
            cy="5"
            r="1.8"
          />
          <circle
            cx="12"
            cy="12"
            r="1.8"
          />
          <circle
            cx="12"
            cy="19"
            r="1.8"
          />
        </svg>
      </div>
      <div class="poster">
        <img
          src="${safeImage}"
          alt="${safeTitle}"
        >
      </div>
      <div class="info">
        <div class="info__names">
          <div class="info__title">
            ${safeTitle}
          </div>
          <div class="info__artist">
            ${safeArtist}
          </div>
        </div>
        <button
          class="info__heart"
          id="heart"
          type="button"
          aria-label="Suka"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2l1.6 1.6L12 21.6l7.2-7.2 1.6-1.6a5.1 5.1 0 0 0 0-7.2z"/>
          </svg>
        </button>
      </div>
      <div
        class="bar"
        id="bar"
      >
        <div
          class="bar__fill"
          id="fill"
        ></div>
        <div
          class="bar__dot"
          id="dot"
        ></div>
      </div>
      <div class="time">
        <span id="cur">
          0:00
        </span>
        <span id="dur">
          ${safeDuration}
        </span>
      </div>
      <div class="controls">
        <!-- SHUFFLE -->
        <button
          class="ctrl is-off"
          disabled
          type="button"
          aria-label="Acak"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M16 3h5v5"/>
            <path d="M4 20 21 3"/>
            <path d="M21 16v5h-5"/>
            <path d="m15 15 6 6"/>
            <path d="M4 4l5 5"/>
          </svg>
        </button>
        <!-- PREVIOUS -->
        <button
          class="ctrl is-off"
          disabled
          type="button"
          aria-label="Sebelumnya"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M6 5h2.5v14H6z"/>
            <path d="M20 5.5v13a.6.6 0 0 1-.93.5L10 13.1a.6.6 0 0 1 0-1l9.07-5.9a.6.6 0 0 1 .93.5z"/>
          </svg>
        </button>
        <!-- PLAY -->
        <button
          class="play"
          id="play"
          type="button"
          aria-label="Putar"
        >
          <svg
            id="icon-play"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M8 5.6v12.8a.6.6 0 0 0 .92.5l10-6.4a.6.6 0 0 0 0-1l-10-6.4a.6.6 0 0 0-.92.5z"/>
          </svg>
          <svg
            id="icon-pause"
            viewBox="0 0 24 24"
            fill="currentColor"
            style="display:none"
          >
            <rect
              x="6.5"
              y="5"
              width="3.8"
              height="14"
              rx="1"
            />
            <rect
              x="13.7"
              y="5"
              width="3.8"
              height="14"
              rx="1"
            />
          </svg>
        </button>
        <!-- NEXT -->
        <button
          class="ctrl is-off"
          disabled
          type="button"
          aria-label="Berikutnya"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M15.5 5H18v14h-2.5z"/>
            <path d="M4 5.5v13a.6.6 0 0 0 .93.5L14 13.1a.6.6 0 0 0 0-1L4.93 6.2A.6.6 0 0 0 4 6.7z"/>
          </svg>
        </button>
        <!-- REPEAT -->
        <button
          class="ctrl is-off"
          disabled
          type="button"
          aria-label="Ulang"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m17 2 4 4-4 4"/>
            <path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
            <path d="m7 22-4-4 4-4"/>
            <path d="M21 13v1a4 4 0 0 1-4 4H3"/>
          </svg>
        </button>
      </div>
      <div class="note">
        support terus kami yaaa
      </div>
    </div>
  </div>
</div>
<audio
  id="audio"
  preload="metadata"
  src="${safeAudio}"
></audio>
<script>
(function () {
  'use strict'
  const audio =
    document.getElementById('audio')
  const play =
    document.getElementById('play')
  const bar =
    document.getElementById('bar')
  const fill =
    document.getElementById('fill')
  const dot =
    document.getElementById('dot')
  const cur =
    document.getElementById('cur')
  const dur =
    document.getElementById('dur')
  const heart =
    document.getElementById('heart')
  const iconPlay =
    document.getElementById('icon-play')
  const iconPause =
    document.getElementById('icon-pause')
  if (
    !audio ||
    !play ||
    !bar ||
    !fill ||
    !dot
  ) {
    return
  }
  function formatTime(seconds) {
    if (
      !Number.isFinite(seconds) ||
      seconds < 0
    ) {
      return '0:00'
    }
    const minutes =
      Math.floor(
        seconds / 60
      )
    const secs =
      Math.floor(
        seconds % 60
      )
    return (
      minutes +
      ':' +
      String(secs).padStart(2, '0')
    )
  }
  function updateProgress() {
    if (
      !Number.isFinite(
        audio.duration
      ) ||
      audio.duration <= 0
    ) {
      return
    }
    const percent =
      Math.max(
        0,
        Math.min(
          100,
          (
            audio.currentTime /
            audio.duration
          ) * 100
        )
      )
    fill.style.width =
      percent + '%'
    dot.style.left =
      percent + '%'
    if (cur) {
      cur.textContent =
        formatTime(
          audio.currentTime
        )
    }
  }
  function setPlaying() {
    if (iconPlay) {
      iconPlay.style.display =
        'none'
    }
    if (iconPause) {
      iconPause.style.display =
        'block'
    }
    play.setAttribute(
      'aria-label',
      'Jeda'
    )
  }
  function setPaused() {
    if (iconPlay) {
      iconPlay.style.display =
        'block'
    }
    if (iconPause) {
      iconPause.style.display =
        'none'
    }
    play.setAttribute(
      'aria-label',
      'Putar'
    )
  }
  async function togglePlayback() {
    try {
      if (audio.paused) {
        await audio.play()
      } else {
        audio.pause()
      }
    } catch (error) {
      console.error(
        '[PLAYER]',
        error
      )
      setPaused()
    }
  }
  play.addEventListener(
    'click',
    togglePlayback
  )
  if (heart) {
    heart.addEventListener(
      'click',
      function () {
        heart.classList.toggle(
          'is-on'
        )
      }
    )
  }
  function seekFromEvent(event) {
    if (
      !Number.isFinite(
        audio.duration
      ) ||
      audio.duration <= 0
    ) {
      return
    }
    const rect =
      bar.getBoundingClientRect()
    if (!rect.width) {
      return
    }
    const x =
      Math.max(
        0,
        Math.min(
          event.clientX -
            rect.left,
          rect.width
        )
      )
    const ratio =
      x / rect.width
    audio.currentTime =
      ratio * audio.duration
    updateProgress()
  }
  bar.addEventListener(
    'pointerdown',
    function (event) {
      seekFromEvent(event)
      try {
        bar.setPointerCapture(
          event.pointerId
        )
      } catch {}
    }
  )
  bar.addEventListener(
    'pointermove',
    function (event) {
      if (
        event.buttons === 1
      ) {
        seekFromEvent(event)
      }
    }
  )
  audio.addEventListener(
    'loadedmetadata',
    function () {
      if (dur) {
        dur.textContent =
          formatTime(
            audio.duration
          )
      }
    }
  )
  audio.addEventListener(
    'durationchange',
    function () {
      if (
        dur &&
        Number.isFinite(
          audio.duration
        )
      ) {
        dur.textContent =
          formatTime(
            audio.duration
          )
      }
    }
  )
  audio.addEventListener(
    'timeupdate',
    updateProgress
  )
  audio.addEventListener(
    'play',
    setPlaying
  )
  audio.addEventListener(
    'pause',
    function () {
      if (!audio.ended) {
        setPaused()
      }
    }
  )
  audio.addEventListener(
    'ended',
    function () {
      setPaused()
      fill.style.width =
        '0%'
      dot.style.left =
        '0%'
      if (cur) {
        cur.textContent =
          '0:00'
      }
    }
  )
  audio.addEventListener(
    'error',
    function () {
      console.error(
        '[PLAYER] Audio gagal dimainkan'
      )
      setPaused()
    }
  )
  setPaused()
})()
</script>
`
}

/* =========================================================
 * SEND MUSIC PLAYER
 * ========================================================= */
async function sendMusicPlayer(conn, m, html) {
  if (!conn?.relayMessage) {
    throw new Error('Connection WhatsApp tidak valid')
  }
  const targetJid = m.from || m.chat
  const responseId = randomUUID()
  const unifiedData = {
    response_id: responseId,
    sections: [
      {
        view_model: {
          primitive: {
            __typename: 'GenAIaeacdsnwHtmlPrimitive',
            payload: html,
            trusted_sources: []
          },
          __typename: 'GenAISingleLayoutViewModel'
        }
      }
    ]
  }
  await conn.relayMessage(
    targetJid,
    {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
          messageDisclaimerText: '',
          botResponseId: responseId
        }
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [
              {
                messageType: 2,
                messageText: 'Music Player'
              }
            ],
            unifiedResponse: {
              data: Buffer.from(JSON.stringify(unifiedData)).toString('base64')
            },
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: {
                botJid: '867051314767696@bot'
              },
              forwardOrigin: 4
            }
          }
        }
      }
    },
    { messageId: responseId }
  )
}

/* =========================================================
 * EXPORT DEFAULT HANDLER
 * ========================================================= */
export default {
  cmd: ['play', 'playsf'],
  category: 'downloader',
  desc: 'Memutar dan mengunduh musik dari YouTube dengan player interaktif HTML Base64',
  exec: async (m, { sock, query, command, text, usedPrefix }) => {
    const conn = sock || m.conn
    const inputQuery = query || text

    if (!inputQuery?.trim()) {
      return m.reply(
        `Contoh penggunaan:\n` +
        `${usedPrefix || '.'}${command} chase atlantic`
      )
    }

    // Safe reaction helper
    const sendReaction = async (emoji) => {
      if (typeof m.react === 'function') {
        return m.react(emoji)
      }
      return conn.sendMessage(m.from, { react: { text: emoji, key: m.key } })
    }

    await sendReaction("⏳")
    try {
      let input = inputQuery.trim()
      if (!isYouTubeUrl(input)) {
        console.log('[PLAY] Searching YouTube:', input)
        const search = await yts(input)
        if (!search?.videos?.length) {
          throw new Error('Lagu tidak ditemukan')
        }
        input = search.videos[0].url
      }
      console.log('[PLAY] Getting YouTube detail...')
      const detail = await yts(input)
      const vid = detail?.videos?.[0]
      if (!vid) throw new Error('Video YouTube tidak ditemukan')
      const ytUrl = vid.url || input
      const title = vid.title || 'Unknown'
      const artist = vid.author?.name || 'YouTube'
      const duration = vid.timestamp || '0:00'
      console.log('[PLAY] Getting thumbnail...')
      const thumb = await getThumb(vid.thumbnail)
      await createHighQualityThumbnail(conn, thumb)
      let imageSrc = ''
      if (thumb?.length) {
        imageSrc = 'data:image/jpeg;base64,' + thumb.toString('base64')
        console.log(`[PLAY] Thumbnail Base64: ${mb(Buffer.byteLength(imageSrc, 'utf8'))} MB`)
      }
      console.log('[PLAY] Getting SaveTube audio...')
      const audio = await savetubeRetry(
        ytUrl,
        { downloadType: 'audio', quality: '128kbps' },
        3
      )
      if (!audio?.url) throw new Error('URL audio tidak tersedia')
      console.log('[PLAY] Download audio -> Buffer')
      const originalBuffer = await downloadAudioBuffer(audio.url)
      console.log(`[PLAY] Original audio: ${mb(originalBuffer.length)} MB`)
      console.log(`[PLAY] FFmpeg compress -> ${FFMPEG_BITRATE} ${FFMPEG_CODEC}`)
      const compressedBuffer = await compressAudio(originalBuffer)
      console.log(`[PLAY] Compressed audio: ${mb(compressedBuffer.length)} MB`)
      const compression =
        100 - (compressedBuffer.length / originalBuffer.length) * 100
      console.log(`[PLAY] Reduced: ${compression.toFixed(1)}%`)
      const audioSrc =
        'data:audio/ogg;base64,' + compressedBuffer.toString('base64')
      const audioSize = Buffer.byteLength(audioSrc, 'utf8')
      console.log(`[PLAY] Base64 audio: ${mb(audioSize)} MB`)
      if (audioSize > MAX_BASE64_AUDIO_SIZE) {
        throw new Error(
          `Audio Base64 terlalu besar. Maksimal ${MAX_BASE64_AUDIO_MB} MB`
        )
      }
      console.log('[PLAY] Creating HTML player...')
      const html = createMusicPlayer({
        title: audio.title || title,
        artist,
        duration: audio.duration || duration,
        audioSrc,
        imageSrc
      })
      console.log('[PLAY] Sending music player...')
      await sendMusicPlayer(conn, m, html)
      await sendReaction("✅")
      console.log('[PLAY] Success:', title)
    } catch (error) {
      console.error('[PLAY ERROR]', error)
      await sendReaction("❌")
      const message = formatError(error)
      try {
        await conn.sendMessage(
          m.from || m.chat,
          {
            text:
              '❌ Audio gagal diambil, coba lagi nanti.\n\n' +
              `> ${message}`
          },
          { quoted: m }
        )
      } catch (sendError) {
        console.error('[PLAY ERROR MESSAGE]', sendError)
      }
    }
  }
}