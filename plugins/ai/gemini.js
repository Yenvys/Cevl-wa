import { GoogleGenAI } from "@google/genai";
import { downloadContentFromMessage } from "baileys";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { res } from "../../src/response.js";

const MODEL = config.geminiModel || "gemini-2.0-flash";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const HISTORY_DIR = "./data/history";
const MAX_HISTORY = 18;

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

async function loadHistory(id) {
  try {
    return JSON.parse(await fs.readFile(path.join(HISTORY_DIR, `${id}.json`), "utf-8"));
  } catch {
    return [];
  }
}

async function saveHistory(id, history) {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  await fs.writeFile(path.join(HISTORY_DIR, `${id}.json`), JSON.stringify(history, null, 2));
}

function getQuotedText(q) {
  return q?.text || q?.body || q?.msg?.text || q?.msg?.conversation || q?.msg?.extendedTextMessage?.text || "";
}

async function runGemini(m, sock) {
  try {
    const q = m.quoted || m;
    const msgData = q.msg || q;
    const mime = msgData.mimetype || msgData.mediaType || "";
    const isMedia = /image|video|audio|application|webp|pdf|document/i.test(mime) || q.download;
    const quotedText = m.quoted ? getQuotedText(m.quoted) : "";
    const query = m.query || "";

    let finalQuery = query;
    if (quotedText) {
      finalQuery = `[Pengguna membalas sebuah pesan dengan teks: "${quotedText}"]\n\nInstruksi pengguna: "${query || "Tolong tanggapi pesan/media ini"}"`;
    }

    if (!finalQuery && !isMedia) {
      return m.reply(res.format(m.prefix, command, "jelaskan teori relativitas", "Bisa kirim teks langsung atau reply pesan/media"));
    }

    const parts = [{ text: finalQuery || "Tolong jelaskan isi media ini secara detail." }];

    if (isMedia) {
      let buffer;
      if (q.download) {
        buffer = await q.download();
      } else {
        let type = "document";
        if (mime.startsWith("image/") || mime.includes("webp")) type = "image";
        else if (mime.startsWith("video/")) type = "video";
        else if (mime.startsWith("audio/")) type = "audio";
        buffer = await streamToBuffer(await downloadContentFromMessage(msgData, type));
      }

      if (buffer) {
        parts.push({
          inlineData: {
            mimeType: mime.split(";")[0] || "application/octet-stream",
            data: buffer.toString("base64"),
          },
        });
      }
    }

    await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

    const id = m.isGroup ? m.from : m.sender;
    const history = await loadHistory(id);
    const userContent = { role: "user", parts };

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [...history, userContent],
      config: {
        systemInstruction: "Kamu adalah asisten AI yang cerdas. Jawab singkat, natural, tanpa emoji berlebihan.",
        maxOutputTokens: 1080,
        temperature: 0.4,
      },
    });

    const resultText = response.text || "Tidak ada respons dari AI.";
    await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
    await m.reply(resultText);

    if (response.text) {
      history.push(userContent, { role: "model", parts: [{ text: resultText.slice(0, 800) }] });
      await saveHistory(id, history);
    }
  } catch (e) {
    console.error(e);
    await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
    m.adReply(`Error: ${e.message}`, "AI ERROR");
  }
}

export default {
  cmd: ["gemini", "g", "gm"],
  category: "ai",
  desc: "Chat AI Gemini (Fast Response + Multi Media)",
  exec: async (m, { sock }) => runGemini(m, sock),

  after: async (m, { sock, handler }) => {
    if (!m.quoted?.text) return;
    const botId = sock.decodeJid ? sock.decodeJid(sock.user.id) : `${sock.user.id.split(":")[0]}@s.whatsapp.net`;
    const isFromBot = m.quoted.sender === botId || m.quoted.fromMe || m.quoted.key?.fromMe;
    if (!isFromBot) return;

    const id = m.isGroup ? m.from : m.sender;
    const history = await loadHistory(id);
    const isFromGemini = history.some((h) => {
      if (h.role !== "model" || !h.parts[0]?.text) return false;
      const text = h.parts[0].text;
      return m.quoted.text.startsWith(text) || text.startsWith(m.quoted.text.slice(0, 100));
    });
    if (!isFromGemini) return;

    const usedPrefix = handler.prefix.find((p) => p !== "" && m.body?.startsWith(p));
    if (usedPrefix !== undefined) {
      const cmdName = m.body.slice(usedPrefix.length).trim().split(/\s+/)[0]?.toLowerCase();
      if (handler.aliases.has(cmdName)) return;
    }

    m.query = m.body || "";
    await runGemini(m, sock);
  },
};
