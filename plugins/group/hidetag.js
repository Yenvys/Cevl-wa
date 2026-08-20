import { res } from '../src/response.js';

export default {
    cmd: ['hidetag', 'ht', 'pengumuman'],
    category: 'grup',
    desc: 'Tag semua member secara sembunyi (Hanya Admin/Owner)',
    exec: async (m, { sock, args }) => {
        if (!m.isGroup) return m.reply(res.group);
        if (!m.isAdmin && !m.isOwner) return m.reply('_kamu bukan admin/owner!_');
        
        let target = m;
        let text = args.join(' ');
        
        if (!text && m.quoted) {
            text = m.quoted.text || m.quoted.body || m.quoted.caption || '';
            target = m.quoted;
        }
        if (!text) text = '📢 Pengumuman!';
        
        try {
            const groupMetadata = await sock.groupMetadata(m.from);
            const mentions = groupMetadata.participants.map(v => v.id);
            
            const isMedia = target.mimetype && (target.mimetype.startsWith('image/') || target.mimetype.startsWith('video/'));
            
            if (isMedia && target.download) {
                try {
                    const media = await target.download();
                    if (media) {
                        const isVid = target.mimetype.startsWith('video/');
                        await sock.sendMessage(m.from, { [isVid ? 'video' : 'image']: media, caption: text, mentions });
                        return;
                    }
                } catch (e) {
                    console.error('[HIDETAG_MEDIA_ERR]', e);
                }
            }
            
            await sock.sendMessage(m.from, { text: text, mentions });
        } catch (e) {
            console.error('[HIDETAG_ERR]', e);
            m.reply('_Gagal melakukan hidetag._');
        }
    }
};
