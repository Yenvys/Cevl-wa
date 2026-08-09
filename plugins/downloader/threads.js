import axios from 'axios';
import { res } from '../../lib/response.js';

export default {
    cmd: ['threads', 'thread', 'threadsmate'],
    category: 'download',
    desc: 'Download media (video/photo/GIF) dari Threads',
    exec: async (m, { sock, query, command }) => {
        if (!query) {
            return m.reply(`_Kirim tautan Threads yang valid!_\n\nContoh: *${m.prefix}${command} https://www.threads.net/...*`);
        }
        if (!/threads\.(net|com)/i.test(query)) {
            return m.reply('_Tautan tidak valid! Pastikan itu adalah tautan dari threads.net atau threads.com._');
        }

        await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        try {
            const apiKey = process.env.JEREXD_API_KEY;
            if (!apiKey) return m.reply("_JEREXD_API_KEY tidak dikonfigurasi di .env_");
            const apiUrl = `https://api.jerexd.my.id/api/downloader/sssthreads?apikey=${apiKey}&url=${encodeURIComponent(query)}`;
            const { data } = await axios.get(apiUrl);

            if (!data || data.status !== true) {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                return m.reply(`_Gagal mengambil media. Error API:* \`\`\`${data?.error || 'Respons API tidak valid.'}\`\`\``);
            }

            const result = data.result;
            if (!result || !result.media) {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                return m.reply(res.error);
            }

            let medias = result.media.map(item => ({
                url: item.download,
                type: item.type === 'video' ? 'video' : 'image'
            }));

            medias = medias.filter(m => typeof m.url === 'string' && m.url.startsWith('http'));

            if (medias.length === 0) {
                await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                return m.reply('_Gagal memuat media. Pastikan tautan berisi video/foto/GIF dan bersifat publik._');
            }

            const authorText = result.author ? `*@${result.author.username}*: ${result.author.caption}\n\n` : '';
            const capt = `*THREADS DOWNLOADER*\n\n${authorText}_Diproses dari sssthreads._`;

            if (medias.length > 1) {
                const albumMedia = [];
                for (let mediaObj of medias) {
                    const isVideo = mediaObj.type === 'video' || mediaObj.url.includes('.mp4');
                    albumMedia.push({
                        [isVideo ? 'video' : 'image']: { url: mediaObj.url },
                        mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                    });
                }

                await m.reply(capt + `\n\n_Mengirim berkas album (${medias.length} media)..._`);

                for (let media of albumMedia) {
                    await sock.sendMessage(m.from, media, { quoted: m });
                }
            } else {
                const mediaObj = medias[0];
                const isVideo = mediaObj.type === 'video' || mediaObj.url.includes('.mp4');
                
                await sock.sendMessage(m.from, {
                    [isVideo ? 'video' : 'image']: { url: mediaObj.url },
                    caption: capt,
                    mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                }, { quoted: m });
            }

            await sock.sendMessage(m.from, { react: { text: '✅', key: m.key } });

        } catch (err) {
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            
            if (err.response && err.response.data) {
                const apiErr = err.response.data.error || 'Server Error';
                console.error(`[THREADS_DL_ERR] API returned ${err.response.status}: ${apiErr}`);
                await m.reply(`_Gagal memproses media karena API sedang gangguan._\n\n*Log Error:* \`\`\`${apiErr}\`\`\``);
            } else {
                console.error('[THREADS_DL_ERR]', err.message);
                await m.reply(`_Terjadi kesalahan saat menghubungi API:_ ${err.message}`);
            }
        }
    }
};
