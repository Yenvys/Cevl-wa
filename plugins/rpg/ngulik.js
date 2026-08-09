import UserRPG from '../../lib/rpg/schema.js';
import { getCooldown, getRandom, checkLevelUp } from '../../lib/rpg/core.js';

export default {
    cmd: ['ngulik', 'belajar'],
    category: 'rpg',
    exec: async (m, { sock }) => {
        try {
            const user = await UserRPG.findOne({ noWa: m.sender });
            if (!user)
                return m.reply("_Anda belum terdaftar. Silakan ketik .daftar terlebih dahulu._");

            if (user.stamina < 20)
                return m.reply("_Stamina Anda habis. Silakan istirahat menggunakan perintah .tidur._");

            const cd = getCooldown(user.lastNgulik, 5 * 60 * 1000);
            if (!cd.isReady)
                return m.reply(`Kondisi mental Anda belum stabil. Silakan tunggu selama ${cd.sisaWaktu} detik lagi.`);

            const xpDapet = getRandom(50, 150);
            const listTeks = [
                "_Sedang menganalisis dan memperbaiki kegagalan sistem pada bot WhatsApp..._",
                "_Melakukan konfigurasi lingkungan kerja perangkat lunak di sistem operasi Linux..._",
                "_Mempelajari dokumentasi struktur skema database Mongoose secara mendalam..._",
                "_Mengintegrasikan API kecerdasan buatan Gemini guna mengoptimalkan kinerja bot..._",
                "_Melakukan pembersihan data digital secara berkala guna menjaga stabilitas sistem..._"
            ];
            const teks = listTeks[Math.floor(Math.random() * listTeks.length)];

            user.exp = (user.exp || 0) + xpDapet;
            user.stamina -= 20;
            user.lastNgulik = Date.now();

            const levelUp = checkLevelUp(user.exp, user.level);
            let pesan = `『 *SESI PEMBELAJARAN TECH* 』\n\n${teks}\n\n`;
            pesan += `XP didapat: +${xpDapet}\nStamina berkurang: -20 (Sisa: ${user.stamina})`;

            if (levelUp.isNaik) {
                user.level = levelUp.levelBaru;
                user.exp = levelUp.sisaXp;
                pesan += `\n\n🎉 *LEVEL UP!* Anda sekarang berada di Level ${user.level}!`;
            }

            await user.save();
            return m.reply(pesan);
        } catch (e) {
            console.error(e);
            return m.reply("Terjadi kesalahan pada sistem database.");
        }
    }
};