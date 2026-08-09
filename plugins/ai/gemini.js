/**
 * plugins/ai/gemini.js
 */

import { GoogleGenAI } from "@google/genai";
import { downloadContentFromMessage } from "baileys";
import fs from "fs/promises";
import path from "path";
import { config } from "../../config.js";

const MODEL = config.geminiModel || "gemini-2.0-flash";
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const HISTORY_DIR = "./data/history";
const MAX_HISTORY = 18;

const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
};

async function loadHistory(id) {
    try {
        const file = path.join(HISTORY_DIR, `${id}.json`);
        const data = await fs.readFile(file, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function saveHistory(id, history) {
    await fs.mkdir(HISTORY_DIR, { recursive: true });

    if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
    }

    const file = path.join(HISTORY_DIR, `${id}.json`);
    await fs.writeFile(file, JSON.stringify(history, null, 2));
}

function getQuotedText(q) {
    const msg = q?.msg || q;

    return (
        msg?.conversation ||
        msg?.extendedTextMessage?.text ||
        msg?.text ||
        ""
    );
}

async function runGemini(m, sock) {
    try {
        const quoted = m.quoted;
        const q = quoted || m;
        const msgData = q.msg || q;
        const mime = msgData.mimetype || msgData.mediaType || "";

        const isMedia = /image|video|audio|application|webp|pdf|document/i.test(mime) || q.download;
        
        const quotedIsMedia = quoted && (/image|video|audio|application|webp|pdf|document/i.test(quoted?.msg?.mimetype || quoted?.msg?.mediaType || "") || quoted?.download);
        
        const quotedText = quoted ? getQuotedText(quoted) : "";
        let query = m.query || "";

        let finalQuery = query;
        if (quotedText) {
            finalQuery = `[Pengguna membalas sebuah pesan dengan teks: "${quotedText}"]\n\nInstruksi pengguna: "${query || 'Tolong tanggapi pesan/media ini'}"`;
        } else if (query) {
            finalQuery = query;
        }
        
        if (!finalQuery && !isMedia) {
            return m.adReply(
                "Masukin pertanyaan atau reply media/pesan (gambar, video, dokumen, teks, dll).",
                "GEMINI"
            );
        }

        const parts = [];

        if (finalQuery) {
            parts.push({ text: finalQuery });
        } else {
            parts.push({
                text: "Tolong jelaskan isi media ini secara detail."
            });
        }

        if (isMedia) {
            let buffer;

            if (q.download) {
                buffer = await q.download();
            } else {
                let type = "document";
                if (mime.startsWith("image/") || mime.includes("webp")) type = "image";
                else if (mime.startsWith("video/")) type = "video";
                else if (mime.startsWith("audio/")) type = "audio";
                
                const stream = await downloadContentFromMessage(msgData, type);
                buffer = await streamToBuffer(stream);
            }

            if (buffer) {
                parts.push({
                    inlineData: {
                        mimeType: mime.split(";")[0] || "application/octet-stream",
                        data: buffer.toString("base64")
                    }
                });
            }
        }

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        const id = m.isGroup ? m.from : m.sender;
        const history = await loadHistory(id);

        const contents = [
            {
                role: "user",
                parts
            }
        ];

        const fullContents = [...history, ...contents];

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: fullContents,
            config: {
                systemInstruction: "Kamu adalah asisten AI yang cerdas. Jawab singkat, natural, tanpa emoji berlebihan.",
                maxOutputTokens: 1080,
                temperature: 0.4
            }
        });

        const resultText = response.text || "Tidak ada respons dari AI.";

        await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
        await m.reply(resultText);

        if (response.text) {
            history.push(contents[0]);
            history.push({
                role: "model",
                parts: [{ text: resultText.slice(0, 800) }]
            });
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

    exec: async (m, { sock }) => {
        await runGemini(m, sock);
    },

    after: async (m, { sock, handler }) => {
        if (!m.quoted || !m.quoted.text) return;

        const botId = sock.decodeJid ? sock.decodeJid(sock.user.id) : sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const isFromBot = m.quoted.sender === botId || m.quoted.fromMe || (m.quoted.key && m.quoted.key.fromMe);

        if (!isFromBot) return;

        // Cek apakah pesan yang dibalas ada di history Gemini
        const id = m.isGroup ? m.from : m.sender;
        const history = await loadHistory(id);
        
        const isFromGemini = history.some(h => {
            if (h.role !== 'model' || !h.parts[0]?.text) return false;
            const savedText = h.parts[0].text;
            return m.quoted.text.startsWith(savedText) || savedText.startsWith(m.quoted.text.slice(0, 100));
        });

        if (!isFromGemini) return;

        // Jangan merespons jika user sebenarnya sedang mengetik command lain
        const usedPrefix = handler.prefix.find(p => p !== "" && m.body?.startsWith(p));
        if (usedPrefix !== undefined) {
            const bodyNoPrefix = m.body.slice(usedPrefix.length).trim();
            const cmdName = bodyNoPrefix.split(/ +/)[0]?.toLowerCase();
            if (handler.aliases.has(cmdName)) {
                return;
            }
        }

        m.query = m.body || "";
        await runGemini(m, sock);
    }
};