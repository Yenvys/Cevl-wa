/**
 * plugins/owner/eval.js
 * Mengevaluasi skrip kode JavaScript secara runtime lewat obrolan (Universal Chat Style)
 * Dilengkapi timeout 10 detik untuk mencegah infinite loop
 */

import util from 'util';

export default {
    cmd: ['eval', '>'],
    category: 'owner',
    desc: 'Evaluate JavaScript code (timeout: 10s)',
    exec: async (m, { sock, query }) => {
        if (!m.isOwner) return;
        if (!query) return m.reply('Format salah! Masukkan kode skrip JavaScript yang ingin dievaluasi.');

        const TIMEOUT_MS = 10000;

        try {
            const result = await Promise.race([
                (async () => {
                    let evaled;
                    try {
                        evaled = await eval(query);
                    } catch {
                        evaled = await eval(`(async () => { ${query} })()`);
                    }
                    return evaled;
                })(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('⏱️ Timeout: Eksekusi melebihi 10 detik.')), TIMEOUT_MS)
                )
            ]);

            const output = typeof result !== 'string' ? util.inspect(result, { depth: 1 }) : result;
            await m.reply(`${output}`);
        } catch (e) {
            await m.reply(`${String(e)}`);
        }
    }
};