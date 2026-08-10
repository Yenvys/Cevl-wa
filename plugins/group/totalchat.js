import { res } from '../../lib/response.js';
import { getGroupMessages } from '../../lib/database.js';

export default {
    cmd: ['totalchat', 'tc', 'topchat'],
    category: 'grup',
    desc: 'Melihat klasemen total pesan (chat) dari setiap member di grup ini.',
    exec: async (m, { sock }) => {
        if (!m.isGroup) return m.reply(res.group);
        
        try {
            const messages = getGroupMessages(m.from);
            
            if (!messages || messages.length === 0) {
                return m.reply('_Belum ada data chat yang terekam di grup ini._');
            }
            
            const metadata = await sock.groupMetadata(m.from).catch(() => ({ subject: 'Grup Ini' }));
            
            let tagText = `*📊 TOTAL CHAT LEADERBOARD*\n*Grup:* ${metadata.subject}\n\n`;
            let mentions = [];
            
            messages.forEach((row, index) => {
                const jid = row.user_jid;
                const count = row.count;
                
                // Emoji piala untuk top 3
                let medal = '';
                if (index === 0) medal = ' 🥇';
                else if (index === 1) medal = ' 🥈';
                else if (index === 2) medal = ' 🥉';
                
                tagText += `*${index + 1}.* @${jid.split('@')[0]}${medal} : ${count} pesan\n`;
                mentions.push(jid);
            });
            
            tagText += `\n_Catatan: Data ini mulai dihitung sejak bot aktif merekam chat._`;
            
            await sock.sendMessage(m.from, { text: tagText, mentions }, { quoted: m });
        } catch (e) {
            console.error('[TOTALCHAT_ERR]', e);
            m.reply('_Gagal memuat data total chat._');
        }
    }
};
