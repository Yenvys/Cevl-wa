/**
 * plugins/system/clean.js
 * Fitur Pemeliharaan Sistem Kompak (Session & AI History Cleanup)
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { res } from '../../lib/response.js';
import UserRPG from '../../lib/rpg/schema.js';


const HISTORY_DIR = "./data/history";

export default {
    cmd: ['clear', 'cleanup', 'c', 'resetdb', 'wipedata'],
    category: 'system',
    desc: 'Pusat pemeliharaan sistem untuk membersihkan sampah sesi, riwayat obrolan AI, atau database.',
    exec: async (m, { sock, args, command }) => {
        // 1. Validasi hak akses khusus owner menggunakan m.reply biasa
        if (!m.isOwner) return m.reply(res.owner);

        const cmdName = command?.toLowerCase();

        // ==========================================
        // OPSI: RESET DB (Wipe Data)
        // ==========================================
        if (cmdName === 'resetdb' || cmdName === 'wipedata') {
            if (!args[0] || args[0] !== 'confirm') {
                return m.reply(`*PERINGATAN KERAS!*\n> _Perintah ini akan menghapus *SELURUH* data user yang tersimpan di database Anda secara permanen._ \n_Jika Anda yakin untuk melanjutkan tindakan ini, silakan ketik: *${m.prefix}${cmdName} confirm*_`);
            }

            try {
                await UserRPG.deleteMany({});
                if (sock.interview) sock.interview = {};

                return m.reply("_Proses wipe data selesai. Seluruh database pengguna berhasil dikosongkan._");
            } catch (err) {
                console.error('[RESET_DB_ERR]', err);
                return m.reply(res.error);
            }
        }

        const opt = args[0]?.toLowerCase();

        // ==========================================
        // OPSI 1: BERSIHKAN SAMPAH SESI (c --session)
        // ==========================================
        if (opt === '--session' || opt === '-s') {
            const currentSessionId = sock.user?.id ? sock.user.id.split(':')[0] : 'default';
            const sessionDir = path.join(process.cwd(), 'data', `session_${currentSessionId}`);

            if (!fs.existsSync(sessionDir)) {
                return m.reply(res.error);
            }

            const files = fs.readdirSync(sessionDir);
            let deletedCount = 0;

            files.forEach(file => {
                if (file !== 'creds.json' && (
                    file.startsWith('pre-key-') ||
                    file.startsWith('sender-key-') ||
                    file.startsWith('session-') ||
                    file.startsWith('app-state-sync-')
                )) {
                    try {
                        fs.unlinkSync(path.join(sessionDir, file));
                        deletedCount++;
                    } catch (e) { }
                }
            });

            return m.reply(`_Sistem pembersihan sesi selesai._\n_Berhasil menghapus ${deletedCount} berkas berkategori sampah sesi._`);
        }

        // ==========================================
        // OPSI 2: BERSIHKAN RIWAYAT AI (c --history)
        // ==========================================
        if (opt === '--history' || opt === '-h') {
            try {
                const id = m.isGroup ? m.from : m.sender;
                const file = path.join(HISTORY_DIR, `${id}.json`);

                await fsPromises.unlink(file).catch(() => { });

                return m.reply("_Seluruh riwayat percakapan AI pada ruang obrolan ini Sukses bersihkan._");
            } catch (e) {
                console.error('[CLEAR_HISTORY_ERR]', e);
                return m.reply(res.error);
            }
        }

        // ==========================================
        // MENU BANTUAN JIKA PARAMETER SALAH / KOSONG
        // ==========================================
        let helpText = `⌗ *MANAJEMEN PEMELIHARAAN BOT*\n\n`;
        helpText += `*Daftar Opsi Perintah:*\n`;
        helpText += `│ ◦ ${m.prefix}c --session : Bersihkan berkas sampah pre-key sesi\n`;
        helpText += `│ ◦ ${m.prefix}c --history : Hapus riwayat obrolan AI di chat ini\n`;
        helpText += `│ ◦ ${m.prefix}resetdb : Wipe database pengguna secara keseluruhan\n`;
        helpText += `╰───────────────────────────\n\n`;
        helpText += `_Alternatif: Anda juga bisa menggunakan shortcut singkat seperti -s atau -h._`;

        return m.reply(helpText);
    }
};