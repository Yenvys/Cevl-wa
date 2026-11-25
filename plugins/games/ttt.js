import UserRPG from "../../src/rpg/schema.js";
import { checkLevelUp } from "../../src/rpg/core.js";

const sessions = new Map();
const pendingInvites = new Map();
const STOP_WORDS = new Set(["stop", "nyerah"]);
const GAME_TIMEOUT = 90000;
const INVITE_TIMEOUT = 60000;

const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const EMOJI_MAP = {
  " ": ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"],
  X: "❌",
  O: "⭕",
};

function renderBoard(board) {
  const lines = [];
  for (let i = 0; i < 9; i += 3) {
    lines.push([
      board[i] === " " ? EMOJI_MAP[" "][i] : EMOJI_MAP[board[i]],
      board[i + 1] === " " ? EMOJI_MAP[" "][i + 1] : EMOJI_MAP[board[i + 1]],
      board[i + 2] === " " ? EMOJI_MAP[" "][i + 2] : EMOJI_MAP[board[i + 2]],
    ].join(" | "));
  }
  return lines.join("\n-----------\n");
}

const checkWin = (board, p) => WIN_PATTERNS.some((pat) => pat.every((idx) => board[idx] === p));
const checkDraw = (board) => board.every((s) => s !== " ");
const formatMention = (jid) => (jid === "bot" ? "🤖 BOT" : `@${jid.split("@")[0]}`);
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

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
  const corners = [0, 2, 6, 8].filter((i) => board[i] === " ");
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  const available = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => board[i] === " ");
  return available[Math.floor(Math.random() * available.length)];
}

async function handleWin(m, sock, session, winner) {
  sessions.delete(m.from);
  const totalMoves = session.movesX.length + session.movesO.length;
  const xp = totalMoves * 10;
  const uang = xp * 5;

  let levelUpMsg = "";
  if (winner !== "bot") {
    const user = await UserRPG.findOne({ noWa: winner });
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
  }

  const boardStr = renderBoard(session.board);
  const reward = winner !== "bot" ? `\n🌟 *+${xp} XP*\n💵 *+¥${uang}*${levelUpMsg}` : "";
  const mentions = [session.playerX, session.playerO].filter((p) => p !== "bot");
  return m.reply(`🎉 *Selamat!* ${formatMention(winner)} memenangkan permainan!${reward}\n(setelah ${totalMoves} giliran)\n\n${boardStr}`, { mentions });
}

async function handleDraw(m, sock, session) {
  sessions.delete(m.from);
  const mentions = [session.playerX, session.playerO].filter((p) => p !== "bot");
  return m.reply(`🤝 *Seri!* Permainan berakhir imbang.\n\n${renderBoard(session.board)}`, { mentions });
}

async function handleBotTurn(m, sock, session) {
  await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
  await delay(1200);

  const botMove = getBotMove(session.board);
  session.board[botMove] = "O";
  session.movesO.push(botMove);
  if (session.movesO.length > 3) session.board[session.movesO.shift()] = " ";

  await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
  if (checkWin(session.board, "O")) return await handleWin(m, sock, session, "bot");
  if (checkDraw(session.board)) return await handleDraw(m, sock, session);

  session.turn = session.playerX;
  const resp = await sock.sendMessage(m.from, {
    text: `👉 *Giliran:* ${formatMention(session.turn)}\n\n${renderBoard(session.board)}`,
    mentions: [session.playerX].filter((p) => p !== "bot"),
  }, { quoted: m });
  session.boardIds.add(resp.key.id);

  session.timeout = setTimeout(async () => {
    if (sessions.has(m.from)) {
      sessions.delete(m.from);
      await sock.sendMessage(m.from, { text: "⌛ *Waktu Habis!* Permainan berakhir." });
    }
  }, GAME_TIMEOUT);
}

async function startGame(m, sock, playerX, playerO) {
  const board = Array(9).fill(" ");
  const gameInfo =
    `🎮 *Tic-Tac-Toe Dimulai!*\n❌ *Pemain 1:* ${formatMention(playerX)}\n⭕ *Pemain 2:* ${formatMention(playerO)}\n\n` +
    `👉 *Giliran:* ${formatMention(playerX)}\n_Balas papan game dengan angka 1-9._\n_Ketik *stop* / *nyerah* untuk berhenti._`;

  const mentions = [playerX, playerO].filter((p) => p !== "bot");
  const resp = await sock.sendMessage(m.from, { text: `${gameInfo}\n\n${renderBoard(board)}`, mentions }, { quoted: m });

  const timeout = setTimeout(async () => {
    if (sessions.has(m.from)) {
      sessions.delete(m.from);
      await sock.sendMessage(m.from, { text: "⌛ *Waktu Habis!* Permainan berakhir." });
    }
  }, GAME_TIMEOUT);

  sessions.set(m.from, {
    board,
    playerX,
    playerO,
    turn: playerX,
    boardIds: new Set([resp.key.id]),
    timeout,
    movesX: [],
    movesO: [],
  });
}

