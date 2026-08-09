/**
 * plugins/grup/kick.js
 * Mengeluarkan anggota dari dalam grup (Universal Chat Style)
 */

import db from '../../lib/database.js';
import { res } from '../../lib/response.js';


export default {
    cmd: ['kick'],
    category: 'grup',
    desc: 'Mengeluarkan member dari grup',
    exec: async (m, { sock }) => {
        if (!m.isGroup) return; 
        if (!m.isOwner && !m.isAdmin) return m.reply('_Anda bukan admin atau owner grup._');
        if (!m.isBotAdmin) return m.reply(res.error);

        let target = m.mentionedJid?.[0] || m.quoted?.sender || (m.query ? m.query.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
        if (!target || target.length < 10) return m.reply(res.format(m.prefix, command, `@tag/reply pesan`));
        if (target.includes(sock.user.id.split(':')[0])) return m.reply(res.owner);

        try {
            await sock.groupParticipantsUpdate(m.from, [target], 'remove');
            await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
        } catch (e) {
            console.error('[KICK_MEMBER_ERR]', e);
            await m.reply(res.error);
        }
    }
};