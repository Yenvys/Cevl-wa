/**
 * plugins/games/catur.js
 * Game Catur Engine AI Hard dengan Typography & Design Modern
 */

'use strict'
import { randomUUID } from 'crypto'

/* =========================================================
 * META AI PAYLOAD SENDER
 * ========================================================= */
async function sendMetaAiHtmlMessage(conn, targetJid, htmlContent) {
    if (!conn?.relayMessage) {
        throw new Error('Koneksi WhatsApp tidak valid')
    }

    const responseId = randomUUID()
    const unifiedData = {
        response_id: responseId,
        sections: [
            {
                view_model: {
                    primitive: {
                        __typename: 'GenAIaeacdsnwHtmlPrimitive',
                        payload: htmlContent,
                        trusted_sources: []
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            }
        ]
    }

    await conn.relayMessage(
        targetJid,
        {
            messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
                botMetadata: {
                    messageDisclaimerText: '',
                    botResponseId: responseId
                }
            },
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: 1,
                        submessages: [
                            {
                                messageType: 2,
                                messageText: 'Interactive Chess Board'
                            }
                        ],
                        unifiedResponse: {
                            data: Buffer.from(JSON.stringify(unifiedData)).toString('base64')
                        },
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedAiBotMessageInfo: {
                                botJid: '867051314767696@bot'
                            },
                            forwardOrigin: 4
                        }
                    }
                }
            }
        },
        { messageId: responseId }
    )
}

/* =========================================================
 * AUTO-RESPONSIVE HTML CHESS BOARD GENERATOR (MODERN FONT)
 * ========================================================= */
