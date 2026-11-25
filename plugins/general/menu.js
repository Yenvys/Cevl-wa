import fs from "node:fs";
import path from "node:path";
import { prepareWAMessageMedia } from "baileys";

const getGreeting = () => {
  const hour = parseInt(
    new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }),
    10
  );
  if (hour >= 5 && hour < 11) return "Selamat Pagi";
  if (hour >= 11 && hour < 15) return "Selamat Siang";
  if (hour >= 15 && hour < 18) return "Selamat Sore";
  return "Selamat Malam";
};

const readMore = String.fromCharCode(8206).repeat(4001);

const groupPluginsByCategory = (plugins) => {
  const map = {};
  for (const p of plugins) {
    if (!p.cmd) continue;
    const cat = p.category || "Lainnya";
    if (!map[cat]) map[cat] = [];
    map[cat].push(p);
  }
  return map;
};

export default {
  cmd: ["menu", "help", "h"],
  category: "system",
  desc: "Menampilkan daftar menu perintah bot",
  exec: async (m, { sock, handler, query }) => {
    const prefix = typeof m.prefix === "string" ? m.prefix : (handler.prefix?.[0] ?? "");
    const displayPrefix = handler.prefix?.filter(Boolean).join(" ") || (prefix || "none");
    const q = (query || "").trim().toLowerCase();

    // 1. Category list view
    if (q === "cat" || q === "category") {
      const categories = [...new Set(Array.from(handler.plugins.values()).map((p) => p.category || "Lainnya"))].sort();
      let text = `*♯ CATEGORY LIST*\n${categories.map((c) => `> ♯${c}`).join("\n")}\n\n_Tip: Gunakan ${prefix ? `${prefix}menu` : "menu"} <category> untuk melihat command di dalam category._`;
      return m.reply(text);
    }

    // 2. Aliases view
    if (q === "alias" || q === "aliases") {
      const unique = Array.from(new Set(handler.plugins.values())).filter((p) => p.cmd);
      const catMap = groupPluginsByCategory(unique);

      let text = `*♯ ALIAS MENU*\n> MODE : ${handler.mode.toUpperCase()}\n> PREFIX : | ${displayPrefix} |\n> TOTAL : ${unique.length} Commands\n${readMore}\n`;
      for (const cat of Object.keys(catMap).sort()) {
        text += `\n*♯ ${prefix ? `${prefix}menu` : "menu"} ${cat.toLowerCase()}*\n`;
        const sorted = catMap[cat].sort((a, b) => (Array.isArray(a.cmd) ? a.cmd[0] : a.cmd).localeCompare(Array.isArray(b.cmd) ? b.cmd[0] : b.cmd));
        for (const p of sorted) {
          const name = Array.isArray(p.cmd) ? p.cmd[0] : p.cmd;
          const aliases = Array.isArray(p.cmd) ? p.cmd.slice(1) : [];
          text += aliases.length ? `> ${prefix}${name} ${aliases.map((a) => `\`${a}\``).join(", ")}\n` : `> ${prefix}${name}\n`;
        }
      }
      return m.reply(`${text.trim()}\n\n_Tip: Gunakan ${prefix ? `${prefix}menu` : "menu"} <command> untuk melihat detail command._`);
    }

    // 3. Command detail or Category detail view
    if (q) {
      const plugin = handler.aliases.get(q);
      if (plugin) {
        const name = Array.isArray(plugin.cmd) ? plugin.cmd[0] : plugin.cmd;
        const alias = Array.isArray(plugin.cmd) ? plugin.cmd.join(", ") : "-";
        return m.reply(
          `*♯ COMMAND DETAILS*\n> Command : ${name}\n> Alias : ${alias}\n> Category : ${plugin.category || "Lainnya"}\n> Desc : ${plugin.desc || "Tidak ada deskripsi."}\n\n_Tip: Gunakan *${prefix ? `${prefix}menu` : "menu"}* untuk melihat semua menu._`
        );
      }

      const catPlugins = Array.from(handler.plugins.values()).filter(
        (p) => (p.category || "Lainnya").toLowerCase() === q
      );
      if (catPlugins.length) {
        let text = `*♯ ${prefix ? `${prefix}menu` : "menu"} ${q}*\n`;
        const sorted = catPlugins.sort((a, b) => (Array.isArray(a.cmd) ? a.cmd[0] : a.cmd).localeCompare(Array.isArray(b.cmd) ? b.cmd[0] : b.cmd));
        for (const p of sorted) {
          const name = Array.isArray(p.cmd) ? p.cmd[0] : p.cmd;
          text += `> ${prefix}${name}\n`;
        }
        return m.reply(text.trim());
      }

      return m.reply(`_Command atau Kategori dengan nama *"${query}"* tidak ditemukan!_`);
    }

    // 4. Main Menu View
    const unique = Array.from(new Set(handler.plugins.values())).filter((p) => p.cmd);
    const catMap = groupPluginsByCategory(unique);

    let menuText = `> MODE : ${handler.mode.toUpperCase()}\n> PREFIX : | ${displayPrefix} |\n> TOTAL : ${unique.length} Commands\n${readMore}\n`;
    for (const cat of Object.keys(catMap).sort()) {
      menuText += `\n*♯ ${prefix ? `${prefix}menu` : "menu"} ${cat.toLowerCase()}*\n`;
      const sorted = catMap[cat].sort((a, b) => (Array.isArray(a.cmd) ? a.cmd[0] : a.cmd).localeCompare(Array.isArray(b.cmd) ? b.cmd[0] : b.cmd));
      for (const p of sorted) {
        const name = Array.isArray(p.cmd) ? p.cmd[0] : p.cmd;
        menuText += `> ${prefix}${name}\n`;
      }
    }

    let thumbSource;
    try {
      thumbSource = fs.readFileSync(path.join(process.cwd(), "thumb.jpg"));
    } catch {
      thumbSource = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    }

    let media;
    try {
      media = await prepareWAMessageMedia({ image: thumbSource }, { upload: sock.waUploadToServer });
    } catch {
      media = { imageMessage: null };
    }

    const interactivePayload = {
      interactiveMessage: {
        header: {
          title: `*♯ MAIN MENU*`,
          subtitle: getGreeting(),
          hasMediaAttachment: !!media?.imageMessage,
          ...(media?.imageMessage ? { imageMessage: media.imageMessage } : {}),
        },
        body: { text: menuText.trim() },
        footer: { text: `Gunakan ${prefix ? `${prefix}menu` : "menu"} <command> untuk detail` },
        contextInfo: {
          mentionedJid: [m.sender],
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
            },
          ],
        },
      },
    };

    const isGroup = m.from.endsWith("@g.us");
    const additionalNodes = [
      {
        tag: "biz",
        attrs: {},
        content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }],
      },
      ...(!isGroup ? [{ tag: "bot", attrs: { biz_bot: "1" } }] : []),
    ];

    const msgId = sock.generateMessageID?.() || `YENVY_BTN_${Math.random().toString(36).slice(2).toUpperCase()}`;
    await sock.relayMessage(m.from, interactivePayload, { messageId: msgId, additionalNodes });
  },
};
