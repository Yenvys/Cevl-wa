import { getRegularLevel, getRegularLevelsCatalog } from "../../src/lib/tebakgambar.js";
import UserRPG from "../../src/rpg/schema.js";
import { checkLevelUp } from "../../src/rpg/core.js";
import { res } from "../../src/response.js";

const sessions = new Map();
const REPLAY_WORDS = new Set(["lagi", "lanjut", "again", "next"]);
const STOP_WORDS = new Set(["stop", "nyerah", "menyerah", "berhenti"]);
const CLUE_WORDS = new Set(["clue", "bantuan", "hint", "petunjuk"]);

const levelCache = new Map();
const MAX_CACHED_LEVELS = 50;

async function getCachedLevel(lvl) {
  if (levelCache.has(lvl)) return levelCache.get(lvl);
  const data = await getRegularLevel(lvl, { includeImages: true }).catch(() => null);
  if (data?.questions?.length) {
    if (levelCache.size >= MAX_CACHED_LEVELS) {
      const oldestKey = levelCache.keys().next().value;
      levelCache.delete(oldestKey);
    }
    levelCache.set(lvl, data);
  }
  return data;
}

function normalizeAnswer(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function makeClue(ans) {
  return ans
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 2) return word.toUpperCase();
      const chars = word.split("");
      return chars
        .map((c, i) => {
          if (i === 0 || i === chars.length - 1) return c.toUpperCase();
          return "_";
        })
        .join(" ");
    })
    .join("   ");
}

async function startTebakGambar(m, sock, args = []) {
  if (sessions.has(m.from) && !sessions.get(m.from).done) {
    const current = sessions.get(m.from);
    return m.reply(
      `⚠️ *Sesi Tebak Gambar Masih Berjalan!*\n\n` +
      `• Kategori: *${current.isBoss ? "👑 Raja Gambar" : `Level ${current.level}`} (Soal ${current.number}/20)*\n` +
      `• Selesaikan tebakan sebelumnya atau ketik \`nyerah\` untuk mengakhiri.`
    );
  }

  let targetLevel = 1;
  let pickBoss = false;
  const firstArg = (args[0] || "").toLowerCase();

  if (firstArg === "boss" || firstArg === "raja") {
    pickBoss = true;
    targetLevel = Math.floor(Math.random() * 257) + 1;
  } else if (/^\d+$/.test(firstArg)) {
    const parsed = parseInt(firstArg, 10);
    if (parsed >= 1 && parsed <= 257) {
      targetLevel = parsed;
    } else {
      return m.reply(res.warn("Level hanya tersedia dari *1 sampai 257*!"));
    }
  } else {
    targetLevel = Math.floor(Math.random() * 257) + 1;
  }

  await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } }).catch(() => {});

  const lvlData = await getCachedLevel(targetLevel);
  if (!lvlData?.questions?.length) {
    await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => {});
    return m.reply(res.error(`Gagal memuat soal Level ${targetLevel}. Silakan coba beberapa saat lagi.`));
  }

  let question = null;
  if (pickBoss) {
    question =
      lvlData.bossQuestion ||
      lvlData.questions.find((q) => q.isBoss) ||
      lvlData.questions[lvlData.questions.length - 1];
  } else {
    question = lvlData.questions[Math.floor(Math.random() * lvlData.questions.length)];
  }

  if (!question || !question.imageBuffer) {
    await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => {});
    return m.reply(res.error("Gagal mengekstrak berkas gambar soal. Silakan coba lagi!"));
  }

  const isBoss = Boolean(question.isBoss);
  const baseXP = isBoss ? 300 : 150;
  const xpReward = baseXP + (question.answer.length * 10);
  const uangReward = xpReward * 10;

  const resp = await sock.sendMessage(
    m.from,
    {
      image: question.imageBuffer,
      caption:
        `*♯ TEBAK GAMBAR - ${isBoss ? "👑 RAJA GAMBAR" : `LEVEL ${question.level}`}*\n` +
        `Nomor Soal: *${question.number}/20*\n` +
        (lvlData.quotes ? `> _"${lvlData.quotes}"_\n\n` : "\n") +
        `⏱️ *Waktu:* 60 detik\n` +
        `🎁 *Hadiah:* ${xpReward} XP | ¥${uangReward.toLocaleString("id-ID")}\n\n` +
        `> • *Balas (reply)* gambar ini untuk menjawab!\n` +
        `> • Ketik \`clue\` untuk petunjuk huruf bantuan\n` +
        `> • Ketik \`nyerah\` jika tidak sanggup menjawab`,
    },
    { quoted: m }
  );

  if (!resp) return;

  const timeout = setTimeout(async () => {
    const s = sessions.get(m.from);
    if (!s || s.done) return;
    s.done = true;
    const r = await sock.sendMessage(
      m.from,
      {
        text:
          `⌛ *Waktu Habis!*\n` +
          `Jawaban yang benar adalah: *${question.answer.toUpperCase()}*\n\n` +
          `_Balas *lagi* untuk melanjutkan ke soal berikutnya._`,
      },
      { quoted: resp }
    );
    if (r) s.resultId = r.key.id;
  }, 60000);

  sessions.set(m.from, {
    level: question.level,
    number: question.number,
    answer: question.answer,
    normalizedAnswer: normalizeAnswer(question.answer),
    xp: xpReward,
    uang: uangReward,
    isBoss,
    questionId: resp.key.id,
    resultId: "",
    timeout,
    clueCount: 0,
    done: false,
  });

  await sock.sendMessage(m.from, { react: { text: "🎮", key: m.key } }).catch(() => {});
}

