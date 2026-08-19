/**
 * Akwam Movie & Series Search & Download
 * from: Omegatech
 * Version: 1.5
 * Description: Search and download movies/series from Akwam
 */

import axios from 'axios';
import crypto from 'crypto';
import { prepareWAMessageMedia } from 'baileys';

const CLOUDINARY_IMAGE = 'https://files.catbox.moe/r5qcku.jpg';
const CLOUDINARY_THUMB = 'https://files.catbox.moe/r5qcku.jpg';

async function searchMovies(query) {
    const url = `https://api.omegatech.app/api/movie/Akwam?action=search&query=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, { timeout: 30000, validateStatus: () => true });
    if (!data || !data.success) return { results: [] };
    return data.data;
}

async function getMovieContent(movieUrl) {
    const apiUrl = `https://api.omegatech.app/api/movie/Akwam?action=content&url=${encodeURIComponent(movieUrl)}`;
    const { data } = await axios.get(apiUrl, { timeout: 30000, validateStatus: () => true });
    if (!data || !data.success) throw new Error('Failed to fetch content');
    return data.data;
}

async function getEpisodeContent(episodeUrl) {
    const apiUrl = `https://api.omegatech.app/api/movie/Akwam?action=episode&episode=${encodeURIComponent(episodeUrl)}`;
    const { data } = await axios.get(apiUrl, { timeout: 30000, validateStatus: () => true });
    if (!data || !data.success) throw new Error('Failed to fetch episode');
    return data.data;
}

async function resolveDownload(downloadPageUrl) {
    const apiUrl = `https://api.omegatech.app/api/movie/Akwam?action=resolve&download=${encodeURIComponent(downloadPageUrl)}`;
    const { data } = await axios.get(apiUrl, { timeout: 60000, validateStatus: () => true });
    if (!data || !data.success || !data.data || !data.data.directUrl) throw new Error('Failed to resolve download');
    return data.data;
}

