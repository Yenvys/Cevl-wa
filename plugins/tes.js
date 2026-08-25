/**
 * plugins/tes.js
 * Command untuk menampilkan demo semua tipe button menggunakan baileys-mbuilder
 * Menampilkan: Quick Reply, URL, Copy, Selection List, ButtonV2, dan Location
 */

import {
    createButton,
    createButtonV2,
    sendQuickReply,
    sendUrlButton,
    sendSelection,
    sendCopyButton
} from '../src/mbuilder.js';

export default {
    cmd: ['tesbutton', 'tb', 'buttontest'],
    category: 'owner',
    desc: 'Demo semua tipe button (baileys-mbuilder)',
    exec: async (m, { sock, query, command }) => {
        if (!m.isOwner) return;

        const sub = (query || '').toLowerCase();

        // ==========================================
        // 1. QUICK REPLY BUTTONS
        // ==========================================
        if (sub === 'reply') {
            await sendQuickReply(sock, m.from,
                '*Demo Quick Reply Buttons*\n\nPilih salah satu opsi di bawah:',
                [
                    { text: '📊 Info Bot', id: '.info' },
                    { text: '📋 Menu', id: '.menu' },
                    { text: '🏓 Ping', id: '.ping' },
                ],
                {
                    title: '♯ QUICK REPLY',
                    footer: 'Tap button untuk menjalankan command'
                }
            );
        }

        // ==========================================
        // 2. URL BUTTONS
        // ==========================================
        if (sub === 'url') {
            await sendUrlButton(sock, m.from,
                '*Demo URL Buttons*\n\nButton yang mengarahkan ke link external:',
                [
                    { text: '🐙 GitHub', url: 'https://github.com/Yenvys' },
                    { text: '📢 Channel WA', url: 'https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J' },
                ],
                {
                    title: '♯ URL BUTTONS',
                    footer: 'Tap untuk membuka link'
                }
            );
        }

        // ==========================================
        // 3. COPY BUTTON
        // ==========================================
        if (sub === 'copy') {
            await sendCopyButton(sock, m.from,
                '*Demo Copy Button*\n\nTekan button untuk menyalin teks ke clipboard:',
                'npm install baileys-mbuilder',
                '📋 Copy Command',
                {
                    title: '♯ COPY BUTTON',
                    footer: 'Text akan disalin ke clipboard'
                }
            );
        }

        // ==========================================
        // 4. SELECTION LIST (DROPDOWN)
        // ==========================================
        if (sub === 'list') {
            await sendSelection(sock, m.from,
                '*Demo Selection List*\n\nPilih dari dropdown menu di bawah:',
                '📝 Pilih Kategori',
                [
                    {
                        title: '🎵 Downloader',
                        rows: [
                            { title: 'YouTube', description: 'Download video/audio YouTube', id: '.yt' },
                            { title: 'TikTok', description: 'Download video TikTok', id: '.tt' },
                            { title: 'Instagram', description: 'Download post/reel IG', id: '.ig' },
                        ]
                    },
                    {
                        title: '🤖 AI Tools',
                        rows: [
                            { title: 'AI Chat', description: 'Chat dengan Gemini AI', id: '.ai' },
                        ]
                    }
                ],
                {
                    title: '♯ SELECTION LIST',
                    footer: 'Pilih opsi dari menu'
                }
            );
        }

        // ==========================================
        // 5. MIXED BUTTONS (KOMBINASI)
        // ==========================================
        if (!sub || sub === 'mix') {
            const msg = createButton(sock)
                .setTitle('♯ MIXED BUTTONS')
                .setBody('*Demo Mixed Buttons*\n\nSemua tipe button dalam 1 pesan:')
                .setFooter('baileys-mbuilder v4.7')
                .addReply('📊 Quick Reply', '.info')
                .addUrl('🌐 Open URL', 'https://github.com/Yenvys')
                .addCopy('📋 Copy Text', 'Hello World!')
                .addLocation()
                .addSelection('📝 Select')
                .makeSection('Commands')
                .makeRow('', 'Menu', 'Lihat daftar command', '.menu')
                .makeRow('', 'Ping', 'Cek response time', '.ping');

            await msg.send(m.from);
        }

        // ==========================================
        // 6. BUTTON V2 (LEGACY STYLE)
        // ==========================================
        if (!sub || sub === 'v2') {
            const msg = createButtonV2(sock)
                .setTitle('♯ BUTTON V2')
                .setSubtitle('Legacy-style buttons')
                .setBody('*Demo ButtonV2*\n\nStyle button yang berbeda (location-based):')
                .setFooter('baileys-mbuilder')
                .addButton('📊 Info', '.info')
                .addButton('📋 Menu', '.menu')

            await msg.send(m.from);
        }

        // ==========================================
        // HELP
        // ==========================================
        if (sub === 'help') {
            let helpText = `*♯ BUTTON TEST — HELP*\n\n`;
            helpText += `*Penggunaan:*\n`;
            helpText += `> ${m.prefix}${command} — Tampilkan semua demo\n`;
            helpText += `> ${m.prefix}${command} reply — Quick reply buttons\n`;
            helpText += `> ${m.prefix}${command} url — URL buttons\n`;
            helpText += `> ${m.prefix}${command} copy — Copy button\n`;
            helpText += `> ${m.prefix}${command} list — Selection list\n`;
            helpText += `> ${m.prefix}${command} mix — Mixed buttons\n`;
            helpText += `> ${m.prefix}${command} v2 — ButtonV2 (legacy)\n`;
            return m.reply(helpText);
        }
    }
};