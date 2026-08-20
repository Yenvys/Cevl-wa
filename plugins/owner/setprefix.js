import { res } from '../../src/response.js';

/**
 * plugins/owner/setprefix.js
 * Mengubah prefix bot
 */

export default {
    cmd: ['setprefix', 'prefix'],
    category: 'owner',
    desc: 'Mengubah prefix (awalan) perintah bot.',
    exec: async (m, { handler, args }) => {
        if (!m.isOwner) return m.reply(res.owner);

        if (!args[0]) {
            let helpText = `*PREFIX BOT*\n`;
            helpText += `> Prefix Aktif: *${handler.prefix.join(', ')}*\n\n`;
            helpText += `*Cara mengubah:* \n`;
            helpText += `│ ◦ ${m.prefix}setprefix ! \n`;
            helpText += `│ ◦ ${m.prefix}setprefix . / ! \n`;
            helpText += `╰────────────────────────────`;
            return m.reply(helpText);
        }

        const newPrefixes = m.query.split(' ').map(p => p.trim()).filter(Boolean);
        
        await handler.changePrefix(newPrefixes);
        
        return m.reply(`_Sukses! Prefix bot berhasil diubah ke: *${newPrefixes.join(', ')}*_`);
    }
};