async function sendRichResponse(sock, chatId, status, data, query, title, taggedUsers = []) {
    try {
        const messageSecret = crypto.randomBytes(32).toString('base64');
        const stanzaId = crypto.randomBytes(16).toString('hex').toUpperCase();
        const responseId = crypto.randomUUID();
        const isComplete = status === 'completed';
        const movie = data || {};
        const poster = movie.poster || CLOUDINARY_IMAGE;
        const movieTitle = movie.title || title || 'Untitled';
        const year = movie.year || 'N/A';
        const rating = movie.rating || 'N/A';
        const quality = movie.quality || 'N/A';
        const genres = movie.genres ? movie.genres.join(', ') : 'N/A';
        const description = movie.description || 'No description available.';
        const downloadLinks = movie.downloadLinks || [];

        const responseData = {
            "response_id": responseId,
            "sections": [
                {
                    "view_model": {
                        "primitive": {
                            "title": isComplete ? `🎬 ${movieTitle}` : "🎬 Searching...",
                            "brand": "Omegatech AI",
                            "price": isComplete ? `⭐ ${rating}` : "⏳ Loading",
                            "product_url": "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
                            "image": { "url": poster, "mime_type": "image/jpeg" },
                            "additional_images": [],
                            "__typename": "GenAIProductItemCardPrimitive"
                        },
                        "__typename": "GenAISingleLayoutViewModel"
                    },
                    "__typename": "GenAIUnifiedResponseSection"
                },
                {
                    "view_model": {
                        "primitive": {
                            "text": isComplete ?
                                `✅ *Movie Details*\n\n🎬 *Title:* ${movieTitle}\n📅 *Year:* ${year}\n⭐ *Rating:* ${rating}\n🎞️ *Quality:* ${quality}\n🎭 *Genres:* ${genres}\n📖 *Description:* ${description.substring(0, 200)}${description.length > 200 ? '...' : ''}\n\n📥 *Download Links:*\n${downloadLinks.map((l, i) => `${i + 1}. ${l.quality} (${l.size})`).join('\n')}` :
                                `⏳ *Fetching movie details...*\n\n🔍 *Query:* ${query}`,
                            "inline_entities": [],
                            "__typename": "GenAIMarkdownTextUXPrimitive"
                        },
                        "__typename": "GenAISingleLayoutViewModel"
                    },
                    "__typename": "GenAIUnifiedResponseSection"
                },
                {
                    "view_model": {
                        "primitive": {
                            "text": `📢 *Join Our Channel:*\nhttps://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J`,
                            "inline_entities": [
                                {
                                    "key": "CI_0",
                                    "metadata": {
                                        "reference_id": 1,
                                        "reference_url": "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
                                        "reference_title": "Cevl Channel",
                                        "reference_display_name": "📢 Join Channel",
                                        "sources": [],
                                        "__typename": "GenAISearchCitationItem"
                                    }
                                }
                            ],
                            "__typename": "GenAIMarkdownTextUXPrimitive"
                        },
                        "__typename": "GenAISingleLayoutViewModel"
                    },
                    "__typename": "GenAIUnifiedResponseSection"
                }
            ]
        };

        await sock.relayMessage(
            chatId,
            {
                messageContextInfo: {
                    messageSecret,
                    botMetadata: {
                        messageDisclaimerText: "Cevl Movie Search",
                        botResponseId: responseId
                    }
                },
                botForwardedMessage: {
                    message: {
                        richResponseMessage: {
                            messageType: 1,
                            unifiedResponse: {
                                data: Buffer.from(JSON.stringify(responseData)).toString('base64')
                            },
                            contextInfo: {
                                stanzaId,
                                participant: "23288461957@s.whatsapp.net",
                                quotedMessage: {
                                    extendedTextMessage: {
                                        text: query || "Movie search",
                                        previewType: 0,
                                        inviteLinkGroupTypeV2: 0
                                    }
                                },
                                forwardingScore: 1,
                                isForwarded: true,
                                expiration: 7776000,
                                forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" },
                                forwardOrigin: 4,
                                mentionedJid: taggedUsers,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363401731165846@newsletter',
                                    serverMessageId: 142,
                                    newsletterName: 'Cevl'
                                }
                            }
                        }
                    }
                }
            },
            {}
        );
        return true;
    } catch (e) {
        console.error('Rich response error:', e);
        return false;
    }
}

async function showSearchResults(sock, chatId, query, results, command, taggedUsers = []) {
    try {
        let imageMessage;
        try {
            const imgResp = await axios.get(CLOUDINARY_IMAGE, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(imgResp.data);
            const media = await prepareWAMessageMedia({ image: buffer }, { upload: sock.waUploadToServer });
            imageMessage = media.imageMessage;
        } catch (e) {
            console.error('Image prep failed:', e);
        }

        const rows = results.slice(0, 20).map((item, idx) => ({
            id: `.${command} ${query} --select ${idx}`,
            title: `${item.title} (${item.year})`,
            description: `${item.type} ⭐${item.rating} 🎞️${item.quality}`
        }));

        const selectButton = {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
                title: "🎬 Select Movie/Series",
                sections: [{
                    title: `Results for "${query}" (${results.length})`,
                    rows: rows
                }]
            })
        };

        const cancelButton = {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
                display_text: "📢 Channel",
                url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
                webview_interaction: true,
                icon: "default"
            })
        };

        const interactiveMsg = {
            interactiveMessage: {
                header: {
                    title: `🎬 Search Results: "${query}"`,
                    hasMediaAttachment: !!imageMessage
                },
                body: {
                    text: `📌 *Found ${results.length} results*\nSelect a movie/series from the dropdown below.`
                },
                footer: {
                    text: "_Cevl_"
                },
                contextInfo: {
                    mentionedJid: taggedUsers,
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363401731165846@newsletter',
                        serverMessageId: 142,
                        newsletterName: 'Cevl'
                    }
                },
                nativeFlowMessage: {
                    buttons: [selectButton, cancelButton]
                }
            }
        };

        if (imageMessage) {
            interactiveMsg.interactiveMessage.header.imageMessage = imageMessage;
        }

        await sock.relayMessage(
            chatId,
            interactiveMsg,
            {
                additionalNodes: [
                    {
                        tag: "biz",
                        attrs: {},
                        content: [
                            {
                                tag: "interactive",
                                attrs: { type: "native_flow", v: "1" },
                                content: [{
                                    tag: "native_flow",
                                    attrs: { v: "9", name: "mixed" }
                                }]
                            }
                        ]
                    }
                ]
            }
        );
        return true;
    } catch (e) {
        console.error('Search results error:', e);
        return false;
    }
}

