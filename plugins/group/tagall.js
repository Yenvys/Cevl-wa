import { res } from '../../lib/response.js';

export default {
    cmd: ['tagall', 'everyone'],
    category: 'grup',
    desc: 'Tag semua member di grup (Hanya Admin/Owner)',
    exec: async (m, { sock, args }) => {
        if (!m.isGroup) return m.reply(res.group);
        if (!m.isAdmin && !m.isOwner) return m.reply('_kamu bukan admin/owner!_');
        
        let target = m;
        let text = args.join(' ');
        
        if (!text && m.quoted) {
            text = m.quoted.text || m.quoted.body || m.quoted.caption || '';
            target = m.quoted;
        }
        if (!text) text = '📢 Panggilan Grup!';
        
        try {
            const groupMetadata = await sock.groupMetadata(m.from);
            const participants = groupMetadata.participants;
            
            let tagText = `*📢 MENTION ALL*\n\n*Pesan:* ${text}\n\n*Daftar Member:*\n`;
            let mentions = [];
            
            for (let mem of participants) {
                tagText += ` ◦ @${mem.id.split('@')[0]}\n`;
                mentions.push(mem.id);
            }
            
            await sock.sendMessage(m.from, { text: tagText, mentions }, { quoted: m });
        } catch (e) {
            console.error('[TAGALL_ERR]', e);
            m.reply('_Gagal melakukan tagall._');
        }
    }
};
