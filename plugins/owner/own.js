/**
 * plugins/owner/ownerManager.js
 * Manajemen penambahan dan pencabutan hak akses nomor Owner secara dinamis (Universal Chat Style + vCard Integration)
 */

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { getLidMapping } from '../../lib/database.js';
import { sendMultiContact } from '../../lib/helper.js';
import { res } from '../../lib/response.js';


export default {
    cmd: ['owner', 'own'],
    category: 'owner',
    desc: 'Menambahkan, menghapus, atau melihat daftar nomor telepon yang memiliki hak akses penuh sebagai Owner bot.',
    exec: async (m, { sock, args = [] }) => {
        const action = args[0]?.toLowerCase();
        
        if (action !== 'list' && !m.isOwner) return m.reply(res.owner);

        // ==========================================
        // OPSI: LIHAT DAFTAR OWNER (list) VIA V-CARD
        // ==========================================
        if (action === 'list') {
            const list = config.ownerNumbers || [];
            if (list.length === 0) return m.reply("_Tidak ada list nomor Owner yang tercatat._");
            // Teks pengantar manis sebelum kontak dikirim
            //await m.reply(`_*Berikut adalah daftar kartu kontak resmi jajaran Owner & Developer aktif Yenvy Bot...*_`);

            await new Promise((resolve) => setTimeout(resolve, 1000));

            const mappedOwners = list.map((num, i) => {
                return {
                    name: i === 0 ? `AlFarel` : `Owner ${i + 1}`,
                    number: num
                };
            });

            return await sendMultiContact(
                sock,
                m.from,
                mappedOwners,
                m
            );
        }

        // ==========================================
        // OPSI: MODIFIKASI DATA (add / remove / del)
        // ==========================================
        if (action === 'add' || action === 'remove' || action === 'del') {
            let rawJid = m.quoted ? m.quoted.sender : (m.mentionedJid?.[0] || (args[1] ? args[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null));

            if (!rawJid) {
                return m.reply(`_Format salah! Harap tag target, reply pesan target, atau masukkan nomor secara spesifik._\n\nContoh: *${m.prefix}own ${action} @user*`);
            }

            let finalJid = rawJid;
            if (rawJid.endsWith('@lid')) {
                finalJid = await getLidMapping(rawJid) || rawJid;
            }

            const targetNum = finalJid.split('@')[0];
            const configPath = path.resolve('./config.js');

            if (action === 'add') {
                if (config.ownerNumbers.includes(targetNum)) return m.reply("_Nomor telepon tersebut sudah terdaftar di dalam list Owner._");

                config.ownerNumbers.push(targetNum);
                saveOwnerConfig(configPath, config.ownerNumbers);

                return m.reply(`_Sukses! @${targetNum} saat ini telah resmi ditambahkan sebagai Owner bot tambahan._`, { mentions: [targetNum + '@s.whatsapp.net'] });
            }

            if (action === 'remove' || action === 'del') {
                if (targetNum === '62895806279898') return m.reply(res.owner);
                if (!config.ownerNumbers.includes(targetNum)) return m.reply("_Nomor tersebut memang tidak tercantum di dalam list Owner._");

                config.ownerNumbers = config.ownerNumbers.filter(num => num !== targetNum);
                saveOwnerConfig(configPath, config.ownerNumbers);

                return m.reply(`_Sukses! Otoritas akses Owner untuk @${targetNum} telah resmi dicabut._`, { mentions: [targetNum + '@s.whatsapp.net'] });
            }
        }

        // ==========================================
        // MENU PANDUAN UTAMA (Memicu jika input kosong atau opsi salah)
        // ==========================================
        let helpText = `⌗ *MANAJEMEN OTORITAS OWNER*\n\n`;
        helpText += `*Daftar Opsi Perintah:*\n`;
        helpText += `│ ◦ ${m.prefix}own add @tag/nomor - Tambah owner\n`;
        helpText += `│ ◦ ${m.prefix}own del @tag/nomor - Hapus owner\n`;
        helpText += `│ ◦ ${m.prefix}own list - Lihat daftar owner aktif (vCard format)\n`;
        helpText += `╰───────────────────────────`;
        return m.reply(helpText);
    }
};

function saveOwnerConfig(filePath, newOwnerList) {
    try {
        let content = fs.readFileSync(filePath, 'utf-8');
        const regexOwner = /(['"]?)ownerNumbers\1\s*:\s*\[[\s\S]*?\]/;

        if (regexOwner.test(content)) {
            const updatedContent = content.replace(
                regexOwner,
                `"ownerNumbers": ${JSON.stringify(newOwnerList, null, 4)}`
            );
            fs.writeFileSync(filePath, updatedContent, 'utf-8');
        } else {
            console.error("[CONFIG_SAVE_ERR] Properti ownerNumbers tidak ditemukan di config.js");
        }
    } catch (e) {
        console.error("[CONFIG_WRITE_FATAL]", e.message);
    }
}