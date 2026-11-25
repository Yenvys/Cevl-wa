import UserRPG from "../../src/rpg/schema.js";
import { checkLevelUp } from "../../src/rpg/core.js";

const sessions = new Map();
const REPLAY_WORDS = new Set(["lagi", "lanjut", "again", "next"]);
const STOP_WORDS = new Set(["stop", "nyerah"]);

const LEVELS = {
  easy: { range: 50, mult: 10, xp: 20 },
  medium: { range: 200, mult: 20, xp: 40 },
  hard: { range: 1000, mult: 50, xp: 60 },
  impossible: { range: 5000, mult: 100, xp: 150 },
};

const LEVEL_ALIAS = { e: "easy", m: "medium", h: "hard", i: "impossible" };

async function startGame(m, sock, levelName) {
  const selectedLevel = LEVEL_ALIAS[levelName] || levelName || "easy";
  const level = LEVELS[selectedLevel] || LEVELS.easy;
  const op = ["+", "-", "*"][Math.floor(Math.random() * 3)];
  let a, b, answer;

  if (op === "*") {
    a = Math.floor(Math.random() * level.mult) + 1;
    b = Math.floor(Math.random() * level.mult) + 1;
    answer = a * b;
  } else {
    a = Math.floor(Math.random() * level.range) + 1;
    b = Math.floor(Math.random() * level.range) + 1;
    answer = op === "+" ? a + b : a - b;
  }

  const resp = await sock.sendMessage(m.from, {
    text: `*♯ ${selectedLevel.toUpperCase()}*\nBerapakah hasil dari *${a} ${op} ${b}*?\n\n⏱️ *Waktu:* 30 detik\n🎁 *Hadiah:* ${level.xp} XP\n> _Reply chat ini untuk menjawab!_`,
  }, { quoted: m });

  if (!resp) return;

  const timeout = setTimeout(async () => {
    const s = sessions.get(m.from);
    if (!s || s.done) return;
    s.done = true;
    const r = await sock.sendMessage(m.from, { text: `⌛ *Waktu habis!*\n\nJawabannya adalah *${answer}*` }, { quoted: resp });
    if (r) s.resultId = r.key.id;
  }, 30000);

  sessions.set(m.from, {
    answer,
    timeout,
    xp: level.xp,
    questionId: resp.key.id,
    level: selectedLevel,
    done: false,
    resultId: "",
  });
}

export default {
  cmd: ["math"],
  category: "games",
  desc: "Game matematika (easy, medium, hard, impossible)",
  exec: async (m, { sock, args, command }) => {
    const levelArg = (args[0] || "").toLowerCase();
    if (!levelArg || levelArg === "?" || command.endsWith("?")) {
      return m.reply(
        `*♯ MATH GAME - CARA BERMAIN*\n\nGunakan perintah \`${m.prefix}math [level]\` untuk memulai.\n\n` +
        `*Daftar Level:*\n\`e\` / \`easy\` : 20 XP\n\`m\` / \`medium\` : 40 XP\n\`h\` / \`hard\` : 60 XP\n\`i\` / \`impossible\` : 150 XP\n\n` +
        `> Reply pesan soal untuk menjawab (Waktu: 30 detik).`
      );
    }

    const existing = sessions.get(m.from);
    if (existing && !existing.done) return m.reply("❌ Masih ada soal yang belum terjawab di grup ini!");
    await startGame(m, sock, levelArg);
  },

  after: async (m, { sock }) => {
    if (!sessions.has(m.from) || !m.quoted) return;
    const session = sessions.get(m.from);
    const text = m.body?.toLowerCase().trim();

    if (!session.done) {
      if (m.quoted.id !== session.questionId) return;

      if (parseInt(m.body, 10) === session.answer) {
        clearTimeout(session.timeout);
        session.done = true;
        const xp = session.xp;
        const uang = xp * 10;

        let levelUpMsg = "";
        const user = await UserRPG.findOne({ noWa: m.sender });
        if (user) {
          user.exp += xp;
          user.yen += uang;
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
          text: `🎉 *Selamat* @${m.sender.split("@")[0]}!\nJawaban benar: *${session.answer}*\n\n🌟 *+${xp} XP*\n💵 *+¥${uang}*${levelUpMsg}\n\nBalas _lagi_ untuk main lagi, atau _stop_ untuk berhenti`,
          mentions: [m.sender],
        }, { quoted: m });

        if (result) session.resultId = result.key.id;
      } else if (STOP_WORDS.has(text)) {
        clearTimeout(session.timeout);
        sessions.delete(m.from);
        await m.reply("🛑 *Permainan dihentikan*");
      } else {
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
      }
    } else if (m.quoted.id === session.resultId) {
      if (REPLAY_WORDS.has(text)) {
        await sock.sendMessage(m.from, { react: { text: "🔄", key: m.key } });
        sessions.delete(m.from);
        await startGame(m, sock, session.level);
      } else if (STOP_WORDS.has(text)) {
        sessions.delete(m.from);
        await m.reply("🛑 *Permainan dihentikan*");
      }
    }
  },
};
