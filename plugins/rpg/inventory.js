import UserRPG from "../../src/rpg/schema.js";
import { formatYen } from "../../src/rpg/core.js";
import { res } from "../../src/response.js";

const MARKET_ITEMS = {
  onigiri: { name: "Onigiri", emoji: "🍙", stamina: 20 },
  ramen: { name: "Ramen", emoji: "🍜", stamina: 50 },
  matcha: { name: "Matcha", emoji: "🍵", stamina: 15 },
  ocha: { name: "Ocha", emoji: "🍵", stamina: 30 },
};

export default {
  cmd: ["inv", "inventory", "use"],
  category: "rpg",
  desc: "Cek inventory dan gunakan item untuk memulihkan stamina.",
  exec: async (m, { args, command }) => {
    const cmd = command?.toLowerCase();
    let user = await UserRPG.findOne({ noWa: m.sender });
    if (!user) {
      user = new UserRPG({ noWa: m.sender });
      await user.save();
    }
    if (!user.inventory) {
      user.inventory = { onigiri: 0, ramen: 0, matcha: 0, ocha: 0 };
      await user.save();
    }

    if (cmd === "inv" || cmd === "inventory") {
      let invText = `*🎒 INVENTORY MILIKMU 🎒*\n\n> 💰 Uangmu : ${formatYen(user.yen)}\n> ⚡ Stamina : ${user.stamina}/100\n*♯ Item Makanan & Minuman*\n`;
      let hasItems = false;
      for (const [key, item] of Object.entries(MARKET_ITEMS)) {
        const qty = user.inventory[key] || 0;
        if (qty > 0) {
          hasItems = true;
          invText += `> ${item.emoji} ${item.name} : ${qty}x\n`;
        }
      }
      invText += hasItems ? `\n_Gunakan item: *${m.prefix}use <nama_item>*_` : `_Kosong. Beli item di *${m.prefix}market*_`;
      return m.reply(invText.trim());
    }

    if (cmd === "use") {
      if (!args[0]) return m.reply(res.format(m.prefix, "use", "onigiri", "Gunakan nama item dari inventory"));
      const itemKey = args[0].toLowerCase();
      const item = MARKET_ITEMS[itemKey];
      if (!item) return m.reply(res.warn(`Barang "${args[0]}" tidak bisa digunakan atau tidak ada.`));
      if (!user.inventory[itemKey] || user.inventory[itemKey] <= 0) {
        return m.reply(res.warn(`Kamu tidak memiliki ${item.name} di inventory! Beli di ${m.prefix}market.`));
      }
      if (user.stamina >= 100) return m.reply(res.warn(`Staminamu sudah penuh (100/100)! Simpan ${item.name} milikmu.`));

      user.inventory[itemKey] -= 1;
      const oldStamina = user.stamina;
      user.stamina = Math.min(100, user.stamina + item.stamina);
      await user.save();

      return m.reply(
        `🍱 *ITEM DIGUNAKAN* 🍱\n\nKamu mengonsumsi 1x *${item.emoji} ${item.name}*.\n⚡ Stamina dipulihkan: +${user.stamina - oldStamina}\n\nStamina saat ini: *${user.stamina}/100*`
      );
    }
  },
};
