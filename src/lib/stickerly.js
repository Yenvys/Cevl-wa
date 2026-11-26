import { addExif, writeExifImg, imageToWebp } from "./webp.js";
import { classifySticker } from "./stickerpack.js";

const STICKERLY_HEADERS = {
  "User-Agent": "androidapp.stickerly/1.13.3 (G011A; U; Android 22; pt-BR; br;)",
  "Host": "api.sticker.ly",
  "Content-Type": "application/json",
};

/**
 * Cari sticker pack di Sticker.ly berdasarkan keyword
 * @param {string} keyword
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function searchStickerPacks(keyword, limit = 10) {
  if (!keyword || typeof keyword !== "string") return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("http://api.sticker.ly/v3.1/stickerPack/search", {
      method: "POST",
      headers: STICKERLY_HEADERS,
      body: JSON.stringify({
        keyword: keyword.trim(),
        size: Math.max(1, Math.min(limit, 20)),
        cursor: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.error("[STICKERLY SEARCH] HTTP error:", res.status, res.statusText);
      return [];
    }

    const data = await res.json().catch(() => null);
    if (!data?.result?.stickerPacks || !Array.isArray(data.result.stickerPacks)) {
      return [];
    }

    const packs = data.result.stickerPacks.slice(0, limit).map((p) => {
      const isAnim = Boolean(p.isAnimated || p.animated);
      const files = Array.isArray(p.resourceFiles) ? p.resourceFiles : [];
      const prefix = p.resourceUrlPrefix || "";

      return {
        id: p.packId,
        name: p.name || "Sticker Pack",
        author: p.authorName || p.user?.userName || "Sticker.ly",
        isAnimated: isAnim,
        shareUrl: p.shareUrl || `https://sticker.ly/s/${p.packId}`,
        resourceUrlPrefix: prefix,
        resourceFiles: files,
        count: files.length,
        viewCount: p.viewCount || 0,
        exportCount: p.exportCount || 0,
      };
    });

    return packs;
  } catch (err) {
    clearTimeout(timer);
    console.error("[STICKERLY SEARCH ERROR]", err.message);
    return [];
  }
}

/**
 * Ambil detail lengkap suatu sticker pack dari Sticker.ly
 * @param {string} packId
 * @returns {Promise<Object|null>}
 */
export async function getStickerPackDetails(packId) {
  if (!packId || typeof packId !== "string") return null;
  const cleanId = packId.trim().toUpperCase();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`http://api.sticker.ly/v3.1/stickerPack/${cleanId}`, {
      method: "GET",
      headers: STICKERLY_HEADERS,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.result) {
        const r = data.result;
        const prefix = r.resourceUrlPrefix || "";
        const isAnim = Boolean(r.isAnimated || r.animated);
        const stickers = (r.stickers || []).map((s) => ({
          fileName: s.fileName,
          isAnimated: Boolean(s.isAnimated || s.animated || isAnim),
          url: `${prefix}${s.fileName}`,
        }));

        return {
          id: r.packId || cleanId,
          name: r.name || "Sticker Pack",
          author: r.authorName || r.user?.userName || "Sticker.ly",
          isAnimated: isAnim,
          resourceUrlPrefix: prefix,
          stickers,
          count: stickers.length,
          shareUrl: r.shareUrl || `https://sticker.ly/s/${cleanId}`,
        };
      }
    }
  } catch (err) {
    clearTimeout(timer);
    console.error("[STICKERLY DETAILS ERROR]", err.message);
  }

  // Fallback: Scrape https://sticker.ly/s/{packId} web page
  try {
    const webRes = await fetch(`https://sticker.ly/s/${cleanId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (webRes.ok) {
      const html = await webRes.text();
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const ogTitleMatch = html.match(/property="og:title" content="([^"]+)"/i);
      const packName = ogTitleMatch?.[1] || titleMatch?.[1]?.split(" - ")?.[0] || cleanId;
      const authorMatch = html.match(/class="author[^"]*"[^>]*>([^<]+)<\//i);
      const authorName = authorMatch?.[1]?.trim() || "Sticker.ly";

      const matchedUrls = [
        ...html.matchAll(/https:\/\/stickerly\.pstatic\.net\/sticker_pack\/[^\s"'<>]+\.(?:png|webp)/g),
      ].map((m) => m[0]);
      const uniqueUrls = [...new Set(matchedUrls)];

      if (uniqueUrls.length > 0) {
        const isAnim = uniqueUrls.some((u) => u.endsWith(".webp"));
        const stickers = uniqueUrls.map((u) => ({
          fileName: u.split("/").pop(),
          isAnimated: isAnim,
          url: u,
        }));

        return {
          id: cleanId,
          name: packName,
          author: authorName,
          isAnimated: isAnim,
          resourceUrlPrefix: "",
          stickers,
          count: stickers.length,
          shareUrl: `https://sticker.ly/s/${cleanId}`,
        };
      }
    }
  } catch (err) {
    console.error("[STICKERLY SCRAPE FALLBACK ERROR]", err.message);
  }

  return null;
}

