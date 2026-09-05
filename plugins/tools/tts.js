/**
 * Adapted from Ginko project (https://github.com/ginkohub/mushi)
 * Credits to Google Translate TTS for text-to-speech API.
 */

export default {
    cmd: ['tts', 'tts?', 'gtts'],
    category: 'tools',
    desc: 'Convert text to speech audio',
    exec: async (m, { sock, args, command }) => {
        let lang = 'id';
        let text = '';

        if (command.endsWith('?')) {
            const helpText = [
                "*♯ TEXT TO SPEECH (TTS)*",
                `Gunakan \`${m.prefix}tts [kode_bahasa] [teks]\` atau \`${m.prefix}tts [teks]\`.`,
                "> 💡 *Contoh:* `" + m.prefix + "tts en Hello world` atau `" + m.prefix + "tts Halo dunia`",
            ];
            return m.reply(helpText.join('\n'));
        }

        // Cek apakah argumen pertama adalah kode bahasa 2 huruf (misal: id, en, jp)
        if (args.length > 0 && args[0].length === 2) {
            lang = args[0].toLowerCase();
            text = args.slice(1).join(' ');
        } else {
            text = args.join(' ');
        }

        // Ambil dari pesan yang di-quote jika teks kosong
        if (!text && m.quoted && m.quoted.text) {
            text = m.quoted.text;
        }

        text = text.replace(/[*_~`]/g, "").replace(/[\r\n]+/g, ". ").trim();

        if (!text) return m.reply('❌ Teks tidak boleh kosong!');
        if (text.length > 200) return m.reply('❌ Teks melebihi batas 200 karakter!');

        try {
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;
            const res = await fetch(ttsUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });

            if (!res.ok) throw new Error(`TTS API error: ${res.status}`);

            const buffer = await res.arrayBuffer();

            return await sock.sendMessage(m.from, {
                audio: Buffer.from(buffer),
                mimetype: 'audio/mp4',
                ptt: true
            }, { quoted: m });
        } catch (e) {
            console.error('[TTS_ERR]', e);
            return m.reply('❌ Gagal menghasilkan suara.');
        }
    }
};
