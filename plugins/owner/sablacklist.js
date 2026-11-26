/**
 * plugins/owner/sablacklist.js
 * Manajemen Blacklist Stiker Audio & Auto-Delete Stiker Audio Terlarang di Grup
 * Kategori: Owner
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
  isHashBlacklisted,
  downloadAudioFromMessage,
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
  category: "owner",
  desc: "Kelola daftar blacklist audio meresahkan untuk Audio Sticker & Auto-Delete (Khusus Owner)",

  exec: async (m, { sock, command, args, isOwner }) => {
    // Khusus Owner
    if (!isOwner) {
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
        const audioMsg = extractAudioMessage(q, m);
        const collectedHashes = [];

        // 1. Jika audioMessage terdeteksi (stiker bersuara / VN / Audio)
        if (audioMsg) {
          const directHashes = getHashesFromAudioMessage(audioMsg);
          collectedHashes.push(...directHashes);

          // Coba unduh audio stream langsung dari audioMessage
          const audioBuf = await downloadAudioFromMessage(audioMsg);
          if (audioBuf && Buffer.isBuffer(audioBuf) && audioBuf.length > 0) {
            const rawHash = hashBuffer(audioBuf);
            if (rawHash) collectedHashes.push(rawHash);

            // Convert ke OGG Opus untuk mengamankan hash varian hasil saudio
            const oggBuf = await convertToOggOpusQuick(audioBuf);
            if (oggBuf && Buffer.isBuffer(oggBuf)) {
              const oggHash = hashBuffer(oggBuf);
              if (oggHash) collectedHashes.push(oggHash);
            }
          }
        }

        // 2. Jika pesan quoted adalah media yang bisa diunduh (audio/video/stiker)
        let mediaBuf = null;
        if (typeof q.download === "function") {
          mediaBuf = await q.download().catch(() => null);
        }

        if (mediaBuf && Buffer.isBuffer(mediaBuf) && mediaBuf.length > 0) {
          const bufHash = hashBuffer(mediaBuf);
          if (bufHash) collectedHashes.push(bufHash);

          // Jika media adalah audio/video, coba convert ke OGG
          const oggBuf = await convertToOggOpusQuick(mediaBuf);
          if (oggBuf && Buffer.isBuffer(oggBuf)) {
            const oggHash = hashBuffer(oggBuf);
            if (oggHash) collectedHashes.push(oggHash);
          }
        }

        // 3. Rekam juga hash sha256 dari metadata stickerMessage jika membalas stiker
        const stickerObj = q.msg || q.message?.stickerMessage || q;
        if (stickerObj?.fileSha256) {
          collectedHashes.push(Buffer.from(stickerObj.fileSha256).toString("hex").toLowerCase());
          collectedHashes.push(Buffer.from(stickerObj.fileSha256).toString("base64").toLowerCase());
        }
        if (stickerObj?.fileEncSha256) {
          collectedHashes.push(Buffer.from(stickerObj.fileEncSha256).toString("hex").toLowerCase());
          collectedHashes.push(Buffer.from(stickerObj.fileEncSha256).toString("base64").toLowerCase());
        }

        if (!collectedHashes.length) {
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          return m.reply(res.warn("Gagal mengekstrak berkas media dari pesan yang di-reply. Pastikan membalas stiker, audio, atau video yang valid."));
        }

        const note = query || "Audio meresahkan / dilarang";
        const result = addAudioBlacklist(collectedHashes, note, m.sender);

        await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });

        const teks =
          `✅ *BERKAS BERHASIL DIBLACKLIST*\n\n` +
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
        const who = item.added_by ? `@${String(item.added_by).split("@")[0].split(":")[0]}` : "Owner";
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

    // 1. Cek audioMessage jika ada di pesan
    let check = checkMessageAudioBlacklist(m);

    // 2. Jika belum ketemu, cek hash stiker langsung jika pesan adalah stiker
    const stickerObj = m.msg || m.message?.stickerMessage;
    if (!check && stickerObj?.fileSha256) {
      const hexSha = Buffer.from(stickerObj.fileSha256).toString("hex").toLowerCase();
      check = isHashBlacklisted(hexSha);
    }

    // 3. Jika belum ketemu dan adalah stiker, unduh buffer untuk cek raw hash
    if (!check && (m.mtype === "stickerMessage" || m.message?.stickerMessage)) {
      try {
        if (typeof m.download === "function") {
          const buf = await m.download().catch(() => null);
          if (buf && Buffer.isBuffer(buf)) {
            check = isBufferBlacklisted(buf);
          }
        }
      } catch {}
    }

    if (check && check.isBlacklisted) {
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
              `> @${senderNum} Pesan stiker yang kamu kirim otomatis dihapus karena masuk dalam daftar hitam (blacklist).\n\n` +
              `*Catatan :* _Kategori: ${check.note}_`,
            mentions: [m.sender],
          });
        } catch (err) {
          console.error("[AUTO_DELETE_SAUDIO_ERR]", err.message);
        }
      }
      return true;
    }

    return false;
  },
};
