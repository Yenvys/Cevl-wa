import { getContentType, jidNormalizedUser, downloadMediaMessage } from 'baileys';
import db, { getLidMapping, saveContact, saveMetadata, syncParticipants } from './database.js';
import { config } from '../config.js';
import { execSync } from 'child_process';
import { getMessageFromStoreById, groupCache } from './helper.js';

// Group metadata cache TTL: 5 menit
const GROUP_CACHE_TTL = 300000;

export async function serialize(sock, m) {
    if (!m) return m;

    // IDENTIFICATION
    if (m.key) {
        m.id = m.key.id;
        m.from = jidNormalizedUser(m.key.remoteJid);
        m.isGroup = m.from.endsWith('@g.us');
        m.isNewsletter = m.from.endsWith('@newsletter');

        let jid, lid;
        if (m.isGroup) {
            lid = m.key.participant;
            if (lid && lid.endsWith('@lid')) {
                const mapped = await getLidMapping(lid);
                jid = mapped || lid;
            } else jid = lid;
        } else {
            lid = m.from;
            if (lid && lid.endsWith('@lid')) {
                const mapped = await getLidMapping(lid);
                jid = mapped || lid;
            } else jid = lid;
        }

        m.sender = jidNormalizedUser(jid);
        m.fromMe = m.key.fromMe;
    }

    // CONTENT PROCESSING
    if (m.message) {
        m.type = getContentType(m.message);
        m.isViewOnce = ['viewOnceMessageV2', 'viewOnceMessage'].includes(m.type);

        if (m.isViewOnce || m.type === 'ephemeralMessage') {
            let unwrap = m.message[m.type];
            m.message = unwrap?.message || unwrap;
            m.type = getContentType(m.message);
        }

        const msgContent = m.message[m.type] || {};
        const contextInfo = msgContent?.contextInfo || m.message?.extendedTextMessage?.contextInfo || {};
        
        m.newsletterName = contextInfo?.forwardedNewsletterMessageInfo?.newsletterName || null;
    
        m.pushName = m.pushName || msgContent?.senderName || contextInfo?.externalAdReply?.title || 'Unknown';
        
        let interactiveId = '';
        if (m.type === 'interactiveResponseMessage') {
            try {
                const nativeReply = msgContent?.nativeFlowResponseMessage;
                const paramsRaw   = nativeReply?.paramsJson || nativeReply?.responseJson || '';
                const params      = paramsRaw ? JSON.parse(paramsRaw) : {};
                interactiveId     = params?.id || nativeReply?.name || '';
            } catch {
                interactiveId = '';
            }
        }

        m.body = (
            m.type === 'conversation' ? m.message.conversation :
            m.type === 'extendedTextMessage' ? msgContent?.text :
            ['imageMessage', 'videoMessage'].includes(m.type) ? msgContent?.caption :
            m.type === 'templateButtonReplyMessage' ? msgContent?.selectedId :
            m.type === 'buttonsResponseMessage' ? msgContent?.selectedButtonId :
            m.type === 'listResponseMessage' ? msgContent?.singleSelectReply?.selectedRowId :
            m.type === 'interactiveResponseMessage' ? interactiveId :
            ''
        ) || '';
        
        if (m.isNewsletter && m.newsletterName) {
            m.groupName = m.newsletterName;
        }

        m.args = m.body.trim().split(/ +/).slice(1);
        m.query = m.args.join(" ");
        m.expiration = contextInfo?.expiration || 0;
        m.mentionedJid = contextInfo?.mentionedJid || [];
        m.download = () => downloadMediaMessage(m, 'buffer').catch(() => null);

        const quotedMsgHeader = contextInfo?.quotedMessage;
        if (quotedMsgHeader) {
            const stanzaId = contextInfo.stanzaId;
            
            m.quoted = {
                id: stanzaId,
                participant: contextInfo.participant
            };

            let qMessage = getMessageFromStoreById(stanzaId);
            if (!qMessage) {
                qMessage = quotedMsgHeader;
            }

            while (true) {
                const t = getContentType(qMessage);
                if (['viewOnceMessageV2', 'viewOnceMessage', 'ephemeralMessage'].includes(t)) {
                    qMessage = qMessage[t]?.message || qMessage[t];
                } else break;
            }

            m.quoted.type = getContentType(qMessage);
            m.quoted.isViewOnce = ['viewOnceMessageV2', 'viewOnceMessage'].includes(m.quoted.type);
            m.quoted.message = qMessage;
            m.quoted.msg = qMessage[m.quoted.type] || qMessage;
            m.quoted.mimetype = m.quoted.msg?.mimetype || '';
            
            m.quoted.text = (
                m.quoted.type === 'conversation' ? qMessage.conversation :
                m.quoted.type === 'extendedTextMessage' ? m.quoted.msg?.text :
                ['imageMessage', 'videoMessage'].includes(m.quoted.type) ? m.quoted.msg?.caption :
                ''
            ) || '';

            let qRaw = contextInfo.participant;
            let qJid = qRaw?.endsWith('@lid') ? (await getLidMapping(qRaw) || qRaw) : qRaw;
            m.quoted.sender = jidNormalizedUser(qJid);
            
            m.quoted.download = () => downloadMediaMessage({
                key: { remoteJid: m.from, id: m.quoted.id, participant: m.quoted.participant },
                message: m.quoted.message
            }, 'buffer').catch(() => null);
        }
    }

    m.isAdmin = false;
    m.isBotAdmin = false;

    if (m.isGroup) {
        // Cached groupMetadata — hindari panggilan API berulang untuk grup yang sama
        let metadata = null;
        const cached = groupCache.get(m.from);
        if (cached && (Date.now() - cached._cachedAt) < GROUP_CACHE_TTL) {
            metadata = cached;
        } else {
            metadata = await sock.groupMetadata(m.from).catch(() => null);
            if (metadata) {
                metadata._cachedAt = Date.now();
                groupCache.set(m.from, metadata);
            }
        }
        if (metadata) {
            const participants = metadata.participants || [];
            m.groupName = metadata.subject;

            const botJid = jidNormalizedUser(sock.user.id);
            const senderJid = jidNormalizedUser(m.sender);

            let userRecord = null;
            let botRecord = null;

            for (const p of participants) {
                let pJid = p.id;
                if (pJid.endsWith('@lid')) {
                    pJid = (await getLidMapping(pJid)) || pJid;
                }
                const normalizedParticipant = jidNormalizedUser(pJid);

                if (normalizedParticipant === senderJid) userRecord = p;
                if (normalizedParticipant === botJid) botRecord = p;
            }

            const checkAdminStatus = (p) => p?.admin === 'admin' || p?.admin === 'superadmin';
            m.isAdmin = checkAdminStatus(userRecord);
            m.isBotAdmin = checkAdminStatus(botRecord);

            setImmediate(async () => {
                await saveMetadata(m.from, metadata.subject, metadata.desc?.toString(), participants);
                await syncParticipants(m.from, participants);
            });
        }
    }

    // HELPERS
    setImmediate(async () => {
        if (m.sender && !m.fromMe) {
            await saveContact(m.sender, m.key.participant?.endsWith('@lid') ? m.key.participant : null, m.pushName);
        }
    });

    m.getResolvedText = (text) => {
        if (!text) return '';
        
        const matches = [...text.matchAll(/@(\d+)/g)];
        if (!matches.length) return text;
        
        const jids = [...new Set(matches.map(m => m[1] + '@s.whatsapp.net'))];
        const placeholders = jids.map(() => '?').join(',');
        
        const rows = db.prepare(`SELECT jid, pushname FROM contacts WHERE jid IN (${placeholders})`).all(...jids);
        const contactMap = new Map();
        
        for (const row of rows) {
            if (row.pushname && row.pushname !== 'null') {
                contactMap.set(row.jid, row.pushname);
            }
        }
        
        return text.replace(/@(\d+)/g, (match, p1) => {
            const pushname = contactMap.get(p1 + '@s.whatsapp.net');
            return pushname ? `@${pushname}` : match;
        });
    };
    
    m.reply = (text, options = {}) => {
        return sock.sendMessage(m.from, { text: String(text), mentions: options.mentions || [...text.matchAll(/@(\d+)/g)].map(v => v[1] + '@s.whatsapp.net'), ...options }, { quoted: m });
    };

    m.tree = (dir = '.') => {
        try { return execSync(`tree -I 'node_modules|.git|data*|tmp' ${dir}`).toString().trim(); }
        catch { return 'Gagal'; }
    };

    return m;
}