/**
 * Adapted from Ginko project (https://github.com/ginkohub/mushi)
 */

import UserRPG from '../../src/rpg/schema.js';
import { checkLevelUp } from '../../src/rpg/core.js';

const sessions = new Map();
const STOP_WORDS = new Set(["stop", "nyerah"]);

const WIN_PATTERNS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

const EMOJI_MAP = {
    " ": ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"],
    "X": "❌",
    "O": "⭕"
};

function renderBoard(board) {
    const lines = [];
    for (let i = 0; i < 9; i += 3) {
        const row = [
            board[i] === " " ? EMOJI_MAP[" "][i] : EMOJI_MAP[board[i]],
            board[i + 1] === " " ? EMOJI_MAP[" "][i + 1] : EMOJI_MAP[board[i + 1]],
            board[i + 2] === " " ? EMOJI_MAP[" "][i + 2] : EMOJI_MAP[board[i + 2]]
        ];
        lines.push(row.join(" | "));
    }
    return lines.join("\n-----------\n");
}

function checkWin(board, player) {
    return WIN_PATTERNS.some(pattern => pattern.every(index => board[index] === player));
}

function checkDraw(board) {
    return board.every(spot => spot !== " ");
}

function getBotMove(board) {
    for (let i = 0; i < 9; i++) {
        if (board[i] === " ") {
            board[i] = "O";
            if (checkWin(board, "O")) { board[i] = " "; return i; }
            board[i] = " ";
        }
    }
    for (let i = 0; i < 9; i++) {
        if (board[i] === " ") {
            board[i] = "X";
            if (checkWin(board, "X")) { board[i] = " "; return i; }
            board[i] = " ";
        }
    }
    if (board[4] === " ") return 4;
    const corners = [0, 2, 6, 8].filter(i => board[i] === " ");
    if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
    
    const available = [];
    for (let i = 0; i < 9; i++) {
        if (board[i] === " ") available.push(i);
    }
    return available[Math.floor(Math.random() * available.length)];
}

function formatMention(jid) {
    if (jid === "bot") return "🤖 BOT";
    return `@${jid.split("@")[0]}`;
}

const delay = ms => new Promise(res => setTimeout(res, ms));

