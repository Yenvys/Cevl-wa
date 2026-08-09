/**
 * plugins/owner/autoclose.js
 * Manajemen & Scheduler Otomatis Penutupan Jam Malam Grup
 */

import { updateGroupSettings, getAutoCloseGroups } from '../../lib/database.js';
import { res } from '../../lib/response.js';

export default {
    cmd: ['autoclose', 'ac'],
    category: 'owner',
    desc: 'Pengaturan grup khusus untuk fitur Auto Close / Open',
    exec: async (m, { sock, args, command, handler }) => {
        if (!m.isOwner) return m.reply(res.owner);

        const opt = args[0]?.toLowerCase();
        if (opt === 'add' && m.isGroup) {
            await updateGroupSettings(m.from, 'autoclose', 1);
            return m.reply('_Sukses memasukkan grup ini ke dalam daftar jadwal Autoclose._');
        }

        if ((opt === 'del' || opt === 'off') && m.isGroup) {
            await updateGroupSettings(m.from, 'autoclose', 0);
            return m.reply('_Sukses menghapus grup ini dari daftar jadwal Autoclose._');
        }

        if (opt === 'list') {
            const list = await getAutoCloseGroups();
            if (!list.length) return m.reply('_Tidak ada grup yang terdaftar dalam jam malam saat ini._');

            let txt = `⌗ *DAFTAR GRUP AUTO CLOSE*\n\n`;
            list.forEach((v, i) => {
                txt += `${i + 1}. ${v.name || v.jid}\n`;
            });
            return m.reply(txt.trim());
        }

        if (opt === 'start') {
            await handler.changeFeature('autoclose', true);
            return m.reply('_Sistem jam malam berhasil diaktifkan secara global._');
        }

        if (opt === 'stop') {
            await handler.changeFeature('autoclose', false);
            return m.reply('_Sistem jam malam berhasil dinonaktifkan secara global._');
        }

        if (opt === 'setclose' || opt === 'setopen') {
            const time = args[1]; // HH:MM
            const days = args[2] || '*'; // Optional days (e.g. 1-5)

            if (!/^\d{2}:\d{2}$/.test(time || '')) {
                return m.reply(`_Format salah! Gunakan: ${m.prefix}${command} ${opt} HH:MM [hari]\nContoh:\n- ${m.prefix}${command} ${opt} 22:30\n- ${m.prefix}${command} ${opt} 22:30 1-5_`);
            }

            const [hh, mm] = time.split(':');
            const cronStr = `${parseInt(mm)} ${parseInt(hh)} * * ${days}`;

            if (opt === 'setclose') {
                await handler.changeAcTime('close', cronStr);
                return m.reply(`_Jadwal TUTUP grup berhasil diubah menjadi: ${time} WIB (Hari: ${days})._`);
            } else {
                await handler.changeAcTime('open', cronStr);
                return m.reply(`_Jadwal BUKA grup berhasil diubah menjadi: ${time} WIB (Hari: ${days})._`);
            }
        }


        if (!opt) {
            let helpText = `⌗ *MANAJEMEN AUTO CLOSE GRUP*\n\n`;
            helpText += `*Status Master:* ${handler.autoclose ? '✅ AKTIF' : '❌ NONAKTIF'}\n`;
            helpText += `*Waktu Tutup (Cron):* ${handler.ac_closeCron}\n`;
            helpText += `*Waktu Buka (Cron):* ${handler.ac_openCron}\n\n`;
            helpText += `*Daftar Opsi Perintah:*\n`;
            helpText += `│ ◦ ${m.prefix}${command} add - Daftarkan grup ini ke jadwal\n`;
            helpText += `│ ◦ ${m.prefix}${command} del - Hapus grup ini dari jadwal\n`;
            helpText += `│ ◦ ${m.prefix}${command} list - Lihat seluruh daftar grup\n`;
            helpText += `│ ◦ ${m.prefix}${command} start - Aktifkan cron global\n`;
            helpText += `│ ◦ ${m.prefix}${command} stop - Matikan cron global\n`;
            helpText += `│ ◦ ${m.prefix}${command} setclose HH:MM [hari] - Ubah jam tutup\n`;
            helpText += `│ ◦ ${m.prefix}${command} setopen HH:MM [hari] - Ubah jam buka\n`;
            helpText += `╰───────────────────────────\n\n`;
            helpText += `*Catatan Hari (Opsional):*\n> 0 = Minggu, 1 = Senin, ... 6 = Sabtu. \n> Jika dikosongkan, maka setiap hari (*).`;

            return m.reply(helpText);
        }
    }
};