import { res } from '../src/response.js';

/**
 * plugins/debugtombol.js
 * Command Tools buat memberondong chat dengan semua jenis tombol fungsional
 */

import { sendButton } from '../src/button.js';

export default {
    cmd: ['btn'],
    category: 'tools',
    desc: ' tes beton.',
    exec: async (m, { sock }) => {
        const jid = m.from;

        console.log(`\x1b[1;34m[PROCESS]\x1b[0m Memberondong ${jid} dengan semua jenis tombol...`);

        const listButtons = [
            // 1. Tombol Biasa (Quick Reply)
            {
                name: "quick_reply",
                displayText: "cek koneksi",
                id: ".ping"
            },
            // 2. Tombol Buka Link (CTA URL)
            {
                name: "cta_url",
                displayText: "github",
                url: "https://github.com/Yenvys"
            },
            // 3. Tombol Salin Teks (CTA Copy)
            {
                name: "cta_copy",
                displayText: "📋 Salin ID User",
                id: m.sender
            },
            // 4. Tombol Menu List Bottom Sheet (Single Select)
            {
                name: "single_select",
                displayText: "📜 Buka Daftar Opsi",
                sections: [
                    {
                        title: "Layanan Utama",
                        rows: [
                            {
                                id: ".menu",
                                title: "bot menu",
                                description: "ya intinya list command lah"
                            },
                            {
                                id: ".info",
                                title: "stats",
                                description: "> Lihat info bot"
                            }
                        ]
                    },
                    {
                        title: "Bantuan",
                        rows: [
                            {
                                id: ".owner list",
                                title: "Hubungi Admin",
                                description: "> Kalo ada error lapor sini"
                            }
                        ]
                    }
                ]
            }
        ];

        try {
            await sendButton(
                sock,
                jid,
                "BETON",
                "kanjud kuda.",
                "Select an option below",
                listButtons
            );

            console.log(`\x1b[1;32m[SUCCESS]\x1b[0m Semua tipe tombol sukses dirender di nomor target.`);

        } catch (e) {
            console.error(`\x1b[1;31m[FATAL ERROR]\x1b[0m`, e);
            m.reply(res.error);
        }
    }
};