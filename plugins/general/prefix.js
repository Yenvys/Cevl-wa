/**
 * plugins/system/prefix.js
 * Mengubah prefix operasional bot secara permanen (Universal Chat Style)
 */

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { res } from '../src/response.js';


export default {
    cmd: ['prefix', 'prefixes', 'setprefix'],
    category: 'system',
    desc: 'Ganti prefix bot secara permanen',
    async exec(m, { handler, args, query, command }) {
        if (!m.isOwner) return m.reply(res.owner);

        if (!query) {
            const currentPrefix = Array.isArray(handler.prefix) ? handler.prefix.join(', ') : handler.prefix;
            let guideText = `Prefix bot saat ini: *[ ${currentPrefix} ]*\n\n`;
            guideText += `*Panduan Penggunaan:*\n`;
            guideText += `│ ◦ ${m.prefix}prefix <simbol> - Mengatur satu prefix (contoh: ${m.prefix}prefix !)\n`;
            guideText += `│ ◦ ${m.prefix}prefixes <simbol1>,<simbol2> - Mengatur multi prefix (contoh: ${m.prefix}prefixes !,.,#)\n`;
            guideText += `│ ◦ ${m.prefix}prefix none - Menghapus prefix (tanpa prefix)\n`;
            guideText += `╰───────────────────────────`;
            return m.reply(guideText);
        }

        let newPrefix;
        if (query.toLowerCase() === 'none') {
            newPrefix = [""]; 
        } else if (command.toLowerCase() === 'prefixes') {
            newPrefix = query.split(',').map(v => v.trim()).filter(v => v !== "");
        } else {
            newPrefix = [query.trim()];
        }

        handler.prefix = newPrefix;

        const configPath = path.join(process.cwd(), 'config.js');
        try {
            let content = fs.readFileSync(configPath, 'utf8');
            const regexPrefix = /(['"]?)prefix\1\s*:\s*\[[\s\S]*?\]/;
            
            if (!regexPrefix.test(content)) {
                return m.reply(res.error);
            }

            const updatedContent = content.replace(
                regexPrefix,
                `"prefix": ${JSON.stringify(newPrefix)}`
            );

            fs.writeFileSync(configPath, updatedContent, 'utf8');
            const displayPrefix = newPrefix.join(', ') || 'None';
            await m.reply(`_Prefix bot berhasil diubah menjadi: \`${displayPrefix}\`_`);

        } catch (e) {
            console.error('[PREFIX_SAVE_ERR]', e);
            await m.reply(res.error);
        }
    }
};