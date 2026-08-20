import { res } from '../src/response.js';

/**
 * plugins/tools/getpp.js
 * Mengambil foto profil pengguna WhatsApp (Universal Chat Style)
 */

export default {
    cmd: ['getpp', 'pp', 'foto'],
    category: 'tools',
    desc: 'Mengambil foto profil target.',
    exec: async (m, { sock }) => {
        let target = m.quoted ? m.quoted.sender : (m.mentionedJid?.[0] || m.sender);

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        try {
            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(target, 'image');
            } catch {
                ppUrl = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
            }

            await sock.sendMessage(m.from, { 
                image: { url: ppUrl }, 
                caption: `_JID:* @${target.split('@')[0]}_`,
                mentions: [target]
            }, { quoted: m });

            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });

        } catch (e) {
            console.error('[GETPP_ERR]', e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
        }
    }
};