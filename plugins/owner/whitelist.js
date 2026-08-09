/**
 * plugins/owner/whitelistManager.js
 * Manajemen hak izin whitelisting grup agar dapat menggunakan bot (Universal Chat Style)
 */

import { getWhitelistedGroups, updateGroupSettings } from '../../lib/database.js';
import { res } from '../../lib/response.js';


export default {
    cmd: ['whitelist', 'wl'],
    category: 'owner',
    desc: 'Atur whitelist grup (Support Index)',
    exec: async (m, { sock }) => {
        // Validasi hak akses khusus owner
        if (!m.isOwner) return m.reply(res.owner);

        const action = m.args[0]?.toLowerCase();
        const input = m.args[1];

        global.whitelistCache = global.whitelistCache || [];

        switch (action) {
            // ==========================================
            // SUB-PERINTAH: TAMBAH WHITELIST (add)
            // ==========================================
            case 'add': {
                const jidAdd = input || m.from;
                if (!jidAdd.endsWith('@g.us')) return m.reply('_Format salah! Input JID harus (@g.us)._');
                
                const meta = await sock.groupMetadata(jidAdd).catch(() => ({ subject: 'Grup Tidak Dikenal' }));
                await updateGroupSettings(jidAdd, 'whitelist', 1, meta.subject);
                
                return m.reply(`*BERHASIL MENAMBAHKAN WHITELIST*\n\n> *Grup:* ${meta.subject}\n> *JID:* ${jidAdd}`);
            }

            // ==========================================
            // SUB-PERINTAH: HAPUS WHITELIST (remove/del)
            // ==========================================
            case 'remove':
            case 'del': {
                if (!input) return m.reply('_Format salah! masukkan nomor indeks urutan atau JID grup yang ingin dihapus._');
                let targetJid;
                if (!isNaN(input) && global.whitelistCache[parseInt(input) - 1]) {
                    targetJid = global.whitelistCache[parseInt(input) - 1].jid;
                } else {
                    targetJid = input;
                }

                await updateGroupSettings(targetJid, 'whitelist', 0);
                return m.reply(`_Sukses menghapus grup dengan JID: \`${targetJid}\` dari Whitelist._`);
            }

            // ==========================================
            // SUB-PERINTAH: LIHAT DAFTAR WHITELIST (list)
            // ==========================================
            case 'list': {
                const list = await getWhitelistedGroups();
                if (list.length === 0) return m.reply('_Tidak ada grup yang terdaftar dalam izin Whitelist saat ini._');
                
                global.whitelistCache = list; 
                let txt = '⌗ *DAFTAR GRUP WHITELIST*\n\n';
                list.forEach((v, i) => {
                    txt += `${i + 1}. *${v.name || 'Grup Tidak Diketahui'}*\n     └ ${v.jid}\n\n`;
                });
                return m.reply(txt.trim());
            }

            default: {
                let helpText = `⌗ *MANAJEMEN WHITELIST GRUP*\n\n`;
                helpText += `*Daftar Opsi Perintah:*\n`;
                helpText += `│ ◦ ${m.prefix}wl add <jid_grup> - Daftarkan grup ke list izin\n`;
                helpText += `│ ◦ ${m.prefix}wl del <index/jid_grup> - Hapus grup dari list izin\n`;
                helpText += `│ ◦ ${m.prefix}wl list - Tampilkan seluruh grup yang diizinkan\n`;
                helpText += `╰───────────────────────────`;
                return m.reply(helpText);
            }
        }
    }
};