import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
  Browsers,
} from "baileys";
import chalk from "chalk";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import qrcode from "qrcode-terminal";
import readline from "node:readline";
import wrapSocket, { getMessageFromStoreById } from "./helper.js";

const ask = (text) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(text, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
};

export async function startSock(sessionId, logger, onSocketReady, _retryCount = 0) {
  const MAX_RETRIES = 10;
  const dataDir = path.join(process.cwd(), "data");
  const sessionDir = path.join(dataDir, `session_${sessionId}`);

  if (!fsSync.existsSync(dataDir)) await fs.mkdir(dataDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const silentLogger = pino({ level: "silent" });

  let loginMethod = "";

  const sock = makeWASocket({
    version,
    logger: silentLogger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    keepAliveIntervalMs: 10000,
    connectTimeoutMs: 60000,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 15,
    syncFullHistory: false,
    getMessage: async (key) => (await getMessageFromStoreById(key.id)) || { conversation: "hello" },
  });

  if (!sock.authState.creds.registered) {
    console.log(`\n${chalk.cyan.bold("┌──────────────────────────────────┐")}`);
    console.log(`${chalk.cyan.bold("│")}   PILIH METODE LOGIN :           ${chalk.cyan.bold("│")}`);
    console.log(`${chalk.cyan.bold("│")}   1. Pairing Code (Nomor WA)     ${chalk.cyan.bold("│")}`);
    console.log(`${chalk.cyan.bold("│")}   2. QR Code (Scan)              ${chalk.cyan.bold("│")}`);
    console.log(`${chalk.cyan.bold("└──────────────────────────────────┘")}`);

    loginMethod = await ask(chalk.yellow.bold(" Masukkan pilihan (1/2): "));

    if (loginMethod === "1") {
      let phoneNumber = process.env.PAIRING_NUMBER;
      if (!phoneNumber) {
        phoneNumber = await ask(chalk.bgMagenta.white.bold(" Masukan Nomer Bot (Contoh: 628xxx): "));
      }

      const requestPairing = async (retries = 0) => {
        try {
          await new Promise((r) => setTimeout(r, 3000));
          const rawCode = await sock.requestPairingCode(phoneNumber.replace(/[^\d]/g, ""), "WUWUWAWA");
          const code = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;
          console.log(`\n${chalk.black(chalk.bgCyan.bold(` Pairing Code: ${code} `))}\n`);
        } catch (e) {
          if (retries < 5) {
            console.log(chalk.yellow(`[RETRY] Menunggu socket siap untuk pairing... (${retries + 1}/5)`));
            requestPairing(retries + 1);
          } else {
            logger.error("PAIRING", "Gagal request pairing code setelah 5 percobaan.");
          }
        }
      };
      requestPairing();
    }
  }

  sock.ev.on("creds.update", saveCreds);

  return new Promise((resolve, reject) => {
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !sock.authState.creds.registered && loginMethod === "2") {
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        await wrapSocket(sock);
        console.log(chalk.greenBright.bold(`\n Yenvy Connected Successfully! \n`));
        if (onSocketReady) await onSocketReady(sock);
        resolve(sock);
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
        const reason = lastDisconnect?.error?.message || "No Message";

        console.log(`\x1b[1;31m[DEBUG KONEKSI]\x1b[0m status=${statusCode} retry=${_retryCount + 1}/${MAX_RETRIES} reason=${reason}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log(chalk.red(`\n[FATAL] Session Logout. Menghapus session...`));
          if (fsSync.existsSync(sessionDir)) await fs.rm(sessionDir, { recursive: true, force: true });
          process.exit(1);
        }

        if (_retryCount >= MAX_RETRIES) {
          console.log(chalk.red(`\n[FATAL] Gagal reconnect setelah ${MAX_RETRIES} percobaan. Keluar...`));
          process.exit(1);
        }

        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("creds.update");
        sock.ev.removeAllListeners("messages.upsert");
        try { sock.ws.close(); } catch {}
        try { sock.end(new Error("Reconnect")); } catch {}

        const delay = Math.min(5000 * Math.pow(2, _retryCount), 60000);
        console.log(chalk.yellow(`\n[RECONNECT] Percobaan ${_retryCount + 1}/${MAX_RETRIES} dalam ${delay / 1000}s...`));
        setTimeout(() => {
          startSock(sessionId, logger, onSocketReady, _retryCount + 1).then(resolve).catch(reject);
        }, delay);
      }
    });
  });
}
