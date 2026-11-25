import db from "../database.js";
import fs from "node:fs";
import path from "node:path";

// Inisialisasi tabel rpg_users di SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS rpg_users (
    noWa TEXT PRIMARY KEY,
    yen INTEGER DEFAULT 10000,
    bank INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    stamina INTEGER DEFAULT 100,
    pekerjaan TEXT DEFAULT 'Pengangguran',
    statusBermain TEXT DEFAULT 'bebas',
    lastKerja INTEGER DEFAULT 0,
    lastDaily INTEGER DEFAULT 0,
    lastTidur INTEGER DEFAULT 0,
    lastNgulik INTEGER DEFAULT 0,
    lastRegen INTEGER DEFAULT 0,
    inventory TEXT DEFAULT '{"onigiri":0,"ramen":0,"matcha":0,"ocha":0}'
  );
  CREATE INDEX IF NOT EXISTS idx_rpg_nowa ON rpg_users(noWa);
`);

const stmts = {
  getUser: db.prepare("SELECT * FROM rpg_users WHERE noWa = ?"),
  saveUser: db.prepare(`
    INSERT OR REPLACE INTO rpg_users (
      noWa, yen, bank, level, exp, stamina, pekerjaan, statusBermain,
      lastKerja, lastDaily, lastTidur, lastNgulik, lastRegen, inventory
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  deleteMany: db.prepare("DELETE FROM rpg_users"),
};

// Migrasi otomatis data lama dari rpg_db.json jika ada
try {
  const oldDbPath = path.join(process.cwd(), "data", "rpg_db.json");
  if (fs.existsSync(oldDbPath)) {
    const raw = fs.readFileSync(oldDbPath, "utf-8");
    const list = JSON.parse(raw);
    if (Array.isArray(list) && list.length > 0) {
      const migrateTx = db.transaction((users) => {
        for (const u of users) {
          if (!u.noWa) continue;
          stmts.saveUser.run(
            u.noWa,
            u.yen ?? 10000,
            u.bank ?? 0,
            u.level ?? 1,
            u.exp ?? 0,
            u.stamina ?? 100,
            u.pekerjaan ?? "Pengangguran",
            u.statusBermain ?? "bebas",
            u.lastKerja ?? 0,
            u.lastDaily ?? 0,
            u.lastTidur ?? 0,
            u.lastNgulik ?? 0,
            u.lastRegen ?? Date.now(),
            typeof u.inventory === "object" ? JSON.stringify(u.inventory) : u.inventory || "{}"
          );
        }
      });
      migrateTx(list);
      console.log(`[RPG_MIGRATION] Berhasil migrasi ${list.length} pengguna RPG ke SQLite.`);
      fs.renameSync(oldDbPath, `${oldDbPath}.bak`);
    }
  }
} catch (e) {
  console.error("[RPG_MIGRATION_ERR]", e.message);
}

class UserRPG {
  constructor(data = {}) {
    this.noWa = data.noWa;
    this.yen = data.yen ?? 10000;
    this.bank = data.bank ?? 0;
    this.level = data.level ?? 1;
    this.exp = data.exp ?? 0;
    this.stamina = data.stamina ?? 100;
    this.pekerjaan = data.pekerjaan ?? "Pengangguran";
    this.statusBermain = data.statusBermain ?? "bebas";
    this.lastKerja = data.lastKerja ?? 0;
    this.lastDaily = data.lastDaily ?? 0;
    this.lastTidur = data.lastTidur ?? 0;
    this.lastNgulik = data.lastNgulik ?? 0;
    this.lastRegen = data.lastRegen ?? Date.now();

    if (typeof data.inventory === "string") {
      try {
        this.inventory = JSON.parse(data.inventory);
      } catch {
        this.inventory = { onigiri: 0, ramen: 0, matcha: 0, ocha: 0 };
      }
    } else {
      this.inventory = data.inventory ?? { onigiri: 0, ramen: 0, matcha: 0, ocha: 0 };
    }
  }

  async save() {
    if (!this.noWa) return;
    stmts.saveUser.run(
      this.noWa,
      this.yen,
      this.bank,
      this.level,
      this.exp,
      this.stamina,
      this.pekerjaan,
      this.statusBermain,
      this.lastKerja,
      this.lastDaily,
      this.lastTidur,
      this.lastNgulik,
      this.lastRegen,
      JSON.stringify(this.inventory || {})
    );
  }

  static async findOne(query) {
    if (!query?.noWa) return null;
    const row = stmts.getUser.get(query.noWa);
    return row ? new UserRPG(row) : null;
  }

  static async deleteMany() {
    stmts.deleteMany.run();
  }
}

export default UserRPG;
