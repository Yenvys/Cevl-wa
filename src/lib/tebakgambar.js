import crypto from 'node:crypto';
import zlib from 'node:zlib';

const API_BASE = 'https://api.tebakgambar.com';
const APIS_BASE = 'https://apis.tebakgambar.com';
const AES_KEY = 'c670c13c2af975f1f72e19692cd70998';
const AES_IV = 'fedcba3450126789';
const PKG_ID = 'com.tebakgambar';
const APP_VERSION = '2.0.3';

const HEADERS = {
  'User-Agent': 'Dart/3.5 (dart:io)',
  'Accept': 'application/json',
  'x-os': 'android',
  'x-app': 'tebakgambar-v2.0.3'
};

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

let cachedCatalog = null;
let cachedCatalogDate = '';

function md5Hex(input) {
  return crypto.createHash('md5').update(input).digest('hex');
}

function zipCryptoDecrypt(encryptedBuf, password) {
  const pw = Buffer.from(password, 'utf8');
  let k0 = 0x12345678;
  let k1 = 0x23456789;
  let k2 = 0x34567890;
  const upd = (b) => {
    k0 = ((k0 >>> 8) ^ CRC32_TABLE[(k0 ^ b) & 0xff]) >>> 0;
    k1 = (Math.imul((k1 + (k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    k2 = ((k2 >>> 8) ^ CRC32_TABLE[(k2 ^ ((k1 >>> 24) & 0xff)) & 0xff]) >>> 0;
  };
  for (let i = 0; i < pw.length; i++) upd(pw[i]);

  const out = Buffer.allocUnsafe(Math.max(0, encryptedBuf.length - 12));
  for (let i = 0; i < encryptedBuf.length; i++) {
    const temp = (k2 | 2) >>> 0;
    const plain = encryptedBuf[i] ^ ((Math.imul(temp, temp ^ 1) >>> 8) & 0xff);
    upd(plain);
    if (i >= 12) out[i - 12] = plain;
  }
  return out;
}

function parseAesExtra(extraBuf) {
  for (let off = 0; off + 4 <= extraBuf.length;) {
    const id = extraBuf.readUInt16LE(off);
    const size = extraBuf.readUInt16LE(off + 2);
    if (id === 0x9901 && size >= 7 && off + 4 + size <= extraBuf.length) {
      return { strength: extraBuf[off + 8], actualMethod: extraBuf.readUInt16LE(off + 9) };
    }
    off += 4 + size;
  }
  return null;
}

function winzipAesDecrypt(encryptedBuf, password, strength) {
  const keyLen = strength === 1 ? 16 : strength === 2 ? 24 : 32;
  const saltLen = keyLen / 2;
  const salt = encryptedBuf.subarray(0, saltLen);
  const pwVerify = encryptedBuf.subarray(saltLen, saltLen + 2);
  const ciphertext = encryptedBuf.subarray(saltLen + 2, encryptedBuf.length - 10);
  const authTag = encryptedBuf.subarray(encryptedBuf.length - 10);

  const derived = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, 1000, keyLen * 2 + 2, 'sha1');
  if (!derived.subarray(keyLen * 2, keyLen * 2 + 2).equals(pwVerify)) {
    throw new Error('WinZip AES password mismatch');
  }
  const hmac = crypto.createHmac('sha1', derived.subarray(keyLen, keyLen * 2)).update(ciphertext).digest().subarray(0, 10);
  if (!hmac.equals(authTag)) {
    throw new Error('WinZip AES auth tag mismatch');
  }

  const out = Buffer.allocUnsafe(ciphertext.length);
  const counter = Buffer.alloc(16, 0);
  const ecb = crypto.createCipheriv(`aes-${keyLen * 8}-ecb`, derived.subarray(0, keyLen), null);
  ecb.setAutoPadding(false);

  for (let off = 0; off < ciphertext.length; off += 16) {
    for (let j = 0; j < 16; j++) {
      counter[j] = (counter[j] + 1) & 0xff;
      if (counter[j] !== 0) break;
    }
    const ks = ecb.update(counter);
    const n = Math.min(16, ciphertext.length - off);
    for (let j = 0; j < n; j++) out[off + j] = ciphertext[off + j] ^ ks[j];
  }
  return out;
}

function parseZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Invalid ZIP buffer');

  const count = buf.readUInt16LE(eocd + 10);
  let cd = buf.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const flagBits = buf.readUInt16LE(cd + 8);
    const method = buf.readUInt16LE(cd + 10);
    const compressedSize = buf.readUInt32LE(cd + 20);
    const nameLen = buf.readUInt16LE(cd + 28);
    const extraLen = buf.readUInt16LE(cd + 30);
    const commentLen = buf.readUInt16LE(cd + 32);
    const localHeaderOffset = buf.readUInt32LE(cd + 42);
    const filename = buf.subarray(cd + 46, cd + 46 + nameLen).toString('utf8');
    const aesInfo = parseAesExtra(buf.subarray(cd + 46 + nameLen, cd + 46 + nameLen + extraLen));
    entries.push({ filename, flagBits, method, compressedSize, localHeaderOffset, aesInfo });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractZipEntry(buf, entry, password = null) {
  const lfh = entry.localHeaderOffset;
  if (buf.readUInt32LE(lfh) !== 0x04034b50) throw new Error('Invalid ZIP local header');
  const nameLen = buf.readUInt16LE(lfh + 26);
  const extraLen = buf.readUInt16LE(lfh + 28);
  const start = lfh + 30 + nameLen + extraLen;
  let payload = buf.subarray(start, start + entry.compressedSize);
  let method = entry.method;

  if (method === 99) {
    const aes = entry.aesInfo || parseAesExtra(buf.subarray(lfh + 30 + nameLen, start));
    method = aes?.actualMethod ?? 8;
    payload = winzipAesDecrypt(payload, password, aes?.strength || 3);
  } else if (entry.flagBits & 1) {
    payload = zipCryptoDecrypt(payload, password);
  }

  if (method === 0) return payload;
  if (method === 8) return zlib.inflateRawSync(payload);
  throw new Error(`Unsupported ZIP method: ${method}`);
}

function decryptEntryName(hexName) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(AES_KEY, 'utf8'), Buffer.from(AES_IV, 'utf8'));
  decipher.setAutoPadding(false);
  const raw = Buffer.concat([decipher.update(Buffer.from(hexName.trim(), 'hex')), decipher.final()])
    .toString('utf8')
    .replace(/\0+$/, '');
  const parts = raw.replace(/\.(png|jpg|jpeg)$/i, '').split('#');
  if (parts.length < 4) throw new Error(`Invalid entry format: ${raw}`);
  const id = parseInt(parts[0], 10);
  const type = parts[1];
  return {
    id,
    number: (id % 20) + 1,
    level: parseInt(parts[2], 10),
    type,
    isBoss: type === 'raja',
    answer: parts.slice(3).join('#').trim()
  };
}

export async function getRegularLevelsCatalog(options = {}) {
  const dateKey = (options.date instanceof Date ? options.date.toISOString() : String(options.date || new Date().toISOString())).slice(0, 10);
  if (!options.forceRefresh && cachedCatalog && cachedCatalogDate === dateKey) return cachedCatalog;

  const token = Buffer.from(`${PKG_ID}&${APP_VERSION}&${dateKey}`, 'utf8').toString('base64').replace(/=/g, '').replace(/\n/g, '');
  const res = await fetch(`${APIS_BASE}/v4/SoalReguler/get/${token}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Catalog HTTP ${res.status}`);
  const payload = await res.json();
  if (String(payload?.code) !== '200' || !Array.isArray(payload?.data)) {
    throw new Error(`Unexpected response: ${payload?.message || payload?.code}`);
  }

  const levels = payload.data.map((item) => ({
    level: parseInt(item.SoalRegulerID, 10),
    title: item.Title || `Level ${item.SoalRegulerID}`,
    quotes: item.Quotes || '',
    version: parseInt(item.Version || '1', 10),
    zipLevelUrl: item.ZipLevelURL || '',
    iconUrl: item.IconURL || '',
    soalRecehIds: item.SoalRecehIDs || null
  }));

  cachedCatalog = { totalLevels: levels.length, levels };
  cachedCatalogDate = dateKey;
  return cachedCatalog;
}

export async function getRegularLevel(levelNumber, options = {}) {
  const levelNum = parseInt(levelNumber, 10);
  if (isNaN(levelNum) || levelNum <= 0) throw new Error(`Invalid levelNumber: ${levelNumber}`);

  const includeImages = Boolean(options.includeImages);
  const catalog = await getRegularLevelsCatalog(options);
  const meta = catalog.levels.find((l) => l.level === levelNum);
  const zipUrl = options.zipUrl || meta?.zipLevelUrl || `https://static.tebakgambar.com/TG-App/Reguler/question/android/android-level-${levelNum}.zip`;

  const res = await fetch(zipUrl, { headers: HEADERS });
  if (!res.ok) throw new Error(`Level ${levelNum} ZIP HTTP ${res.status}`);

  const outerBuf = Buffer.from(await res.arrayBuffer());
  const questions = [];

  for (const outerEntry of parseZipEntries(outerBuf).filter((e) => e.filename.endsWith('.zip'))) {
    const innerBuf = extractZipEntry(outerBuf, outerEntry);
    const innerEntry = parseZipEntries(innerBuf)[0];
    if (!innerEntry) continue;

    const q = decryptEntryName(innerEntry.filename);
    if (includeImages) {
      q.imageBuffer = extractZipEntry(innerBuf, innerEntry, md5Hex(`${q.id}${AES_KEY}`));
    }
    questions.push(q);
  }

  questions.sort((a, b) => a.id - b.id);
  return {
    level: levelNum,
    title: meta?.title || `Level ${levelNum}`,
    quotes: meta?.quotes || '',
    totalQuestions: questions.length,
    bossQuestion: questions.find((q) => q.isBoss) || null,
    questions
  };
}

export async function getRegularLevels(options = {}) {
  if (options.level) return (await getRegularLevel(options.level, options)).questions;

  const levelNumbers = Array.isArray(options.levels)
    ? options.levels.map((l) => parseInt(l, 10)).filter((l) => l > 0)
    : Array.from(
        { length: Math.max(0, (options.maxLevel || 10) - (options.minLevel || 1) + 1) },
        (_, i) => (options.minLevel || 1) + i
      );

  const concurrency = Math.max(1, Math.min(10, parseInt(options.concurrency || 5, 10)));
  const all = [];
  for (let i = 0; i < levelNumbers.length; i += concurrency) {
    const chunk = await Promise.all(levelNumbers.slice(i, i + concurrency).map((l) => getRegularLevel(l, options)));
    for (const r of chunk) all.push(...r.questions);
  }
  return all.sort((a, b) => a.id - b.id);
}

export async function getEvents() {
  const res = await fetch(`${API_BASE}/v1/game/event`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Events HTTP ${res.status}`);
  const payload = await res.json();
  return (payload?.data?.event || []).map((ev) => ({
    id: ev.id,
    title: ev.title_event,
    subtitle: ev.sub_title_event,
    startDate: ev.date_event_start,
    endDate: ev.date_event_end,
    mascotImageUrl: ev.mascot_image_url || null
  }));
}

export async function getEventQuestions(eventId, options = {}) {
  const numericId = parseInt(eventId, 10);
  if (isNaN(numericId) || numericId <= 0) throw new Error(`Invalid eventId: ${eventId}`);

  const maxQuestions = options.maxQuestions || 200;
  const collected = [];
  const seen = new Set();
  const orderedIds = [];
  const base = `${API_BASE}/v1/game/event/${numericId}/questions`;

  while (collected.length < maxQuestions) {
    const res = await fetch(orderedIds.length ? `${base}/${orderedIds.join(',')}` : base, { headers: HEADERS });
    if (!res.ok) throw new Error(`Event ${numericId} HTTP ${res.status}`);
    const q = (await res.json())?.data?.[0];
    if (!q || typeof q.id !== 'number' || seen.has(q.id)) break;

    seen.add(q.id);
    orderedIds.push(q.id);
    const numMatch = decodeURIComponent(q.soal_image_url || '').split('/').pop()?.match(/^(\d+)\./);
    collected.push({
      id: q.id,
      number: numMatch ? parseInt(numMatch[1], 10) : null,
      answer: (q.jawaban || '').trim(),
      imageUrl: q.soal_image_url || '',
      type: q.type || 'REGULAR',
      points: q.default_point ?? 100
    });
  }

  return collected.sort((a, b) => (a.number !== null && b.number !== null ? a.number - b.number : a.id - b.id));
}

export async function getAllEventsWithQuestions(options = {}) {
  const events = await getEvents();
  const entries = await Promise.all(events.map(async (ev) => [ev.id, await getEventQuestions(ev.id, options).catch(() => [])]));
  const questionsByEvent = Object.fromEntries(entries);
  const totalQuestions = entries.reduce((sum, [, qs]) => sum + qs.length, 0);
  return { events, questionsByEvent, totalQuestions };
}

export default {
  getRegularLevelsCatalog,
  getRegularLevel,
  getRegularLevels,
  getEvents,
  getEventQuestions,
  getAllEventsWithQuestions
};