async function showEpisodeSelection(sock, chatId, seriesTitle, episodes, query, command, taggedUsers = []) {
    try {
        let imageMessage;
        try {
            const imgResp = await axios.get(CLOUDINARY_IMAGE, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(imgResp.data);
            const media = await prepareWAMessageMedia({ image: buffer }, { upload: sock.waUploadToServer });
            imageMessage = media.imageMessage;
        } catch (e) {
            console.error('Image prep failed:', e);
        }

        const rows = episodes.map((ep, idx) => ({
            id: `.${command} ${query} --episode ${idx}`,
            title: `Episode ${ep.number}`,
            description: ep.title || ''
        }));

        const episodeButton = {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
                title: "📺 Select Episode",
                sections: [{
                    title: `${seriesTitle} (${episodes.length} episodes)`,
                    rows: rows
                }]
            })
        };

        const cancelButton = {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
                display_text: "📢 Channel",
                url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
                webview_interaction: true,
                icon: "default"
            })
        };

        const interactiveMsg = {
            interactiveMessage: {
                header: {
                    title: `📺 Episodes: ${seriesTitle}`,
                    hasMediaAttachment: !!imageMessage
                },
                body: {
                    text: `Select an episode to download.`
                },
                footer: {
                    text: "_Cevl_"
                },
                contextInfo: {
                    mentionedJid: taggedUsers,
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363401731165846@newsletter',
                        serverMessageId: 142,
                        newsletterName: 'Cevl'
                    }
                },
                nativeFlowMessage: {
                    buttons: [episodeButton, cancelButton]
                }
            }
        };

        if (imageMessage) {
            interactiveMsg.interactiveMessage.header.imageMessage = imageMessage;
        }

        await sock.relayMessage(
            chatId,
            interactiveMsg,
            {
                additionalNodes: [
                    {
                        tag: "biz",
                        attrs: {},
                        content: [
                            {
                                tag: "interactive",
                                attrs: { type: "native_flow", v: "1" },
                                content: [{
                                    tag: "native_flow",
                                    attrs: { v: "9", name: "mixed" }
                                }]
                            }
                        ]
                    }
                ]
            }
        );
        return true;
    } catch (e) {
        console.error('Episode selection error:', e);
        return false;
    }
}

