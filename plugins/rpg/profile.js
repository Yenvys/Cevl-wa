import UserRPG from '../../lib/rpg/schema.js';
import { refreshUser, formatYen } from '../../lib/rpg/core.js';
import { res } from '../../lib/response.js';


export default {
    cmd: ['me', 'stat', 'profile'],
    category: 'rpg',
    exec: async (m) => {
        try {
            let user = await UserRPG.findOne({ noWa: m.sender });
            if (!user) return m.reply("_Kamu belum terdaftar! Silakan ketik .daftar terlebih dahulu._");

            user = await refreshUser(user);

            const currentExp = Number(user.exp || 0);
            const currentYen = Number(user.yen || 0);
            const currentBank = Number(user.bank || 0);

            const xpNeeded = user.level * 100;
            const progress = Math.min((currentExp / xpNeeded) * 100, 100);

            let displayStatus = "BEBAS";
            try {
                const parsedStatus = JSON.parse(user.statusBermain);
                if (parsedStatus && parsedStatus.mode) {
                    displayStatus = parsedStatus.mode.toUpperCase();
                }
            } catch {
                if (user.statusBermain) {
                    displayStatus = user.statusBermain.split('|')[0].toUpperCase();
                }
            }

            let teks = `『 👤 *USER STATUS* 』\n\n`;
            teks += `> 👤 *Nama* : ${m.pushName || 'Anonim'}\n`;
            teks += `> 🏷️ *Profesi* : ${user.pekerjaan}\n`;
            teks += `> 🆙 *Level* : ${user.level}\n`;
            teks += `> ✨ *XP* : ${currentExp} / ${xpNeeded} (${progress.toFixed(1)}%)\n`;
            teks += `> ⚡ *Stamina* : ${user.stamina} / 100\n`;
            teks += `> 💵 *Dompet* : ${formatYen(currentYen)}\n`;
            teks += `> 🏦 *Bank* : ${formatYen(currentBank)}\n`;
            teks += `───────────────────\n`;
            teks += `> 🎮 *Status* : ${displayStatus}\n`;

            return m.reply(teks);
        } catch (e) {
            console.error(e);
            m.reply(res.error);
        }
    }
};