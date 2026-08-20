import { getMedia } from '../src/helper.js';

export default {
    cmd: ['setpp'],
    category: 'owner',
    desc: 'Ganti foto profil bot lewat gambar/reply gambar',
    exec: async (m, { sock, args }) => {
        if (!m.isOwner) return m.adReply('Fitur ini cuma buat owner.');

        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || '';

        if (!/image/.test(mime)) return m.reply(`Kirim/reply gambar terus ketik .setpp.`);

        try {
            const { buffer } = await getMedia(m, sock);
            
            if (args[0] === 'full') {
                const sharp = (await import('sharp')).default;
                const image = sharp(buffer);
                const { width, height } = await image.metadata();
               
                const finalBuffer = await image
                    .resize(640, 640, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .toBuffer();

                await sock.query({
                    tag: 'iq',
                    attrs: {
                        to: sock.user.id,
                        type: 'set',
                        xmlns: 'w:profile:picture'
                    },
                    content: [
                        {
                            tag: 'picture',
                            attrs: { type: 'image' },
                            content: finalBuffer
                        }
                    ]
                });
            } else {
                await sock.updateProfilePicture(sock.user.id, buffer);
            }

           await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
        } catch (e) {
            console.error(e);
            m.adReply(`Gagal: ${e.message}`);
        }
    }
};