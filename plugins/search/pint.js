import fetch from "node-fetch";
import { buildCarouselMessage } from "../../src/helper.js";
import { res } from "../../src/response.js";

const PINTEREST_AUTH_COOKIE = process.env.PINTEREST_AUTH_COOKIE || "";
const sentImageHistory = new Map();
const MAX_HISTORY_SIZE = 10;

async function getPinterestImages(query, pageCount = 1, pageSize = 30) {
  if (!PINTEREST_AUTH_COOKIE || PINTEREST_AUTH_COOKIE.length < 50) {
    throw new Error("Cookie Pinterest belum diatur / tidak valid.");
  }

  const baseUrl = "https://id.pinterest.com/resource/BaseSearchResource/get/";
  const headers = {
    "X-Requested-With": "XMLHttpRequest",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    Referer: `https://id.pinterest.com/search/pins/?rs=typed&q=${encodeURIComponent(query)}`,
    Cookie: PINTEREST_AUTH_COOKIE,
  };

  let bookmark = null;
  const allPins = [];
  const encodedQuery = encodeURIComponent(query);

  for (let i = 0; i < pageCount; i++) {
    const options = {
      appliedProductFilters: "---",
      query,
      scope: "pins",
      source_url: `/search/pins/?q=${encodedQuery}&rs=typed`,
      page_size: pageSize,
      ...(bookmark && { bookmark }),
    };

    const url = `${baseUrl}?source_url=/search/pins/?q=${encodedQuery}&rs=typed&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}&_=${Date.now()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Status ${res.status}`);

    const json = await res.json();
    const rawData = json.resource_response?.data?.results;
    bookmark = json.resource_response?.bookmark;
    if (!Array.isArray(rawData)) break;

    const pins = rawData
      .map((pin) => ({
        image: pin.images?.["736x"]?.url || pin.images?.orig?.url || null,
        link: pin.id ? `https://id.pinterest.com/pin/${pin.id}` : null,
      }))
      .filter((v) => v.image);

    allPins.push(...pins);
    if (!bookmark) break;
  }

  return [...new Map(allPins.map((v) => [v.image, v])).values()];
}

function pickUniquePin(chatId, pins) {
  if (!sentImageHistory.has(chatId)) sentImageHistory.set(chatId, new Set());
  const historySet = sentImageHistory.get(chatId);
  const available = pins.filter((p) => !historySet.has(p.image));

  const selected = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : pins[Math.floor(Math.random() * pins.length)];

  if (selected) {
    historySet.add(selected.image);
    if (historySet.size > MAX_HISTORY_SIZE) {
      historySet.delete(historySet.values().next().value);
    }
  }
  return selected;
}

export default {
  cmd: ["pinterest", "pint"],
  category: "search",
  desc: "Cari foto/gambar di Pinterest",
  exec: async (m, { sock, args }) => {
    const query = args.join(" ").trim();
    if (!query) {
      return m.reply(
        res.format(
          m.prefix ?? ".",
          "pint",
          "Elysia",
          "Masukkan kata kunci gambar atau ilustrasi yang ingin dicari",
          "Cari gambar dan foto dari Pinterest",
        ),
      );
    }

    if (!PINTEREST_AUTH_COOKIE || PINTEREST_AUTH_COOKIE.length < 50) {
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.warn("Cookie Pinterest belum diatur di environment."));
    }

    await sock.sendMessage(m.from, { react: { text: "🔍", key: m.key } });

    try {
      const pins = await getPinterestImages(query, 1);
      if (!pins.length) throw new Error("Tidak ditemukan hasil");

      const used = new Set();
      const selectedPins = [];
      while (selectedPins.length < 5 && used.size < pins.length) {
        const pin = pickUniquePin(m.from, pins);
        if (pin && !used.has(pin.image)) {
          used.add(pin.image);
          selectedPins.push(pin);
        }
      }

      const carousel = await buildCarouselMessage(sock, m.from, selectedPins, query);
      await sock.relayMessage(m.from, carousel.message, {
        messageId: carousel.key.id,
        additionalNodes: [{
          tag: "biz",
          attrs: {},
          content: [{
            tag: "interactive",
            attrs: { type: "native_flow", v: "1" },
            content: [{ tag: "native_flow", attrs: { name: "quick_reply" } }],
          }],
        }],
      });

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      await m.reply(res.error(err.message));
    }
  },
};
