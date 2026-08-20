import { res } from '../src/response.js';
import UserRPG from '../src/rpg/schema.js';
import { formatYen } from '../src/rpg/core.js';

const MARKET_ITEMS = {
    onigiri: { name: 'Onigiri', emoji: '🍙', type: 'food', stamina: 20 },
    ramen: { name: 'Ramen', emoji: '🍜', type: 'food', stamina: 50 },
    matcha: { name: 'Matcha', emoji: '🍵', type: 'drink', stamina: 15 },
    ocha: { name: 'Ocha', emoji: '🍵', type: 'drink', stamina: 30 }
};

export default {
    cmd: ['inv', 'inventory', 'use'],
    category: 'rpg',
    desc: 'Cek inventory dan gunakan item untuk memulihkan stamina.',
    exec: async (m, { sock, args, command }) => {
        const cmdName = command?.toLowerCase();

        let user = await UserRPG.findOne({ noWa: m.sender });
        if (!user) {
            user = new UserRPG({ noWa: m.sender });
            await user.save();
        }

        // Pastikan inventory objek ada
        if (!user.inventory) {
            user.inventory = { onigiri: 0, ramen: 0, matcha: 0, ocha: 0 };
            await user.save();
        }

        if (cmdName === 'inv' || cmdName === 'inventory') {
            let invText = `*🎒 INVENTORY MILIKMU 🎒*\n\n`;
            invText += `> 💰 Uangmu : ${formatYen(user.yen)}\n`;
            invText += `> ⚡ Stamina : ${user.stamina}/100\n`;

            invText += `*♯ Item Makanan & Minuman*\n`;

            let hasItems = false;
            for (const [key, itemData] of Object.entries(MARKET_ITEMS)) {
                const qty = user.inventory[key] || 0;
                if (qty > 0) {
                    hasItems = true;
                    invText += `> ${itemData.emoji} ${itemData.name} : ${qty}x\n`;
                }
            }

            if (!hasItems) {
                invText += `_Kosong. Beli item di *${m.prefix}market*_`;
            } else {
                invText += `\n_Gunakan item dengan mengetik: *${m.prefix}use <nama_item>*_`;
            }

            return m.reply(invText.trim());
        }

        if (cmdName === 'use') {
            if (!args[0]) {
                return m.reply(`Format salah! Gunakan: *${m.prefix}use <nama_item>*\nContoh: *${m.prefix}use onigiri*`);
            }

            const itemKey = args[0].toLowerCase();
            const item = MARKET_ITEMS[itemKey];

            if (!item) {
                return m.reply(`Barang *"${args[0]}"* tidak bisa digunakan atau tidak ada.`);
            }

            if (!user.inventory[itemKey] || user.inventory[itemKey] <= 0) {
                return m.reply(`Kamu tidak memiliki *${item.name}* di inventory! Beli dulu di *${m.prefix}market*.`);
            }

            if (user.stamina >= 100) {
                return m.reply(`Staminamu sudah penuh (100/100)! Simpan *${item.name}* mu untuk nanti.`);
            }

            // Kurangi item dari inventory
            user.inventory[itemKey] -= 1;

            // Tambah stamina
            const oldStamina = user.stamina;
            user.stamina = Math.min(100, user.stamina + item.stamina);
            const restored = user.stamina - oldStamina;

            await user.save();

            m.reply(`🍱 *ITEM DIGUNAKAN* 🍱\n\nKamu mengonsumsi 1x *${item.emoji} ${item.name}*.\n⚡ Stamina dipulihkan: +${restored}\n\nStamina kamu saat ini: *${user.stamina}/100*`);
        }
    }
};
