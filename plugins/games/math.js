/**
 * Adapted from Ginko project (https://github.com/ginkohub/mushi)
 */

import UserRPG from '../../src/rpg/schema.js';
import { checkLevelUp } from '../../src/rpg/core.js';

const sessions = new Map();

const REPLAY_WORDS = new Set(["lagi", "lanjut", "again", "next"]);
const STOP_WORDS = new Set(["stop", "nyerah"]);

const LEVELS = {
    easy: { range: 50, mult: 10, xp: 20 },
    medium: { range: 200, mult: 20, xp: 40 },
    hard: { range: 1000, mult: 50, xp: 60 },
    impossible: { range: 5000, mult: 100, xp: 150 },
};

const LEVEL_ALIAS = {
    e: "easy",
    m: "medium",
    h: "hard",
    i: "impossible",
};

async function startGame(m, sock, levelName) {
    const selectedLevel = LEVEL_ALIAS[levelName] || levelName || "easy";
    const level = LEVELS[selectedLevel] || LEVELS.easy;

    const operators = ["+", "-", "*"];
    const op = operators[Math.floor(Math.random() * operators.length)];
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

    const xpReward = level.xp;

    const texts = [
        `🧮 [ Level: *${selectedLevel.toUpperCase()}* ]`,
        `Berapakah hasil dari *${a} ${op} ${b}*?`,
        "",
        `⏱️ *Waktu:* 30 detik`,
        `🎁 *Hadiah:* ${xpReward} XP`,
        "",
        `📝 *Note:*`,
        `_Reply chat ini untuk menjawab!_`
    ];

    const resp = await sock.sendMessage(m.from, { text: texts.join("\n") }, { quoted: m });
    
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
        xp: xpReward,
        questionId: resp.key.id,
        level: selectedLevel,
        done: false,
        resultId: "",
    });
}

export default {
    cmd: ["math", "math?"],
    category: "games",
    desc: "Game matematika (easy, medium, hard, impossible)",
    exec: async (m, { sock, args, command }) => {
        const levelArg = (args[0] || "").toLowerCase();

        if (command.endsWith("?") || levelArg === "?") {
            const helpText = [
                "🧮 *MATH GAME - CARA BERMAIN*",
                "",
                `Gunakan perintah \`${m.prefix}math [level]\` untuk memulai.`,
                "",
                "*Daftar Level & Inisial:*",
                "🟢 `e` / `easy` : 20 XP",
                "🟡 `m` / `medium` : 40 XP",
                "🔴 `h` / `hard` : 60 XP",
                "💀 `i` / `impossible` : 150 XP",
                "",
                `💡 *Contoh:* \`${m.prefix}math m\` atau \`${m.prefix}math h\``,
                "",
                "⚠️ *Penting:*",
                "- Harus *Reply/Quote* pesan soal untuk menjawab.",
                "- Waktu menjawab adalah 30 detik."
            ];
            return m.reply(helpText.join("\n"));
        }

        const existing = sessions.get(m.from);
        if (existing && !existing.done) {
            return m.reply("❌ Masih ada soal yang belum terjawab di grup ini!");
        }

        await startGame(m, sock, levelArg);
    },

    after: async (m, { sock }) => {
        if (!sessions.has(m.from) || !m.quoted) return;
        
        const session = sessions.get(m.from);

        if (!session.done) {
            if (m.quoted.id !== session.questionId) return;

            const userAnswer = parseInt(m.body, 10);
            const text = m.body?.toLowerCase().trim();

            if (userAnswer === session.answer) {
                clearTimeout(session.timeout);
                session.done = true;

                const xp = session.xp;
                const uang = xp * 10;
                
                let user = await UserRPG.findOne({ noWa: m.sender });
                let levelUpMsg = "";
                if (user) {
                    user.exp += xp;
                    user.yen += uang;
                    const cekLevel = checkLevelUp(user.exp, user.level);
                    if (cekLevel.isNaik) {
                        user.level = cekLevel.levelBaru;
                        user.exp = cekLevel.sisaXp;
                        user.yen += cekLevel.hadiah;
                        levelUpMsg = `\n🎉 *LEVEL UP!* Naik ke level ${user.level} (Hadiah: ¥${cekLevel.hadiah})`;
                    }
                    await user.save();
                }
                
                const result = await sock.sendMessage(m.from, {
                    text: `🎉 *Selamat* @${m.sender.split("@")[0]}!\nJawaban kamu benar: *${session.answer}*\n\n🌟 *+${xp} XP*\n💵 *+¥${uang}*${levelUpMsg}\n\nBalas _lagi/lanjut/again/next_ untuk main lagi, atau _stop/nyerah_ untuk berhenti`,
                    mentions: [m.sender]
                }, { quoted: m });
                
                if (result) session.resultId = result.key.id;
            } else if (STOP_WORDS.has(text)) {
                clearTimeout(session.timeout);
                sessions.delete(m.from);
                await m.reply("🛑 *Permainan dihentikan*");
            } else {
                return await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            }
        } else {
            const text = m.body?.toLowerCase().trim();
            if (m.quoted.id !== session.resultId) return;

            if (REPLAY_WORDS.has(text)) {
                await sock.sendMessage(m.from, { react: { text: "🔄", key: m.key } });
                sessions.delete(m.from);
                await startGame(m, sock, session.level);
            } else if (STOP_WORDS.has(text)) {
                sessions.delete(m.from);
                await m.reply("🛑 *Permainan dihentikan*");
            }
        }
    }
};
