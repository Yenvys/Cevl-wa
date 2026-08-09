/**
 * lib/rpg/schema.js
 * Drop-in replacement for Mongoose UserRPG model using JSON
 */
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'rpg_db.json');

const readDB = () => {
    if (!fs.existsSync(dbPath)) return [];
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error reading RPG DB:', e.message);
        return [];
    }
};

const writeDB = (data) => {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing RPG DB:', e.message);
    }
};

class UserRPG {
    constructor(data) {
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
        this.inventory = data.inventory ?? {
            onigiri: 0,
            ramen: 0,
            matcha: 0,
            ocha: 0
        };
    }

    async save() {
        const db = readDB();
        const index = db.findIndex(u => u.noWa === this.noWa);
        if (index !== -1) {
            db[index] = this;
        } else {
            db.push(this);
        }
        writeDB(db);
    }

    static async findOne(query) {
        const db = readDB();
        const user = db.find(u => u.noWa === query.noWa);
        if (user) {
            return new UserRPG(user);
        }
        return null;
    }
}

export default UserRPG;