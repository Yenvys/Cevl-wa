/**
 * plugins/system/menu.js
 * Menampilkan daftar menu perintah bot (Universal Chat Style)
 */
import { config } from "../../config.js";

const getGreeting = () => {
  const hour = parseInt(
    new Date().toLocaleTimeString("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hour12: false,
    }),
  );
  if (hour >= 5 && hour < 11) return "Selamat Pagi";
  if (hour >= 11 && hour < 15) return "Selamat Siang";
  if (hour >= 15 && hour < 18) return "Selamat Sore";
  return "Selamat Malam";
};

const readMore = String.fromCharCode(8206).repeat(4001);

export default {
  cmd: ["menu", "help", "h"],
  category: "system",
  exec: async (m, { sock, handler, query, command }) => {
    if (query) {
      if (query.toLowerCase() === "cat" || query.toLowerCase() === "category") {
        const plugins = Array.from(handler.plugins.values());
        const categories = new Set();
        plugins.forEach((p) => {
          const cat = p.category || "Lainnya";
          categories.add(cat);
        });

        const sortedCategories = Array.from(categories).sort((a, b) =>
          a.localeCompare(b),
        );

        let menuText = `*♯ CATEGORY LIST*\n`;
        sortedCategories.forEach((cat) => {
          menuText += `> ♯${cat}\n`;
        });
        menuText += `_Tip: Gunakan *.h <category>* untuk melihat command di dalam category tersebut._`;

        return await m.reply(menuText.trim());
      }

      if (
        query.toLowerCase() === "alias" ||
        query.toLowerCase() === "aliases"
      ) {
        const uniquePlugins = Array.from(new Set(handler.plugins.values()));
        const prefix = handler.prefix;

        const totalCmds = uniquePlugins.filter((p) => p.cmd).length;
        let menuText = `*♯ ALIAS MENU*\n`;
        menuText += `> MODE : ${handler.mode.toUpperCase()}\n`;
        menuText += `> PREFIX : | ${prefix || "None"} |\n`;
        menuText += `> TOTAL : ${totalCmds} Commands\n`;
        menuText += `${readMore}\n`;

        const categories = {};
        uniquePlugins.forEach((p) => {
          if (!p.cmd) return;
          const cat = p.category || "Lainnya";
          if (!categories[cat]) categories[cat] = [];
          categories[cat].push(p);
        });

        const sortedCategories = Object.keys(categories).sort((a, b) =>
          a.localeCompare(b),
        );

        sortedCategories.forEach((cat) => {
          menuText += `*♯ menu ${cat.toLowerCase()}*\n`;

          const cmds = categories[cat].sort((a, b) => {
            const nameA = Array.isArray(a.cmd) ? a.cmd[0] : a.cmd;
            const nameB = Array.isArray(b.cmd) ? b.cmd[0] : b.cmd;
            return nameA.localeCompare(nameB);
          });

          cmds.forEach((p) => {
            const name = Array.isArray(p.cmd) ? p.cmd[0] : p.cmd;
            const aliases = Array.isArray(p.cmd) ? p.cmd.slice(1) : [];

            if (aliases.length > 0) {
              const formattedAliases = aliases
                .map((a) => `\`${a}\``)
                .join(", ");
              menuText += `> ${prefix || ""}${name} ${formattedAliases}\n`;
            } else {
              menuText += `> ${prefix || ""}${name}\n`;
            }
          });
        });
        menuText += `\n_Tip: gunakan ${prefix || ""}menu <command> untuk melihat detail command._`;

        return await m.reply(menuText.trim());
      }

      const plugin = handler.aliases.get(query.toLowerCase());

      if (!plugin) {
        const plugins = Array.from(handler.plugins.values());
        const categoryPlugins = plugins.filter(
          (p) =>
            (p.category || "Lainnya").toLowerCase() === query.toLowerCase(),
        );

        if (categoryPlugins.length === 0) {
          return m.reply(
            `_Command atau Kategori dengan nama *"${query}"* Tidak ditemukan/Tidak ada!_`,
          );
        }

        let menuText = `*♯ menu ${query.toLowerCase()}*\n`;
        const cmds = categoryPlugins.sort((a, b) => {
          const nameA = Array.isArray(a.cmd) ? a.cmd[0] : a.cmd;
          const nameB = Array.isArray(b.cmd) ? b.cmd[0] : b.cmd;
          return nameA.localeCompare(nameB);
        });

        cmds.forEach((p, i) => {
          const name = Array.isArray(p.cmd) ? p.cmd[0] : p.cmd;
          menuText += `> ${prefix || ""}${name} \n`;
        });

        return await m.reply(menuText.trim());
      }
      const name = Array.isArray(plugin.cmd) ? plugin.cmd[0] : plugin.cmd;
      const alias = Array.isArray(plugin.cmd) ? plugin.cmd.join(", ") : "-";

      let helpMsg = `*♯ COMMAND DETAILS*\n`;
      helpMsg += `> Command : ${name}\n`;
      helpMsg += `> Alias : ${alias}\n`;
      helpMsg += `> Category : ${plugin.category || "Lainnya"}\n`;
      helpMsg += `> Desc : ${plugin.desc || "Gak ada deskripsi buat command ini."}\n\n`;
      helpMsg += `_Tip: Gunakan *${prefix || ""}menu* untuk melihat semua list command._`;

      return await m.reply(helpMsg);
    }

    const plugins = Array.from(handler.plugins.values());
    const prefix = handler.prefix;
    const greeting = getGreeting();

    const totalCmds = plugins.filter((p) => p.cmd).length;
    let menuText = `> MODE : ${handler.mode.toUpperCase()}\n`;
    menuText += `> PREFIX : | ${prefix || "None"} |\n`;
    menuText += `> TOTAL : ${totalCmds} Commands\n`;
    menuText += `${readMore}\n`;

    const categories = {};
    plugins.forEach((p) => {
      const cat = p.category || "Lainnya";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(p);
    });

    const sortedCategories = Object.keys(categories).sort((a, b) =>
      a.localeCompare(b),
    );

    sortedCategories.forEach((cat) => {
      menuText += `*♯ menu ${cat.toLowerCase()}*\n`;

      const cmds = categories[cat].sort((a, b) => {
        const nameA = Array.isArray(a.cmd) ? a.cmd[0] : a.cmd;
        const nameB = Array.isArray(b.cmd) ? b.cmd[0] : b.cmd;
        return nameA.localeCompare(nameB);
      });

      cmds.forEach((p, i) => {
        const name = Array.isArray(p.cmd) ? p.cmd[0] : p.cmd;
        menuText += `> ${prefix || ""}${name}\n`;
      });
      menuText += ``;
    });

    const fs = (await import("fs")).default;
    const path = (await import("path")).default;

    let thumbSource;
    try {
      thumbSource = fs.readFileSync(path.join(process.cwd(), "thumb.jpg"));
    } catch (err) {
      console.error("Gagal membaca thumb.jpg:", err);
      // Placeholder transparan 1x1 jika thumb.jpg benar-benar tidak ada
      thumbSource = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64"
      );
    }

    const { prepareWAMessageMedia } = await import("baileys");

    let media;
    try {
      media = await prepareWAMessageMedia({ image: thumbSource }, { upload: sock.waUploadToServer });
    } catch (e) {
      console.error("Gagal prepare media:", e);
      media = { imageMessage: null };
    }

    const interactivePayload = {
      interactiveMessage: {
        header: {
          title: `*♯ MAIN MENU*`,
          subtitle: greeting,
          hasMediaAttachment: !!media?.imageMessage,
        },
        body: { text: menuText.trim() },
        footer: { text: `gunakan ${prefix || ""}menu <command> untuk detail` },
        contextInfo: {
          mentionedJid: [m.sender],
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: "120363401731165846@newsletter",
            serverMessageId: 142,
            newsletterName: "Cevl",
          },
        },
        nativeFlowMessage: {
          buttons: [
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "Channel",
                url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
                merchant_url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
              }),
            }
          ],
        },
      },
    };

    if (media?.imageMessage) {
      interactivePayload.interactiveMessage.header.imageMessage = media.imageMessage;
    }

    const isGroup = m.from.endsWith("@g.us");
    let nodes = [
      {
        tag: "biz",
        attrs: {},
        content: [
          {
            tag: "interactive",
            attrs: { type: "native_flow", v: "1" },
            content: [
              {
                tag: "native_flow",
                attrs: { v: "9", name: "mixed" },
              },
            ],
          },
        ],
      },
    ];

    if (!isGroup) {
      nodes.push({ tag: "bot", attrs: { biz_bot: "1" } });
    }

    const msgId = sock.generateMessageID ? sock.generateMessageID() : "YENVY_BTN_" + Math.random().toString(36).substring(7).toUpperCase();

    await sock.relayMessage(m.from, interactivePayload, {
      messageId: msgId,
      additionalNodes: nodes,
    });
  },
};




