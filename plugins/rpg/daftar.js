import UserRPG from '../../lib/rpg/schema.js';
import { formatYen } from '../../lib/rpg/core.js';
import { res } from '../../lib/response.js';


export default {
    cmd: ['daftar', 'register', 'reg'],
    category: 'rpg',
    exec: async (m, { sock }) => {
        try {
            const isRegistered = await UserRPG.findOne({ noWa: m.sender });
            
            if (isRegistered) {
                return m.reply("_Kamu Sudah Daftar. Cek di *.me*_");
            }

            const newUser = new UserRPG({
                noWa: m.sender
            });

            await newUser.save();

            const teks = `『 REGISTRASI 』\n\n` +
                         `> 🎫 *Status:* Aktif / Terdaftar\n` +
                         `> 📱 *Nomor:* @${m.sender.split('@')[0]}\n` +
                         `> 💼 *Pekerjaan:* Pengangguran Sukses\n` +
                         `> 💵 *Modal Awal:* ${formatYen(10000)}\n\n` +
                         `_📌 Catatan: Ketik *.bursakerja* untuk mencari pekerjaan!_`;

            // FIX: Hapus adReply, ganti pake reply murni dengan bawaan mention nomor
            return m.reply(teks, { mentions: [m.sender] });

        } catch (error) {
            console.log(error);
            return m.reply(res.error);
        }
    }
};