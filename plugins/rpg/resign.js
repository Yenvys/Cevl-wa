import UserRPG from '../../lib/rpg/schema.js';
import { res } from '../../lib/response.js';

export default {
    cmd: ['resign', 'berhenti'],
    category: 'rpg',
    desc: 'Berhenti dari pekerjaanmu saat ini',
    exec: async (m) => {
        try {
            const user = await UserRPG.findOne({ noWa: m.sender });
            if (!user) return m.reply("_Kamu belum terdaftar! Silakan ketik .daftar terlebih dahulu._");

            const currentJob = user.pekerjaan;
            
            if (!currentJob || currentJob.toLowerCase() === 'pengangguran') {
                return m.reply("_Kamu saat ini tidak memiliki pekerjaan! Gunakan *.bursakerja* untuk mencari lowongan._");
            }

            // Set pekerjaan kembali ke default
            user.pekerjaan = "Pengangguran";
            await user.save();

            return m.reply(
                `📝 *RESIGN BERHASIL*\n\n` +
                `Kamu telah resmi berhenti dari pekerjaanmu sebagai *${currentJob}*.\n` +
                `Sekarang kamu adalah seorang *Pengangguran*.\n\n` +
                `_Gunakan *.bursakerja* jika ingin mencari pekerjaan baru._`
            );

        } catch (err) {
            console.error('\x1b[1;31m[RESIGN ERROR]\x1b[0m', err);
            m.reply(res.error);
        }
    }
};