export default {
  cmd: ["tictactoe", "ttt"],
  category: "games",
  desc: "Tic-Tac-Toe melawan bot atau pemain lain",
  exec: async (m, { sock, args, command }) => {
    const sub = (args[0] || "").toLowerCase();

    if (!sub && !m.mentionedJid?.length && !m.quoted) {
      return m.reply(
        `*♯ TIC-TAC-TOE - CARA BERMAIN*\n\n` +
        `\`${m.prefix}${command} ai\` : Lawan bot\n` +
        `\`${m.prefix}${command} @user\` : Tantang teman\n` +
        `\`${m.prefix}${command} acc\` : Terima tantangan\n\n` +
        `> Max 3 bidak per pemain (bidak lama otomatis hilang).`
      );
    }

    if (sub === "acc" || sub === "accept" || sub === "terima") {
      const invite = pendingInvites.get(m.from);
      if (!invite) return m.reply("❌ Tidak ada tantangan di obrolan ini.");
      if (m.sender !== invite.target) return m.reply(`⚠️ Tantangan ini untuk ${formatMention(invite.target)}.`, { mentions: [invite.target] });

      clearTimeout(invite.timeout);
      pendingInvites.delete(m.from);
      if (sessions.has(m.from)) return m.reply("❌ Masih ada game aktif!");
      return startGame(m, sock, invite.challenger, invite.target);
    }

    if (sub === "ai" || sub === "bot") {
      if (sessions.has(m.from)) return m.reply("❌ Masih ada game aktif!");
      return startGame(m, sock, m.sender, "bot");
    }

    const opponentJid = m.mentionedJid?.[0] || m.quoted?.sender;
    if (!opponentJid) return m.reply(`❌ Tag atau reply seseorang untuk menantang!`);
    if (opponentJid === m.sender) return m.reply("❌ Tidak bisa menantang diri sendiri!");
    if (sessions.has(m.from)) return m.reply("❌ Masih ada game aktif!");
    if (pendingInvites.has(m.from)) return m.reply("❌ Masih ada tantangan yang menunggu!");

    const inviteTimeout = setTimeout(async () => {
      if (pendingInvites.has(m.from)) {
        pendingInvites.delete(m.from);
        await sock.sendMessage(m.from, {
          text: `⌛ Tantangan dari ${formatMention(m.sender)} ke ${formatMention(opponentJid)} kedaluwarsa.`,
          mentions: [m.sender, opponentJid],
        });
      }
    }, INVITE_TIMEOUT);

    pendingInvites.set(m.from, { challenger: m.sender, target: opponentJid, timeout: inviteTimeout });
    return m.reply(
      `⚔️ *TANTANGAN TIC-TAC-TOE!*\n\n${formatMention(m.sender)} menantang ${formatMention(opponentJid)}!\n` +
      `Ketik *${m.prefix}${command} acc* dalam 60 detik untuk menerima.`,
      { mentions: [m.sender, opponentJid] }
    );
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
      return m.reply(`🏳️ *${formatMention(senderJid)} menyerah!* Game berakhir.`, {
        mentions: [session.playerX, session.playerO].filter((p) => p !== "bot"),
      });
    }

    const move = parseInt(m.body?.trim(), 10) - 1;
    if (senderJid !== session.turn) {
      return m.reply(`⚠️ Giliran saat ini: ${formatMention(session.turn)}`, { mentions: [session.turn].filter((p) => p !== "bot") });
    }
    if (Number.isNaN(move) || move < 0 || move > 8 || session.board[move] !== " ") {
      return m.reply("❌ Langkah tidak valid! Pilih angka 1-9 pada kotak kosong.");
    }

    clearTimeout(session.timeout);
    const marker = session.turn === session.playerX ? "X" : "O";
    session.board[move] = marker;

    const movesKey = marker === "X" ? "movesX" : "movesO";
    session[movesKey].push(move);
    if (session[movesKey].length > 3) session.board[session[movesKey].shift()] = " ";

    if (checkWin(session.board, marker)) return await handleWin(m, sock, session, session.turn);
    if (checkDraw(session.board)) return await handleDraw(m, sock, session);

    session.turn = session.turn === session.playerX ? session.playerO : session.playerX;
    if (session.turn === "bot") return await handleBotTurn(m, sock, session);

    const mentions = [session.playerX, session.playerO].filter((p) => p !== "bot");
    const resp = await sock.sendMessage(m.from, {
      text: `👉 *Giliran:* ${formatMention(session.turn)}\n\n${renderBoard(session.board)}`,
      mentions,
    }, { quoted: m });
    session.boardIds.add(resp.key.id);

    session.timeout = setTimeout(async () => {
      if (sessions.has(m.from)) {
        sessions.delete(m.from);
        await sock.sendMessage(m.from, { text: "⌛ *Waktu Habis!* Permainan berakhir." });
      }
    }, GAME_TIMEOUT);
  },
};
