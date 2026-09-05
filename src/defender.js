/**
 * Adapted from Ginko project (https://github.com/ginkohub/mushi)
 */

import fs from 'node:fs';
import path from 'node:path';

export function getDefenseConfig() {
    const defenseFile = path.join(process.cwd(), 'data', 'defense.json');
    if (!fs.existsSync(defenseFile)) {
        return {
            active: true,
            allow_status: [
                "extendedTextMessage",
                "videoMessage",
                "imageMessage",
                "audioMessage",
                "protocolMessage",
                "senderKeyDistributionMessage",
                "associatedChildMessage",
                "reactionMessage"
            ]
        };
    }
    return JSON.parse(fs.readFileSync(defenseFile, 'utf-8'));
}

export async function runDefender(m, { sock, handler }) {
    if (m.fromMe) return;

    const config = getDefenseConfig();
    if (!config.active) return; // Defense is inactive

    let suspect = false;
    let reason = '';

    // Detector 1: Pesan Status (Broadcast) dengan tipe yang tidak diizinkan
    const isStatus = m.from === 'status@broadcast' || m.key?.remoteJid === 'status@broadcast';
    if (isStatus) {
        if (!config.allow_status.includes(m.type)) {
            suspect = true;
            reason = "Pesan status dengan tipe yang tidak diizinkan";
        }
    }

    // Detector 2: Terlalu banyak mention (Anti Tag All spam / crash)
    if (!suspect && m.mentionedJid?.length > 1024) {
        suspect = true;
        reason = "Terlalu banyak penyebutan JID";
    }

    // Detector 3: Overload message (Anti Crash text/payload)
    if (!suspect) {
        const msgs = [m.message?.botInvokeMessage?.message, m.message];
        for (const msg of msgs) {
            if (!msg) continue;
            if (msg.newsletterAdminInviteMessage?.caption?.length > 256) {
                suspect = true;
                break;
            }
            if (msg.interactiveMessage?.nativeFlowMessage?.messageParamsJson?.length > 2048) {
                suspect = true;
                break;
            }
        }
        if (suspect) reason = "Teks berlebihan (overload)";
    }

    // Jika terdeteksi sebagai pesan berbahaya, lakukan defense actions
    if (suspect) {
        handler.log.warn('DEFENDER', `Pertahanan: ${reason} dari ${m.sender} di ${m.from}`);

        try {
            // Aksi 1: Blokir User
            await sock.updateBlockStatus(m.sender, 'block').catch(() => {});
            
            // Aksi 2: Hapus pesan untuk semua (Delete for All)
            let canDeleteForAll = false;
            if (m.isGroup) {
                // Cek apakah bot adalah admin
                if (m.isBotAdmin) canDeleteForAll = true;
            } else {
                canDeleteForAll = true; // Private chat bisa dihapus
            }

            if (canDeleteForAll) {
                await sock.sendMessage(m.from, { delete: m.key }).catch(() => {});
            }

            // Aksi 3: Hapus pesan untuk saya (Delete for Me)
            await sock.chatModify({
                deleteForMe: {
                    deleteMedia: true,
                    key: m.key,
                    timestamp: Date.now()
                }
            }, m.from).catch(() => {});

            if (m.isGroup && m.isBotAdmin) {
                await sock.groupParticipantsUpdate(m.from, [m.sender], 'remove').catch(() => {});
            }

        } catch (err) {
            handler.log.error('DEFENDER_ERR', err.message);
        }
    }
}
