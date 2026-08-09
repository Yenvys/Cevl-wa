import UserRPG from '../../lib/rpg/schema.js';
import { formatYen } from '../../lib/rpg/core.js';

export default {
    cmd: ['deposit', 'dp', 'withdraw', 'wd', 'tarik', 'nabung'],
    category: 'rpg',
    exec: async (m, { command, args }) => {
        try {
            const user = await UserRPG.findOne({ noWa: m.sender });
            if (!user)
                return m.reply("_Anda belum terdaftar. Silakan ketik .daftar terlebih dahulu._");

            const action = command.toLowerCase();
            let amount = args[0];

            if (!amount) return m.reply(`Contoh penggunaan:\n.${action} 1000 atau .${action} all`);

            if (action === 'deposit' || action === 'nabung' || action === 'dp') {
                const totalDepo = amount === 'all' ? user.yen : parseInt(amount);
                if (isNaN(totalDepo) || totalDepo <= 0)
                    return m.reply("_Nominal yang Anda masukkan tidak valid._");
                
                if (user.yen < totalDepo)
                    return m.reply("_Saldo dompet Anda tidak mencukupi untuk melakukan deposit._");

                user.yen -= totalDepo;
                user.bank += totalDepo;
                await user.save();
                return m.reply(`*DEPOSIT BERHASIL*\n\nJumlah simpanan: ${formatYen(totalDepo)}\nSisa di dompet: ${formatYen(user.yen)}`);

            } else if (action === 'wd' || action === 'tarik' || action === 'withdraw') {
                const totalWD = amount === 'all' ? user.bank : parseInt(amount);
                if (isNaN(totalWD) || totalWD <= 0)
                    return m.reply("_Nominal yang Anda masukkan tidak valid._");
                
                if (user.bank < totalWD)
                    return m.reply("_Saldo tabungan di bank Anda tidak mencukupi untuk melakukan penarikan._");

                user.bank -= totalWD;
                user.yen += totalWD;
                await user.save();
                return m.reply(`*PENARIKAN BERHASIL*\n\nJumlah penarikan: ${formatYen(totalWD)}\nTotal di dompet: ${formatYen(user.yen)}`);
            }
        } catch (err) {
            console.error(err);
            return m.reply("Terjadi kesalahan pada server transaksi.");
        }
    }
};