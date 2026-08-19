/**
 * Apple Music Search & Download
 * from: Omegatech
 * Version: 2.3
 * Description: Search and download music from Apple Music with interactive buttons
 */

import axios from 'axios';
import { prepareWAMessageMedia } from 'baileys';

const activeDownloads = new Set();

async function handleDownload(m, sock, query, num) {
    const downloadKey = `${m.sender}_${query}_${num}`;
    if (activeDownloads.has(downloadKey)) {
        return m.reply('⏳ Download already in progress...');
    }
    activeDownloads.add(downloadKey);

    try {
        if (!global.db) global.db = { data: {} };
        const appleMusicData = global.db.data.appleMusic?.[m.sender];
        let results = appleMusicData?.results || [];
        let searchQuery = appleMusicData?.query || query;

        if (!appleMusicData || results.length === 0) {
            try {
                const searchUrl = `https://api.omegatech.app/api/Search/Applemusic?action=search&query=${encodeURIComponent(query)}`;
                const { data: searchData } = await axios.get(searchUrl, { timeout: 30000 });

                if (!searchData.success || !searchData.data.results || searchData.data.results.length === 0) {
                    return m.reply(`❌ No results found for *${query}* on Apple Music.`);
                }

                results = searchData.data.results;
                searchQuery = query;

                if (!global.db.data.appleMusic) global.db.data.appleMusic = {};
                global.db.data.appleMusic[m.sender] = {
                    results: results,
                    query: query,
                    timestamp: Date.now()
                };
            } catch (e) {
                return m.reply(`❌ Error searching. Please try again.`);
            }
        }

        if (appleMusicData && Date.now() - appleMusicData.timestamp > 300000) {
            delete global.db.data.appleMusic[m.sender];
            return m.reply('⏰ Search results expired. Please search again.');
        }

        const selectedSong = results[num - 1];
        if (!selectedSong) {
            return m.reply(`❌ Song #${num} not found. Please search again.`);
        }

        if (!global.db.data.downloading) global.db.data.downloading = {};
        if (global.db.data.downloading[m.sender]) {
            return m.reply('⏳ Please wait for your current download to finish.');
        }

        global.db.data.downloading[m.sender] = true;

        await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        const downloadUrl = `https://api.omegatech.app/api/Search/Applemusic?action=download&query=${encodeURIComponent(searchQuery)}&url=${encodeURIComponent(selectedSong.url)}`;
        const { data: downloadData } = await axios.get(downloadUrl, { timeout: 60000 });

        if (!downloadData.success || !downloadData.data.downloadUrl) {
            throw new Error('Failed to get download URL');
        }

        const audioUrl = downloadData.data.downloadUrl;
        const title = downloadData.data.title || selectedSong.title;
        const artist = downloadData.data.artist || selectedSong.artist;

        await sock.sendMessage(m.from, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: `${title}.mp3`,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363401731165846@newsletter',
                    serverMessageId: 142,
                    newsletterName: 'Cevl'
                }
            }
        }, { quoted: m });

        if (global.db.data.appleMusic) {
            delete global.db.data.appleMusic[m.sender];
        }

    } catch (error) {
        console.error('Download error:', error);
        await m.reply(`❌ Failed to download song. Please try again later.`);
    } finally {
        if (global.db && global.db.data && global.db.data.downloading) {
            delete global.db.data.downloading[m.sender];
        }
        activeDownloads.delete(downloadKey);
    }
}

export default {
    cmd: ['song', 'apple'],
    category: 'search',
    desc: 'Search and play music from Apple Music',
    exec: async (m, { sock, query, command }) => {
        if (!query) {
            return m.reply(`🎵 *Apple Music Player*\n\nPlease provide a song name or artist.\n\nExample: .${command} Alone\n.${command} Marshmello Alone`);
        }

        const parts = query.split(' ');
        const lastPart = parts[parts.length - 1];
        const isNumber = /^\d+$/.test(lastPart);

        if (isNumber) {
            const actualQuery = parts.slice(0, -1).join(' ');
            const num = parseInt(lastPart);
            return await handleDownload(m, sock, actualQuery, num);
        }

        await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        try {
            const searchUrl = `https://api.omegatech.app/api/Search/Applemusic?action=search&query=${encodeURIComponent(query)}`;
            const { data: searchData } = await axios.get(searchUrl, { timeout: 30000 });

            if (!searchData.success || !searchData.data.results || searchData.data.results.length === 0) {
                return m.reply(`❌ No results found for *${query}* on Apple Music.`);
            }

            const results = searchData.data.results;
            const total = searchData.data.total || results.length;

            if (!global.db) global.db = { data: {} };
            if (!global.db.data.appleMusic) global.db.data.appleMusic = {};
            global.db.data.appleMusic[m.sender] = {
                results: results,
                query: query,
                timestamp: Date.now()
            };

            const buttons = [{
                name: "single_select",
                buttonParamsJson: JSON.stringify({
                    title: "Select a Song",
                    sections: [{
                        title: "Select to Download",
                        rows: results.slice(0, 5).map((song, index) => ({
                            id: `.${command} ${query} ${index + 1}`,
                            title: `${song.title} - ${song.artist}`,
                        }))
                    }]
                })
            }];

            buttons.push({
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: "📢 Channel",
                    url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
                    webview_interaction: true,
                    icon: "default"
                })
            });

            let imageMessage;
            try {
                if (results[0]?.cover) {
                    const coverUrl = results[0].cover.replace('.webp', '.jpg');
                    const response = await axios.get(coverUrl, { responseType: 'arraybuffer' });
                    const buffer = Buffer.from(response.data);
                    const media = await prepareWAMessageMedia(
                        { image: buffer },
                        { upload: sock.waUploadToServer }
                    );
                    imageMessage = media.imageMessage;
                }
            } catch (e) {
                console.error('Failed to prepare image:', e);
            }

            const interactiveMsg = {
                interactiveMessage: {
                    header: {
                        title: `${total} Results for "${query}"`,
                        hasMediaAttachment: !!imageMessage
                    },
                    body: {
                        text: `📌 *Select a song to download:*\n${results.slice(0, 5).map((song, i) =>
                            `> ${i + 1}. *${song.title}* - ${song.artist}`
                        ).join('\n')}\n${results.length > 5 ? `\n📌 *Showing first 5 of ${total} results*` : ''}`
                    },
                    footer: {
                        text: "_Cevl_"
                    },
                    contextInfo: {
                        mentionedJid: [m.sender],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363401731165846@newsletter',
                            serverMessageId: 142,
                            newsletterName: 'Cevl'
                        }
                    },
                    nativeFlowMessage: {
                        buttons: buttons
                    }
                }
            };

            if (imageMessage) {
                interactiveMsg.interactiveMessage.header.imageMessage = imageMessage;
            }

            await sock.relayMessage(
                m.from,
                interactiveMsg,
                {
                    additionalNodes: [
                        {
                            tag: "biz",
                            attrs: {},
                            content: [
                                {
                                    tag: "interactive",
                                    attrs: {
                                        type: "native_flow",
                                        v: "1"
                                    },
                                    content: [
                                        {
                                            tag: "native_flow",
                                            attrs: {
                                                v: "9",
                                                name: "mixed"
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            );

        } catch (error) {
            console.error('Apple Music Error:', error);
            await m.reply(`❌ Error searching Apple Music. Please try again later.`);
        }
    }
};
