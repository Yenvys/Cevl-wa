import fs from 'fs';
import path from 'path';
import { res } from '../src/response.js';


const prFile = path.join(process.cwd(), 'data', 'tugas', 'pr_list.json');

if (!fs.existsSync(path.dirname(prFile))) fs.mkdirSync(path.dirname(prFile), { recursive: true });
if (!fs.existsSync(prFile)) fs.writeFileSync(prFile, JSON.stringify([]));

export default {
    cmd: ['pr', 'task', 'tugas'],
    category: 'class',
    desc: 'Manajemen daftar PR (add, list, del)',
    exec: async (m, { query, command }) => {
        const db = JSON.parse(fs.readFileSync(prFile));
        const args = query.trim().split(' ');
        const action = args[0]?.toLowerCase();

        if (!query.trim() || !action) {
            let tutorial = `『 *PANDUAN MANAJEMEN TUGAS / PR* 』\n\n`;
            tutorial += `Berikut adalah daftar instruksi resmi untuk mengelola data PR:\n\n`;
            tutorial += `> *Menambah Daftar Tugas:*\n`;
            tutorial += `\`.${command} add <Nama Matkul> | deadline <Hari/Tanggal> | isi <Detail Tugas>\`\n`;
            tutorial += `> *Menampilkan Daftar Tugas:*\n`;
            tutorial += `\`.${command} list\`\n`;
            tutorial += `> *Menghapus Tugas:*\n`;
            tutorial += `\`.${command} del <Nomor Urutan PR>\`\n\n`;
            tutorial += `───────────────────\n`;
            tutorial += `_Catatan: Gunakan karakter ( | ) sebagai pemisah antar parameter._`;

            return m.reply(tutorial);
        }

        if (action === 'add') {
            const rawContent = query.substring(args[0].length).trim();
            if (!rawContent) {
                return m.reply(res.format(m.prefix, command, `add Matematika | deadline Besok | isi Halaman 40`));
            }

            const parts = rawContent.split('|').map(p => p.trim());

            const matkul = parts[0] || 'Tidak Diketahui';
            let deadline = 'Tidak Ditentukan';
            let detail = 'Tidak Ada Detail';

            parts.slice(1).forEach(part => {
                if (part.toLowerCase().startsWith('deadline')) {
                    deadline = part.substring('deadline'.length).trim();
                } else if (part.toLowerCase().startsWith('isi')) {
                    detail = part.substring('isi'.length).trim();
                } else {
                    if (deadline === 'Tidak Ditentukan') {
                        deadline = part;
                    } else {
                        detail = part;
                    }
                }
            });

            db.push({
                id: Date.now(),
                matkul,
                deadline,
                detail
            });

            fs.writeFileSync(prFile, JSON.stringify(db, null, 2));
            return m.reply('_Sukses menambahkan tugas baru ke dalam daftar PR._');
        }

        if (action === 'list') {
            if (db.length === 0) return m.reply('_Tidak ada daftar PR yang tercatat saat ini._');

            let teks = `『 *DAFTAR PR / TUGAS AKTIF* 』\n\n`;
            db.forEach((v, i) => {
                const namaMatkul = v.matkul ? v.matkul.toUpperCase() : 'TIDAK DIKETAHUI';
                teks += `*${i + 1}. [${namaMatkul}]*\n`;
                teks += `   • Deadline : ${v.deadline}\n`;
                teks += `   • Detail   :\n ${v.detail}\n\n`;
            });
            teks += `_Ketik .${command} del <nomor> untuk menghapus tugas._`;
            return m.reply(teks);
        }

        if (action === 'del') {
            const index = parseInt(args[1]) - 1;
            if (isNaN(index) || !db[index]) return m.reply('_Nomor urutan PR yang Anda masukkan tidak valid._');

            db.splice(index, 1);
            fs.writeFileSync(prFile, JSON.stringify(db, null, 2));
            return m.reply('_Tugas PR berhasil dihapus dari daftar._');
        }

        return m.reply(`tidak dikenal. Ketik \`.${command}\`.`);
    }
};