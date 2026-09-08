/**
 * Adapted from Ginko project (https://github.com/ginkohub/mushi)
 */

import UserRPG from "../../src/rpg/schema.js";
import { checkLevelUp } from "../../src/rpg/core.js";

// Active game sessions (key: chatJid)
const sessions = new Map();
// Pending duel invitations (key: chatJid)
const pendingInvites = new Map();

const STOP_WORDS = new Set(["stop", "nyerah"]);
const GAME_TIMEOUT = 90_000; // 90s inactivity
const INVITE_TIMEOUT = 60_000; // 60s to accept

const WIN_PATTERNS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const EMOJI_MAP = {
  " ": ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"],
  X: "❌",
  O: "⭕",
};

function renderBoard(board) {
  const lines = [];
  for (let i = 0; i < 9; i += 3) {
    const row = [
      board[i] === " " ? EMOJI_MAP[" "][i] : EMOJI_MAP[board[i]],
      board[i + 1] === " " ? EMOJI_MAP[" "][i + 1] : EMOJI_MAP[board[i + 1]],
      board[i + 2] === " " ? EMOJI_MAP[" "][i + 2] : EMOJI_MAP[board[i + 2]],
    ];
    lines.push(row.join(" | "));
  }
  return lines.join("\n-----------\n");
}

function checkWin(board, player) {
  return WIN_PATTERNS.some((pattern) =>
    pattern.every((index) => board[index] === player),
  );
}

function checkDraw(board) {
  return board.every((spot) => spot !== " ");
}

