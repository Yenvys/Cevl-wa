import UserRPG from "../../src/rpg/schema.js";
import { sendButton } from "../../src/button.js";
import { formatYen } from "../../src/rpg/core.js";
import { res } from "../../src/response.js";

const MARKET_ITEMS = {
  onigiri: { name: "Onigiri", emoji: "🍙", stamina: 20, price: 100 },
  ramen: { name: "Ramen", emoji: "🍜", stamina: 50, price: 250 },
  matcha: { name: "Matcha", emoji: "🍵", stamina: 15, price: 75 },
  ocha: { name: "Ocha", emoji: "🍵", stamina: 30, price: 150 },
};

export default {
  cmd: ["market", "shop", "buy"],
  category: "rpg",
  desc: "Beli makanan dan minuman untuk memulihkan stamina.",
  exec: async (m, { sock, args, command }) => {
    const cmd = command?.toLowerCase();
    let user = await UserRPG.findOne({ noWa: m.sender });
    if (!user) {
      user = new UserRPG({ noWa: m.sender });
      await user.save();
    }

    if (cmd === "market" || cmd === "shop") {
      const listButtons = [
        {
          name: "single_select",
          displayText: "Lihat Daftar Barang",
          sections: [
            {
              title: "🍚 Makanan",
              rows: [
                { title: `${MARKET_ITEMS.onigiri.emoji} ${MARKET_ITEMS.onigiri.name}`, description: `Pulihkan ${MARKET_ITEMS.onigiri.stamina} Stamina | Harga: ${formatYen(MARKET_ITEMS.onigiri.price)}`, id: `${m.prefix}buy onigiri` },
                { title: `${MARKET_ITEMS.ramen.emoji} ${MARKET_ITEMS.ramen.name}`, description: `Pulihkan ${MARKET_ITEMS.ramen.stamina} Stamina | Harga: ${formatYen(MARKET_ITEMS.ramen.price)}`, id: `${m.prefix}buy ramen` },
              ],
            },
            {
              title: "🥤 Minuman",
              rows: [
                { title: `${MARKET_ITEMS.matcha.emoji} ${MARKET_ITEMS.matcha.name}`, description: `Pulihkan ${MARKET_ITEMS.matcha.stamina} Stamina | Harga: ${formatYen(MARKET_ITEMS.matcha.price)}`, id: `${m.prefix}buy matcha` },
                { title: `${MARKET_ITEMS.ocha.emoji} ${MARKET_ITEMS.ocha.name}`, description: `Pulihkan ${MARKET_ITEMS.ocha.stamina} Stamina | Harga: ${formatYen(MARKET_ITEMS.ocha.price)}`, id: `${m.prefix}buy ocha` },
              ],
            },
          ],
        },
        { name: "quick_reply", displayText: "Cek Inventory", id: `${m.prefix}inv` },
      ];

      return await sendButton(
        sock,
        m.from,
        "*🏮 7NIGHT MARKET 🏮*",
        `> _Selamat datang di pasar malam! Kami menjual makanan dan minuman untuk mengembalikan staminamu._\n\nSaldo Anda: *${formatYen(user.yen)}*`,
        "Silakan pilih barang yang ingin dibeli melalui menu di bawah.",
        listButtons
      );
    }

    if (cmd === "buy") {
      if (!args[0]) return m.reply(res.format(m.prefix, "buy", "onigiri", `Buka ${m.prefix}market untuk melihat daftar barang`));
      const itemKey = args[0].toLowerCase();
      const item = MARKET_ITEMS[itemKey];
      if (!item) return m.reply(res.warn(`Barang "${args[0]}" tidak ditemukan di pasar! Buka ${m.prefix}market untuk melihat barang.`));

      if (user.yen < item.price) {
        return m.reply(res.warn(`Uang Yen Anda tidak cukup untuk membeli ${item.name}!\nHarga: ${item.price} Yen\nSaldo Anda: ${user.yen} Yen`));
      }

      user.yen -= item.price;
      if (!user.inventory) user.inventory = { onigiri: 0, ramen: 0, matcha: 0, ocha: 0 };
      user.inventory[itemKey] = (user.inventory[itemKey] || 0) + 1;
      await user.save();

      return m.reply(
        `🏮 *PEMBELIAN BERHASIL* 🏮\n\nAnda telah membeli 1x *${item.emoji} ${item.name}* seharga ${item.price} Yen.\n\nSisa Yen Anda: *${user.yen} Yen*\n\nKetik *${m.prefix}inv* untuk mengecek inventory, dan *${m.prefix}use ${itemKey}* untuk mengonsumsinya.`
      );
    }
  },
};
