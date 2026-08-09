/**
 * plugins/grup/mainGroup.js
 * Pusat Komando Manajemen Fitur Administrasi Grup (Universal Chat Style)
 */

import { getGroupSettings, updateGroupSettings } from '../../lib/database.js';
import { res } from '../../lib/response.js';


export default {
    cmd: ['gc', 'open', 'close', 'promote', 'up', 'demote', 'down', 'antilink', 'welcome', 'goodbye'],
    category: 'grup',
    desc: 'Pusat kendali konfigurasi, status operasional, serta hak akses anggota grup.',
    exec: async (m, { sock, args, query, command }) => {
        if (!m.isGroup) return sock.sendMessage(m.from, { react: { text: '⁉️', key: m.key } });
        if (!m.isAdmin && !m.isOwner) return m.reply(res.owner);
        if (!m.isBotAdmin) return await sock.sendMessage(m.from, { react: { text: '❕', key: m.key } });

        const targetCmd = command.toLowerCase();

        switch (targetCmd) {
            // ==========================================
            // KONDISI: BUKA / TUTUP GRUP
            // ==========================================
            case 'gc':
            case 'open':
            case 'close': {
                const subAction = args[0]?.toLowerCase() || targetCmd;
                let settingMode = /open|buka/i.test(subAction) ? 'not_announcement' : (/close|tutup/i.test(subAction) ? 'announcement' : '');
                
                if (!settingMode) {
                    return m.reply(`Format salah!\n\nGunakan format:\n${m.prefix}gc open\n${m.prefix}gc close`);
                }
                
                await sock.groupSettingUpdate(m.from, settingMode);
                await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                break;
            }

            // ==========================================
            // KONDISI: PROMOTE / DEMOTE 
            // ==========================================
            case 'promote':
            case 'up':
            case 'demote':
            case 'down': {
                const actionType = /promote|up/i.test(targetCmd) ? 'promote' : 'demote';
                let targets = m.quoted ? [m.quoted.sender] : m.mentionedJid || [];
                
                if (query && !targets.length) {
                    targets.push(query.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
                }
                if (!targets.length) {
                    return m.reply(res.format(m.prefix, command, `@tag/reply pesan`));
                }

                try {
                    for (let target of targets) {
                        await sock.groupParticipantsUpdate(m.from, [target], actionType);
                    }
                    await sock.sendMessage(m.from, { react: { text: '', key: m.key } }); // Menghapus reaksi
                } catch (e) {
                    console.error(`[${actionType.toUpperCase()}_ERR]`, e);
                    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                    await m.reply(res.error);
                }
                break;
            }

            // ==========================================
            // KONDISI: KONFIGURASI WELCOME / GOODBYE
            // ==========================================
            case 'welcome':
            case 'goodbye': {
                const subAction = args[0]?.toLowerCase();
                const currentSettings = await getGroupSettings(m.from);

                if (subAction === 'on' || subAction === 'off') {
                    const toggleValue = subAction === 'on' ? 1 : 0;
                    await updateGroupSettings(m.from, targetCmd, toggleValue);
                    await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                    return m.reply(`_Sistem notif *${targetCmd.toUpperCase()}* berhasil diubah menjadi: *${subAction.toUpperCase()}*_`);
                } 
                
                if (subAction === 'set') {
                    const newTextTemplate = args.slice(1).join(' '); 
                    if (!newTextTemplate) {
                        return m.reply(`Format salah!\n\nContoh penggunaan:\n${m.prefix}${targetCmd} set Selamat Datang @pushname di grup @gcname`);
                    }
                    await updateGroupSettings(m.from, targetCmd + 'Text', newTextTemplate);
                    await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                    return m.reply(`teks teks pesan *${targetCmd}* berhasil diperbarui.`);
                }

                let infoMenu = `⌗ *SISTEM NOTIFIKASI ${targetCmd.toUpperCase()}*\n\n`;
                infoMenu += `> *Status Aktif:* [ ${currentSettings[targetCmd] ? 'ON' : 'OFF'} ]\n\n`;
                infoMenu += `*Opsi Perintah Modifikasi:*\n`;
                infoMenu += `│ ◦ ${m.prefix}${targetCmd} on\n`;
                infoMenu += `│ ◦ ${m.prefix}${targetCmd} off\n`;
                infoMenu += `│ ◦ ${m.prefix}${targetCmd} set <template_teks>\n`;
                infoMenu += `╰───────────────────────────\n\n`;
                infoMenu += `_Catatan: Gunakan tag @pushname untuk memanggil nama user dan @gcname untuk memanggil nama grup._`;
                
                await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                await m.reply(infoMenu);
                break;
            }

            // ==========================================
            // KONDISI: KONFIGURASI FILTER ANTILINK
            // ==========================================
            case 'antilink': {
                const subAction = args[0]?.toLowerCase();
                if (!['on', 'off'].includes(subAction)) {
                    return m.reply(`Format salah!\n\nGunakan format:\n${m.prefix}antilink on\n${m.prefix}antilink off`);
                }
                
                const antilinkToggle = subAction === 'on' ? 1 : 0;
                await getGroupSettings(m.from);
                await updateGroupSettings(m.from, 'antilink', antilinkToggle);
                
                await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
                await m.reply(`_*Antilink* berhasil diubah ke: *${subAction.toUpperCase()}*_`);
                break;
            }
        }
    }
};