export default {
    cmd: ["tictactoe", "ttt", "tictactoe?"],
    category: "games",
    desc: "Mainkan Tic-Tac-Toe melawan bot atau tantang teman Anda!",
    exec: async (m, { sock, command }) => {
        if (command.endsWith('?')) {
            const helpText = [
                "❌ *TIC-TAC-TOE (TTT)* ⭕",
                "",
                "Mainkan Tic-Tac-Toe melawan bot atau tantang teman Anda!",
                `Perintah:\n- \`${m.prefix}ttt\` : Bermain melawan bot.\n- \`${m.prefix}ttt @user\` : Menantang teman.`,
                "",
                "📝 *Cara Bermain:*",
                "- Balas/Quote pesan papan game dengan angka `1-9` untuk melangkah.",
                "- Dapatkan 3 baris (horizontal, vertikal, atau diagonal) untuk menang!"
            ];
            return m.reply(helpText.join("\n"));
        }

        if (sessions.has(m.from)) {
            return m.reply("❌ Sudah ada sesi game Tic-Tac-Toe yang aktif di obrolan ini!");
        }

        let opponentJid = "bot";
        if (m.mentionedJid && m.mentionedJid.length > 0) {
            opponentJid = m.mentionedJid[0];
            if (opponentJid === m.sender) {
                return m.reply("❌ Lawan tidak valid! Tag seseorang atau ketik tanpa tag untuk melawan bot.");
            }
        }

        const board = Array(9).fill(" ");
        const playerX = m.sender;
        const playerO = opponentJid;
        const turn = playerX;

        const boardStr = renderBoard(board);
        const gameInfo = `🎮 *Tic-Tac-Toe Dimulai!*\n❌ *Pemain 1:* ${formatMention(playerX)}\n⭕ *Pemain 2:* ${formatMention(playerO)}\n\n*Giliran:* ${formatMention(turn)}\n_Balas pesan papan game dengan angka 1-9 untuk melangkah._`;

        const responseText = `${gameInfo}\n\n${boardStr}`;
        const mentions = [playerX, playerO].filter(p => p !== "bot");

        const resp = await m.reply(responseText, { mentions });

        const timeout = setTimeout(async () => {
            if (sessions.has(m.from)) {
                sessions.delete(m.from);
                await sock.sendMessage(m.from, { text: "⌛ *Waktu Habis!* Permainan berakhir karena tidak ada aktivitas." });
            }
        }, 60000);

        sessions.set(m.from, {
            board,
            playerX,
            playerO,
            turn,
            boardIds: new Set([resp.key.id]),
            timeout,
            movesX: [],
            movesO: []
        });
    },

    after: async (m, { sock }) => {
        if (!sessions.has(m.from) || !m.quoted) return;

        const session = sessions.get(m.from);
        if (!session.boardIds.has(m.quoted.id)) return;

        const senderJid = m.sender;
        const text = m.body?.toLowerCase().trim();

        if (STOP_WORDS.has(text)) {
            clearTimeout(session.timeout);
            sessions.delete(m.from);
            return m.reply("🛑 *Game dihentikan*");
        }

        const move = parseInt(m.body?.trim(), 10) - 1;

        if (senderJid !== session.turn) {
            return m.reply(`⚠️ Ini bukan giliranmu! Giliran saat ini: ${formatMention(session.turn)}`, { mentions: [session.turn].filter(p => p !== "bot") });
        }

        if (Number.isNaN(move) || move < 0 || move > 8 || session.board[move] !== " ") {
            return m.reply("❌ Langkah tidak valid! Kotak sudah terisi atau tidak valid.");
        }

        clearTimeout(session.timeout);

        const currentMarker = session.turn === session.playerX ? "X" : "O";
        session.board[move] = currentMarker;

        const movesKey = currentMarker === "X" ? "movesX" : "movesO";
        session[movesKey].push(move);
        if (session[movesKey].length > 3) {
            const removed = session[movesKey].shift();
            session.board[removed] = " ";
        }

        if (checkWin(session.board, currentMarker)) {
            sessions.delete(m.from);
            const totalMoves = session.movesX.length + session.movesO.length;
            const xp = totalMoves * 10;
            const uang = xp * 5;

            let user = await UserRPG.findOne({ noWa: session.turn });
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

            const boardStr = renderBoard(session.board);
            const winMsg = `🎉 *Selamat!* ${formatMention(session.turn)} memenangkan permainan!\n🌟 *+${xp} XP*\n💵 *+¥${uang}*${levelUpMsg}\n(setelah ${totalMoves} giliran)`;
            const mentions = [session.playerX, session.playerO].filter(p => p !== "bot");
            return m.reply(`${winMsg}\n\n${boardStr}`, { mentions });
        }

        if (checkDraw(session.board)) {
            sessions.delete(m.from);
            const boardStr = renderBoard(session.board);
            const drawMsg = "🤝 *Seri!* Permainan berakhir dengan hasil imbang.";
            const mentions = [session.playerX, session.playerO].filter(p => p !== "bot");
            return m.reply(`${drawMsg}\n\n${boardStr}`, { mentions });
        }

        session.turn = session.turn === session.playerX ? session.playerO : session.playerX;

        if (session.turn === "bot") {
            await sock.sendMessage(m.from, { react: { text: "⌛", key: m.key } });
            await delay(1500);

            const botMove = getBotMove(session.board);
            session.board[botMove] = "O";

            session.movesO.push(botMove);
            if (session.movesO.length > 3) {
                const removed = session.movesO.shift();
                session.board[removed] = " ";
            }

            if (checkWin(session.board, "O")) {
                sessions.delete(m.from);
                await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
                const totalMoves = session.movesX.length + session.movesO.length;
                const boardStr = renderBoard(session.board);
                const winMsg = `🎉 *Selamat!* ${formatMention("bot")} memenangkan permainan!\n(setelah ${totalMoves} giliran)`;
                const mentions = [session.playerX].filter(p => p !== "bot");
                return m.reply(`${winMsg}\n\n${boardStr}`, { mentions });
            }

            if (checkDraw(session.board)) {
                sessions.delete(m.from);
                await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
                const boardStr = renderBoard(session.board);
                const drawMsg = "🤝 *Seri!* Permainan berakhir dengan hasil imbang.";
                const mentions = [session.playerX].filter(p => p !== "bot");
                return m.reply(`${drawMsg}\n\n${boardStr}`, { mentions });
            }

            session.turn = session.playerX;
            const boardStr = renderBoard(session.board);
            const nextTurnMsg = `👉 *Giliran:* ${formatMention(session.turn)}`;
            const responseText = `${nextTurnMsg}\n\n${boardStr}`;
            const mentions = [session.playerX, session.playerO].filter(p => p !== "bot");

            const botResp = await sock.sendMessage(m.from, { text: responseText, mentions }, { quoted: m });
            session.boardIds.add(botResp.key.id);

            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });

            session.timeout = setTimeout(async () => {
                if (sessions.has(m.from)) {
                    sessions.delete(m.from);
                    await sock.sendMessage(m.from, { text: "⌛ *Waktu Habis!* Permainan berakhir karena tidak ada aktivitas." });
                }
            }, 60000);
            return;
        }

        const boardStr = renderBoard(session.board);
        const nextTurnMsg = `👉 *Giliran:* ${formatMention(session.turn)}`;
        const responseText = `${nextTurnMsg}\n\n${boardStr}`;
        const mentions = [session.playerX, session.playerO].filter(p => p !== "bot");

        const playerResp = await sock.sendMessage(m.from, { text: responseText, mentions }, { quoted: m });
        session.boardIds.add(playerResp.key.id);

        session.timeout = setTimeout(async () => {
            if (sessions.has(m.from)) {
                sessions.delete(m.from);
                await sock.sendMessage(m.from, { text: "⌛ *Waktu Habis!* Permainan berakhir karena tidak ada aktivitas." });
            }
        }, 60000);
    }
};