function getBotMove(board) {
  // 1. Try to win
  for (let i = 0; i < 9; i++) {
    if (board[i] === " ") {
      board[i] = "O";
      if (checkWin(board, "O")) {
        board[i] = " ";
        return i;
      }
      board[i] = " ";
    }
  }
  // 2. Block opponent
  for (let i = 0; i < 9; i++) {
    if (board[i] === " ") {
      board[i] = "X";
      if (checkWin(board, "X")) {
        board[i] = " ";
        return i;
      }
      board[i] = " ";
    }
  }
  // 3. Center
  if (board[4] === " ") return 4;
  // 4. Corners
  const corners = [0, 2, 6, 8].filter((i) => board[i] === " ");
  if (corners.length > 0)
    return corners[Math.floor(Math.random() * corners.length)];
  // 5. Any available
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

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ─── Start a new game ───
async function startGame(m, sock, playerX, playerO) {
  const board = Array(9).fill(" ");

  const boardStr = renderBoard(board);
  const gameInfo =
    `🎮 *Tic-Tac-Toe Dimulai!*\n` +
    `❌ *Pemain 1:* ${formatMention(playerX)}\n` +
    `⭕ *Pemain 2:* ${formatMention(playerO)}\n\n` +
    `👉 *Giliran:* ${formatMention(playerX)}\n` +
    `_Balas pesan papan game dengan angka 1-9 untuk melangkah._\n` +
    `_Ketik *stop* / *nyerah* untuk menyerah._`;

  const mentions = [playerX, playerO].filter((p) => p !== "bot");
  const resp = await sock.sendMessage(
    m.from,
    { text: `${gameInfo}\n\n${boardStr}`, mentions },
    { quoted: m },
  );

  const timeout = setTimeout(async () => {
    if (sessions.has(m.from)) {
      sessions.delete(m.from);
      await sock.sendMessage(m.from, {
        text: "⌛ *Waktu Habis!* Permainan berakhir karena tidak ada aktivitas.",
      });
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
  desc: "Mainkan Tic-Tac-Toe melawan bot atau tantang teman!",
  exec: async (m, { sock, args, command }) => {
    const sub = (args[0] || "").toLowerCase();

    // ─── .ttt (tanpa argumen) → tampilkan help ───
    if (!sub && !m.mentionedJid?.length && !m.quoted) {
      const helpText = [
        "*♯ TIC-TAC-TOE - CARA BERMAIN*",
        "",
        `Gunakan perintah \`${m.prefix}${command}\` untuk memulai.`,
        "",
        "*Daftar Perintah:*",
        `\`${m.prefix}${command} ai\` : Bermain melawan bot`,
        `\`${m.prefix}${command} @user\` : Tantang seseorang (tag)`,
        `\`${m.prefix}${command}\` _(reply pesan)_ : Tantang orang yang di-reply`,
        `\`${m.prefix}${command} acc\` : Terima tantangan duel`,
        "",
        "> - Balas/Quote pesan papan game dengan angka `1-9` untuk melangkah.",
        "> - Setiap pemain max *3 bidak* di papan (bidak lama hilang).",
        "> - Buat 3 sejajar untuk menang!",
        "> - Ketik *stop* / *nyerah* untuk menyerah.",
      ];
      return m.reply(helpText.join("\n"));
    }

    // ─── .ttt acc → terima tantangan ───
    if (sub === "acc" || sub === "accept" || sub === "terima") {
      const invite = pendingInvites.get(m.from);
      if (!invite) {
        return m.reply("❌ Tidak ada tantangan yang menunggu di obrolan ini.");
      }
      if (m.sender !== invite.target) {
        return m.reply(
          `⚠️ Tantangan ini ditujukan untuk ${formatMention(invite.target)}, bukan kamu.`,
          { mentions: [invite.target] },
        );
      }

      clearTimeout(invite.timeout);
      pendingInvites.delete(m.from);

      if (sessions.has(m.from)) {
        return m.reply(
          "❌ Sudah ada sesi game aktif di obrolan ini! Selesaikan dulu.",
        );
      }

      return startGame(m, sock, invite.challenger, invite.target);
    }

    // ─── .ttt ai → lawan bot ───
    if (sub === "ai" || sub === "bot") {
      if (sessions.has(m.from)) {
        return m.reply(
          "❌ Sudah ada sesi game aktif di obrolan ini! Selesaikan dulu.",
        );
      }
      return startGame(m, sock, m.sender, "bot");
    }

    // ─── .ttt @user / .ttt (reply) → tantang pemain ───
    let opponentJid = null;

    if (m.mentionedJid?.length > 0) {
      opponentJid = m.mentionedJid[0];
    } else if (m.quoted?.sender) {
      opponentJid = m.quoted.sender;
    }

    if (!opponentJid) {
      return m.reply(
        `❌ Tag atau reply pesan seseorang untuk menantang!\n\n_Contoh: *${m.prefix}${command} @user* atau reply pesan lalu ketik *${m.prefix}${command}*_`,
      );
    }

    if (opponentJid === m.sender) {
      return m.reply("❌ Tidak bisa menantang diri sendiri!");
    }

    if (sessions.has(m.from)) {
      return m.reply(
        "❌ Sudah ada sesi game aktif di obrolan ini! Selesaikan dulu.",
      );
    }

    if (pendingInvites.has(m.from)) {
      return m.reply(
        "❌ Sudah ada tantangan yang menunggu! Tunggu sampai diterima atau kedaluwarsa.",
      );
    }

    // Buat undangan
    const inviteTimeout = setTimeout(async () => {
      if (pendingInvites.has(m.from)) {
        pendingInvites.delete(m.from);
        await sock.sendMessage(m.from, {
          text: `⌛ Tantangan dari ${formatMention(m.sender)} ke ${formatMention(opponentJid)} telah kedaluwarsa.`,
          mentions: [m.sender, opponentJid],
        });
      }
    }, INVITE_TIMEOUT);

    pendingInvites.set(m.from, {
      challenger: m.sender,
      target: opponentJid,
      timeout: inviteTimeout,
    });

    const inviteMsg =
      `⚔️ *TANTANGAN TIC-TAC-TOE!*\n\n` +
      `${formatMention(m.sender)} menantang ${formatMention(opponentJid)} untuk bermain Tic-Tac-Toe!\n\n` +
      `Ketik *${m.prefix}${command} acc* dalam 60 detik untuk menerima.`;

    return m.reply(inviteMsg, { mentions: [m.sender, opponentJid] });
  },

  // ─── Handler untuk langkah game (after hook) ───
  after: async (m, { sock }) => {
    if (!sessions.has(m.from) || !m.quoted) return;

    const session = sessions.get(m.from);
    if (!session.boardIds.has(m.quoted.id)) return;

    const senderJid = m.sender;
    const text = m.body?.toLowerCase().trim();

    // Stop / nyerah
    if (STOP_WORDS.has(text)) {
      clearTimeout(session.timeout);
      sessions.delete(m.from);
      return m.reply(
        `🏳️ *${formatMention(senderJid)} menyerah!* Game berakhir.`,
        {
          mentions: [session.playerX, session.playerO].filter(
            (p) => p !== "bot",
          ),
        },
      );
    }

    const move = parseInt(m.body?.trim(), 10) - 1;

    // Cek giliran
    if (senderJid !== session.turn) {
      return m.reply(
        `⚠️ Ini bukan giliranmu! Giliran saat ini: ${formatMention(session.turn)}`,
        { mentions: [session.turn].filter((p) => p !== "bot") },
      );
    }

    // Validasi langkah
    if (
      Number.isNaN(move) ||
      move < 0 ||
      move > 8 ||
      session.board[move] !== " "
    ) {
      return m.reply(
        "❌ Langkah tidak valid! Pilih angka 1-9 pada kotak yang kosong.",
      );
    }

    clearTimeout(session.timeout);

    const currentMarker = session.turn === session.playerX ? "X" : "O";
    session.board[move] = currentMarker;

    // Cycling: max 3 bidak per pemain
    const movesKey = currentMarker === "X" ? "movesX" : "movesO";
    session[movesKey].push(move);
    if (session[movesKey].length > 3) {
      const removed = session[movesKey].shift();
      session.board[removed] = " ";
    }

    // Cek menang
    if (checkWin(session.board, currentMarker)) {
      return await handleWin(m, sock, session, session.turn, currentMarker);
    }

    // Cek seri
    if (checkDraw(session.board)) {
      return await handleDraw(m, sock, session);
    }

    // Ganti giliran
    session.turn =
      session.turn === session.playerX ? session.playerO : session.playerX;

    // Jika giliran bot
    if (session.turn === "bot") {
      return await handleBotTurn(m, sock, session);
    }

    // Giliran pemain berikutnya
    return await sendBoardUpdate(m, sock, session);
  },
};

// ─── Helper: handle win ───
async function handleWin(m, sock, session, winner, marker) {
  sessions.delete(m.from);

  const totalMoves = session.movesX.length + session.movesO.length;
  const xp = totalMoves * 10;
  const uang = xp * 5;

  let levelUpMsg = "";
  if (winner !== "bot") {
    let user = await UserRPG.findOne({ noWa: winner });
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
  }

  const boardStr = renderBoard(session.board);
  const rewardText =
    winner !== "bot" ? `\n🌟 *+${xp} XP*\n💵 *+¥${uang}*${levelUpMsg}` : "";
  const winMsg =
    `🎉 *Selamat!* ${formatMention(winner)} memenangkan permainan!${rewardText}\n` +
    `(setelah ${totalMoves} giliran)`;

  const mentions = [session.playerX, session.playerO].filter(
    (p) => p !== "bot",
  );
  return m.reply(`${winMsg}\n\n${boardStr}`, { mentions });
}

// ─── Helper: handle draw ───
async function handleDraw(m, sock, session) {
  sessions.delete(m.from);
  const boardStr = renderBoard(session.board);
  const mentions = [session.playerX, session.playerO].filter(
    (p) => p !== "bot",
  );
  return m.reply(`🤝 *Seri!* Permainan berakhir dengan hasil imbang.\n\n${boardStr}`, {
    mentions,
  });
}

// ─── Helper: bot turn ───
async function handleBotTurn(m, sock, session) {
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
    await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
    return await handleWin(m, sock, session, "bot", "O");
  }

  if (checkDraw(session.board)) {
    await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
    return await handleDraw(m, sock, session);
  }

  session.turn = session.playerX;

  const boardStr = renderBoard(session.board);
  const mentions = [session.playerX].filter((p) => p !== "bot");
  const responseText = `👉 *Giliran:* ${formatMention(session.turn)}\n\n${boardStr}`;

  const botResp = await sock.sendMessage(
    m.from,
    { text: responseText, mentions },
    { quoted: m },
  );
  session.boardIds.add(botResp.key.id);

  await sock.sendMessage(m.from, { react: { text: "", key: m.key } });

  session.timeout = setTimeout(async () => {
    if (sessions.has(m.from)) {
      sessions.delete(m.from);
      await sock.sendMessage(m.from, {
        text: "⌛ *Waktu Habis!* Permainan berakhir karena tidak ada aktivitas.",
      });
    }
  }, GAME_TIMEOUT);
}

// ─── Helper: send board update for player turn ───
async function sendBoardUpdate(m, sock, session) {
  const boardStr = renderBoard(session.board);
  const mentions = [session.playerX, session.playerO].filter(
    (p) => p !== "bot",
  );
  const responseText = `👉 *Giliran:* ${formatMention(session.turn)}\n\n${boardStr}`;

  const playerResp = await sock.sendMessage(
    m.from,
    { text: responseText, mentions },
    { quoted: m },
  );
  session.boardIds.add(playerResp.key.id);

  session.timeout = setTimeout(async () => {
    if (sessions.has(m.from)) {
      sessions.delete(m.from);
      await sock.sendMessage(m.from, {
        text: "⌛ *Waktu Habis!* Permainan berakhir karena tidak ada aktivitas.",
      });
    }
  }, GAME_TIMEOUT);
}
