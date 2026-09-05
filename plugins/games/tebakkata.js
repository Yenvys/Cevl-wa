/**
 * Adapted from Ginko project (https://github.com/ginkohub/mushi)
 * Credits to MichaelAgam23 for game data (https://github.com/MichaelAgam23/metadata)
 */

import fs from 'node:fs';
import path from 'node:path';
import UserRPG from '../../src/rpg/schema.js';
import { checkLevelUp } from '../../src/rpg/core.js';

const sessions = new Map();

const REPLAY_WORDS = new Set(["lagi", "lanjut", "again", "next"]);
const STOP_WORDS = new Set(["stop", "nyerah"]);

const LEVEL_ALIAS = {
    e: "easy",
    m: "medium",
    h: "hard",
};

const WORD_URL = "https://raw.githubusercontent.com/ginkohub/game-assets/main/tebak-kata/data.json";
const wordFilePath = path.join(process.cwd(), 'data', 'tebak_kata.json');

let wordList = { easy: [], medium: [], hard: [] };

function loadWords() {
    try {
        if (fs.existsSync(wordFilePath)) {
            wordList = JSON.parse(fs.readFileSync(wordFilePath, 'utf-8'));
        }
    } catch (e) {
        console.error('[TK] Failed to load tebak_kata.json:', e.message);
    }
}

loadWords();

async function fetchWords() {
    try {
        const res = await fetch(WORD_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid data format');

        const newWordList = {
            easy: data.filter(w => w.jawaban.length <= 6),
            medium: data.filter(w => w.jawaban.length >= 7 && w.jawaban.length <= 9),
            hard: data.filter(w => w.jawaban.length >= 10),
        };

        fs.writeFileSync(wordFilePath, JSON.stringify(newWordList, null, 2));
        wordList = newWordList;
        return newWordList;
    } catch (e) {
        console.error('[TK] Fetch failed:', e.message);
        return null;
    }
}

async function startGame(m, sock, levelName) {
    const selectedLevel = LEVEL_ALIAS[levelName] || levelName || "easy";
    const words = wordList[selectedLevel] || wordList.easy;

    if (!words || words.length === 0) {
        return m.reply(`❌ Data kata tidak ditemukan atau kosong! Gunakan \`${m.prefix}tk.update\` untuk sinkronisasi.`);
    }

    const item = words[Math.floor(Math.random() * words.length)];
    const answer = item.jawaban.toUpperCase();
    const clues = item.soal;

    const xpMultiplier = selectedLevel === "hard" ? 30 : selectedLevel === "medium" ? 20 : 10;
    const xpReward = answer.length * xpMultiplier;
    const uangReward = xpReward * 10;

    const texts = [
        `*♯ ${selectedLevel.toUpperCase()}* `,
        `Petunjuk: *${clues}*`,
        "",
        ` *Waktu:* 45 detik`,
        ` *Hadiah:* ${xpReward} XP | ¥${uangReward}`,
        `> _Reply chat ini untuk menjawab!_`
    ];

    const resp = await sock.sendMessage(m.from, { text: texts.join("\n") }, { quoted: m });

    if (!resp) return;

    const timeout = setTimeout(async () => {
        const s = sessions.get(m.from);
        if (!s || s.done) return;
        s.done = true;
        const r = await sock.sendMessage(m.from, {
            text: `⌛ *Waktu habis!*\nJawabannya adalah *${answer}*`
        }, { quoted: resp });
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
    cmd: ['tk', 'tk?', 'tebakkata', 'tebakkata?', 'tk.update'],
    category: 'games',
    desc: 'Game Tebak Kata berdasarkan petunjuk',
    exec: async (m, { sock, args, command }) => {
        // Subcommand: update word list
        if (command === 'tk.update') {
            if (!m.isOwner) return m.reply('Perintah ini hanya untuk Owner.');

            await sock.sendMessage(m.from, { react: { text: '⌛', key: m.key } });

            const result = await fetchWords();
            if (result) {
                await sock.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                return m.reply(
                    ` *Sinkronisasi Berhasil!*\n\n` +
                    ` *Mudah:* ${result.easy.length} kata\n` +
                    ` *Sedang:* ${result.medium.length} kata\n` +
                    ` *Sulit:* ${result.hard.length} kata\n\n` +
                    `Data disimpan dan dimuat ulang!`
                );
            } else {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                return m.reply('❌ *Sinkronisasi Gagal!* Cek koneksi atau URL sumber data.');
            }
        }

        // Subcommand: help
        const levelArg = (args[0] || "").toLowerCase();
        if (command.endsWith('?') || levelArg === '?') {
            const helpText = [
                "*♯ TEBAK KATA*",
                "",
                "Tebaklah kata berdasarkan petunjuk yang diberikan!",
                `Gunakan perintah \`${m.prefix}tk [level]\` untuk memulai.`,
                "",
                "*Daftar Level & Inisial:*",
                "`e` / `easy` : 1-6 huruf",
                "`m` / `medium` : 7-9 huruf",
                "`h` / `hard` : 10+ huruf",
                `*Contoh:* \`${m.prefix}tk m\` atau \`${m.prefix}tk h\``,
                "",
                "> - Harus *Reply/Quote* pesan soal untuk menjawab.",
                "> - Waktu menjawab adalah 45 detik.",
                `> ⚙️ \`${m.prefix}tk.update\` untuk sinkronisasi kata.`
            ];
            return m.reply(helpText.join("\n"));
        }

        // Cek session aktif
        const existing = sessions.get(m.from);
        if (existing && !existing.done) {
            return m.reply("❌ Masih ada soal yang belum terjawab di grup ini!");
        }

        // Auto-fetch jika data kosong
        if (!wordList.easy.length && !wordList.medium.length && !wordList.hard.length) {
            await fetchWords();
        }

        await startGame(m, sock, levelArg);
    },

    after: async (m, { sock }) => {
        if (!sessions.has(m.from) || !m.quoted) return;

        const session = sessions.get(m.from);

        if (!session.done) {
            if (m.quoted.id !== session.questionId) return;

            const userAnswer = m.body?.toLowerCase().trim();

            if (userAnswer === session.answer) {
                clearTimeout(session.timeout);
                session.done = true;

                const xp = session.xp;
                const uang = session.uang;

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
                    text: `🎉 *Selamat* @${m.sender.split("@")[0]}!\nJawaban kamu benar: *${session.answer.toUpperCase()}*\n\n🌟 *+${xp} XP*\n💵 *+¥${uang}*${levelUpMsg}\n\nBalas _lagi/lanjut/again/next_ untuk main lagi, atau _stop/nyerah_ untuk berhenti`,
                    mentions: [m.sender]
                }, { quoted: m });

                if (result) session.resultId = result.key.id;
            } else if (STOP_WORDS.has(userAnswer)) {
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
