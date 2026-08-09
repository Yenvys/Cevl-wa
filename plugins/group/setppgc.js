/**
 * plugins/grup/setppgc.js
 * Mengubah foto profil grup (Universal Chat Style)
 */

import { getMedia } from '../../lib/helper.js';
import { res } from '../../lib/response.js';


export default {
    cmd: ['setppgc', 'setppgroup'],
    category: 'grup',
    desc: 'Ganti foto profil grup (Admin Only)',
    exec: async (m, { sock, isAdmin, isBotAdmin }) => {
        if (!m.isGroup) return m.reply(res.group);
        
        if (!isBotAdmin) {
            const metadata = await sock.groupMetadata(m.from).catch(() => ({ participants: [] }));
            const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const botParticipant = metadata.participants.find(p => p.id === botNumber);
            isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
        }
        
        if (!isAdmin && !m.isOwner) return m.reply(res.owner);
        if (!isBotAdmin) return m.reply(res.error);

        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || '';

        if (!/image/.test(mime)) return m.reply(res.format(m.prefix, command, `[reply/kirim gambar]`));

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

        try {
            const { buffer } = await getMedia(m, sock);
            if (!buffer) {
                await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
                return m.reply(res.error);
            }

            await sock.updateProfilePicture(m.from, buffer);
            await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
        } catch (e) {
            console.error('[SETPPGC_ERR]', e);
            await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
            await m.reply(res.error);
        }
    }
};