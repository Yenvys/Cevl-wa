import { getWhitelistedUsers, updateUserWhitelist } from '../../src/database.js';
import { res } from '../../src/response.js';

export default {
    cmd: ['userwhitelist', 'uwl'],
    category: 'owner',
    desc: 'Atur whitelist pengguna (User Whitelist)',
    exec: async (m, { sock, command }) => {
        if (!m.isOwner) return m.reply(res.owner);

        const action = m.args[0]?.toLowerCase();
        const input = m.args[1];

        global.userWhitelistCache = global.userWhitelistCache || [];

        switch (action) {
            case 'add': {
                let targetUser = '';
                if (m.quoted) {
                    targetUser = m.quoted.sender;
                } else if (m.mentions && m.mentions.length > 0) {
                    targetUser = m.mentions[0];
                } else if (input) {
                    targetUser = input.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                }

                if (!targetUser) {
                    return m.reply(res.format(m.prefix, command, `add @tag/628xxx`));
                }
                
                await updateUserWhitelist(targetUser, 1);
                return m.reply(`✅ *BERHASIL MENAMBAHKAN USER KE WHITELIST*\n\n> *JID:* ${targetUser}`);
            }

            case 'remove':
            case 'del': {
                if (!input) return m.reply(res.format(m.prefix, command, `del <nomor_urut/jid>`));
                let targetJid;
                if (!isNaN(input) && global.userWhitelistCache[parseInt(input) - 1]) {
                    targetJid = global.userWhitelistCache[parseInt(input) - 1].jid;
                } else {
                    targetJid = input.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                }

                await updateUserWhitelist(targetJid, 0);
                return m.reply(`_Sukses menghapus user dengan JID: \`${targetJid}\` dari Whitelist._`);
            }

            case 'list': {
                const list = await getWhitelistedUsers();
                if (list.length === 0) return m.reply('_Tidak ada user yang terdaftar dalam izin Whitelist saat ini._');
                
                global.userWhitelistCache = list; 
                let txt = '⌗ *DAFTAR USER WHITELIST*\n\n';
                list.forEach((v, i) => {
                    txt += `${i + 1}. *${v.pushname || 'User Tidak Diketahui'}*\n     └ ${v.jid}\n\n`;
                });
                return m.reply(txt.trim());
            }

            default: {
                let helpText = `⌗ *MANAJEMEN USER WHITELIST*\n\n`;
                helpText += `*Daftar Opsi Perintah:*\n`;
                helpText += `│ ◦ ${m.prefix}uwl add <tag/nomor> - Daftarkan user ke list izin\n`;
                helpText += `│ ◦ ${m.prefix}uwl del <index/nomor> - Hapus user dari list izin\n`;
                helpText += `│ ◦ ${m.prefix}uwl list - Tampilkan seluruh user yang diizinkan\n`;
                helpText += `╰───────────────────────────`;
                return m.reply(helpText);
            }
        }
    }
};