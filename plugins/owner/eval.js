/**
 * plugins/owner/eval.js
 * Mengevaluasi skrip kode JavaScript secara runtime lewat obrolan (Universal Chat Style)
 */

import util from 'util';
import { exec } from 'child_process';

export default {
    cmd: ['eval', '>'],
    category: 'owner',
    desc: 'Evaluate JavaScript code',
    exec: async (m, { sock, query }) => {
        if (!m.isOwner) return;
        if (!query) return m.reply('Format salah! Masukkan kode skrip JavaScript yang ingin dievaluasi.');

        try {
            let evaled;
            try {
                evaled = await eval(query);
            } catch {
                evaled = await eval(`(async () => { ${query} })()`);
            }

            if (typeof evaled !== 'string') evaled = util.inspect(evaled, { depth: 1 });

            await m.reply(`${evaled}`);
        } catch (e) {
            await m.reply(`${String(e)}`);
        }
    }
};