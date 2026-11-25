import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data", "db");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "database.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS contacts (
    jid TEXT PRIMARY KEY,
    lid TEXT,
    pushname TEXT,
    is_whitelist INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS lid_mapping (
    lid TEXT PRIMARY KEY,
    jid TEXT
  );
  CREATE TABLE IF NOT EXISTS group_settings (
    jid TEXT PRIMARY KEY,
    name TEXT,
    welcome INTEGER DEFAULT 1,
    goodbye INTEGER DEFAULT 1,
    is_whitelist INTEGER DEFAULT 0,
    antilink INTEGER DEFAULT 0,
    auto_close INTEGER DEFAULT 0,
    welcome_text TEXT DEFAULT 'Hai *@pushname*, Selamat datang di *@gcname!*',
    goodbye_text TEXT DEFAULT 'Selamat tinggal *@pushname*, semoga tenang disana.'
  );
  CREATE TABLE IF NOT EXISTS group_messages (
    group_jid TEXT,
    user_jid TEXT,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (group_jid, user_jid)
  );
  CREATE TABLE IF NOT EXISTS afk (
    jid TEXT PRIMARY KEY,
    reason TEXT,
    time INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_whitelist ON group_settings(is_whitelist);
  CREATE INDEX IF NOT EXISTS idx_autoclose ON group_settings(auto_close);
  CREATE INDEX IF NOT EXISTS idx_contact_whitelist ON contacts(is_whitelist);
`);

// Pre-compiled statements for high-throughput performance
const stmts = {
  getContact: db.prepare("SELECT pushname, lid, is_whitelist FROM contacts WHERE jid = ?"),
  saveContact: db.prepare("INSERT OR REPLACE INTO contacts (jid, lid, pushname, is_whitelist) VALUES (?, ?, ?, ?)"),
  saveLid: db.prepare("INSERT OR REPLACE INTO lid_mapping (lid, jid) VALUES (?, ?)"),
  getLid: db.prepare("SELECT jid FROM lid_mapping WHERE lid = ?"),
  isBanned: db.prepare("SELECT 1 FROM contacts WHERE jid = ? AND is_whitelist = -1"),
  incrMsg: db.prepare(
    "INSERT INTO group_messages (group_jid, user_jid, count) VALUES (?, ?, 1) ON CONFLICT(group_jid, user_jid) DO UPDATE SET count = count + 1"
  ),
  getMsgs: db.prepare("SELECT user_jid, count FROM group_messages WHERE group_jid = ? ORDER BY count DESC"),
  setAfk: db.prepare("INSERT OR REPLACE INTO afk (jid, reason, time) VALUES (?, ?, ?)"),
  getAfk: db.prepare("SELECT reason, time FROM afk WHERE jid = ?"),
  delAfk: db.prepare("DELETE FROM afk WHERE jid = ?"),
  initGroup: db.prepare("INSERT OR IGNORE INTO group_settings (jid) VALUES (?)"),
  getGroup: db.prepare("SELECT * FROM group_settings WHERE jid = ?"),
  updateGroupName: db.prepare("UPDATE group_settings SET name = ? WHERE jid = ?"),
  getWlGroups: db.prepare("SELECT jid, name FROM group_settings WHERE is_whitelist = 1"),
  getAcGroups: db.prepare("SELECT jid, name FROM group_settings WHERE auto_close = 1"),
  getUserWl: db.prepare("SELECT is_whitelist FROM contacts WHERE jid = ?"),
  updateUserWlOnly: db.prepare("UPDATE contacts SET is_whitelist = ? WHERE jid = ?"),
  insertUserWl: db.prepare("INSERT INTO contacts (jid, pushname, is_whitelist) VALUES (?, ?, ?)"),
  getWlUsers: db.prepare("SELECT jid, pushname FROM contacts WHERE is_whitelist = 1"),
};

const updateGroupFieldStmts = {};
const GROUP_FIELDS = {
  welcome: "welcome",
  goodbye: "goodbye",
  welcomeText: "welcome_text",
  goodbyeText: "goodbye_text",
  whitelist: "is_whitelist",
  antilink: "antilink",
  autoclose: "auto_close",
};
for (const [key, col] of Object.entries(GROUP_FIELDS)) {
  updateGroupFieldStmts[key] = db.prepare(`UPDATE group_settings SET ${col} = ? WHERE jid = ?`);
}

export function saveContact(jid, lid, pushName) {
  if (!jid?.endsWith("@s.whatsapp.net")) return;
  const existing = stmts.getContact.get(jid);
  const finalName =
    pushName && pushName !== "Unknown" && pushName !== "null"
      ? pushName
      : existing?.pushname && existing.pushname !== "null"
        ? existing.pushname
        : "Unknown";

  stmts.saveContact.run(jid, lid || existing?.lid || null, finalName, existing?.is_whitelist || 0);
  if (lid?.endsWith("@lid")) stmts.saveLid.run(lid, jid);
}

export function getLidMapping(lid) {
  return lid ? stmts.getLid.get(lid)?.jid || null : null;
}

export function isBanned(jid) {
  return !!stmts.isBanned.get(jid);
}

export function incrementGroupMessage(groupJid, userJid) {
  if (groupJid && userJid) stmts.incrMsg.run(groupJid, userJid);
}

export function getGroupMessages(groupJid) {
  return stmts.getMsgs.all(groupJid);
}

export function setAfk(jid, groupJid, reason, time) {
  if (jid && groupJid) stmts.setAfk.run(`${jid}_${groupJid}`, reason, time);
}

export function getAfk(jid, groupJid) {
  return jid && groupJid ? stmts.getAfk.get(`${jid}_${groupJid}`) || null : null;
}

export function deleteAfk(jid, groupJid) {
  if (jid && groupJid) stmts.delAfk.run(`${jid}_${groupJid}`);
}

export function getGroupSettings(jid) {
  let row = stmts.getGroup.get(jid);
  if (!row) {
    stmts.initGroup.run(jid);
    row = stmts.getGroup.get(jid) || {};
  }
  return {
    welcome: row.welcome === 1,
    goodbye: row.goodbye === 1,
    isWhitelist: row.is_whitelist === 1,
    antilink: row.antilink === 1,
    autoClose: row.auto_close === 1,
    welcomeText: row.welcome_text,
    goodbyeText: row.goodbye_text,
    name: row.name,
  };
}

export function updateGroupSettings(jid, field, value) {
  updateGroupFieldStmts[field]?.run(value, jid);
}

export function saveMetadata(jid, name, desc, participants = []) {
  if (!jid) return;
  stmts.updateGroupName.run(name, jid);
  syncParticipants(jid, participants);
}

const syncTx = db.transaction((pts) => {
  for (const p of pts) {
    const userJid = p.id?.endsWith("@s.whatsapp.net")
      ? p.id
      : p.phoneNumber
        ? `${p.phoneNumber.split("@")[0]}@s.whatsapp.net`
        : null;
    const userLid = p.id?.endsWith("@lid") ? p.id : null;
    if (userJid) saveContact(userJid, userLid, null);
  }
});

export function syncParticipants(jid, participants = []) {
  if (jid && participants.length) {
    try {
      syncTx(participants);
    } catch (e) {
      console.error("SYNC_ERROR:", e.message);
    }
  }
}

export function getWhitelistedGroups() {
  return stmts.getWlGroups.all();
}

export function getAutoCloseGroups() {
  return stmts.getAcGroups.all();
}

export function isUserWhitelisted(jid) {
  return jid ? stmts.getUserWl.get(jid)?.is_whitelist === 1 : false;
}

export function updateUserWhitelist(jid, value, pushname = "Unknown") {
  if (!jid) return;
  const existing = stmts.getContact.get(jid);
  if (!existing) stmts.insertUserWl.run(jid, pushname, value);
  else stmts.updateUserWlOnly.run(value, jid);
}

export function getWhitelistedUsers() {
  return stmts.getWlUsers.all();
}

export function backupDatabase() {
  const backupDir = path.join(dataDir, "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(backupDir, `database_${timestamp}.db`);

  try {
    db.exec(`VACUUM INTO '${backupPath.replace(/\\/g, "/")}'`);
    const backups = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("database_") && f.endsWith(".db"))
      .sort()
      .reverse();

    for (let i = 7; i < backups.length; i++) {
      try {
        fs.unlinkSync(path.join(backupDir, backups[i]));
      } catch {}
    }
    return backupPath;
  } catch (e) {
    console.error("[DB_BACKUP_ERR]", e.message);
    return null;
  }
}

export default db;
