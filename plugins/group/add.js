import { res } from '../../src/response.js';

/**
 * plugins/grup/add.js
 * Menambahkan anggota baru ke dalam grup (Universal Chat Style)
 */

export default {
    cmd: ['add', 'tambah'],
    category: 'grup',
    desc: 'Menambahkan member ke grup',
    exec: async (m, { sock }) => {
        if (!m.isGroup) return m.reply(res.group);
        if (!m.isOwner && !m.isAdmin) return m.reply('_kamu bukan admin/owner!_');
        if (!m.isBotAdmin) return m.reply('_Bot bukan admin/owner!_');

        let users = m.quoted ? [m.quoted.sender] : m.mentionedJid || [];
        if (m.query && !users.length) users.push(m.query.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
        if (!users.length) return m.reply(res.format(m.prefix, command, `@tag/reply pesan/nomor`));

        try {
            for (let jid of users) {
                await sock.groupParticipantsUpdate(m.from, [jid], 'add');
            }
            await sock.sendMessage(m.from, { react: { text: '', key: m.key } });
        } catch (e) {
            console.error('[ADD_MEMBER_ERR]', e);
            await m.reply(res.error);
        }
    }
};