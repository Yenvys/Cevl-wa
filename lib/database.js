import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.join(process.cwd(), 'data', 'db');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'database.db'));
db.pragma('journal_mode = WAL');
db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
        jid TEXT PRIMARY KEY, 
        lid TEXT, 
        pushname TEXT
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
`);

try { db.exec(`ALTER TABLE group_settings ADD COLUMN antilink INTEGER DEFAULT 0;`); } catch (e) {}
try { db.exec(`ALTER TABLE group_settings ADD COLUMN auto_close INTEGER DEFAULT 0;`); } catch (e) {}
try { db.exec(`ALTER TABLE contacts ADD COLUMN is_whitelist INTEGER DEFAULT 0;`); } catch (e) {}

db.exec(`CREATE INDEX IF NOT EXISTS idx_whitelist ON group_settings(is_whitelist);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_autoclose ON group_settings(auto_close);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_contact_whitelist ON contacts(is_whitelist);`);

// KONTAK & LID

export function saveContact(jid, lid, pushName) {
    if (!jid || !jid.endsWith('@s.whatsapp.net')) return;
    const existing = db.prepare('SELECT pushname, lid, is_whitelist FROM contacts WHERE jid = ?').get(jid);
    let finalName = pushName;
    if (!pushName || pushName === 'Unknown' || pushName === 'null') {
        finalName = (existing && existing.pushname !== 'null') ? existing.pushname : 'Unknown';
    }
    const currentWhitelist = existing ? existing.is_whitelist : 0;
    db.prepare('INSERT OR REPLACE INTO contacts (jid, lid, pushname, is_whitelist) VALUES (?, ?, ?, ?)').run(jid, lid || (existing?.lid || null), finalName, currentWhitelist);
    if (lid && lid.endsWith('@lid')) {
        db.prepare('INSERT OR REPLACE INTO lid_mapping (lid, jid) VALUES (?, ?)').run(lid, jid);
    }
}

export function getLidMapping(lid) {
    if (!lid) return null;
    const row = db.prepare('SELECT jid FROM lid_mapping WHERE lid = ?').get(lid);
    return row ? row.jid : null;
}

// SETTINGS GRUP

export function isBanned(jid) {
    const row = db.prepare('SELECT 1 FROM contacts WHERE jid = ? AND is_whitelist = -1').get(jid);
    return !!row;
}

// GROUP MESSAGES TRACKING

export function incrementGroupMessage(groupJid, userJid) {
    if (!groupJid || !userJid) return;
    db.prepare('INSERT INTO group_messages (group_jid, user_jid, count) VALUES (?, ?, 1) ON CONFLICT(group_jid, user_jid) DO UPDATE SET count = count + 1').run(groupJid, userJid);
}

export function getGroupMessages(groupJid) {
    return db.prepare('SELECT user_jid, count FROM group_messages WHERE group_jid = ? ORDER BY count DESC').all(groupJid);
}

// AFK TRACKING

export function setAfk(jid, reason, time) {
    if (!jid) return;
    db.prepare('INSERT OR REPLACE INTO afk (jid, reason, time) VALUES (?, ?, ?)').run(jid, reason, time);
}

export function getAfk(jid) {
    if (!jid) return null;
    return db.prepare('SELECT reason, time FROM afk WHERE jid = ?').get(jid);
}

export function deleteAfk(jid) {
    if (!jid) return;
    db.prepare('DELETE FROM afk WHERE jid = ?').run(jid);
}

export function getGroupSettings(jid) {
    let row = db.prepare('SELECT * FROM group_settings WHERE jid = ?').get(jid);
    if (!row) {
        db.prepare('INSERT INTO group_settings (jid) VALUES (?)').run(jid);
        row = db.prepare('SELECT * FROM group_settings WHERE jid = ?').get(jid);
    }
    return {
        welcome: row.welcome === 1,
        goodbye: row.goodbye === 1,
        isWhitelist: row.is_whitelist === 1,
        antilink: row.antilink === 1,
        autoClose: row.auto_close === 1,
        welcomeText: row.welcome_text,
        goodbyeText: row.goodbye_text,
        name: row.name
    };
}

export function updateGroupSettings(jid, field, value) {
    const validFields = {
        welcome: 'welcome',
        goodbye: 'goodbye',
        welcomeText: 'welcome_text',
        goodbyeText: 'goodbye_text',
        whitelist: 'is_whitelist',
        antilink: 'antilink',
        autoclose: 'auto_close'
    };
    const col = validFields[field];
    if (!col) return;
    db.prepare(`UPDATE group_settings SET ${col} = ? WHERE jid = ?`).run(value, jid);
}

// SYNC & METADATA 

export function saveMetadata(jid, name, desc, participants = []) {
    if (!jid) return;
    db.prepare('UPDATE group_settings SET name = ? WHERE jid = ?').run(name, jid);
    syncParticipants(jid, participants);
}

export function syncParticipants(jid, participants = []) {
    if (!jid || !participants.length) return;
    
    const syncTx = db.transaction((pts) => {
        for (const p of pts) {
            const userJid = p.id?.endsWith('@s.whatsapp.net') ? p.id : (p.phoneNumber ? p.phoneNumber.split('@')[0] + '@s.whatsapp.net' : null);
            const userLid = p.id?.endsWith('@lid') ? p.id : null;
            if (userJid) saveContact(userJid, userLid, null);
        }
    });

    try {
        syncTx(participants);
    } catch (error) {
        console.error('SYNC_ERROR:', error);
    }
}


export function getWhitelistedGroups() {
    return db.prepare('SELECT jid, name FROM group_settings WHERE is_whitelist = 1').all();
}

export function getAutoCloseGroups() {
    return db.prepare('SELECT jid, name FROM group_settings WHERE auto_close = 1').all();
}

// USER WHITELIST

export function isUserWhitelisted(jid) {
    if (!jid) return false;
    const row = db.prepare('SELECT is_whitelist FROM contacts WHERE jid = ?').get(jid);
    return row && row.is_whitelist === 1;
}

export function updateUserWhitelist(jid, value, pushname = 'Unknown') {
    if (!jid) return;
    const existing = db.prepare('SELECT * FROM contacts WHERE jid = ?').get(jid);
    if (!existing) {
        db.prepare('INSERT INTO contacts (jid, pushname, is_whitelist) VALUES (?, ?, ?)').run(jid, pushname, value);
    } else {
        db.prepare('UPDATE contacts SET is_whitelist = ? WHERE jid = ?').run(value, jid);
    }
}

export function getWhitelistedUsers() {
    return db.prepare('SELECT jid, pushname FROM contacts WHERE is_whitelist = 1').all();
}

export default db;