import { randomUUID } from "node:crypto";

async function sendMetaAiHtmlMessage(conn, targetJid, htmlContent) {
  if (!conn?.relayMessage) throw new Error("Koneksi WhatsApp tidak valid");
  const responseId = randomUUID();
  const unifiedData = {
    response_id: responseId,
    sections: [{
      view_model: {
        primitive: {
          __typename: "GenAIaeacdsnwHtmlPrimitive",
          payload: htmlContent,
          trusted_sources: [],
        },
        __typename: "GenAISingleLayoutViewModel",
      },
    }],
  };

  await conn.relayMessage(
    targetJid,
    {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: { messageDisclaimerText: "", botResponseId: responseId },
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [{ messageType: 2, messageText: "Interactive Chess Board" }],
            unifiedResponse: { data: Buffer.from(JSON.stringify(unifiedData)).toString("base64") },
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" },
              forwardOrigin: 4,
            },
          },
        },
      },
    },
    { messageId: responseId }
  );
}

function createPureChessHtml() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; user-select: none; -webkit-user-select: none; touch-action: manipulation; margin: 0; padding: 0; }
    body { background: #090d16; color: #f8fafc; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; padding: 6px; letter-spacing: -0.01em; }
    .card { background: #131c2e; width: 100%; border-radius: 12px; padding: 10px; box-shadow: 0 8px 20px rgba(0,0,0,0.5); text-align: center; border: 1px solid #1e293b; position: relative; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .title { font-size: 13px; font-weight: 800; color: #38bdf8; letter-spacing: 0.02em; text-transform: uppercase; }
    .status { font-size: 11px; color: #38bdf8; font-weight: 700; background: rgba(56, 189, 248, 0.1); padding: 3px 10px; border-radius: 20px; border: 1px solid rgba(56, 189, 248, 0.25); }
    .board-wrapper { width: 100%; aspect-ratio: 1 / 1; display: grid; grid-template-columns: 16px repeat(8, 1fr) 16px; grid-template-rows: 16px repeat(8, 1fr) 16px; background: #090d16; border-radius: 8px; border: 2px solid #334155; overflow: hidden; }
    .label { display: flex; justify-content: center; align-items: center; font-size: 10px; font-weight: 700; color: #64748b; font-family: 'Inter', sans-serif; }
    .sq { display: flex; justify-content: center; align-items: center; font-size: 6.8vw; cursor: pointer; position: relative; }
    .sq.light { background-color: #cbd5e1; color: #0f172a; }
    .sq.dark { background-color: #475569; color: #f8fafc; }
    .piece.w { color: #ffffff; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.8)); }
    .piece.b { color: #020617; filter: drop-shadow(0 1px 2px rgba(255,255,255,0.2)); }
    .sq.selected { background-color: #0284c7 !important; }
    .sq.valid-move::after { content: ''; width: 24%; height: 24%; background: rgba(16, 185, 129, 0.95); border-radius: 50%; position: absolute; box-shadow: 0 0 8px rgba(16, 185, 129, 0.6); }
    .history-card { margin-top: 8px; background: #090d16; border: 1px solid #1e293b; border-radius: 8px; padding: 8px; text-align: left; }
    .history-title { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; display: block; letter-spacing: 0.05em; }
    .history-item { font-size: 12px; font-weight: 600; font-family: 'Inter', sans-serif; color: #f1f5f9; background: #131c2e; padding: 5px 8px; border-radius: 6px; margin-bottom: 4px; border-left: 3px solid #38bdf8; display: flex; justify-content: space-between; align-items: center; }
    .history-item .player-user { color: #38bdf8; font-weight: 700; }
    .history-item .player-bot { color: #f43f5e; font-weight: 700; }
    .overlay { position: absolute; inset: 0; background: rgba(9, 13, 22, 0.96); backdrop-filter: blur(4px); display: flex; flex-direction: column; justify-content: center; align-items: center; border-radius: 12px; z-index: 10; padding: 16px; }
    .overlay.hidden { display: none; }
    .overlay-title { font-size: 20px; font-weight: 800; color: #38bdf8; margin-bottom: 6px; }
    .overlay-msg { font-size: 13px; color: #e2e8f0; margin-bottom: 16px; font-family: 'Inter', sans-serif; }
    .btn-replay { background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-family: 'Plus Jakarta Sans', sans-serif; cursor: pointer; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4); }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="title">♟️ CATUR vs BOT (HARD)</div>
    <div class="status" id="status">Giliran: Kamu</div>
  </div>
  <div class="board-wrapper" id="board"></div>
  <div class="history-card">
    <span class="history-title">📜 2 Langkah Terakhir:</span>
    <div id="history-container"><div class="history-item" style="color:#64748b;">Belum ada langkah</div></div>
  </div>
  <div class="overlay hidden" id="game-over-overlay">
    <div class="overlay-title" id="game-result-title">SELESAI!</div>
    <div class="overlay-msg" id="game-result-msg">Kamu Menang!</div>
    <button class="btn-replay" onclick="initBoard()">Main Lagi 🔄</button>
  </div>
</div>
<script>
  const PIECES = { 'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙', 'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' };
  const FILES = ['a','b','c','d','e','f','g','h'];
  const RANKS = ['8','7','6','5','4','3','2','1'];
  const initialBoard = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];
  const PIECE_VALUES = { 'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000, 'p': -100, 'n': -320, 'b': -330, 'r': -500, 'q': -900, 'k': -20000 };
  const pawnPST = [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]];
  const knightPST = [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]];

  let boardState = [], turn = 'w', selected = null, validMoves = [], moveHistory = [];

  function initBoard() {
    boardState = JSON.parse(JSON.stringify(initialBoard));
    turn = 'w'; selected = null; validMoves = []; moveHistory = [];
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('status').innerText = 'Giliran: Kamu';
    renderHistory(); render();
  }

  const isWhite = (p) => p && p === p.toUpperCase();
  const isBlack = (p) => p && p === p.toLowerCase();

  function getValidMoves(r, c, b = boardState) {
    const p = b[r][c]; if (!p) return [];
    const moves = [], type = p.toUpperCase(), isW = isWhite(p);
    const addMove = (nr, nc) => {
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) return false;
      const target = b[nr][nc];
      if (!target) { moves.push({ r: nr, c: nc }); return true; }
      if ((isW && isBlack(target)) || (!isW && isWhite(target))) moves.push({ r: nr, c: nc });
      return false;
    };

    if (type === 'P') {
      const dir = isW ? -1 : 1;
      if (r + dir >= 0 && r + dir <= 7 && !b[r + dir][c]) {
        moves.push({ r: r + dir, c });
        if (r === (isW ? 6 : 1) && !b[r + 2 * dir][c]) moves.push({ r: r + 2 * dir, c });
      }
      [-1, 1].forEach(dc => {
        const nr = r + dir, nc = c + dc;
        if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7 && b[nr][nc] && ((isW && isBlack(b[nr][nc])) || (!isW && isWhite(b[nr][nc])))) moves.push({ r: nr, c: nc });
      });
    } else if (type === 'N') {
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => addMove(r + dr, c + dc));
    } else if (type === 'R' || type === 'B' || type === 'Q') {
      const dirs = [];
      if (type === 'R' || type === 'Q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
      if (type === 'B' || type === 'Q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      dirs.forEach(([dr, dc]) => { let nr = r + dr, nc = c + dc; while (addMove(nr, nc)) { nr += dr; nc += dc; } });
    } else if (type === 'K') {
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => addMove(r + dr, c + dc));
    }
    return moves;
  }

  function render() {
    const el = document.getElementById('board'); el.innerHTML = '';
    const label = (t) => { const d = document.createElement('div'); d.className = 'label'; d.innerText = t; return d; };
    el.appendChild(label('')); FILES.forEach(f => el.appendChild(label(f))); el.appendChild(label(''));
    for (let r = 0; r < 8; r++) {
      el.appendChild(label(RANKS[r]));
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.className = 'sq ' + ((r + c) % 2 ? 'dark' : 'light');
        if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');
        if (validMoves.some(m => m.r === r && m.c === c)) sq.classList.add('valid-move');
        const p = boardState[r][c];
        if (p) {
          const sp = document.createElement('span');
          sp.className = 'piece ' + (isWhite(p) ? 'w' : 'b');
          sp.innerText = PIECES[p] || '';
          sq.appendChild(sp);
        }
        sq.onclick = () => handleClick(r, c);
        el.appendChild(sq);
      }
      el.appendChild(label(RANKS[r]));
    }
    el.appendChild(label('')); FILES.forEach(f => el.appendChild(label(f))); el.appendChild(label(''));
  }

  function renderHistory() {
    const el = document.getElementById('history-container');
    if (!moveHistory.length) { el.innerHTML = '<div class="history-item" style="color:#64748b;">Belum ada langkah</div>'; return; }
    el.innerHTML = moveHistory.map(function(i) {
      var cls = i.p === 'Kamu' ? 'player-user' : 'player-bot';
      return '<div class="history-item"><span class="' + cls + '">' + i.p + '</span><span>' + i.t + '</span></div>';
    }).join('');
  }

  function handleClick(r, c) {
    if (turn !== 'w') return;
    const p = boardState[r][c];
    if (p && isWhite(p)) { selected = { r, c }; validMoves = getValidMoves(r, c); render(); return; }
    if (selected && validMoves.some(m => m.r === r && m.c === c)) {
      var pieceChar = PIECES[boardState[selected.r][selected.c]] || '';
      var moveText = pieceChar + ' ' + FILES[selected.c] + RANKS[selected.r] + ' ➔ ' + FILES[c] + RANKS[r];
      moveHistory.push({ p: 'Kamu', t: moveText });
      if (moveHistory.length > 2) moveHistory.shift();
      renderHistory();
      boardState[r][c] = boardState[selected.r][selected.c]; boardState[selected.r][selected.c] = '';
      selected = null; validMoves = []; render();
      if (checkGameOver()) return;
      turn = 'b'; document.getElementById('status').innerText = 'Bot Berpikir...';
      setTimeout(makeBotMove, 200);
    }
  }

  function evaluateBoard(b) {
    let s = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c]; if (!p) continue;
        let v = PIECE_VALUES[p] || 0;
        if (p.toUpperCase() === 'P') v += isWhite(p) ? pawnPST[7 - r][c] : -pawnPST[r][c];
        else if (p.toUpperCase() === 'N') v += isWhite(p) ? knightPST[7 - r][c] : -knightPST[r][c];
        s += v;
      }
    }
    return s;
  }

  function getAllMoves(isW, b) {
    const list = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (p && (isW ? isWhite(p) : isBlack(p))) {
          getValidMoves(r, c, b).forEach(to => list.push({ from: { r, c }, to }));
        }
      }
    }
    return list;
  }

  function minimax(b, d, alpha, beta, isMax) {
    if (!d) return evaluateBoard(b);
    const moves = getAllMoves(isMax, b);
    if (!moves.length) return evaluateBoard(b);
    if (isMax) {
      let mx = -Infinity;
      for (const m of moves) {
        const cp = b.map(row => [...row]); cp[m.to.r][m.to.c] = cp[m.from.r][m.from.c]; cp[m.from.r][m.from.c] = '';
        mx = Math.max(mx, minimax(cp, d - 1, alpha, beta, false)); alpha = Math.max(alpha, mx);
        if (beta <= alpha) break;
      }
      return mx;
    } else {
      let mn = Infinity;
      for (const m of moves) {
        const cp = b.map(row => [...row]); cp[m.to.r][m.to.c] = cp[m.from.r][m.from.c]; cp[m.from.r][m.from.c] = '';
        mn = Math.min(mn, minimax(cp, d - 1, alpha, beta, true)); beta = Math.min(beta, mn);
        if (beta <= alpha) break;
      }
      return mn;
    }
  }

  function makeBotMove() {
    const moves = getAllMoves(false, boardState);
    if (!moves.length) return endGame('SKAKMAT!', 'Kamu Menang!');
    let bestMove = null, bestVal = Infinity;
    for (const m of moves) {
      const cp = boardState.map(r => [...r]); cp[m.to.r][m.to.c] = cp[m.from.r][m.from.c]; cp[m.from.r][m.from.c] = '';
      const v = minimax(cp, 2, -Infinity, Infinity, true);
      if (v < bestVal) { bestVal = v; bestMove = m; }
    }
    if (!bestMove) bestMove = moves[Math.floor(Math.random() * moves.length)];
    var botPiece = PIECES[boardState[bestMove.from.r][bestMove.from.c]] || '';
    var botMoveText = botPiece + ' ' + FILES[bestMove.from.c] + RANKS[bestMove.from.r] + ' ➔ ' + FILES[bestMove.to.c] + RANKS[bestMove.to.r];
    moveHistory.push({ p: 'Bot', t: botMoveText });
    if (moveHistory.length > 2) moveHistory.shift();
    boardState[bestMove.to.r][bestMove.to.c] = boardState[bestMove.from.r][bestMove.from.c]; boardState[bestMove.from.r][bestMove.from.c] = '';
    if (checkGameOver()) return;
    turn = 'w'; document.getElementById('status').innerText = 'Giliran: Kamu';
    render();
  }

  function checkGameOver() {
    let hasW = false, hasB = false;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (boardState[r][c] === 'K') hasW = true;
        if (boardState[r][c] === 'k') hasB = true;
      }
    }
    if (!hasB) { endGame('MENANG!', '🎉 Luar Biasa! Kamu Menembus AI Hard!'); return true; }
    if (!hasW) { endGame('KALAH!', '🤖 Bot Berhasil Mengalahkan Kamu!'); return true; }
    return false;
  }

  function endGame(t, msg) {
    document.getElementById('game-result-title').innerText = t;
    document.getElementById('game-result-msg').innerText = msg;
    document.getElementById('game-over-overlay').classList.remove('hidden');
  }

  initBoard();
</script>
</body>
</html>`;
}

export default {
  cmd: ["catur", "chess"],
  category: "games",
  desc: "Papan Catur Interaktif Mode Hard vs AI",
  exec: async (m, { sock }) => {
    const conn = sock || m.conn;
    const targetJid = m.from || m.chat;
    await conn.sendMessage(targetJid, { react: { text: "⏳", key: m.key } });

    try {
      await sendMetaAiHtmlMessage(conn, targetJid, createPureChessHtml());
      await conn.sendMessage(targetJid, { react: { text: "♟️", key: m.key } });
    } catch (error) {
      console.error("[CHESS BOT ERROR]", error);
      await conn.sendMessage(targetJid, { react: { text: "❌", key: m.key } });
      await conn.sendMessage(targetJid, { text: `❌ Gagal memuat Canvas Catur.\n\n> ${error.message || error}` }, { quoted: m });
    }
  },
};
