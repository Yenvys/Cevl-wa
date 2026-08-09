/**
 * lib/client.js
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

export async function startSock(sessionId, logger) {
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
    keepAliveIntervalMs: 30000,
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

      setTimeout(async () => {
        try {
          let code = await sock.requestPairingCode(phoneNumber.replace(/[^\d]/g, ''), 'WUWUWAWA');
          code = code?.match(/.{1,4}/g)?.join('-') || code;
          console.log('\n' + chalk.black(chalk.bgCyan.bold(` Pairing Code: ${code} `)) + '\n');
        } catch (e) {
          logger.error('PAIRING', 'Gagal request pairing code.');
        }
      }, 3000);
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
		    console.log(`- Last Disconnect Obj: ${JSON.stringify(lastDisconnect?.error?.output || {})}`);

		    if (statusCode === DisconnectReason.loggedOut) {
		        console.log(chalk.red(`\n[FATAL] Session Logout. Menghapus session...`));
		        if (fsSync.existsSync(sessionDir)) await fs.rm(sessionDir, { recursive: true, force: true });
		        process.exit(1);
		    } else {
        	// Cek apakah socket masih punya listener aktif yang numpuk
	        console.log(`\x1b[1;33m[DEBUG]\x1b[0m Cleaning up old listeners...`);
	        sock.ev.removeAllListeners('connection.update');
	        sock.ev.removeAllListeners('creds.update');
	        sock.ev.removeAllListeners('messages.upsert');
          try { sock.ws.close(); } catch {}
          try { sock.end(new Error("Reconnect")); } catch {}
	
	        console.log(chalk.yellow(`\n[RECONNECT] Mencoba nyambung ulang dalam 5 detik...`));
	        setTimeout(() => {
	            startSock(sessionId, logger).then(resolve).catch(reject);
	        }, 5000);
	    }
	}
    });
  });
}