/**
 * src/lib/audioBlacklist.js
 * Manajemen Blacklist Audio untuk Audio Sticker & Auto-Delete Grup
 */

import crypto from "node:crypto";
import db from "../database.js";

// Inisialisasi Tabel Blacklist di SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS audio_blacklist_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note TEXT DEFAULT 'Audio meresahkan',
    added_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audio_blacklist_hashes (
    hash TEXT PRIMARY KEY,
    entry_id INTEGER,
    FOREIGN KEY (entry_id) REFERENCES audio_blacklist_entries(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_audio_bl_entry ON audio_blacklist_hashes(entry_id);
`);

// Cache in-memory untuk lookup O(1) super cepat tanpa I/O disk
const memoryHashes = new Map(); // hash -> entryId

function reloadMemoryCache() {
  memoryHashes.clear();
  try {
    const rows = db.prepare("SELECT hash, entry_id FROM audio_blacklist_hashes").all();
    for (const r of rows) {
      if (r?.hash) {
        memoryHashes.set(String(r.hash).toLowerCase(), r.entry_id);
      }
    }
  } catch (err) {
    console.error("[AUDIO_BLACKLIST_INIT_ERR]", err.message);
  }
}

// Inisialisasi awal cache
reloadMemoryCache();

/**
 * Menghitung hash SHA-256 dari Buffer
 */
export function hashBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return null;
  return crypto.createHash("sha256").update(buffer).digest("hex").toLowerCase();
}

/**
 * Menambahkan kumpulan hash ke blacklist dengan satu note & added_by
 * @param {string[]} hashes - Daftar hash (hex/base64)
 * @param {string} note - Alasan/keterangan
 * @param {string} addedBy - JID yang menambahkan
 */
export function addAudioBlacklist(hashes = [], note = "Audio meresahkan", addedBy = "") {
  const cleanHashes = [...new Set(hashes.map((h) => String(h || "").trim().toLowerCase()).filter((h) => h.length >= 8))];
  if (!cleanHashes.length) {
    throw new Error("Tidak ada hash audio valid yang dapat didaftarkan.");
  }

  const insertEntry = db.prepare("INSERT INTO audio_blacklist_entries (note, added_by) VALUES (?, ?)");
  const insertHash = db.prepare("INSERT OR REPLACE INTO audio_blacklist_hashes (hash, entry_id) VALUES (?, ?)");

  const tx = db.transaction(() => {
    const info = insertEntry.run(note || "Audio meresahkan", addedBy || "");
    const entryId = info.lastInsertRowid;

    for (const h of cleanHashes) {
      insertHash.run(h, entryId);
      memoryHashes.set(h, entryId);
    }

    return { entryId, hashCount: cleanHashes.length };
  });

  return tx();
}

/**
 * Menghapus audio blacklist berdasarkan ID
 */
export function removeAudioBlacklist(id) {
  const entryId = parseInt(id, 10);
  if (!entryId || isNaN(entryId)) return false;

  const getHashes = db.prepare("SELECT hash FROM audio_blacklist_hashes WHERE entry_id = ?");
  const hashes = getHashes.all(entryId);

  const del = db.prepare("DELETE FROM audio_blacklist_entries WHERE id = ?");
  const res = del.run(entryId);

  if (res.changes > 0) {
    // Bersihkan dari SQLite hashes jika ON DELETE CASCADE tidak aktif
    db.prepare("DELETE FROM audio_blacklist_hashes WHERE entry_id = ?").run(entryId);
    for (const h of hashes) {
      memoryHashes.delete(h.hash);
    }
    return true;
  }
  return false;
}

/**
 * Mendapatkan daftar audio yang diblacklist
 */
export function listAudioBlacklist() {
  const rows = db.prepare(`
    SELECT e.id, e.note, e.added_by, e.created_at, COUNT(h.hash) as hash_count
    FROM audio_blacklist_entries e
    LEFT JOIN audio_blacklist_hashes h ON e.id = h.entry_id
    GROUP BY e.id
    ORDER BY e.id DESC
  `).all();
  return rows || [];
}

/**
 * Cek apakah sebuah hash terdaftar di blacklist
 */
export function isHashBlacklisted(hash) {
  if (!hash) return false;
  const clean = String(hash).trim().toLowerCase();
  if (memoryHashes.has(clean)) {
    const entryId = memoryHashes.get(clean);
    const entry = db.prepare("SELECT id, note, added_by FROM audio_blacklist_entries WHERE id = ?").get(entryId);
    return { isBlacklisted: true, entryId, note: entry?.note || "Audio meresahkan" };
  }
  return false;
}

/**
 * Cek apakah buffer audio terdaftar di blacklist
 */
export function isBufferBlacklisted(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return false;
  const h = hashBuffer(buffer);
  return isHashBlacklisted(h);
}

/**
 * Deteksi audioMessage di dalam pesan WhatsApp (baik di stiker bersuara maupun audio biasa)
 */
export function extractAudioMessage(m) {
  if (!m) return null;
  const msg = m.message || m.msg || m;

  // Stiker bersuara (audioStickerMessage / stickerMessage.audioMessage)
  if (msg?.audioStickerMessage?.message?.stickerMessage?.audioMessage) {
    return msg.audioStickerMessage.message.stickerMessage.audioMessage;
  }
  if (msg?.stickerMessage?.audioMessage) {
    return msg.stickerMessage.audioMessage;
  }
  if (m.stickerMessage?.audioMessage) {
    return m.stickerMessage.audioMessage;
  }

  // Audio biasa / Voice Note
  if (msg?.audioMessage) {
    return msg.audioMessage;
  }
  if (m.audioMessage) {
    return m.audioMessage;
  }

  return null;
}

/**
 * Ekstrak semua kemungkinan hash dari audioMessage objek Baileys
 */
export function getHashesFromAudioMessage(audioMsg) {
  const hashes = [];
  if (!audioMsg) return hashes;

  if (audioMsg.fileSha256) {
    const b = Buffer.from(audioMsg.fileSha256);
    hashes.push(b.toString("hex").toLowerCase());
    hashes.push(b.toString("base64").toLowerCase());
  }
  if (audioMsg.fileEncSha256) {
    const b = Buffer.from(audioMsg.fileEncSha256);
    hashes.push(b.toString("hex").toLowerCase());
    hashes.push(b.toString("base64").toLowerCase());
  }

  return [...new Set(hashes)];
}

/**
 * Cek pesan stiker/audio secara cepat apakah terblacklist
 */
export function checkMessageAudioBlacklist(m) {
  const audioMsg = extractAudioMessage(m);
  if (!audioMsg) return false;

  const candidateHashes = getHashesFromAudioMessage(audioMsg);
  for (const h of candidateHashes) {
    const check = isHashBlacklisted(h);
    if (check) return check;
  }

  return false;
}
