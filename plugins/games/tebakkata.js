import fs from "node:fs";
import path from "node:path";
import UserRPG from "../../src/rpg/schema.js";
import { checkLevelUp } from "../../src/rpg/core.js";
import { res } from "../../src/response.js";

const sessions = new Map();
const REPLAY_WORDS = new Set(["lagi", "lanjut", "again", "next"]);
const STOP_WORDS = new Set(["stop", "nyerah"]);
const LEVEL_ALIAS = { e: "easy", m: "medium", h: "hard" };

const WORD_URL = "https://raw.githubusercontent.com/ginkohub/game-assets/main/tebak-kata/data.json";
const wordFilePath = path.join(process.cwd(), "data", "tebak_kata.json");

let wordList = { easy: [], medium: [], hard: [] };

function loadWords() {
  try {
    if (fs.existsSync(wordFilePath)) wordList = JSON.parse(fs.readFileSync(wordFilePath, "utf-8"));
  } catch (e) {
    console.error("[TK] Failed to load tebak_kata.json:", e.message);
  }
}
loadWords();

async function fetchWords() {
  try {
    const res = await fetch(WORD_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid data format");

    const newWordList = {
      easy: data.filter((w) => w.jawaban.length <= 6),
      medium: data.filter((w) => w.jawaban.length >= 7 && w.jawaban.length <= 9),
      hard: data.filter((w) => w.jawaban.length >= 10),
    };

    fs.writeFileSync(wordFilePath, JSON.stringify(newWordList, null, 2));
    wordList = newWordList;
    return newWordList;
  } catch (e) {
    console.error("[TK] Fetch failed:", e.message);
    return null;
  }
}

async function startGame(m, sock, levelName) {
  const selectedLevel = LEVEL_ALIAS[levelName] || levelName || "easy";
  const words = wordList[selectedLevel] || wordList.easy;

  if (!words?.length) {
    return m.reply(`❌ Data kata kosong! Gunakan \`${m.prefix}tk.update\` untuk sinkronisasi.`);
  }

  const item = words[Math.floor(Math.random() * words.length)];
  const answer = item.jawaban.toUpperCase();
  const xpMult = selectedLevel === "hard" ? 30 : selectedLevel === "medium" ? 20 : 10;
  const xpReward = answer.length * xpMult;
  const uangReward = xpReward * 10;

  const resp = await sock.sendMessage(m.from, {
    text: `*♯ ${selectedLevel.toUpperCase()}*\nPetunjuk: *${item.soal}*\n\n⏱️ *Waktu:* 45 detik\n🎁 *Hadiah:* ${xpReward} XP | ¥${uangReward}\n> _Reply chat ini untuk menjawab!_`,
  }, { quoted: m });

  if (!resp) return;

  const timeout = setTimeout(async () => {
    const s = sessions.get(m.from);
    if (!s || s.done) return;
    s.done = true;
    const r = await sock.sendMessage(m.from, { text: `⌛ *Waktu habis!*\nJawabannya adalah *${answer}*` }, { quoted: resp });
    if (r) s.resultId = r.key.id;
  }, 45000);

  sessions.set(m.from, {
    answer: answer.toLowerCase().trim(),
    timeout,
    xp: xpReward,
    uang: uangReward,
    questionId: resp.key.id,
    level: selectedLevel,
    done: false,
    resultId: "",
  });
}

export default {
  cmd: ["tk", "tebakkata", "tk.update"],
  category: "games",
  desc: "Game Tebak Kata berdasarkan petunjuk",
  exec: async (m, { sock, args, command }) => {
    if (command === "tk.update") {
      if (!m.isOwner) return m.reply(res.owner);
      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

      const result = await fetchWords();
      if (result) {
        await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
        return m.reply(res.success(`*Sinkronisasi Berhasil!*\n\n• Mudah: ${result.easy.length}\n• Sedang: ${result.medium.length}\n• Sulit: ${result.hard.length}`));
      }
      await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      return m.reply(res.error("Sinkronisasi data kata gagal!"));
    }

    const levelArg = (args[0] || "").toLowerCase();
    if (!levelArg || levelArg === "?" || command.endsWith("?")) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} [level]`,
          [
            "easy",
            "medium",
            "hard",
          ],
          "Pilihan level: easy (e), medium (m), hard (h). Waktu menjawab: 45 detik.",
          "Game Tebak Kata berdasarkan petunjuk kalimat",
        ),
      );
    }

    if (!wordList.easy.length && !wordList.medium.length && !wordList.hard.length) {
      await fetchWords();
    }
    await startGame(m, sock, levelArg);
  },

  after: async (m, { sock }) => {
    if (!sessions.has(m.from) || !m.quoted) return;
    const session = sessions.get(m.from);
    const userAnswer = m.body?.toLowerCase().trim();

    if (!session.done) {
      if (m.quoted.id !== session.questionId) return;

      if (userAnswer === session.answer) {
        clearTimeout(session.timeout);
        session.done = true;

        let levelUpMsg = "";
        const user = await UserRPG.findOne({ noWa: m.sender });
        if (user) {
          user.exp += session.xp;
          user.yen += session.uang;
          const up = checkLevelUp(user.exp, user.level);
          if (up.isNaik) {
            user.level = up.levelBaru;
            user.exp = up.sisaXp;
            user.yen += up.hadiah;
            levelUpMsg = `\n🎉 *LEVEL UP!* Naik ke level ${user.level} (Hadiah: ¥${up.hadiah})`;
          }
          await user.save();
        }

        const result = await sock.sendMessage(m.from, {
          text: `🎉 *Selamat* @${m.sender.split("@")[0]}!\nJawaban benar: *${session.answer.toUpperCase()}*\n\n🌟 *+${session.xp} XP*\n💵 *+¥${session.uang}*${levelUpMsg}\n\nBalas _lagi_ untuk main lagi, atau _stop_ untuk berhenti`,
          mentions: [m.sender],
        }, { quoted: m });

        if (result) session.resultId = result.key.id;
      } else if (STOP_WORDS.has(userAnswer)) {
        clearTimeout(session.timeout);
        sessions.delete(m.from);
        await m.reply("🛑 *Permainan dihentikan*");
      } else {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      }
    } else if (m.quoted.id === session.resultId) {
      if (REPLAY_WORDS.has(userAnswer)) {
        await sock.sendMessage(m.from, { react: { text: "🔄", key: m.key } });
        sessions.delete(m.from);
        await startGame(m, sock, session.level);
      } else if (STOP_WORDS.has(userAnswer)) {
        sessions.delete(m.from);
        await m.reply("🛑 *Permainan dihentikan*");
      }
    }
  },
};
