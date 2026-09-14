/**
 * plugins/games/tetris.js
 * Game Tetris Modern - Extended Vertical Aspect Ratio (Anti-Gepeng)
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
                                messageText: 'Interactive Tetris Game'
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
 * HTML TETRIS GENERATOR (PROPORTIONAL VERTICAL BOARD)
 * ========================================================= */
function createTetrisHtml() {
    return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@600;700&display=swap" rel="stylesheet">
  
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
      background: #070a12;
      color: #f8fafc;
      font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
      padding: 2px;
      display: flex;
      justify-content: center;
    }
    .card {
      background: #0f172a;
      width: 100%;
      max-width: 350px;
      border-radius: 12px;
      padding: 6px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.7);
      text-align: center;
      border: 1px solid #1e293b;
      position: relative;
    }

    /* Container Utama dengan Side Panels & Aspect Ratio Memanjang */
    .game-wrapper {
      display: flex;
      gap: 4px;
      align-items: stretch;
      background: #030712;
      border-radius: 8px;
      padding: 4px;
      border: 2px solid #38bdf8;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
    }

    .side-panel {
      width: 48px;
      display: flex;
      flex-direction: column;
      justify-content: space-around;
      align-items: center;
      background: rgba(15, 23, 42, 0.6);
      border-radius: 6px;
      border: 1px solid #1e293b;
      padding: 4px 2px;
    }

    .panel-box {
      width: 100%;
      text-align: center;
    }
    .panel-label {
      font-size: 7px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    .panel-value {
      font-size: 10px;
      font-weight: 800;
      color: #38bdf8;
    }

    canvas#next-canvas {
      background: transparent;
      display: block;
      margin: 0 auto;
    }

    /* Canvas Arena Utama (Dimensi Diperpanjang secara Vertikal) */
    .canvas-container {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #050b14;
      border-radius: 4px;
      overflow: hidden;
    }
    canvas#tetris {
      background: #050b14;
      display: block;
      width: 100%;
      height: 100%;
      max-height: 360px;
      aspect-ratio: 1 / 2.2;
    }

    /* Touch Controls */
    .controls {
      margin-top: 6px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }
    .btn-ctrl {
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      font-size: 22px;
      font-weight: 800;
      height: 52px;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 8px rgba(0,0,0,0.4);
      transition: transform 0.05s ease, background 0.1s ease;
    }
    .btn-ctrl:active {
      transform: scale(0.92);
    }
    .btn-left, .btn-right {
      background: #1e293b;
      color: #e2e8f0;
    }
    .btn-rotate {
      background: rgba(56, 189, 248, 0.18);
      border-color: rgba(56, 189, 248, 0.45);
      color: #38bdf8;
    }
    .btn-rotate:active {
      background: #0284c7;
      color: #fff;
    }
    .btn-drop {
      background: rgba(244, 63, 94, 0.18);
      border-color: rgba(244, 63, 94, 0.45);
      color: #f43f5e;
    }
    .btn-drop:active {
      background: #e11d48;
      color: #fff;
    }

    /* Game Over Overlay */
    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(3, 7, 18, 0.95);
      backdrop-filter: blur(6px);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      border-radius: 12px;
      z-index: 10;
      padding: 12px;
    }
    .overlay.hidden { display: none; }
    .overlay-title { font-size: 20px; font-weight: 800; color: #f43f5e; margin-bottom: 4px; }
    .overlay-msg { font-size: 12px; color: #e2e8f0; margin-bottom: 14px; font-family: 'Inter', sans-serif; }
    .btn-replay { 
      background: #0284c7; 
      color: white; 
      border: none; 
      padding: 10px 20px; 
      border-radius: 8px; 
      font-weight: 700; 
      font-size: 13px;
      font-family: 'Plus Jakarta Sans', sans-serif;
      cursor: pointer; 
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.5);
    }
  </style>
</head>
<body>

<div class="card">
  <!-- Layout Wrapper -->
  <div class="game-wrapper">
    <!-- Panel Kiri -->
    <div class="side-panel">
      <div class="panel-box">
        <div class="panel-label">SKOR</div>
        <div class="panel-value" id="score">0</div>
      </div>
      <div class="panel-box">
        <div class="panel-label">LEVEL</div>
        <div class="panel-value" id="level-val">1</div>
      </div>
      <div class="panel-box">
        <div class="panel-label">RANK</div>
        <div class="panel-value" id="rank-val">C</div>
      </div>
    </div>

    <!-- Arena Utama Proporsional -->
    <div class="canvas-container">
      <canvas id="tetris" width="200" height="440"></canvas>
    </div>

    <!-- Panel Kanan -->
    <div class="side-panel">
      <div class="panel-box">
        <div class="panel-label">NEXT</div>
        <canvas id="next-canvas" width="30" height="30"></canvas>
      </div>
      <div class="panel-box">
        <div class="panel-label">BARIS</div>
        <div class="panel-value" id="lines-val">0</div>
      </div>
      <div class="panel-box">
        <div class="panel-label">COMBO</div>
        <div class="panel-value" id="combo-val">0</div>
      </div>
    </div>
  </div>

  <!-- Touch Controls -->
  <div class="controls">
    <button class="btn-ctrl btn-left" onclick="playerMove(-1)">&#9664;</button>
    <button class="btn-ctrl btn-right" onclick="playerMove(1)">&#9654;</button>
    <button class="btn-ctrl btn-rotate" onclick="playerRotate()">&#8635;</button>
    <button class="btn-ctrl btn-drop" onclick="playerDrop()">&#10515;</button>
  </div>

  <!-- Game Over Screen -->
  <div class="overlay hidden" id="game-over-overlay">
    <div class="overlay-title">GAME OVER</div>
    <div class="overlay-msg" id="final-score">Skor Akhir: 0</div>
    <button class="btn-replay" onclick="resetGame()">&#8635; MAIN LAGI</button>
  </div>
</div>

<script>
  const canvas = document.getElementById('tetris');
  const context = canvas.getContext('2d');
  context.scale(20, 20);

  const nextCanvas = document.getElementById('next-canvas');
  const nextContext = nextCanvas.getContext('2d');
  nextContext.scale(7.5, 7.5);

  const COLORS = [
    null,
    '#f43f5e',
    '#38bdf8',
    '#f59e0b',
    '#eab308',
    '#10b981',
    '#a855f7',
    '#ec4899',
    '#06b6d4',
    '#6366f1',
    '#14b8a6'
  ];

  function createMatrix(w, h) {
    const matrix = [];
    while (h--) matrix.push(new Array(w).fill(0));
    return matrix;
  }

  function createPiece(type) {
    switch (type) {
      case 'I':
        return [
          [0, 1, 0, 0],
          [0, 1, 0, 0],
          [0, 1, 0, 0],
          [0, 1, 0, 0],
        ];
      case 'L':
        return [
          [0, 3, 0],
          [0, 3, 0],
          [0, 3, 3],
        ];
      case 'J':
        return [
          [0, 2, 0],
          [0, 2, 0],
          [2, 2, 0],
        ];
      case 'O':
        return [
          [4, 4],
          [4, 4],
        ];
      case 'S':
        return [
          [0, 5, 5],
          [5, 5, 0],
          [0, 0, 0],
        ];
      case 'T':
        return [
          [0, 0, 0],
          [6, 6, 6],
          [0, 6, 0],
        ];
      case 'Z':
        return [
          [7, 7, 0],
          [0, 7, 7],
          [0, 0, 0],
        ];
      case 'DOT':
        return [[8]];
      case 'BIG_O':
        return [
          [9, 9, 9],
          [9, 9, 9],
          [9, 9, 9]
        ];
      case 'PLUS':
        return [
          [0, 10, 0],
          [10, 10, 10],
          [0, 10, 0]
        ];
    }
  }

  const arena = createMatrix(10, 22);
  const player = {
    pos: {x: 0, y: 0},
    matrix: null,
    nextPiece: null,
    score: 0,
    lines: 0,
    level: 1,
    combo: 0
  };

  // Mekanik Pembersihan Baris & Tambah Skor
  function arenaSweep() {
    let rowCount = 0;
    outer: for (let y = arena.length - 1; y >= 0; --y) {
      for (let x = 0; x < arena[y].length; ++x) {
        if (arena[y][x] === 0) continue outer;
      }
      const row = arena.splice(y, 1)[0].fill(0);
      arena.unshift(row);
      ++y;
      rowCount++;
    }

    if (rowCount > 0) {
      const basePoints = [0, 40, 100, 300, 1200];
      player.score += (basePoints[rowCount] || rowCount * 400) * player.level;
      player.lines += rowCount;
      player.combo++;
      player.level = Math.floor(player.lines / 10) + 1;
      dropInterval = Math.max(150, 750 - (player.level - 1) * 60);
    } else {
      player.combo = 0;
    }
    updateStats();
  }

  function collide(arena, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
      for (let x = 0; x < m[y].length; ++x) {
        if (m[y][x] !== 0 &&
           (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
          return true;
        }
      }
    }
    return false;
  }

  function merge(arena, player) {
    player.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          arena[y + player.pos.y][x + player.pos.x] = value;
        }
      });
    });
  }

  function rotate(matrix) {
    for (let y = 0; y < matrix.length; ++y) {
      for (let x = 0; x < y; ++x) {
        [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
      }
    }
    matrix.forEach(row => row.reverse());
  }

  function drawMatrix(matrix, offset, ctx = context) {
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          const px = x + offset.x;
          const py = y + offset.y;

          ctx.fillStyle = COLORS[value];
          ctx.fillRect(px + 0.02, py + 0.02, 0.96, 0.96);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.fillRect(px + 0.02, py + 0.02, 0.96, 0.15);
          ctx.fillRect(px + 0.02, py + 0.02, 0.15, 0.96);

          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(px + 0.02, py + 0.83, 0.96, 0.15);
          ctx.fillRect(px + 0.83, py + 0.02, 0.15, 0.96);
        }
      });
    });
  }

  function drawNextPiece() {
    nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!player.nextPiece) return;
    const offset = {
      x: (4 - player.nextPiece[0].length) / 2,
      y: (4 - player.nextPiece.length) / 2
    };
    drawMatrix(player.nextPiece, offset, nextContext);
  }

  function drawGrid() {
    context.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    context.lineWidth = 0.02;
    for (let x = 0; x <= 10; x++) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 22);
      context.stroke();
    }
    for (let y = 0; y <= 22; y++) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(10, y);
      context.stroke();
    }
  }

  function draw() {
    context.fillStyle = '#050b14';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    drawGrid();
    drawMatrix(arena, {x: 0, y: 0});
    drawMatrix(player.matrix, player.pos);
  }

  function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
      player.pos.y--;
      merge(arena, player);
      playerReset();
      arenaSweep();
    }
    dropCounter = 0;
  }

  function playerMove(dir) {
    player.pos.x += dir;
    if (collide(arena, player)) {
      player.pos.x -= dir;
    }
  }

  function playerRotate() {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix);
    while (collide(arena, player)) {
      player.pos.x += offset;
      offset = -(offset + (offset > 0 ? 1 : -1));
      if (offset > player.matrix[0].length) {
        rotate(player.matrix);
        player.pos.x = pos;
        return;
      }
    }
  }

  function getRandomPiece() {
    const pieces = ['I', 'L', 'J', 'O', 'S', 'T', 'Z', 'DOT', 'BIG_O', 'PLUS'];
    return createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
  }

  function playerReset() {
    if (!player.nextPiece) {
      player.nextPiece = getRandomPiece();
    }
    player.matrix = player.nextPiece;
    player.nextPiece = getRandomPiece();
    drawNextPiece();

    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);

    if (collide(arena, player)) {
      document.getElementById('final-score').innerText = 'Skor Akhir: ' + player.score;
      document.getElementById('game-over-overlay').classList.remove('hidden');
      gameOver = true;
    }
  }

  function updateStats() {
    document.getElementById('score').innerText = player.score;
    document.getElementById('lines-val').innerText = player.lines;
    document.getElementById('level-val').innerText = player.level;
    document.getElementById('combo-val').innerText = player.combo;

    let rank = 'C';
    if (player.score > 2000) rank = 'S';
    else if (player.score > 1000) rank = 'A';
    else if (player.score > 500) rank = 'B';
    document.getElementById('rank-val').innerText = rank;
  }

  let dropCounter = 0;
  let dropInterval = 750;
  let lastTime = 0;
  let gameOver = false;

  function update(time = 0) {
    if (gameOver) return;

    const deltaTime = time - lastTime;
    lastTime = time;

    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
      playerDrop();
    }

    draw();
    requestAnimationFrame(update);
  }

  function resetGame() {
    arena.forEach(row => row.fill(0));
    player.score = 0;
    player.lines = 0;
    player.level = 1;
    player.combo = 0;
    player.nextPiece = null;
    dropInterval = 750;
    updateStats();
    gameOver = false;
    document.getElementById('game-over-overlay').classList.add('hidden');
    playerReset();
    update();
  }

  document.addEventListener('keydown', event => {
    if (gameOver) return;
    if (event.keyCode === 37) playerMove(-1);
    else if (event.keyCode === 39) playerMove(1);
    else if (event.keyCode === 40) playerDrop();
    else if (event.keyCode === 38 || event.keyCode === 87) playerRotate();
  });

  resetGame();
</script>
</body>
</html>
  `
}

/* =========================================================
 * EXPORT DEFAULT HANDLER
 * ========================================================= */
export default {
    cmd: ['tetris'],
    category: 'games',
    desc: 'Membuat Game Tetris Modern dengan Proporsi Tinggi Ideal (Anti-Gepeng)',
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
            const htmlContent = createTetrisHtml()
            await sendMetaAiHtmlMessage(conn, targetJid, htmlContent)
            await sendReaction('🕹️')
        } catch (error) {
            console.error('[TETRIS BOT ERROR]', error)
            await sendReaction('❌')
            const errMessage = error?.message || String(error)
            await conn.sendMessage(
                targetJid,
                { text: `❌ Gagal memuat Game Tetris.\n\n> ${errMessage}` },
                { quoted: m }
            )
        }
    }
}