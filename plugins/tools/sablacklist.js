/**
 * plugins/tools/sablacklist.js
 * Manajemen Blacklist Stiker Audio & Auto-Delete Stiker Audio Terlarang di Grup
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { res } from "../../src/response.js";
import {
  addAudioBlacklist,
  removeAudioBlacklist,
  listAudioBlacklist,
  hashBuffer,
  extractAudioMessage,
  getHashesFromAudioMessage,
  checkMessageAudioBlacklist,
  isBufferBlacklisted,
} from "../../src/lib/audioBlacklist.js";

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegInstaller?.path || "ffmpeg";
const tempDir = path.join(process.cwd(), "data", "tmp");

async function convertToOggOpusQuick(buffer) {
  const tmpId = randomBytes(6).toString("hex");
  const inPath = path.join(tempDir, `bl_in_${tmpId}.bin`);
  const outPath = path.join(tempDir, `bl_out_${tmpId}.ogg`);
  try {
    await fs.writeFile(inPath, buffer);
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", inPath,
      "-vn",
      "-c:a", "libopus",
      "-b:a", "48k",
      "-ac", "1",
      "-ar", "48000",
      "-f", "ogg",
      outPath,
    ]);
    return await fs.readFile(outPath);
  } catch {
    return null;
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}

export default {
  cmd: ["sablacklist", "sabl", "sablack"],
  category: "tools",
  desc: "Kelola daftar blacklist audio meresahkan untuk Audio Sticker & Auto-Delete",

  exec: async (m, { sock, command, args, isOwner, isAdmin }) => {
    // Izin akses: Owner atau Admin grup
    if (m.isGroup && !isAdmin && !isOwner) {
      return m.reply(res.admin);
    }
    if (!m.isGroup && !isOwner) {
      return m.reply(res.owner);
    }

    const sub = (args[0] || "").toLowerCase();
    const query = args.slice(1).join(" ").trim();

    // 1. ADD: Tambahkan audio ke blacklist via reply
    if (sub === "add" || sub === "tambah") {
      const q = m.quoted;
      if (!q) {
        return m.reply(
          res.format(
            m.prefix,
            `${command} add [alasan]`,
            ["add suara desah", "add jumpscare"],
            "Balas (reply) Audio, Voice Note, Video, atau Stiker Audio yang ingin diblacklist.",
            "Menambahkan audio meresahkan ke daftar blacklist"
          )
        );
      }

      await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

      try {
        const audioMsg = extractAudioMessage(q);
        const collectedHashes = [];

        // Ambil hash langsung dari audioMessage jika tersedia
        if (audioMsg) {
          const directHashes = getHashesFromAudioMessage(audioMsg);
          collectedHashes.push(...directHashes);
        }

        // Unduh media untuk mendapatkan raw hash & ogg hash
        let buffer = null;
        if (typeof q.download === "function") {
          buffer = await q.download().catch(() => null);
        }

        if (buffer && Buffer.isBuffer(buffer) && buffer.length > 0) {
          const rawHash = hashBuffer(buffer);
          if (rawHash) collectedHashes.push(rawHash);

          // Coba convert ke OGG Opus (seperti pipeline saudio)
          const oggBuf = await convertToOggOpusQuick(buffer);
          if (oggBuf && Buffer.isBuffer(oggBuf)) {
            const oggHash = hashBuffer(oggBuf);
            if (oggHash) collectedHashes.push(oggHash);
          }
        }

        if (!collectedHashes.length) {
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          return m.reply(res.warn("Gagal mengekstrak audio dari pesan yang di-reply. Pastikan membalas audio/stiker audio yang valid."));
        }

        const note = query || "Audio meresahkan / dilarang";
        const result = addAudioBlacklist(collectedHashes, note, m.sender);

        await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });

        const teks =
          `✅ *AUDIO BERHASIL DIBLACKLIST*\n\n` +
          `> • ID Entry     : #${result.entryId}\n` +
          `> • Alasan       : ${note}\n` +
          `> • Varian Hash  : ${result.hashCount} hash tersimpan\n` +
          `> • Ditambahkan  : @${String(m.sender || "").split("@")[0].split(":")[0]}\n\n` +
          `*Catatan :*\n` +
          `> • Stiker audio dengan suara ini otomatis ditolak saat pembuatan\n` +
          `> • Jika dikirim di dalam grup, bot akan otomatis menghapus pesan tersebut`;

        return m.reply(teks, { mentions: [m.sender] });
      } catch (err) {
        console.error("[SABLACKLIST_ADD_ERR]", err);
        await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
        return m.reply(res.error(`Gagal menambahkan audio ke blacklist: ${err.message}`));
      }
    }

    // 2. DEL: Hapus audio dari blacklist berdasarkan ID
    if (sub === "del" || sub === "hapus" || sub === "delete" || sub === "remove") {
      const id = parseInt(query || args[1], 10);
      if (!id || isNaN(id)) {
        return m.reply(
          res.format(
            m.prefix,
            `${command} del <ID>`,
            ["del 1", "del 2"],
            "Masukkan ID audio blacklist yang ingin dihapus (cek ID dengan '.sablacklist list').",
            "Menghapus audio dari daftar blacklist"
          )
        );
      }

      const success = removeAudioBlacklist(id);
      if (!success) {
        return m.reply(res.empty(`Audio blacklist dengan ID #${id} tidak ditemukan.`));
      }

      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      return m.reply(res.success(`Berhasil menghapus audio blacklist ID #${id}.`));
    }

    // 3. LIST: Tampilkan daftar audio yang diblacklist
    if (sub === "list" || sub === "daftar" || !sub) {
      const list = listAudioBlacklist();
      if (!list.length) {
        return m.reply(
          `📁 *DAFTAR AUDIO BLACKLIST*\n\n` +
          `_Belum ada audio yang masuk ke dalam daftar blacklist._\n\n` +
          `*Catatan :* _Reply audio/stiker audio yang meresahkan lalu ketik \`${m.prefix}${command} add [alasan]\` untuk memblokirnya._`
        );
      }

      let teks = `📁 *DAFTAR AUDIO BLACKLIST (${list.length})*\n\n`;
      list.forEach((item, idx) => {
        const who = item.added_by ? `@${String(item.added_by).split("@")[0].split(":")[0]}` : "Admin";
        teks +=
          `*${idx + 1}. [ID: #${item.id}]*\n` +
          `> • Alasan: ${item.note}\n` +
          `> • Varian: ${item.hash_count} hash\n` +
          `> • Oleh  : ${who}\n\n`;
      });

      teks += `*Catatan :* _Gunakan \`${m.prefix}${command} del <ID>\` untuk menghapus dari blacklist._`;
      return m.reply(teks, { mentions: list.map((l) => l.added_by).filter(Boolean) });
    }

    return m.reply(
      res.format(
        m.prefix,
        `${command} [add/del/list]`,
        ["add suara desah", "del 1", "list"],
        "Reply audio/stiker lalu ketik 'add' untuk memblokir audio tersebut secara otomatis.",
        "Kelola blacklist audio stiker & auto-delete di grup"
      )
    );
  },

  /**
   * Hook Before: Mendeteksi dan menghapus stiker audio meresahkan di grup
   */
  before: async (m, { sock, isBotAdmin }) => {
    if (!m || !m.isGroup || m.fromMe) return false;

    // Cek apakah pesan membawa audioMessage (stiker audio atau audio)
    const audioMsg = extractAudioMessage(m);
    if (!audioMsg) return false;

    // Cek hash audioMessage secara instan
    let check = checkMessageAudioBlacklist(m);

    // Jika belum ketemu dan adalah stiker dengan audio, unduh buffer untuk cek raw hash
    if (!check && (m.mtype === "stickerMessage" || m.message?.stickerMessage)) {
      try {
        if (typeof m.download === "function") {
          const buf = await m.download().catch(() => null);
          if (buf && Buffer.isBuffer(buf)) {
            check = isBufferBlacklisted(buf);
            // Jika buffer cocok, rekam juga fileSha256 pesan ini agar berikutnya instan
            if (check && audioMsg.fileSha256) {
              const h = Buffer.from(audioMsg.fileSha256).toString("hex").toLowerCase();
              addAudioBlacklist([h], check.note || "Audio meresahkan", m.sender).catch?.(() => {});
            }
          }
        }
      } catch {}
    }

    if (check && check.isBlacklisted) {
      // Hapus pesan jika bot adalah admin
      if (isBotAdmin) {
        try {
          await sock.sendMessage(m.from, {
            delete: {
              remoteJid: m.from,
              fromMe: false,
              id: m.id || m.key.id,
              participant: m.sender || m.key.participant,
            },
          });

          const senderNum = String(m.sender || "").split("@")[0].split(":")[0];
          await sock.sendMessage(m.from, {
            text:
              `⚠️ *STIKER AUDIO DIHAPUS!*\n` +
              `> @${senderNum} Stiker audio yang kamu kirim otomatis dihapus karena mengandung audio yang masuk dalam daftar hitam (blacklist).\n\n` +
              `*Catatan :* _Kategori: ${check.note}_`,
            mentions: [m.sender],
          });
        } catch (err) {
          console.error("[AUTO_DELETE_SAUDIO_ERR]", err.message);
        }
      }
      return true; // Hentikan eksekusi perintah lain
    }

    return false;
  },
};
