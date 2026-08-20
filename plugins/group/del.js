import { res } from '../src/response.js';

export default {
    cmd: ['del', 'delete'],
    category: 'grup',
    desc: 'Hapus pesan di grup (reply pesan yang ingin dihapus)',
    exec: async (m, { sock }) => {
        if (!m.isGroup) return m.reply(res.group);
        if (!m.isOwner && !m.isAdmin) return m.reply('_kamu bukan admin/owner!_');
        if (!m.isBotAdmin) return m.reply('_Bot bukan admin/owner!_');
        if (!m.quoted) return m.reply('_Reply pesan yang ingin dihapus!_');

        try {
            await sock.sendMessage(m.from, {
                delete: {
                    remoteJid: m.from,
                    fromMe: false,
                    id: m.quoted.id,
                    participant: m.quoted.sender
                }
            });
        } catch (e) {
            m.adReply('Gagal hapus pesan! Pastikan bot adalah admin.');
        }
    }
};