/**
 * Unduh dan proses semua stiker dalam sticker pack menjadi WebP siap kirim dengan EXIF
 * @param {Object} pack
 * @param {Object} options
 * @returns {Promise<Array>}
 */
export async function downloadAndProcessPack(pack, options = {}) {
  const { maxStickers = 30, concurrency = 5 } = options;

  let stickerItems = [];
  if (Array.isArray(pack.stickers) && pack.stickers.length > 0) {
    stickerItems = pack.stickers;
  } else if (Array.isArray(pack.resourceFiles) && pack.resourceFiles.length > 0) {
    const prefix = pack.resourceUrlPrefix || "";
    stickerItems = pack.resourceFiles.map((file) => ({
      fileName: file,
      isAnimated: Boolean(pack.isAnimated || file.endsWith(".webp")),
      url: `${prefix}${file}`,
    }));
  }

  if (stickerItems.length === 0) return [];

  const selectedItems = stickerItems.slice(0, maxStickers);
  const results = [];

  // Unduh & konversi secara batch (concurrency)
  for (let i = 0; i < selectedItems.length; i += concurrency) {
    const chunk = selectedItems.slice(i, i + concurrency);
    const chunkPromises = chunk.map(async (item) => {
      try {
        const res = await fetch(item.url);
        if (!res.ok) return null;

        const rawBuf = Buffer.from(await res.arrayBuffer());
        if (!rawBuf || rawBuf.length === 0) return null;

        const isWebpOrAnim =
          item.isAnimated ||
          item.fileName?.endsWith(".webp") ||
          (rawBuf.length > 12 && rawBuf.toString("ascii", 8, 12) === "WEBP");

        let convertedWebp = null;
        if (isWebpOrAnim) {
          convertedWebp = await addExif(rawBuf, pack.name, pack.author).catch(() => rawBuf);
        } else {
          convertedWebp = await writeExifImg(rawBuf, {
            packname: pack.name,
            author: pack.author,
          }).catch(async () => {
            const fallbackWebp = await imageToWebp(rawBuf).catch(() => null);
            if (fallbackWebp) return await addExif(fallbackWebp, pack.name, pack.author).catch(() => fallbackWebp);
            return null;
          });
        }

        if (convertedWebp && Buffer.isBuffer(convertedWebp) && convertedWebp.length > 0) {
          const info = classifySticker(convertedWebp);
          return {
            buffer: convertedWebp,
            isAnimated: Boolean(item.isAnimated || info.isAnimated),
            mimetype: "image/webp",
          };
        }
      } catch (err) {
        console.error(`[DOWNLOAD STICKER ERROR: ${item.fileName}]`, err.message);
      }
      return null;
    });

    const chunkResults = await Promise.all(chunkPromises);
    for (const r of chunkResults) {
      if (r) results.push(r);
    }
  }

  return results;
}

export default {
  searchStickerPacks,
  getStickerPackDetails,
  downloadAndProcessPack,
};
