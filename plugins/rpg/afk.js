import { setAfk } from '../../src/database.js';

export default {
    cmd: ['afk'],
    category: 'rpg',
    desc: 'Set status kamu menjadi AFK (Away From Keyboard)',
    exec: async (m, { args }) => {
        const reason = args.join(' ') || 'Tanpa alasan';
        const time = Date.now();

        setAfk(m.sender, reason, time);

        return m.reply(`*♯ AFK*\n> @${m.sender.split('@')[0]} sekarang sedang AFK.\n> *Alasan:* ${reason}\n_Jangan ganggu dulu._`);
    }
};
