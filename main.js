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

const customTemp = path.join(process.cwd(), 'data', 'tmp');
if (!fs.existsSync(customTemp)) {
  fs.mkdirSync(customTemp, { recursive: true });
}

process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;
os.tmpdir = () => customTemp;

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

    log.success(`Yenvy [${sessionId}] siap!`);

    setInterval(async () => {
      try {
        await store.writeToFile(storeFilePath);
      } catch (e) {
        console.error('[STORE_SAVE_ERR]', e.message);
      }
    }, 300000);

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