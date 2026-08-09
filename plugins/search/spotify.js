/**
 * plugins/spotify.js
 * Spotify Search + Downloader (High Performance Request Version + Large Preview)
 */

import axios from "axios";
import crypto from "crypto";
import qs from "qs";
import { proto } from "baileys";
import sharp from "sharp";
import { prepareWAMessageMedia } from "baileys";

const BASE_URL = "https://open.spotify.com";

const formatDuration = (ms) => {
    if (!ms) return "0:00";
    const min = Math.floor(ms / 60000);
    const sec = ((ms % 60000) / 1000).toFixed(0);
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
};

class Parser {
    _getImg(o) { return (o?.sources || []).map(s => ({ url: s.url, width: s.width || s.maxWidth || null, height: s.height || s.maxHeight || null })); }
    _getCol(o) { return o?.extractedColors?.colorRaw?.hex || o?.extractedColors?.colorDark?.hex || null; }
    _getVI(v) { return v?.squareCoverImage?.extractedColorSet ? { text_color: v.squareCoverImage.extractedColorSet.encoreBaseSetTextColor || null, high_contrast: v.squareCoverImage.extractedColorSet.highContrast || null, higher_contrast: v.squareCoverImage.extractedColorSet.higherContrast || null, min_contrast: v.squareCoverImage.extractedColorSet.minContrast || null } : null; }
    _getLink(uri) { if (!uri) return { id: null, url: null }; const p = uri.split(":"); return { uri, id: p[2] || null, url: p[2] ? `${BASE_URL}/track/${p[2]}` : null }; }
    
    parseSearch(res) {
        if (!res) return null;
        const parse = (arr, mapFn, isTrack = false) => (arr || []).reduce((acc, node) => { const d = isTrack ? node.item?.data : node.data; if (d) acc.push({ ...mapFn(d), ...(node.matchedFields && { matched_fields: node.matchedFields }) }); return acc; }, []);
        const trackItems = res.tracksV2?.items?.length ? res.tracksV2.items : res.topResultsV2?.itemsV2?.filter(i => i.item?.__typename === "TrackResponseWrapper");
        return {
            tracks: parse(trackItems, t => ({
                ...this._getLink(t.uri),
                name: t.name || null,
                duration_ms: t.duration?.totalMilliseconds || 0,
                artists: (t.artists?.items || []).map(a => ({ name: a.profile?.name || "Unknown Artist" })),
                album: { name: t.albumOfTrack?.name || null, images: this._getImg(t.albumOfTrack?.coverArt) }
            }), true)
        };
    }
}

class SpotifyEngine {
    constructor() {
        this.cfg = {
            secret: "376136387538459893883312310911992847112448894410210511297108",
            version: 61,
            client_version: "1.2.88.61.ge172202b",
            query: { search: { opt: "searchDesktop", sha: "21b3fe49546912ba782db5c47e9ef5a7dbd20329520ba0c7d0fcfadee671d24e" } }
        };
        this.is = axios.create({
            headers: {
                referer: "https://open.spotify.com/",
                origin: "https://open.spotify.com",
                "content-type": "application/json",
                accept: "application/json",
                "user-agent": "Mozilla/5.0 (Linux; Android 16; NX729J) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.34 Mobile Safari/537.36"
            }
        });
        this.parser = new Parser();
    }

    generateTOTP(tsms) {
        const counter = Math.floor(tsms / 1000 / 30);
        const buffer = Buffer.alloc(8);
        buffer.writeBigInt64BE(BigInt(counter));
        const hmac = crypto.createHmac("sha1", Buffer.from(this.cfg.secret, "utf8")).update(buffer);
        const digest = hmac.digest();
        const offset = digest[digest.length - 1] & 0xf;
        const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
        return code.toString().padStart(6, "0");
    }