function createPureChessHtml() {
    return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <!-- Import Font Modern Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  
  <style>
    * {
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
      margin: 0;
      padding: 0;
    }
    body {
      background: #090d16;
      color: #f8fafc;
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 6px;
      letter-spacing: -0.01em;
    }
    .card {
      background: #131c2e;
      width: 100%;
      border-radius: 12px;
      padding: 10px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.5);
      text-align: center;
      border: 1px solid #1e293b;
      position: relative;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .title {
      font-size: 13px;
      font-weight: 800;
      color: #38bdf8;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .status {
      font-size: 11px;
      color: #38bdf8;
      font-weight: 700;
      background: rgba(56, 189, 248, 0.1);
      padding: 3px 10px;
      border-radius: 20px;
      border: 1px solid rgba(56, 189, 248, 0.25);
    }

    /* Papan Catur & Grid */
    .board-wrapper {
      width: 100%;
      aspect-ratio: 1 / 1;
      display: grid;
      grid-template-columns: 16px repeat(8, 1fr) 16px;
      grid-template-rows: 16px repeat(8, 1fr) 16px;
      background: #090d16;
      border-radius: 8px;
      border: 2px solid #334155;
      overflow: hidden;
    }
    .label {
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      font-family: 'Inter', sans-serif;
    }
    .sq {
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 6.8vw;
      max-font-size: 30px;
      cursor: pointer;
      position: relative;
    }
    .sq.light { background-color: #cbd5e1; color: #0f172a; }
    .sq.dark { background-color: #475569; color: #f8fafc; }

    .piece {
      line-height: 1;
      transition: transform 0.1s ease;
    }
    .piece.w { 
      color: #ffffff; 
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.8));
    }
    .piece.b { 
      color: #020617; 
      filter: drop-shadow(0 1px 2px rgba(255,255,255,0.2));
    }

    /* Highlight Petak */
    .sq.selected { background-color: #0284c7 !important; }
    .sq.valid-move::after {
      content: '';
      width: 24%;
      height: 24%;
      background: rgba(16, 185, 129, 0.95);
      border-radius: 50%;
      position: absolute;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
    }

    /* History Card */
    .history-card {
      margin-top: 8px;
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 8px;
      text-align: left;
    }
    .history-title {
      font-size: 10px;
      font-weight: 800;
      color: #94a3b8;
      text-transform: uppercase;
      margin-bottom: 6px;
      display: block;
      letter-spacing: 0.05em;
    }
    .history-item {
      font-size: 12px;
      font-weight: 600;
      font-family: 'Inter', sans-serif;
      color: #f1f5f9;
      background: #131c2e;
      padding: 5px 8px;
      border-radius: 6px;
      margin-bottom: 4px;
      border-left: 3px solid #38bdf8;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .history-item:last-child { margin-bottom: 0; }
    .history-item .player-user { color: #38bdf8; font-weight: 700; }
    .history-item .player-bot { color: #f43f5e; font-weight: 700; }

    /* Overlay Selesai Game */
    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(9, 13, 22, 0.96);
      backdrop-filter: blur(4px);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      border-radius: 12px;
      z-index: 10;
      padding: 16px;
    }
    .overlay.hidden { display: none; }
    .overlay-title { 
      font-size: 20px; 
      font-weight: 800; 
      color: #38bdf8; 
      margin-bottom: 6px; 
      letter-spacing: 0.02em;
    }
    .overlay-msg { 
      font-size: 13px; 
      color: #e2e8f0; 
      margin-bottom: 16px; 
      font-family: 'Inter', sans-serif;
    }
    .btn-replay { 
      background: #0284c7; 
      color: white; 
      border: none; 
      padding: 10px 20px; 
      border-radius: 8px; 
      font-weight: 700; 
      font-family: 'Plus Jakarta Sans', sans-serif;
      cursor: pointer; 
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
    }
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
    <div id="history-container">
      <div class="history-item" style="color:#64748b;">Belum ada langkah</div>
    </div>
  </div>

  <div class="overlay hidden" id="game-over-overlay">
    <div class="overlay-title" id="game-result-title">SELESAI!</div>
    <div class="overlay-msg" id="game-result-msg">Kamu Menang!</div>
    <button class="btn-replay" onclick="initBoard()">Main Lagi 🔄</button>
  </div>
</div>

<script>
  const PIECES = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  };

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

  const PIECE_VALUES = {
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000,
    'p': -100, 'n': -320, 'b': -330, 'r': -500, 'q': -900, 'k': -20000
  };

  const pawnPST = [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [ 5,  5, 10, 25, 25, 10,  5,  5],
    [ 0,  0,  0, 20, 20,  0,  0,  0],
    [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 5, 10, 10,-20,-20, 10, 10,  5],
    [ 0,  0,  0,  0,  0,  0,  0,  0]
  ];

  const knightPST = [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ];

  let boardState = [];
  let turn = 'w';
  let selected = null;
  let validMoves = [];
  let moveHistory = [];

  function initBoard() {
    boardState = JSON.parse(JSON.stringify(initialBoard));
    turn = 'w';
    selected = null;
    validMoves = [];
    moveHistory = [];
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('status').innerText = 'Giliran: Kamu';
    renderHistory();
    render();
  }

  function isWhite(piece) { return piece && piece === piece.toUpperCase(); }
  function isBlack(piece) { return piece && piece === piece.toLowerCase(); }

  function getValidMoves(r, c, currentBoard = boardState) {
    const piece = currentBoard[r][c];
    if (!piece) return [];

    const moves = [];
    const type = piece.toUpperCase();
    const isW = isWhite(piece);

    function addMove(nr, nc) {
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) return false;
      const target = currentBoard[nr][nc];
      if (!target) {
        moves.push({ r: nr, c: nc });
        return true;
      }
      if ((isW && isBlack(target)) || (!isW && isWhite(target))) {
        moves.push({ r: nr, c: nc });
      }
      return false;
    }

    if (type === 'P') {
      const dir = isW ? -1 : 1;
      if (r + dir >= 0 && r + dir <= 7 && !currentBoard[r + dir][c]) {
        moves.push({ r: r + dir, c });
        const startRow = isW ? 6 : 1;
        if (r === startRow && !currentBoard[r + 2 * dir][c]) {
          moves.push({ r: r + 2 * dir, c });
        }
      }
      [-1, 1].forEach(dc => {
        const nr = r + dir, nc = c + dc;
        if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
          const target = currentBoard[nr][nc];
          if (target && ((isW && isBlack(target)) || (!isW && isWhite(target)))) {
            moves.push({ r: nr, c: nc });
          }
        }
      });
    } else if (type === 'N') {
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => {
        addMove(r + dr, c + dc);
      });
    } else if (type === 'R' || type === 'B' || type === 'Q') {
      const dirs = [];
      if (type === 'R' || type === 'Q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
      if (type === 'B' || type === 'Q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      
      dirs.forEach(([dr, dc]) => {
        let nr = r + dr, nc = c + dc;
        while (addMove(nr, nc)) {
          nr += dr; nc += dc;
        }
      });
    } else if (type === 'K') {
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => {
        addMove(r + dr, c + dc);
      });
    }

    return moves;
  }

  function render() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    boardEl.appendChild(createLabel(''));
    FILES.forEach(f => boardEl.appendChild(createLabel(f)));
    boardEl.appendChild(createLabel(''));

    for (let r = 0; r < 8; r++) {
      boardEl.appendChild(createLabel(RANKS[r]));

      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        const isDark = (r + c) % 2 === 1;
        sq.className = 'sq ' + (isDark ? 'dark' : 'light');
        
        if (selected && selected.r === r && selected.c === c) {
          sq.classList.add('selected');
        }

        if (validMoves.some(m => m.r === r && m.c === c)) {
          sq.classList.add('valid-move');
        }

        const piece = boardState[r][c];
        if (piece) {
          const pieceEl = document.createElement('span');
          pieceEl.className = 'piece ' + (isWhite(piece) ? 'w' : 'b');
          pieceEl.innerText = PIECES[piece] || '';
          sq.appendChild(pieceEl);
        }

        sq.onclick = () => handleClick(r, c);
        boardEl.appendChild(sq);
      }

      boardEl.appendChild(createLabel(RANKS[r]));
    }

    boardEl.appendChild(createLabel(''));
    FILES.forEach(f => boardEl.appendChild(createLabel(f)));
    boardEl.appendChild(createLabel(''));
  }

  function createLabel(text) {
    const div = document.createElement('div');
    div.className = 'label';
    div.innerText = text;
    return div;
  }

  function getSquareNotation(r, c) {
    return FILES[c] + RANKS[r];
  }

  function addMoveToHistory(player, pieceSymbol, from, to) {
    const entry = {
      player,
      text: \`\${pieceSymbol} \${from} ➔ \${to}\`
    };

    moveHistory.push(entry);
    if (moveHistory.length > 2) {
      moveHistory.shift();
    }
    renderHistory();
  }

  function renderHistory() {
    const container = document.getElementById('history-container');
    if (moveHistory.length === 0) {
      container.innerHTML = '<div class="history-item" style="color:#64748b;">Belum ada langkah</div>';
      return;
    }

    container.innerHTML = moveHistory.map(item => \`
      <div class="history-item">
        <span class="\${item.player === 'Kamu' ? 'player-user' : 'player-bot'}">\${item.player}</span>
        <span>\${item.text}</span>
      </div>
    \`).join('');
  }

  function handleClick(r, c) {
    if (turn !== 'w') return;

    const clickedPiece = boardState[r][c];

    if (clickedPiece && isWhite(clickedPiece)) {
      selected = { r, c };
      validMoves = getValidMoves(r, c);
      render();
      return;
    }

    if (selected && validMoves.some(m => m.r === r && m.c === c)) {
      const piece = boardState[selected.r][selected.c];
      const pieceSymbol = PIECES[piece] || '';
      const fromNote = getSquareNotation(selected.r, selected.c);
      const toNote = getSquareNotation(r, c);

      addMoveToHistory('Kamu', pieceSymbol, fromNote, toNote);
      movePiece(selected.r, selected.c, r, c);
      selected = null;
      validMoves = [];
      render();

      if (checkGameOver()) return;

      turn = 'b';
      document.getElementById('status').innerText = 'Bot Berpikir...';
      setTimeout(makeBotMove, 200);
    }
  }

  function movePiece(fromR, fromC, toR, toC, board = boardState) {
    board[toR][toC] = board[fromR][fromC];
    board[fromR][fromC] = '';
  }

  function evaluateBoard(board) {
    let totalScore = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;

        let score = PIECE_VALUES[piece] || 0;
        const type = piece.toUpperCase();

        if (type === 'P') {
          score += isWhite(piece) ? pawnPST[7 - r][c] : -pawnPST[r][c];
        } else if (type === 'N') {
          score += isWhite(piece) ? knightPST[7 - r][c] : -knightPST[r][c];
        }

        totalScore += score;
      }
    }
    return totalScore;
  }

  function getAllMoves(isWhiteTurn, board) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && (isWhiteTurn ? isWhite(piece) : isBlack(piece))) {
          const valid = getValidMoves(r, c, board);
          valid.forEach(m => moves.push({ from: { r, c }, to: m }));
        }
      }
    }
    return moves;
  }

  function minimax(board, depth, alpha, beta, isMaximizing) {
    if (depth === 0) return evaluateBoard(board);

    const moves = getAllMoves(isMaximizing, board);
    if (moves.length === 0) return evaluateBoard(board);

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const boardCopy = board.map(row => [...row]);
        movePiece(move.from.r, move.from.c, move.to.r, move.to.c, boardCopy);
        const evalVal = minimax(boardCopy, depth - 1, alpha, beta, false);
        maxEval = Math.max(maxEval, evalVal);
        alpha = Math.max(alpha, evalVal);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        const boardCopy = board.map(row => [...row]);
        movePiece(move.from.r, move.from.c, move.to.r, move.to.c, boardCopy);
        const evalVal = minimax(boardCopy, depth - 1, alpha, beta, true);
        minEval = Math.min(minEval, evalVal);
        beta = Math.min(beta, evalVal);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function makeBotMove() {
    const moves = getAllMoves(false, boardState);

    if (moves.length === 0) {
      endGame('SKAKMAT!', 'Kamu Menang!');
      return;
    }

    let bestMove = null;
    let bestValue = Infinity;

    for (const move of moves) {
      const boardCopy = boardState.map(row => [...row]);
      movePiece(move.from.r, move.from.c, move.to.r, move.to.c, boardCopy);

      const boardValue = minimax(boardCopy, 2, -Infinity, Infinity, true);

      if (boardValue < bestValue) {
        bestValue = boardValue;
        bestMove = move;
      }
    }

    if (!bestMove) bestMove = moves[Math.floor(Math.random() * moves.length)];

    const piece = boardState[bestMove.from.r][bestMove.from.c];
    const pieceSymbol = PIECES[piece] || '';
    const fromNote = getSquareNotation(bestMove.from.r, bestMove.from.c);
    const toNote = getSquareNotation(bestMove.to.r, bestMove.to.c);
    
    movePiece(bestMove.from.r, bestMove.from.c, bestMove.to.r, bestMove.to.c);
    addMoveToHistory('Bot', pieceSymbol, fromNote, toNote);

    if (checkGameOver()) return;

    turn = 'w';
    document.getElementById('status').innerText = 'Giliran: Kamu';
    render();
  }

  function checkGameOver() {
    let hasWhiteKing = false;
    let hasBlackKing = false;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (boardState[r][c] === 'K') hasWhiteKing = true;
        if (boardState[r][c] === 'k') hasBlackKing = true;
      }
    }

    if (!hasBlackKing) {
      endGame('MENANG!', '🎉 Luar Biasa! Kamu Menembus AI Hard!');
      return true;
    }
    if (!hasWhiteKing) {
      endGame('KALAH!', '🤖 Bot Berhasil Mengalahkan Kamu!');
      return true;
    }

    return false;
  }

  function endGame(title, msg) {
    document.getElementById('game-result-title').innerText = title;
    document.getElementById('game-result-msg').innerText = msg;
    document.getElementById('game-over-overlay').classList.remove('hidden');
  }

  initBoard();
</script>
</body>
</html>
  `
}

/* =========================================================
 * EXPORT DEFAULT HANDLER
 * ========================================================= */
export default {
    cmd: ['catur', 'chess'],
    category: 'games',
    desc: 'Membuat Papan Catur Mode Hard dengan Modern Typography',
    exec: async (m, { sock }) => {
        const conn = sock || m.conn
        const targetJid = m.from || m.chat

        const sendReaction = async (emoji) => {
            if (typeof m.react === 'function') {
                return m.react(emoji)
            }
            return conn.sendMessage(targetJid, { react: { text: emoji, key: m.key } })
        }

        await sendReaction('⏳')
        try {
            const htmlContent = createPureChessHtml()
            await sendMetaAiHtmlMessage(conn, targetJid, htmlContent)
            await sendReaction('♟️')
        } catch (error) {
            console.error('[CHESS BOT ERROR]', error)
            await sendReaction('❌')
            const errMessage = error?.message || String(error)
            await conn.sendMessage(
                targetJid,
                { text: `❌ Gagal memuat Canvas Catur.\n\n> ${errMessage}` },
                { quoted: m }
            )
        }
    }
}