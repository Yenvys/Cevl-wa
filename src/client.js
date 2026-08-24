/**
 * src/client.js
 */
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
  Browsers
} from 'baileys';
import chalk from 'chalk';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import readline from 'readline';
import wrapSocket, { getMessageFromStoreById } from './helper.js';

const question = (text) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(text, (ans) => { rl.close(); resolve(ans); }));
};

export async function startSock(sessionId, logger, onSocketReady, _retryCount = 0) {
  const MAX_RETRIES = 10;
  const dataDir = path.join(process.cwd(), 'data');
  const sessionDir = path.join(dataDir, `session_${sessionId}`);

  if (!fsSync.existsSync(dataDir)) await fs.mkdir(dataDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const silentLogger = pino({ level: 'silent' });

  let userPilihan = '';

  const sock = makeWASocket({
    version,
    logger: silentLogger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger)
    },
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    keepAliveIntervalMs: 10000,
    connectTimeoutMs: 60000,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 15,
    syncFullHistory: false,
    getMessage: async (key) => {
      const msg = await getMessageFromStoreById(key.id);
      return msg || { conversation: 'hello' };
    }
  });

  if (!sock.authState.creds.registered) {
    console.log('\n' + chalk.cyan.bold('┌──────────────────────────────────┐'));
    console.log(chalk.cyan.bold('│') + '   PILIH METODE LOGIN :           ' + chalk.cyan.bold('│'));
    console.log(chalk.cyan.bold('│') + '   1. Pairing Code (Nomor WA)     ' + chalk.cyan.bold('│'));
    console.log(chalk.cyan.bold('│') + '   2. QR Code (Scan)              ' + chalk.cyan.bold('│'));
    console.log(chalk.cyan.bold('└──────────────────────────────────┘'));

    userPilihan = await question(chalk.yellow.bold(' Masukkan pilihan (1/2): '));

    if (userPilihan === '1') {
      console.log(chalk.yellow('\n Menunggu inisialisasi...'));
      await new Promise(resolve => setTimeout(resolve, 2000));

      let phoneNumber = process.env.PAIRING_NUMBER;
      if (!phoneNumber) {
        phoneNumber = await question(chalk.bgMagenta.white.bold(' Masukan Nomer Bot (Contoh: 628xxx): '));
      }

      const requestPairing = async (retries = 0) => {
        try {
          await new Promise(resolve => setTimeout(resolve, 3000));
          let code = await sock.requestPairingCode(phoneNumber.replace(/[^\d]/g, ''), 'WUWUWAWA');
          code = code?.match(/.{1,4}/g)?.join('-') || code;
          console.log('\n' + chalk.black(chalk.bgCyan.bold(` Pairing Code: ${code} `)) + '\n');
        } catch (e) {
          if (retries < 5) {
            console.log(chalk.yellow(`\n[RETRY] Menunggu socket siap untuk pairing... (${retries + 1}/5)`));
            requestPairing(retries + 1);
          } else {
            logger.error('PAIRING', 'Gagal request pairing code setelah 5 percobaan.');
          }
        }
      };
      requestPairing();
    }
  }

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !sock.authState.creds.registered && userPilihan === '2') {
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        await wrapSocket(sock);
        console.log(chalk.greenBright.bold(`\n Yenvy Connected Successfully! \n`));
        if (onSocketReady) await onSocketReady(sock);
        resolve(sock);
      }

      if (connection === 'close') {
		    const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
		    const reason = lastDisconnect?.error?.message || 'No Message';
    
    		// DEBUG LOGS
		    console.log(`\x1b[1;31m[DEBUG KONEKSI]\x1b[0m`);
		    console.log(`- Status Code: ${statusCode}`);
		    console.log(`- Reason: ${reason}`);
		    console.log(`- Is Registered: ${sock.authState.creds.registered}`);
		    console.log(`- Retry: ${_retryCount + 1}/${MAX_RETRIES}`);

		    if (statusCode === DisconnectReason.loggedOut) {
		        console.log(chalk.red(`\n[FATAL] Session Logout. Menghapus session...`));
		        if (fsSync.existsSync(sessionDir)) await fs.rm(sessionDir, { recursive: true, force: true });
		        process.exit(1);
		    } else if (_retryCount >= MAX_RETRIES) {
		        console.log(chalk.red(`\n[FATAL] Gagal reconnect setelah ${MAX_RETRIES} percobaan. Keluar...`));
		        process.exit(1);
		    } else {
        	// Cleanup old listeners
	        console.log(`\x1b[1;33m[DEBUG]\x1b[0m Cleaning up old listeners...`);
	        sock.ev.removeAllListeners('connection.update');
	        sock.ev.removeAllListeners('creds.update');
	        sock.ev.removeAllListeners('messages.upsert');
          try { sock.ws.close(); } catch {}
          try { sock.end(new Error("Reconnect")); } catch {}
	
	        // Exponential backoff: 5s, 10s, 20s, 40s, max 60s
	        const delay = Math.min(5000 * Math.pow(2, _retryCount), 60000);
	        console.log(chalk.yellow(`\n[RECONNECT] Percobaan ${_retryCount + 1}/${MAX_RETRIES} dalam ${delay / 1000} detik...`));
	        setTimeout(() => {
	            startSock(sessionId, logger, onSocketReady, _retryCount + 1).then(resolve).catch(reject);
	        }, delay);
	    }
	}
    });
  });
}