    async getToken() {
        try {
            if (this.is.defaults.headers.authorization) return true;
            const sts = Math.floor(Date.now() / 1000);
            const { data: token } = await this.is.get("https://open.spotify.com/api/token", {
                params: { reason: "init", productType: "web-player", totp: this.generateTOTP(Date.now()), totpServer: this.generateTOTP(sts * 1000), totpVer: String(this.cfg.version) }
            });
            const { data: client } = await this.is.post("https://clienttoken.spotify.com/v1/clienttoken", {
                client_data: { client_version: this.cfg.client_version, client_id: token.clientId, js_sdk_data: { device_brand: "unknown", device_model: "unknown", os: "linux", os_version: "24.04", device_id: crypto.randomUUID(), device_type: "computer" } }
            });
            Object.assign(this.is.defaults.headers, {
                "accept-language": "en",
                "app-platform": "WebPlayer",
                authorization: `Bearer ${token.accessToken}`,
                "client-token": client.granted_token.token,
                "spotify-app-version": this.cfg.client_version
            });
            return true;
        } catch { return false; }
    }

    async search(query) {
        try {
            if (!(await this.getToken())) throw new Error("Gagal generate token internal.");
            const sel = this.cfg.query["search"];
            const { data: res } = await this.is.post("https://api-partner.spotify.com/pathfinder/v2/query", {
                variables: { searchTerm: query, offset: 0, limit: 10, numberOfTopResults: 5, includeAudiobooks: true, includeArtistHasConcertsField: false, includePreReleases: true, includeAuthors: false, includeEpisodeContentRatingsV2: false },
                operationName: sel.opt,
                extensions: { persistedQuery: { version: 1, sha256Hash: sel.sha } }
            });
            return this.parser.parseSearch(res.data.searchV2);
        } catch (error) { throw error; }
    }

    async download(url) {
        try {
            if (!url || typeof url !== 'string') {
                throw new Error('mna link nya?');
            }
            const res = await axios.post('https://musicfab.io/api/spotify', { url: url }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Origin': 'https://musicfab.io',
                    'Referer': 'https://musicfab.io/'
                }
            });

            const result = res.data?.data?.metadata;

            if (!result) {
                throw new Error('Gagal mendapatkan result dari musicfab');
            }
            
            // Map the response to the object structure expected by the after() method
            return { 
                id: null, 
                name: result.name || 'Unknown', 
                duration_ms: result.duration || 0, 
                artist: result.artist || 'Unknown Artist', 
                album: result.album || 'Single', 
                url: url, 
                download: result.download 
            };
        } catch (e) { 
            throw e; 
        }
    }
}

const spotify = new SpotifyEngine();

