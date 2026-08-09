import UserRPG from '../../lib/rpg/schema.js';
import { formatYen } from '../../lib/rpg/core.js';
import { res } from '../../lib/response.js';


export default {
    cmd: ['wallet', 'dompet', 'bal', 'bank'],
    category: 'rpg',
    exec: async (m) => {
        try {
            const user = await UserRPG.findOne({ noWa: m.sender });
            if (!user)
                return m.reply("_Anda belum terdaftar. Silakan ketik .daftar terlebih dahulu._");

            let teks = `『 *INFORMASI KEUANGAN* 』\n\n`;
            teks += `> 💵 *Dompet* : ${formatYen(user.yen)}\n`;
            teks += `> 🏦 *Bank* : ${formatYen(user.bank)}\n\n`;
            teks += `_Gunakan perintah :_\n> _*.deposit* untuk menyimpan dana ke bank._\n> _*.withdraw* untuk mengambil dana dari bank_`;
            
            return m.reply(teks);
        } catch (err) {
            console.error(err);
            return m.reply(res.error);
        }
    }
};