import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const BASE_URL = "https://www.omdown.site";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ZASS_UPLOAD_URL = "https://cdn.zass.in/upload";
const FALLBACK_ACTION_ID = "708399a12b89c0c44316117a83426033874649eaec";
const NEXT_ROUTER_STATE_TREE = "%5B%22%22%2C%7B%22children%22%3A%5B%5B%22locale%22%2C%22id%22%2C%22d%22%2Cnull%5D%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C4096%5D%7D%2Cnull%2Cnull%2C4112%5D%7D%2Cnull%2Cnull%2C4112%5D";

export const PLATFORM_RULES = [
  [/(?:^|\.)shortdrama\.tiktok\.com$/i, "PineDrama"],
  [/(?:^|\.)tiktok\.com$/i, "TikTok"],
  [/(?:^|\.)(?:douyin\.com|iesdouyin\.com)$/i, "Douyin"],
  [/(?:^|\.)(?:kuaishou\.com|kwai\.com)$/i, "Kuaishou"],
  [/(?:^|\.)(?:snackvideo\.com|sck\.io)$/i, "SnackVideo"],
  [/(?:^|\.)(?:xiaohongshu\.com|rednote\.com|xhslink\.com)$/i, "RedNote"],
  [/(?:^|\.)(?:youtu\.be|youtube\.com)$/i, "YouTube"],
  [/(?:^|\.)(?:instagram\.com|instagr\.am|ig\.me)$/i, "Instagram"],
  [/(?:^|\.)(?:twitter\.com|x\.com|t\.co)$/i, "X"],
  [/(?:^|\.)(?:facebook\.com|fb\.watch|fb\.com)$/i, "Facebook"],
  [/(?:^|\.)threads\.(?:net|com)$/i, "Threads"],
  [/(?:^|\.)(?:bsky\.app|bsky\.social)$/i, "Bluesky"],
  [/(?:^|\.)(?:reddit\.com|redd\.it)$/i, "Reddit"],
  [/(?:^|\.)capcut\.com$/i, "CapCut"],
  [/(?:^|\.)snapchat\.com$/i, "Snapchat"],
  [/(?:^|\.)twitch\.tv$/i, "Twitch"],
  [/(?:^|\.)(?:bilibili\.com|bilibili\.tv|b23\.tv|bili\.im)$/i, "Bilibili"],
  [/(?:^|\.)(?:dailymotion\.com|dai\.ly)$/i, "Dailymotion"],
  [/(?:^|\.)lahelu\.com$/i, "Lahelu"],
  [/(?:^|\.)(?:spotify\.com|spoti\.fi)$/i, "Spotify"],
  [/(?:^|\.)soundcloud\.com$/i, "SoundCloud"],
  [/(?:^|\.)(?:music\.apple\.com|apple\.co)$/i, "Apple Music"],
  [/(?:^|\.)(?:pinterest\.(?:com|co\.[a-z]{2}|[a-z]{2,3})|pin\.it)$/i, "Pinterest"],
  [/(?:^|\.)deviantart\.com$/i, "DeviantArt"],
  [/(?:^|\.)pixiv\.net$/i, "Pixiv"],
  [/(?:^|\.)mangadex\.org$/i, "MangaDex"],
  [/(?:^|\.)imgur\.com$/i, "Imgur"]
];

export class OmDownloader {
  constructor(options = {}) {
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.cachedCookies = null;
    this.cachedActionId = null;
    this.cookieExpiresAt = 0;
  }