export default {
  cmd: ["tebakgambar", "tg", "tebakgbr"],
  category: "games",
  desc: "Game Tebak Gambar interaktif (257 Level / 5.140 Soal & Boss Raja Gambar)",

  exec: async (m, { sock, args, command }) => {
    const arg = (args[0] || "").toLowerCase();

    if (arg === "clue" || arg === "bantuan" || arg === "hint") {
      const session = sessions.get(m.from);
      if (!session || session.done) {
        return m.reply("❌ Tidak ada sesi permainan Tebak Gambar yang sedang aktif!");
      }
      session.clueCount = (session.clueCount || 0) + 1;
      const clue = makeClue(session.answer);
      return m.reply(`🔍 *Petunjuk Jawaban:*\n> \`${clue}\`\n\n_Jumlah huruf: ${session.answer.length}_`);
    }

    if (arg === "nyerah" || arg === "stop") {
      const session = sessions.get(m.from);
      if (!session || session.done) {
        return m.reply("❌ Tidak ada sesi permainan Tebak Gambar yang sedang aktif!");
      }
      clearTimeout(session.timeout);
      session.done = true;
      const r = await m.reply(
        `🛑 *Menyerah!*\nJawaban yang benar adalah: *${session.answer.toUpperCase()}*\n\n_Balas *lagi* untuk bermain lagi._`
      );
      if (r) session.resultId = r.key.id;
      return;
    }

    if (arg === "help" || arg === "?" || command.endsWith("?")) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} [level|boss|clue|nyerah]`,
          ["", "1", "25", "boss", "clue", "nyerah"],
          "• Mainkan soal acak dari 257 level resmi (5.140 soal)\n" +
          "• Ketik nama level untuk memilih level tertentu (1 - 257)\n" +
          "• Ketik *boss* untuk memainkan soal Raja Gambar\n" +
          "• Balas gambar soal dengan jawaban untuk menang XP & Yen RPG",
          "Game Tebak Gambar interaktif dari 257 level resmi"
        )
      );
    }

    await startTebakGambar(m, sock, args);
  },

  after: async (m, { sock }) => {
    if (!sessions.has(m.from)) return;
    const session = sessions.get(m.from);
    const text = (m.body || "").trim();
    const lower = text.toLowerCase();
    const cleanGuess = normalizeAnswer(text);

    if (!session.done) {
      const isQuoted = m.quoted && m.quoted.id === session.questionId;
      const isExact = cleanGuess === session.normalizedAnswer;

      if (!isQuoted && !isExact && !STOP_WORDS.has(lower) && !CLUE_WORDS.has(lower)) {
        return;
      }

      if (CLUE_WORDS.has(lower)) {
        session.clueCount = (session.clueCount || 0) + 1;
        const clue = makeClue(session.answer);
        return sock.sendMessage(
          m.from,
          {
            text: `🔍 *Petunjuk Jawaban:*\n> \`${clue}\`\n\n_Jumlah huruf: ${session.answer.length}_`,
          },
          { quoted: m }
        );
      }

      if (STOP_WORDS.has(lower)) {
        clearTimeout(session.timeout);
        session.done = true;
        const r = await sock.sendMessage(
          m.from,
          {
            text:
              `🛑 *Menyerah!*\n` +
              `Jawaban yang benar adalah: *${session.answer.toUpperCase()}*\n\n` +
              `_Balas *lagi* untuk bermain lagi._`,
          },
          { quoted: m }
        );
        if (r) session.resultId = r.key.id;
        return;
      }

      if (isExact) {
        clearTimeout(session.timeout);
        session.done = true;

        let levelUpMsg = "";
        try {
          let user = await UserRPG.findOne({ noWa: m.sender }).catch(() => null);
          if (!user) {
            user = new UserRPG({ noWa: m.sender, name: m.pushName || "Player" });
          }
          if (user) {
            user.exp = (user.exp || 0) + session.xp;
            user.yen = (user.yen || 0) + session.uang;
            const up = checkLevelUp(user.exp, user.level);
            if (up?.isNaik) {
              user.level = up.levelBaru;
              user.exp = up.sisaXp;
              user.yen += up.hadiah;
              levelUpMsg = `\n🎉 *LEVEL UP!* Naik ke level *${user.level}* (Bonus Hadiah: ¥${up.hadiah.toLocaleString("id-ID")})`;
            }
            await user.save().catch(() => {});
          }
        } catch (err) {
          console.error("[TEBAKGAMBAR RPG ERROR]", err);
        }

        await sock.sendMessage(m.from, { react: { text: "🎉", key: m.key } }).catch(() => {});

        const result = await sock.sendMessage(
          m.from,
          {
            text:
              `🎉 *TEBAKAN BENAR!*\n` +
              `> Selamat @${m.sender.split("@")[0]}!\n\n` +
              `• Jawaban: *${session.answer.toUpperCase()}*\n` +
              `• Kategori: *${session.isBoss ? "👑 Raja Gambar" : `Level ${session.level}`}*\n\n` +
              `🎁 *Hadiah Didapatkan:*\n` +
              `• 🌟 *+${session.xp} XP*\n` +
              `• 💵 *+¥${session.uang.toLocaleString("id-ID")}*${levelUpMsg}\n\n` +
              `_Balas *lagi* untuk melanjutkan ke soal berikutnya, atau *stop* untuk berhenti._`,
            mentions: [m.sender],
          },
          { quoted: m }
        );

        if (result) session.resultId = result.key.id;
        return;
      }

      if (isQuoted) {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } }).catch(() => {});
      }
    } else if (session.done && m.quoted && m.quoted.id === session.resultId) {
      if (REPLAY_WORDS.has(lower)) {
        await sock.sendMessage(m.from, { react: { text: "🔄", key: m.key } }).catch(() => {});
        const nextLevel = session.level;
        sessions.delete(m.from);
        await startTebakGambar(m, sock, [String(nextLevel)]);
      } else if (STOP_WORDS.has(lower)) {
        sessions.delete(m.from);
        await sock.sendMessage(m.from, { text: "🛑 *Permainan Selesai.* Terima kasih sudah bermain!" }, { quoted: m });
      }
    }
  },
};
