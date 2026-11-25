import axios from "axios";
import crypto from "node:crypto";
import { proto, prepareWAMessageMedia } from "baileys";
import sharp from "sharp";
import { res } from "../../src/response.js";

const BASE_URL = "https://open.spotify.com";

const formatDuration = (ms) => {
  if (!ms) return "0:00";
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec < 10 ? "0" : ""}${sec}`;
};

class SpotifyEngine {
  constructor() {
    this.secret = "376136387538459893883312310911992847112448894410210511297108";
    this.version = 61;
    this.clientVersion = "1.2.88.61.ge172202b";
    this.http = axios.create({
      headers: {
        referer: "https://open.spotify.com/",
        origin: "https://open.spotify.com",
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (Linux; Android 16; NX729J) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.34 Mobile Safari/537.36",
      },
    });
  }

  generateTOTP(tsms) {
    const counter = Math.floor(tsms / 1000 / 30);
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter));
    const digest = crypto.createHmac("sha1", Buffer.from(this.secret, "utf8")).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0xf;
    return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
  }

  async getToken() {
    try {
      if (this.http.defaults.headers.authorization) return true;
      const sts = Math.floor(Date.now() / 1000);
      const { data: token } = await this.http.get("https://open.spotify.com/api/token", {
        params: {
          reason: "init",
          productType: "web-player",
          totp: this.generateTOTP(Date.now()),
          totpServer: this.generateTOTP(sts * 1000),
          totpVer: String(this.version),
        },
      });

      const { data: client } = await this.http.post("https://clienttoken.spotify.com/v1/clienttoken", {
        client_data: {
          client_version: this.clientVersion,
          client_id: token.clientId,
          js_sdk_data: { device_brand: "unknown", device_model: "unknown", os: "linux", os_version: "24.04", device_id: crypto.randomUUID(), device_type: "computer" },
        },
      });

      Object.assign(this.http.defaults.headers, {
        "accept-language": "en",
        "app-platform": "WebPlayer",
        authorization: `Bearer ${token.accessToken}`,
        "client-token": client.granted_token.token,
        "spotify-app-version": this.clientVersion,
      });
      return true;
    } catch {
      return false;
    }
  }

  async search(query) {
    if (!(await this.getToken())) throw new Error("Gagal generate token internal.");
    const { data: res } = await this.http.post("https://api-partner.spotify.com/pathfinder/v2/query", {
      variables: { searchTerm: query, offset: 0, limit: 10, numberOfTopResults: 5 },
      operationName: "searchDesktop",
      extensions: { persistedQuery: { version: 1, sha256Hash: "21b3fe49546912ba782db5c47e9ef5a7dbd20329520ba0c7d0fcfadee671d24e" } },
    });

    const items = res.data?.searchV2?.tracksV2?.items || res.data?.searchV2?.topResultsV2?.itemsV2 || [];
    return items.map((item) => {
      const t = item.item?.data || item.data;
      if (!t) return null;
      const id = t.uri?.split(":")[2] || null;
      return {
        id,
        url: id ? `${BASE_URL}/track/${id}` : null,
        name: t.name || "Unknown",
        duration_ms: t.duration?.totalMilliseconds || 0,
        artists: (t.artists?.items || []).map((a) => ({ name: a.profile?.name || "Unknown Artist" })),
        album: {
          name: t.albumOfTrack?.name || null,
          images: (t.albumOfTrack?.coverArt?.sources || []).map((s) => ({ url: s.url })),
        },
      };
    }).filter(Boolean);
  }

  async download(url) {
    const { data: res } = await axios.post("https://musicfab.io/api/spotify", { url }, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        Origin: "https://musicfab.io",
        Referer: "https://musicfab.io/",
      },
    });

    const meta = res?.data?.metadata;
    if (!meta) throw new Error("Gagal mengambil audio dari musicfab");
    return {
      name: meta.name || "Unknown",
      artist: meta.artist || "Unknown Artist",
      album: meta.album || "Single",
      url,
      download: meta.download,
    };
  }
}

const spotify = new SpotifyEngine();

export default {
  cmd: ["spotify", "spotsearch", "spsearch"],
  category: "search",
  desc: "Cari dan download musik dari Spotify",
  exec: async (m, { sock, query, command }) => {
    if (!query) {
      return m.reply(
        res.format(
          m.prefix,
          command,
          "lathi",
          "Masukkan kata kunci judul lagu atau nama penyanyi",
          "Cari dan dengarkan lagu dari Spotify",
        ),
      );
    }

    const start = Date.now();
    const sentLoading = await sock.sendMessage(m.from, { text: `_*Searching "${query}" on Spotify... Please wait..*_` }, { quoted: m });

    try {
      const items = await spotify.search(query);
      if (!items.length) return sock.sendMessage(m.from, { text: res.empty("Lagu tidak ditemukan."), edit: sentLoading.key });

      const tracks = items.slice(0, 5).map((t) => ({
        title: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        album: t.album.name || "Single",
        duration: formatDuration(t.duration_ms),
        cover: t.album.images[0]?.url || null,
        url: t.url,
      }));

      const speed = ((Date.now() - start) / 1000).toFixed(2);
      let txt = `*SPOTIFY SEARCH*\n> _Query: "${query}"_\n> Speed: ${speed}s | Total: ${tracks.length}\n\n`;
      tracks.forEach((t, i) => {
        txt += `*${i + 1}. ${t.title} - ${t.duration}*\n> 👤 *Artist:* ${t.artist}\n`;
      });
      txt += `\n_📌 *Reply dengan angka (1-${tracks.length})* untuk download lagu!_`;

      if (!sock.spotifySession) sock.spotifySession = {};
      sock.spotifySession[m.sender] = { tracks, expired: Date.now() + 60000, isDone: false };

      return await sock.sendMessage(m.from, { text: txt, edit: sentLoading.key });
    } catch (e) {
      console.error(e);
      return sock.sendMessage(m.from, { text: `Error Spotify Search\n${e.message}`, edit: sentLoading.key });
    }
  },

  async after(m, { sock }) {
    const session = sock.spotifySession?.[m.sender];
    if (!session || session.isDone || Date.now() > session.expired) {
      if (session && Date.now() > session.expired) delete sock.spotifySession[m.sender];
      return;
    }

    const index = parseInt((m.text || m.body || "").trim(), 10) - 1;
    if (isNaN(index) || index < 0 || index >= session.tracks.length) return;

    const selectedTrack = session.tracks[index];
    session.isDone = true;
    delete sock.spotifySession[m.sender];

    try {
      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
      const dlResult = await spotify.download(selectedTrack.url);
      if (!dlResult?.download) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply("_Download gagal._");
      }

      let imageBuffer = Buffer.alloc(0);
      let mediaParams = null;
      let imgWidth = 640;
      let imgHeight = 640;

      if (selectedTrack.cover) {
        try {
          const imgRes = await axios.get(selectedTrack.cover, { responseType: "arraybuffer", timeout: 5000 });
          const rawBuff = Buffer.from(imgRes.data);
          const meta = await sharp(rawBuff).metadata();
          imgWidth = meta.width || 640;
          imgHeight = meta.height || 640;
          imageBuffer = await sharp(rawBuff).resize(200, 200, { fit: "cover" }).jpeg({ quality: 70 }).toBuffer();
          mediaParams = await prepareWAMessageMedia({ image: rawBuff }, { upload: sock.waUploadToServer, mediaTypeOverride: "thumbnail-link" });
        } catch {}
      }

      const detailText = `> *Judul:* ${dlResult.name}\n> *Artis:* ${dlResult.artist}\n> *Album:* ${selectedTrack.album}\n\n_Mengirim Audio . . . ._`;
      const msgPayload = {
        text: `${selectedTrack.url}\n\n${detailText}`,
        matchedText: selectedTrack.url,
        canonicalUrl: selectedTrack.url,
        title: dlResult.name,
        description: `${dlResult.artist} · ${selectedTrack.album}`,
        previewType: 1,
        jpegThumbnail: imageBuffer,
        thumbnailHeight: imgHeight,
        thumbnailWidth: imgWidth,
        ...(mediaParams?.imageMessage && {
          thumbnailDirectPath: mediaParams.imageMessage.directPath,
          thumbnailSha256: mediaParams.imageMessage.fileSha256.toString("base64"),
          thumbnailEncSha256: mediaParams.imageMessage.fileEncSha256.toString("base64"),
          mediaKey: mediaParams.imageMessage.mediaKey.toString("base64"),
          mediaKeyTimestamp: String(mediaParams.imageMessage.mediaKeyTimestamp || Math.floor(Date.now() / 1000)),
        }),
        contextInfo: { stanzaId: m.key.id, participant: m.sender, quotedMessage: m.message, showAdAttribution: true },
      };

      const msg = proto.Message.fromObject({ extendedTextMessage: msgPayload });
      const sentDetail = await sock.relayMessage(m.from, msg, {});

      await sock.sendMessage(
        m.from,
        { audio: { url: dlResult.download }, mimetype: "audio/mpeg", ptt: false },
        { quoted: { key: { remoteJid: m.from, fromMe: true, id: sentDetail?.key?.id || m.key.id }, message: msg } }
      );
      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (e) {
      console.error(e);
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(`Error downloader\n\n${e.message || e}`);
    }
  },
};