async function showDownloadOptions(sock, chatId, movieData, query, command, taggedUsers = []) {
    try {
        const downloadLinks = movieData.downloadLinks || [];
        if (downloadLinks.length === 0) {
            await sock.sendMessage(chatId, { text: '⚠️ No download links available for this title.' });
            return true;
        }

        if (!global.db.data.movieCache) global.db.data.movieCache = {};
        global.db.data.movieCache[chatId] = { movieData, query };

        const rows = downloadLinks.map((link, idx) => ({
            id: `.${command} ${query} --download ${idx}`,
            title: `${link.quality} (${link.size})`,
            description: `Click to download`
        }));

        const downloadButton = {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
                title: "📥 Download",
                sections: [{
                    title: "Select Quality",
                    rows: rows
                }]
            })
        };

        const cancelButton = {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
                display_text: "📢 Channel",
                url: "https://whatsapp.com/channel/0029Vb6O1mk6GcGKNYa8yC3J",
                webview_interaction: true,
                icon: "default"
            })
        };

        let imageMessage;
        try {
            if (movieData.poster) {
                const posterUrl = movieData.poster.endsWith('.webp') ? movieData.poster.replace('.webp', '.jpg') : movieData.poster;
                const imgResp = await axios.get(posterUrl, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(imgResp.data);
                const media = await prepareWAMessageMedia({ image: buffer }, { upload: sock.waUploadToServer });
                imageMessage = media.imageMessage;
            }
        } catch (e) {
            console.error('Poster image prep failed:', e);
        }

        const interactiveMsg = {
            interactiveMessage: {
                header: {
                    title: `📥 Download: ${movieData.title}`,
                    hasMediaAttachment: !!imageMessage
                },
                body: {
                    text: `🎬 *${movieData.title}*\n⭐ Rating: ${movieData.rating || 'N/A'}\n🎞️ Quality: ${movieData.quality || 'N/A'}\n\nSelect a quality to download:`
                },
                footer: {
                    text: "_Cevl_"
                },
                contextInfo: {
                    mentionedJid: taggedUsers,
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363401731165846@newsletter',
                        serverMessageId: 142,
                        newsletterName: 'Cevl'
                    }
                },
                nativeFlowMessage: {
                    buttons: [downloadButton, cancelButton]
                }
            }
        };

        if (imageMessage) {
            interactiveMsg.interactiveMessage.header.imageMessage = imageMessage;
        }

        await sock.relayMessage(
            chatId,
            interactiveMsg,
            {
                additionalNodes: [
                    {
                        tag: "biz",
                        attrs: {},
                        content: [
                            {
                                tag: "interactive",
                                attrs: { type: "native_flow", v: "1" },
                                content: [{
                                    tag: "native_flow",
                                    attrs: { v: "9", name: "mixed" }
                                }]
                            }
                        ]
                    }
                ]
            }
        );
        return true;
    } catch (e) {
        console.error('Download options error:', e);
        await sock.sendMessage(chatId, { text: '❌ Failed to show download options.' });
        return false;
    }
}

