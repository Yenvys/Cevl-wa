/**
 * plugins/class/alert_pr.js
 * Fitur otomatisasi pengingat PR/Tugas terjadwal untuk grup spesifik menggunakan node-cron.
 * Waktu siaran otomatis: 08.00, 14.00, dan 20.00 WIB.
 */

import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { res } from '../../lib/response.js';


const prFile = path.join(process.cwd(), 'data', 'tugas', 'pr_list.json');
const groupAlertFile = path.join(process.cwd(), 'data', 'tugas', 'group_alerts.json');

if (!fs.existsSync(path.dirname(groupAlertFile))) fs.mkdirSync(path.dirname(groupAlertFile), { recursive: true });
if (!fs.existsSync(groupAlertFile)) fs.writeFileSync(groupAlertFile, JSON.stringify([]));

let isLoopRunning = false;

export function listenAlertSchedule(sock) {
    if (isLoopRunning) return;
    isLoopRunning = true;

    // Menjadwalkan tugas pada menit ke-0, pada jam 8, 14, dan 20 setiap hari
    cron.schedule('0 8,14,20 * * *', async () => {
        try {
            if (!fs.existsSync(prFile)) return;

            const daftarPR = JSON.parse(fs.readFileSync(prFile));
            const daftarGrupBinaan = JSON.parse(fs.readFileSync(groupAlertFile));

            if (daftarPR.length === 0 || daftarGrupBinaan.length === 0) return;

            let templateTeks = `🔔 *[PENGINGAT DAFTAR TUGAS KELAS]* 🔔\n\n`;
            templateTeks += `Diinformasikan kepada seluruh anggota grup, berikut adalah daftar PR/Tugas yang belum diselesaikan:\n\n`;
            
            daftarPR.forEach((v, i) => {
                const namaMatkul = v.matkul ? v.matkul.toUpperCase() : 'TIDAK DIKETAHUI';
                templateTeks += `*${i + 1}. [${namaMatkul}]*\n`;
                templateTeks += `   • Batas Waktu : ${v.deadline || 'Tidak Ditentukan'}\n`;
                templateTeks += `   • Detail Tugas: ${v.detail || 'Tidak Ada Detail'}\n\n`;
            });
            templateTeks += `_Harap segera menyelesaikan tugas._`;

            for (const idGrup of daftarGrupBinaan) {
                await sock.sendMessage(idGrup, { text: templateTeks });
            }

        } catch (error) {
            console.error("Gagal mendistribusikan kiriman pengingat tugas otomatis:", error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Jakarta" 
    });
}

export default {
    cmd: ['alertpr', 'alert-pr', 'infopr'],
    category: 'class',
    desc: 'Mengaktifkan atau menonaktifkan pengingat otomatis daftar PR harian di dalam grup.',
    exec: async (m, { args, sock }) => {
        listenAlertSchedule(sock);

        if (!m.isGroup) {
            return m.reply("Perintah ini hanya dapat dieksekusi di dalam lingkup grup WhatsApp.");
        }

        const subCommand = args[0]?.toLowerCase();
        if (!subCommand || !['--on', '--off'].includes(subCommand)) {
            return m.reply(res.format(m.prefix, 'alertpr', `--on\n> ${m.prefix}alertpr --off`));
        }

        const databaseGrup = JSON.parse(fs.readFileSync(groupAlertFile));

        if (subCommand === '--on') {
            if (databaseGrup.includes(m.from)) {
                return m.reply("Sistem pengingat harian otomatis sudah berada dalam status aktif di grup ini.");
            }

            databaseGrup.push(m.from);
            fs.writeFileSync(groupAlertFile, JSON.stringify(databaseGrup, null, 2));
            return m.reply("🎯 *Fitur Pengingat Aktif!* Grup ini akan menerima siaran daftar tugas otomatis setiap hari pada jam 08.00, 14.00, dan 20.00 WIB.");
        }

        if (subCommand === '--off') {
            const indeksGrup = databaseGrup.indexOf(m.from);
            if (indeksGrup === -1) {
                return m.reply("Sistem pengingat memang tidak dikonfigurasikan aktif di grup ini.");
            }

            databaseGrup.splice(indeksGrup, 1);
            fs.writeFileSync(groupAlertFile, JSON.stringify(databaseGrup, null, 2));
            return m.reply("🛑 *Fitur Pengingat Dimatikan!* Grup ini telah dihapus dari daftar siaran terjadwal otomatis.");
        }
    }
};