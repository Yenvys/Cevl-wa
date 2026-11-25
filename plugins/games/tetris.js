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
            submessages: [{ messageType: 2, messageText: "Interactive Tetris Game" }],
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

function createTetrisHtml() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; user-select: none; -webkit-user-select: none; touch-action: manipulation; margin: 0; padding: 0; }
    body { background: #070a12; color: #f8fafc; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; padding: 2px; display: flex; justify-content: center; }
    .card { background: #0f172a; width: 100%; max-width: 350px; border-radius: 12px; padding: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.7); text-align: center; border: 1px solid #1e293b; position: relative; }
    .game-wrapper { display: flex; gap: 4px; align-items: stretch; background: #030712; border-radius: 8px; padding: 4px; border: 2px solid #38bdf8; box-shadow: 0 0 12px rgba(56, 189, 248, 0.3); }
    .side-panel { width: 48px; display: flex; flex-direction: column; justify-content: space-around; align-items: center; background: rgba(15, 23, 42, 0.6); border-radius: 6px; border: 1px solid #1e293b; padding: 4px 2px; }
    .panel-box { width: 100%; text-align: center; }
    .panel-label { font-size: 7px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
    .panel-value { font-size: 10px; font-weight: 800; color: #38bdf8; }
    canvas#next-canvas { background: transparent; display: block; margin: 0 auto; }
    .canvas-container { flex: 1; display: flex; justify-content: center; align-items: center; background: #050b14; border-radius: 4px; overflow: hidden; }
    canvas#tetris { background: #050b14; display: block; width: 100%; height: 100%; max-height: 360px; aspect-ratio: 1 / 2.2; }
    .controls { margin-top: 6px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .btn-ctrl { background: #1e293b; border: 1px solid #334155; color: #f8fafc; font-size: 22px; font-weight: 800; height: 52px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(0,0,0,0.4); }
    .btn-ctrl:active { transform: scale(0.92); }
    .btn-rotate { background: rgba(56, 189, 248, 0.18); border-color: rgba(56, 189, 248, 0.45); color: #38bdf8; }
    .btn-drop { background: rgba(244, 63, 94, 0.18); border-color: rgba(244, 63, 94, 0.45); color: #f43f5e; }
    .overlay { position: absolute; inset: 0; background: rgba(3, 7, 18, 0.95); backdrop-filter: blur(6px); display: flex; flex-direction: column; justify-content: center; align-items: center; border-radius: 12px; z-index: 10; padding: 12px; }
    .overlay.hidden { display: none; }
    .overlay-title { font-size: 20px; font-weight: 800; color: #f43f5e; margin-bottom: 4px; }
    .overlay-msg { font-size: 12px; color: #e2e8f0; margin-bottom: 14px; font-family: 'Inter', sans-serif; }
    .btn-replay { background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; font-family: 'Plus Jakarta Sans', sans-serif; cursor: pointer; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.5); }
  </style>
</head>
<body>
<div class="card">
  <div class="game-wrapper">
    <div class="side-panel">
      <div class="panel-box"><div class="panel-label">SKOR</div><div class="panel-value" id="score">0</div></div>
      <div class="panel-box"><div class="panel-label">LEVEL</div><div class="panel-value" id="level-val">1</div></div>
      <div class="panel-box"><div class="panel-label">RANK</div><div class="panel-value" id="rank-val">C</div></div>
    </div>
    <div class="canvas-container"><canvas id="tetris" width="200" height="440"></canvas></div>
    <div class="side-panel">
      <div class="panel-box"><div class="panel-label">NEXT</div><canvas id="next-canvas" width="30" height="30"></canvas></div>
      <div class="panel-box"><div class="panel-label">BARIS</div><div class="panel-value" id="lines-val">0</div></div>
      <div class="panel-box"><div class="panel-label">COMBO</div><div class="panel-value" id="combo-val">0</div></div>
    </div>
  </div>
  <div class="controls">
    <button class="btn-ctrl btn-left" onclick="playerMove(-1)">&#9664;</button>
    <button class="btn-ctrl btn-right" onclick="playerMove(1)">&#9654;</button>
    <button class="btn-ctrl btn-rotate" onclick="playerRotate()">&#8635;</button>
    <button class="btn-ctrl btn-drop" onclick="playerDrop()">&#10515;</button>
  </div>
  <div class="overlay hidden" id="game-over-overlay">
    <div class="overlay-title">GAME OVER</div>
    <div class="overlay-msg" id="final-score">Skor Akhir: 0</div>
    <button class="btn-replay" onclick="resetGame()">&#8635; MAIN LAGI</button>
  </div>
</div>
<script>
  const canvas = document.getElementById('tetris'), context = canvas.getContext('2d');
  context.scale(20, 20);
  const nextCanvas = document.getElementById('next-canvas'), nextContext = nextCanvas.getContext('2d');
  nextContext.scale(7.5, 7.5);

  const COLORS = [null, '#f43f5e', '#38bdf8', '#f59e0b', '#eab308', '#10b981', '#a855f7', '#ec4899', '#06b6d4', '#6366f1', '#14b8a6'];
  const createMatrix = (w, h) => { const m = []; while (h--) m.push(new Array(w).fill(0)); return m; };

  function createPiece(type) {
    switch (type) {
      case 'I': return [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]];
      case 'L': return [[0,3,0],[0,3,0],[0,3,3]];
      case 'J': return [[0,2,0],[0,2,0],[2,2,0]];
      case 'O': return [[4,4],[4,4]];
      case 'S': return [[0,5,5],[5,5,0],[0,0,0]];
      case 'T': return [[0,0,0],[6,6,6],[0,6,0]];
      case 'Z': return [[7,7,0],[0,7,7],[0,0,0]];
      case 'DOT': return [[8]];
      case 'BIG_O': return [[9,9,9],[9,9,9],[9,9,9]];
      case 'PLUS': return [[0,10,0],[10,10,10],[0,10,0]];
    }
  }

  const arena = createMatrix(10, 22);
  const player = { pos: {x: 0, y: 0}, matrix: null, nextPiece: null, score: 0, lines: 0, level: 1, combo: 0 };

  function arenaSweep() {
    let rowCount = 0;
    outer: for (let y = arena.length - 1; y >= 0; --y) {
      for (let x = 0; x < arena[y].length; ++x) {
        if (arena[y][x] === 0) continue outer;
      }
      arena.unshift(arena.splice(y, 1)[0].fill(0));
      ++y; rowCount++;
    }
    if (rowCount > 0) {
      const basePoints = [0, 40, 100, 300, 1200];
      player.score += (basePoints[rowCount] || rowCount * 400) * player.level;
      player.lines += rowCount;
      player.combo++;
      player.level = Math.floor(player.lines / 10) + 1;
      dropInterval = Math.max(150, 750 - (player.level - 1) * 60);
    } else { player.combo = 0; }
    updateStats();
  }

  function collide(a, p) {
    const [m, o] = [p.matrix, p.pos];
    for (let y = 0; y < m.length; ++y) {
      for (let x = 0; x < m[y].length; ++x) {
        if (m[y][x] !== 0 && (a[y + o.y] && a[y + o.y][x + o.x]) !== 0) return true;
      }
    }
    return false;
  }

  function merge(a, p) {
    p.matrix.forEach((row, y) => row.forEach((v, x) => { if (v !== 0) a[y + p.pos.y][x + p.pos.x] = v; }));
  }

  function rotate(m) {
    for (let y = 0; y < m.length; ++y) {
      for (let x = 0; x < y; ++x) [m[x][y], m[y][x]] = [m[y][x], m[x][y]];
    }
    m.forEach(row => row.reverse());
  }

  function drawMatrix(matrix, offset, ctx = context) {
    matrix.forEach((row, y) => row.forEach((v, x) => {
      if (v !== 0) {
        ctx.fillStyle = COLORS[v];
        ctx.fillRect(x + offset.x + 0.02, y + offset.y + 0.02, 0.96, 0.96);
      }
    }));
  }

  function draw() {
    context.fillStyle = '#050b14';
    context.fillRect(0, 0, canvas.width, canvas.height);
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
    if (collide(arena, player)) player.pos.x -= dir;
  }

  function playerRotate() {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix);
    while (collide(arena, player)) {
      player.pos.x += offset;
      offset = -(offset + (offset > 0 ? 1 : -1));
      if (offset > player.matrix[0].length) { rotate(player.matrix); player.pos.x = pos; return; }
    }
  }

  const pieces = ['I', 'L', 'J', 'O', 'S', 'T', 'Z', 'DOT', 'BIG_O', 'PLUS'];
  const getRandomPiece = () => createPiece(pieces[Math.floor(Math.random() * pieces.length)]);

  function playerReset() {
    if (!player.nextPiece) player.nextPiece = getRandomPiece();
    player.matrix = player.nextPiece;
    player.nextPiece = getRandomPiece();
    nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    drawMatrix(player.nextPiece, { x: (4 - player.nextPiece[0].length) / 2, y: (4 - player.nextPiece.length) / 2 }, nextContext);

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
    document.getElementById('rank-val').innerText = player.score > 2000 ? 'S' : player.score > 1000 ? 'A' : player.score > 500 ? 'B' : 'C';
  }

  let dropCounter = 0, dropInterval = 750, lastTime = 0, gameOver = false;
  function update(time = 0) {
    if (gameOver) return;
    dropCounter += time - lastTime;
    lastTime = time;
    if (dropCounter > dropInterval) playerDrop();
    draw();
    requestAnimationFrame(update);
  }

  function resetGame() {
    arena.forEach(row => row.fill(0));
    player.score = 0; player.lines = 0; player.level = 1; player.combo = 0;
    player.nextPiece = null; dropInterval = 750; updateStats(); gameOver = false;
    document.getElementById('game-over-overlay').classList.add('hidden');
    playerReset(); update();
  }

  resetGame();
</script>
</body>
</html>`;
}

export default {
  cmd: ["tetris"],
  category: "games",
  desc: "Membuat Game Tetris Modern Interaktif",
  exec: async (m, { sock }) => {
    const conn = sock || m.conn;
    const targetJid = m.from || m.chat;
    await conn.sendMessage(targetJid, { react: { text: "⏳", key: m.key } });

    try {
      await sendMetaAiHtmlMessage(conn, targetJid, createTetrisHtml());
      await conn.sendMessage(targetJid, { react: { text: "🕹️", key: m.key } });
    } catch (error) {
      console.error("[TETRIS BOT ERROR]", error);
      await conn.sendMessage(targetJid, { react: { text: "❌", key: m.key } });
      await conn.sendMessage(targetJid, { text: `❌ Gagal memuat Game Tetris.\n\n> ${error.message || error}` }, { quoted: m });
    }
  },
};