export default {
    cmd: ['movie', 'akwam', 'film'],
    category: 'search',
    desc: 'Search and download movies/series from Akwam',
    exec: async (m, { sock, query, command }) => {
        if (!query) {
            return m.reply(
                `🎬 *Movie & Series Search*\nSearch and download movies/series from Akwam.\n *Usage:*\n.${command} <query>\n> Examples: ${command} Alone, ${command} Inception*`
            );
        }

        try {
            let actualQuery = query;
            let selectIndex = null;
            let downloadIndex = null;
            let episodeIndex = null;

            const selectMatch = query.match(/^(.*?)\s*--select\s+(\d+)/i);
            if (selectMatch) {
                actualQuery = selectMatch[1].trim();
                selectIndex = parseInt(selectMatch[2]);
            }

            const episodeMatch = query.match(/^(.*?)\s*--episode\s+(\d+)/i);
            if (episodeMatch) {
                actualQuery = episodeMatch[1].trim();
                episodeIndex = parseInt(episodeMatch[2]);
            }

            const downloadMatch = query.match(/^(.*?)\s*--download\s+(\d+)/i);
            if (downloadMatch) {
                actualQuery = downloadMatch[1].trim();
                downloadIndex = parseInt(downloadMatch[2]);
            }

            if (!global.db) global.db = { data: {} };

            if (selectIndex !== null) {
                const searchData = global.db.data.movieSearch?.[m.sender];
                if (!searchData || !searchData.results || searchData.results.length === 0) {
                    return m.reply('⚠️ No search results found. Please search again.');
                }
                const selected = searchData.results[selectIndex];
                if (!selected) {
                    return m.reply('❌ Invalid selection.');
                }

                await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                const content = await getMovieContent(selected.url);

                if (content.type === 'series' && content.episodes && content.episodes.length > 0) {
                    if (!global.db.data.movieEpisodes) global.db.data.movieEpisodes = {};
                    global.db.data.movieEpisodes[m.sender] = {
                        episodes: content.episodes,
                        seriesTitle: content.title,
                        query: actualQuery,
                        timestamp: Date.now()
                    };
                    const sent = await showEpisodeSelection(sock, m.from, content.title, content.episodes, actualQuery, command, [m.sender]);
                    if (!sent) {
                        const epList = content.episodes.slice(0, 10).map((ep, i) => `${i + 1}. Episode ${ep.number}`).join('\n');
                        await m.reply(`📺 *Episodes:*\n${epList}\n\nReply with: .${command} ${actualQuery} --episode <number>`);
                    }
                } else {
                    const sent = await showDownloadOptions(sock, m.from, content, actualQuery, command, [m.sender]);
                    if (!sent) {
                        const links = content.downloadLinks || [];
                        const textMsg = `🎬 *${content.title}* (${content.year})\n\n` +
                            (links.length > 0 ? `📥 Select a quality:\n${links.map((l, i) => `${i + 1}. ${l.quality} (${l.size})`).join('\n')}\n\n` : 'No download links.') +
                            `Reply with: .${command} ${actualQuery} --download <number>`;
                        await m.reply(textMsg);
                    }
                }
                return;
            }

            if (episodeIndex !== null) {
                const epData = global.db.data.movieEpisodes?.[m.sender];
                if (!epData || !epData.episodes || epData.episodes.length === 0) {
                    return m.reply('⚠️ No episodes found. Please search again.');
                }
                const selectedEpisode = epData.episodes[episodeIndex];
                if (!selectedEpisode) {
                    return m.reply('❌ Invalid episode selection.');
                }

                await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                const episodeContent = await getEpisodeContent(selectedEpisode.url);
                const sent = await showDownloadOptions(sock, m.from, episodeContent, actualQuery, command, [m.sender]);
                if (!sent) {
                    const links = episodeContent.downloadLinks || [];
                    const textMsg = `📺 *Episode ${episodeContent.number}*\n\n` +
                        (links.length > 0 ? `📥 Select a quality:\n${links.map((l, i) => `${i + 1}. ${l.quality} (${l.size})`).join('\n')}\n\n` : 'No download links.') +
                        `Reply with: .${command} ${actualQuery} --download <number>`;
                    await m.reply(textMsg);
                }
                return;
            }

            if (downloadIndex !== null) {
                const cache = global.db.data.movieCache?.[m.from];
                if (!cache || !cache.movieData) {
                    return m.reply('⚠️ Movie data not found. Please search again.');
                }
                const movieData = cache.movieData;
                const downloadLinks = movieData.downloadLinks || [];
                if (downloadIndex >= downloadLinks.length) {
                    return m.reply('❌ Invalid quality selection.');
                }
                const selectedLink = downloadLinks[downloadIndex];

                await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                const resolved = await resolveDownload(selectedLink.downloadPageUrl);
                const directUrl = resolved.directUrl;
                const filename = resolved.filename || `${movieData.title}.mp4`;

                await m.reply(`📤 Sending document (${selectedLink.size})... This may take a while for large files.`);

                await sock.sendMessage(m.from, {
                    document: { url: directUrl },
                    mimetype: 'video/mp4',
                    fileName: filename,
                    caption: `🎬 *${movieData.title}*\n📥 Quality: ${selectedLink.quality}\n🔹 Source: Akwam`,
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

                await m.reply('✅ *Download Complete!* Sent as document.');
                return;
            }

            await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
            const searchResult = await searchMovies(actualQuery);
            const results = searchResult.results || [];
            if (results.length === 0) {
                return m.reply(`❌ No results found for *${actualQuery}*`);
            }

            if (!global.db.data.movieSearch) global.db.data.movieSearch = {};
            global.db.data.movieSearch[m.sender] = { results, query: actualQuery, timestamp: Date.now() };

            const sent = await showSearchResults(sock, m.from, actualQuery, results, command, [m.sender]);
            if (!sent) {
                const list = results.slice(0, 10).map((r, i) => `${i + 1}. ${r.title} (${r.year}) - ${r.type} ⭐${r.rating}`).join('\n');
                await m.reply(`🎬 *Search Results:*\n${list}\n\nReply with: .${command} ${actualQuery} --select <number>`);
            }
        } catch (e) {
            console.error('Movie error:', e);
            await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await m.reply(`❌ Error: ${e.message || 'Unknown error'}`);
        }
    }
};
