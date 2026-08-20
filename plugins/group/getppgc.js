import { res } from '../src/response.js';

/**
 * plugins/grup/getppgc.js
 * Mengambil foto profil grup saat ini (Universal Chat Style)
 */

export default {
    cmd: ['getppgc'],
    category: 'grup',
    desc: 'Ambil foto profil grup saat ini.',
    exec: async (m, { sock }) => {
        if (!m.isGroup) return m.reply(res.group);

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        try {
            const ppUrl = await sock.profilePictureUrl(m.from, 'image').catch(() => null);

            if (!ppUrl) {
                await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
                return m.reply('_Grup ini tidak menggunakan foto profil, atau bot tidak memiliki akses._');
            }

            await sock.sendMessage(m.from, { 
                image: { url: ppUrl }, 
                caption: `*GROUP PROFILE PICTURE*\n\n> *Grup:* ${m.groupName}\n> ${ppUrl}` 
            }, { quoted: m });

            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });

        } catch (e) {
            console.error('[PPGC_ERR]', e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply('Terjadi kesalahan saat mengambil foto profil grup.');
        }
    }
};