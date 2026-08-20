import { generateWAMessageFromContent, proto } from 'baileys';

/**
 * src/button.js
 * Multi-Button Interactive Engine (Bypass Sanksi Meta)
 * Menyatukan Quick Reply, CTA URL, CTA Copy, dan Single Select List dalam 1 Layout
 */
export const sendButton = async (sock, jid, title, body, footer, buttons = []) => {
    try {
        const isGroup = jid.endsWith('@g.us');
        const processedButtons = [];
        let hasMixed = false;
        let lastType = '';

        for (const btn of buttons) {
            if (btn.name === 'quick_reply') {
                processedButtons.push({
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.displayText,
                        id: btn.id
                    })
                });
                if (lastType && lastType !== 'quick_reply') hasMixed = true;
                lastType = 'quick_reply';
            }
            else if (btn.name === 'cta_url') {
                processedButtons.push({
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.displayText,
                        url: btn.url,
                        merchant_url: btn.url
                    })
                });
                if (lastType && lastType !== 'cta_url') hasMixed = true;
                lastType = 'cta_url';
            }
            else if (btn.name === 'cta_copy') {
                processedButtons.push({
                    name: 'cta_copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.displayText,
                        copy_code: btn.id
                    })
                });
                if (lastType && lastType !== 'cta_copy') hasMixed = true;
                lastType = 'cta_copy';
            }
            else if (btn.name === 'single_select') {
                processedButtons.push({
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: btn.displayText,
                        sections: btn.sections || []
                    })
                });
                if (lastType && lastType !== 'single_select') hasMixed = true;
                lastType = 'single_select';
            }
        }

        const interactivePayload = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: {
                        header: {
                            title: title || '',
                            hasMediaAttachment: false
                        },
                        body: { text: body || '' },
                        footer: { text: footer || '' },
                        nativeFlowMessage: {
                            buttons: processedButtons,
                            messageParamsJson: JSON.stringify({
                                bottom_sheet: {
                                    in_thread_buttons_limit: 4
                                }
                            })
                        }
                    }
                }
            }
        };

        const msgId = sock.generateMessageID ? sock.generateMessageID() : 'YENVY_BTN_' + Math.random().toString(36).substring(7).toUpperCase();

        let nodes = [{
            tag: 'biz',
            attrs: {},
            content: [{
                tag: 'interactive',
                attrs: { type: 'native_flow', v: '1' },
                content: [{
                    tag: 'native_flow',
                    attrs: { v: '9', name: 'mixed' } 
                }]
            }]
        }];

        if (!isGroup) {
            nodes.push({
                tag: 'bot',
                attrs: { biz_bot: '1' }
            });
        }

        await sock.relayMessage(jid, interactivePayload, {
            messageId: msgId,
            additionalNodes: nodes
        });

        return msgId;
    } catch (err) {
        console.error('\x1b[1;31m[BUTTON ERROR]\x1b[0m', err);
        // Fallback
        try {
            const fallbackLines = buttons.map(btn => {
                if (btn.name === 'quick_reply') return `• *${btn.displayText}* -> ketik: ${btn.id}`;
                if (btn.name === 'cta_url') return `• *${btn.displayText}* -> Link: ${btn.url}`;
                if (btn.name === 'cta_copy') return `• *${btn.displayText}* -> Salin: ${btn.id}`;
                return `• *${btn.displayText}*`;
            });
            return await sock.sendMessage(jid, {
                text: `*${title || 'INFO'}*\n\n${body}\n\n${fallbackLines.join('\n')}\n\n_${footer || ''}_`
            });
        } catch (fe) {
            console.error('[BUTTON FALLBACK ERROR]', fe);
        }
    }
};