export default {
    cmd: ["spotify", "spotsearch", "spsearch"],
    category: "search",

    exec: async (m, { sock, query, command }) => {
        if (!query) {
            return sock.sendMessage(m.from, { text: `_Format salah. Cth: *${m.prefix}${command} lathi*_` }, { quoted: m });
        }

        const start = Date.now();
        
        const sentLoading = await sock.sendMessage(m.from, { 
            text: `_*Searching "${query}" on Spotify... Please wait..*_` 
        }, { quoted: m });

        try {
            const searchResult = await spotify.search(query);
            const items = searchResult?.tracks || [];

            if (!items.length) {
                return sock.sendMessage(m.from, { text: `Lagu tidak ditemukan.`, edit: sentLoading.key });
            }

            let tracks = [];
            for (const t of items) {
                if (tracks.length >= 5) break;
                tracks.push({
                    title: t.name || "Unknown",
                    artist: t.artists?.map(a => a.name).join(", ") || "Unknown",
                    album: t.album?.name || "Single",
                    duration: formatDuration(t.duration_ms),
                    cover: t.album?.images?.[0]?.url || null,
                    url: t.url
                });
            }

            const speed = ((Date.now() - start) / 1000).toFixed(2);

            let txt = `*SPOTIFY SEARCH*\n`;
            txt += `> _Query: "${query}"_\n`;
            txt += `> Speed: ${speed}s | Total: ${tracks.length}_\n\n`;

            tracks.forEach((track, i) => {
                txt += `*${i + 1}. ${track.title} - ${track.duration}*\n`;
                txt += `> 👤 *Artist:* ${track.artist}\n`;
            });

            txt += `\n_📌 *Reply dengan angka (1-${tracks.length})* untuk download lagu!_`;

            if (!sock.spotifySession) sock.spotifySession = {};

            sock.spotifySession[m.sender] = {
                tracks,
                expired: Date.now() + 60000,
                isDone: false
            };

            return await sock.sendMessage(m.from, { text: txt, edit: sentLoading.key });

        } catch (e) {
            console.error(e);
            return sock.sendMessage(m.from, { text: `Error Spotify Search\n${e.message}`, edit: sentLoading.key });
        }
    },

    async after(m, { sock }) {
        const session = sock.spotifySession?.[m.sender];
        if (!session || session.isDone) return;

        if (Date.now() > session.expired) {
            delete sock.spotifySession[m.sender];
            return;
        }

        const input = (m.text || m.body || "").trim();
        const index = parseInt(input) - 1;

        if (isNaN(index) || index < 0 || index >= session.tracks.length) return;

        const selectedTrack = session.tracks[index];
        session.isDone = true;
        delete sock.spotifySession[m.sender];

        try {
            await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

            const dlResult = await spotify.download(selectedTrack.url);

            if (!dlResult || !dlResult.download) {
                await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
                return sock.sendMessage(m.from, { text: `_Download gagal_.` }, { quoted: m });
            }

            let imageBuffer = Buffer.alloc(0);
            let mediaParams = null;
            let imgWidth = 640, imgHeight = 640;

            try {
                const targetCover = selectedTrack.cover;
                if (targetCover) {
                    const imgRes = await axios.get(targetCover, { responseType: "arraybuffer", timeout: 5000 });
                    const rawBuff = Buffer.from(imgRes.data);
                    
                    const meta = await sharp(rawBuff).metadata();
                    imgWidth = meta.width || 640;
                    imgHeight = meta.height || 640;

                    imageBuffer = await sharp(rawBuff)
                        .resize(200, 200, { fit: 'cover' })
                        .jpeg({ quality: 70 })
                        .toBuffer();

                    mediaParams = await prepareWAMessageMedia(
                        { image: rawBuff },
                        { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }
                    );
                }
            } catch (err) {
                console.error("Gagal membuat large thumbnail:", err);
            }

            const detailText =
                `> *Judul:* ${dlResult.name}\n` +
                `> *Artis:* ${dlResult.artist}\n` +
                `> *Album:* ${selectedTrack.album || 'Single'}\n\n` +
                `_Mengirim Audio . . . ._`;
            
            const msgPayload = {
                text: `${selectedTrack.url}\n\n${detailText}`,
                matchedText: selectedTrack.url,
                canonicalUrl: selectedTrack.url, 
                title: dlResult.name,
                description: `${dlResult.artist} · ${selectedTrack.album || 'Single'}`,
                previewType: 1, 
                jpegThumbnail: imageBuffer,
                thumbnailHeight: imgHeight,
                thumbnailWidth: imgWidth,
                ...(mediaParams?.imageMessage && {
                    thumbnailDirectPath: mediaParams.imageMessage.directPath,
                    thumbnailSha256: mediaParams.imageMessage.fileSha256.toString('base64'),
                    thumbnailEncSha256: mediaParams.imageMessage.fileEncSha256.toString('base64'),
                    mediaKey: mediaParams.imageMessage.mediaKey.toString('base64'),
                    mediaKeyTimestamp: String(mediaParams.imageMessage.mediaKeyTimestamp || Math.floor(Date.now() / 1000)),
                }),
                contextInfo: {
                    stanzaId: m.key.id,
                    participant: m.sender,
                    quotedMessage: m.message,
                    showAdAttribution: true 
                }
            };

            const msg = proto.Message.fromObject({ extendedTextMessage: msgPayload });
            const sentDetail = await sock.relayMessage(m.from, msg, {});
            
            const quotedObj = {
                key: {
                    remoteJid: m.from,
                    fromMe: true,
                    id: sentDetail?.key?.id || m.key.id
                },
                message: msg
            };

            await sock.sendMessage(m.from, {
                audio: { url: dlResult.download },
                mimetype: "audio/mpeg",
                ptt: false
            }, { quoted: quotedObj });
            
            await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });

        } catch (e) {
            console.error(e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            return sock.sendMessage(m.from, { text: `Error downloader\n\n${e.message || e}` }, { quoted: m });
        }
    }
};