  detectPlatform(inputUrl) {
    try {
      const parsed = new URL(/^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`);
      for (const [pattern, name] of PLATFORM_RULES) {
        if (pattern.test(parsed.hostname)) return name;
      }
    } catch {}
    return "TikTok";
  }

  async initSession(forceRefresh = false) {
    if (!forceRefresh && this.cachedCookies && this.cachedActionId && Date.now() < this.cookieExpiresAt) {
      return { cookies: this.cachedCookies, actionId: this.cachedActionId };
    }

    const res = await fetch(`${BASE_URL}/id`, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      }
    });

    if (!res.ok) throw new Error(`Failed to initialize session from omdown.site (Status ${res.status})`);

    const setCookieHeaders = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ? res.headers.get("set-cookie").split(",") : []);

    const cookieMap = new Map();
    for (const header of setCookieHeaders) {
      const match = header.match(/^\s*([a-zA-Z0-9_-]+)=([^;]+)/);
      if (match) {
        const [, key, val] = match;
        if (!["Path", "Expires", "Max-Age", "Domain", "SameSite"].includes(key)) {
          cookieMap.set(key, val);
        }
      }
    }

    this.cachedCookies = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
    this.cookieExpiresAt = Date.now() + 4 * 60 * 60 * 1000;

    const html = await res.text();
    let discoveredActionId = null;

    const scriptMatches = [...html.matchAll(/src=["'](\/_next\/static\/chunks\/[^"']+\.js)["']/g)];
    const scriptUrls = scriptMatches.map(m => `${BASE_URL}${m[1]}`);

    for (const sUrl of scriptUrls) {
      try {
        const sRes = await fetch(sUrl, { headers: { "User-Agent": this.userAgent } });
        if (sRes.ok) {
          const js = await sRes.text();
          if (js.includes("resolveMediaAction")) {
            const match = js.match(/createServerReference\)?\(["']([a-f0-9]{32,64})["'][^)]*["']resolveMediaAction["']/i)
                       || js.match(/["']([a-f0-9]{32,64})["'][^"']{0,60}resolveMediaAction/i);
            if (match) {
              discoveredActionId = match[1];
              break;
            }
          }
        }
      } catch {}
    }

    this.cachedActionId = discoveredActionId || FALLBACK_ACTION_ID;
    return { cookies: this.cachedCookies, actionId: this.cachedActionId };
  }

  parseFlightStream(raw) {
    const chunks = new Map();
    let pos = 0;

    while (pos < raw.length) {
      while (pos < raw.length && (raw[pos] === "\r" || raw[pos] === "\n")) pos++;
      if (pos >= raw.length) break;

      const colonIdx = raw.indexOf(":", pos);
      if (colonIdx === -1) break;

      const id = raw.slice(pos, colonIdx);
      const nextChar = raw[colonIdx + 1];

      if (nextChar === "T") {
        const commaIdx = raw.indexOf(",", colonIdx + 1);
        if (commaIdx !== -1) {
          const hexLen = raw.slice(colonIdx + 2, commaIdx);
          const len = parseInt(hexLen, 16);
          const textVal = raw.slice(commaIdx + 1, commaIdx + 1 + len);
          chunks.set(id, textVal);
          pos = commaIdx + 1 + len;
          continue;
        }
      }

      const nextNewline = raw.indexOf("\n", colonIdx + 1);
      const lineEnd = nextNewline !== -1 ? nextNewline : raw.length;
      const content = raw.slice(colonIdx + 1, lineEnd).trim();

      try {
        chunks.set(id, JSON.parse(content));
      } catch {
        chunks.set(id, content);
      }
      pos = lineEnd + 1;
    }

    return chunks;
  }

  resolveReferences(value, chunks) {
    if (value === "$undefined") return null;
    if (typeof value === "string" && value.startsWith("$")) {
      const refId = value.slice(1);
      if (chunks.has(refId)) return this.resolveReferences(chunks.get(refId), chunks);
    }
    if (Array.isArray(value)) return value.map(v => this.resolveReferences(v, chunks));
    if (value !== null && typeof value === "object") {
      const resolved = {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = this.resolveReferences(v, chunks);
      }
      return resolved;
    }
    return value;
  }

  async resolve(mediaUrl, options = {}) {
    if (!mediaUrl || typeof mediaUrl !== "string") throw new Error("mediaUrl must be a non-empty string");

    const platform = options.platform || this.detectPlatform(mediaUrl);
    const locale = options.locale || "id";

    const { cookies, actionId } = await this.initSession();
    const postBody = JSON.stringify([mediaUrl.trim(), platform, locale]);

    const res = await fetch(`${BASE_URL}/${locale}`, {
      method: "POST",
      headers: {
        "User-Agent": this.userAgent,
        Accept: "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        "Next-Action": actionId,
        "Next-Router-State-Tree": NEXT_ROUTER_STATE_TREE,
        Origin: BASE_URL,
        Referer: `${BASE_URL}/${locale}`,
        Cookie: cookies,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
      },
      body: postBody
    });

    if (!res.ok) throw new Error(`HTTP Error from omdown.site: ${res.status} ${res.statusText}`);

    const raw = await res.text();
    const chunks = this.parseFlightStream(raw);
    const mainPayload = chunks.get("1");
    if (!mainPayload) throw new Error("Invalid response structure: missing main data payload from omdown.");
    if (mainPayload.success === false) throw new Error(mainPayload.error || "Server rejected media resolution.");

    const mediaData = this.resolveReferences(mainPayload.data, chunks);
    const makeAbsolute = (url) => {
      if (!url || typeof url !== "string") return url;
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
      return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
    };

    if (mediaData.thumbnailUrl) mediaData.thumbnailUrl = makeAbsolute(mediaData.thumbnailUrl);
    if (mediaData.authorAvatar) mediaData.authorAvatar = makeAbsolute(mediaData.authorAvatar);
    if (mediaData.previewUrl) mediaData.previewUrl = makeAbsolute(mediaData.previewUrl);
    if (mediaData.music?.playUrl) mediaData.music.playUrl = makeAbsolute(mediaData.music.playUrl);

    if (Array.isArray(mediaData.formats)) {
      mediaData.formats = mediaData.formats.map(fmt => {
        let dl = fmt.downloadUrl;
        if (dl && dl !== "all-playlist" && dl !== "all-slides") {
          dl = makeAbsolute(dl);
          if (!dl.includes("download=1")) dl += (dl.includes("?") ? "&" : "?") + "download=1";
        }
        return {
          ...fmt,
          dl: typeof dl === "string" && dl.startsWith("http") ? dl : null,
          downloadUrl: dl
        };
      });
    }

    if (Array.isArray(mediaData.slides)) {
      mediaData.slides = mediaData.slides.map(slide => ({
        ...slide,
        imageUrl: makeAbsolute(slide.imageUrl),
        thumbnailUrl: makeAbsolute(slide.thumbnailUrl),
        downloadUrl: makeAbsolute(slide.downloadUrl)
      }));
    }

    return {
      success: true,
      platform: mediaData.platform || platform,
      title: mediaData.title || "Untitled",
      author: mediaData.author || "Unknown",
      authorAvatar: mediaData.authorAvatar || null,
      durationLabel: mediaData.durationLabel || null,
      thumbnailUrl: mediaData.thumbnailUrl || mediaData.previewUrl || null,
      previewUrl: mediaData.previewUrl || null,
      rawUrl: mediaData.rawUrl || mediaUrl,
      isCarousel: Boolean(mediaData.isCarousel),
      stats: mediaData.stats || null,
      music: mediaData.music || null,
      slides: mediaData.slides || null,
      formats: mediaData.formats || [],
      sessionCookies: this.cachedCookies
    };
  }

  async downloadBuffer(downloadUrl, options = {}) {
    if (!downloadUrl) throw new Error("downloadUrl is required");
    if (!this.cachedCookies) await this.initSession();
    const cookies = options.cookies || this.cachedCookies;

    const res = await fetch(downloadUrl, {
      headers: {
        "User-Agent": this.userAgent,
        Referer: `${BASE_URL}/id`,
        Cookie: cookies,
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
        Accept: "*/*"
      }
    });

    if (!res.ok) {
      if (res.status === 403) {
        throw new Error("403 Forbidden: Sesi download kedaluwarsa. Silakan resolve ulang.");
      }
      throw new Error(`Download failed with status ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async download(downloadUrl, outputPath, options = {}) {
    if (!downloadUrl) throw new Error("downloadUrl is required");
    if (!outputPath) throw new Error("outputPath is required");

    if (!this.cachedCookies) await this.initSession();
    const cookies = options.cookies || this.cachedCookies;

    const res = await fetch(downloadUrl, {
      headers: {
        "User-Agent": this.userAgent,
        Referer: `${BASE_URL}/id`,
        Cookie: cookies,
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
        Accept: "*/*"
      }
    });

    if (!res.ok) throw new Error(`Download failed with status ${res.status}`);

    const fileDir = path.dirname(outputPath);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

    const fileStream = fs.createWriteStream(outputPath);
    const bodyStream = Readable.fromWeb(res.body);
    await finished(bodyStream.pipe(fileStream));
    return outputPath;
  }

  static mimeFor(name) {
    const ext = path.extname(String(name)).toLowerCase();
    const map = {
      ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska",
      ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav",
      ".ogg": "audio/ogg", ".flac": "audio/flac", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
      ".avif": "image/avif", ".pdf": "application/pdf", ".zip": "application/zip",
      ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".html": "text/html; charset=utf-8"
    };
    return map[ext] || "application/octet-stream";
  }

  static safeUploadName(name) {
    const ext = path.extname(name) || "";
    const stem = String(name).slice(0, String(name).length - ext.length);
    const safe = stem
      .replace(/[^\w\s.-]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    return `${safe || "file"}${ext}`;
  }

  async upload(filePathOrBuffer, options = {}) {
    const fileName = options.fileName || (typeof filePathOrBuffer === "string" ? OmDownloader.safeUploadName(path.basename(filePathOrBuffer)) : "file.bin");
    const type = options.contentType || OmDownloader.mimeFor(fileName);

    let blob;
    if (Buffer.isBuffer(filePathOrBuffer)) {
      blob = new Blob([filePathOrBuffer], { type });
    } else if (typeof filePathOrBuffer === "string") {
      if (!fs.existsSync(filePathOrBuffer)) throw new Error(`File tidak ditemukan: ${filePathOrBuffer}`);
      if (typeof fs.openAsBlob === "function") {
        const raw = await fs.openAsBlob(filePathOrBuffer);
        blob = type && raw.type !== type ? new Blob([raw], { type }) : raw;
      } else {
        blob = new Blob([fs.readFileSync(filePathOrBuffer)], { type });
      }
    } else {
      throw new Error("Invalid buffer or file path provided to upload");
    }

    const form = new FormData();
    form.append("file", blob, fileName);

    const res = await fetch(options.endpoint || ZASS_UPLOAD_URL, {
      method: "POST",
      body: form,
      headers: options.headers || {}
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Upload gagal (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok || !data.success) {
      throw new Error(`Upload gagal: ${data.error || `HTTP ${res.status}`}`);
    }
    return data;
  }
}

export async function scrapeOmdown(url, options = {}) {
  const downloader = new OmDownloader(options);
  return downloader.resolve(url, options);
}

export default OmDownloader;
