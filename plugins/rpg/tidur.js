import UserRPG from '../../src/rpg/schema.js';
import { getCooldown } from '../../src/rpg/core.js';
import { res } from '../../src/response.js';


export default {
    cmd: ['tidur', 'rest'],
    category: 'rpg',
    exec: async (m) => {
        try {
            const user = await UserRPG.findOne({ noWa: m.sender });
            if (!user)
                return m.reply("_Anda belum terdaftar. Silakan ketik .daftar terlebih dahulu._");

            if (user.stamina >= 100)
                return m.reply("_Stamina Anda masih dalam kondisi penuh, tidak perlu beristirahat._");

            const cd = getCooldown(user.lastTidur, 60 * 60 * 1000);
            if (!cd.isReady) return m.reply(`Anda baru saja tidur. Silakan tunggu selama ${Math.ceil(cd.sisaWaktu / 60)} menit lagi untuk beristirahat kembali.`);

            user.stamina = 100;
            user.lastTidur = Date.now();
            await user.save();

            return m.reply("_Sesi istirahat selesai. Stamina Anda telah sepenuhnya pulih._");
        } catch (e) {
            console.error(e);
            return m.reply(res.error);
        }
    }
};