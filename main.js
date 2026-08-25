/**
 * main.js
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { startSock } from './src/client.js';
import { Handler } from './src/handler.js';
import { Logger } from './src/logger.js';
import { store } from './src/helper.js';
import { listenAlertSchedule } from './plugins/class/alert.js';
import { backupDatabase } from './src/database.js';

const customTemp = path.join(process.cwd(), 'data', 'tmp');
if (!fs.existsSync(customTemp)) {
  fs.mkdirSync(customTemp, { recursive: true });
} else {
  // Startup cleanup: hapus sisa temp file dari session sebelumnya
  try {
    const tmpFiles = fs.readdirSync(customTemp);
    if (tmpFiles.length > 0) {
      for (const file of tmpFiles) {
        try { fs.unlinkSync(path.join(customTemp, file)); } catch { }
      }
      console.log(`[STARTUP] Cleaned ${tmpFiles.length} temp file(s) from data/tmp/`);
    }
  } catch { }
}

process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;
os.tmpdir = () => customTemp;

// Validasi .env keys saat startup
const envValidation = [
  { key: 'GEMINI_API_KEY', required: true, label: 'Google Gemini API' },
  { key: 'SERPAPI_KEY', required: false, label: 'SerpAPI' },
  { key: 'WOLFRAM_APPID', required: false, label: 'Wolfram Alpha' },
  { key: 'PINTEREST_AUTH_COOKIE', required: false, label: 'Pinterest' },
];

for (const { key, required, label } of envValidation) {
  if (!process.env[key]) {
    if (required) {
      console.error(`\x1b[1;31m[ENV ERROR]\x1b[0m ${label} (${key}) tidak ditemukan! Beberapa fitur tidak akan bekerja.`);
    } else {
      console.warn(`\x1b[1;33m[ENV WARN]\x1b[0m ${label} (${key}) kosong — fitur terkait akan dinonaktifkan.`);
    }
  }
}

const storeFilePath = path.join(process.cwd(), 'data', 'store.json');

async function main() {
  const sessionId = process.argv[2] || process.env.SESSION_ID || 'default';
  const log = new Logger(sessionId);

  log.info(`Menginisialisasi sistem bot untuk sesi: ${sessionId}...`);

  if (fs.existsSync(storeFilePath)) {
    try {
      store.readFromFile(storeFilePath);
      log.info('Berhasil memuat riwayat chat lama dari data/store.json');
    } catch (e) {
      log.error('STORE_READ_ERR', `Gagal membaca file store: ${e.message}`);
    }
  }

  const handler = new Handler({
    pluginDir: path.join(process.cwd(), 'plugins'),
    logger: log
  });
  await handler.initPlugins();

  try {
    const onSocketReady = async (sock) => {
      await handler.attach(sock);
      listenAlertSchedule(sock);
    };

    const sock = await startSock(sessionId, log, onSocketReady);

    log.success(`Cevl [${sessionId}] siap!`);

    setInterval(async () => {
      try {
        await store.writeToFile(storeFilePath);
      } catch (e) {
        console.error('[STORE_SAVE_ERR]', e.message);
      }
    }, 300000);

    // Auto-backup database setiap 24 jam
    const runBackup = () => {
      const result = backupDatabase();
      if (result) log.info(`Database backup berhasil: ${result}`);
    };
    runBackup(); // Backup saat startup
    setInterval(runBackup, 1000 * 60 * 60 * 24);

  } catch (error) {
    log.error('MAIN_STARTUP', `Koneksi gagal: ${error.message}`);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  console.error('WARN (Uncaught Exception):', err);
  try { store.writeToFileSync(storeFilePath); } catch { }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('WARN (Unhandled Rejection) at:', promise, 'reason:', reason);
  try { store.writeToFileSync(storeFilePath); } catch { }
  process.exit(1);
});

main();

setInterval(() => {
  const ram = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
  console.log(`[HEARTBEAT] Bot Status: OK | Mem: ${ram} MB`);
}, 1000 * 60 * 5);