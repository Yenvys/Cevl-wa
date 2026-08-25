/**
 * src/mbuilder.js
 * Helper wrapper untuk baileys-mbuilder (MessageBuilder)
 * Mempermudah pembuatan interactive messages: Button, ButtonV2, Carousel, AIRich
 * 
 * @see https://www.npmjs.com/package/baileys-mbuilder
 * @see https://gist.github.com/ValdazGT/adc8b767a082d18d12ff3e7f01b78651
 */

import MBuilder from 'baileys-mbuilder';
const { Button, ButtonV2, Carousel, AIRich, Toolkit } = MBuilder;

// ==========================================
// FACTORY FUNCTIONS
// ==========================================

/**
 * Buat interactive button (native flow) dengan fluent API
 * Mendukung: quick_reply, cta_url, cta_copy, single_select, send_location, cta_call, dll
 */
export function createButton(sock) {
    return new Button(sock);
}

/**
 * Buat button v2 (legacy-style buttons menggunakan locationMessage)
 * Lebih sederhana, tampilan berbeda dari native flow
 */
export function createButtonV2(sock) {
    return new ButtonV2(sock);
}

/**
 * Buat carousel (swipeable cards dengan media)
 * Setiap card harus punya image/video di header
 */
export function createCarousel(sock) {
    return new Carousel(sock);
}

/**
 * Buat AI Rich response (Meta AI-style message)
 * Mendukung: text, code, table, image, video, source, reels, product, post, dll
 * Bisa di-edit secara live (dynamic)
 */
export function createAIRich(sock, options = {}) {
    return new AIRich(sock, options);
}

// ==========================================
// SHORTCUT SENDERS
// ==========================================

/**
 * Kirim pesan dengan quick reply buttons
 * @param {object} sock - Baileys socket
 * @param {string} jid - Chat JID
 * @param {string} text - Body text
 * @param {Array<{text: string, id: string}>} buttons - Array of button objects
 * @param {object} options - { title, footer, image }
 */
export async function sendQuickReply(sock, jid, text, buttons = [], options = {}) {
    const msg = createButton(sock)
        .setBody(text);
    
    if (options.title) msg.setTitle(options.title);
    if (options.footer) msg.setFooter(options.footer);
    if (options.image) msg.setImage(options.image);

    for (const btn of buttons) {
        msg.addReply(btn.text || btn.display_text, btn.id);
    }

    return await msg.send(jid);
}

/**
 * Kirim pesan dengan URL buttons
 * @param {object} sock - Baileys socket
 * @param {string} jid - Chat JID
 * @param {string} text - Body text
 * @param {Array<{text: string, url: string}>} urls - Array of URL button objects
 * @param {object} options - { title, footer, image }
 */
export async function sendUrlButton(sock, jid, text, urls = [], options = {}) {
    const msg = createButton(sock)
        .setBody(text);

    if (options.title) msg.setTitle(options.title);
    if (options.footer) msg.setFooter(options.footer);
    if (options.image) msg.setImage(options.image);

    for (const u of urls) {
        msg.addUrl(u.text || u.display_text, u.url);
    }

    return await msg.send(jid);
}

/**
 * Kirim pesan dengan selection list (dropdown menu)
 * @param {object} sock - Baileys socket
 * @param {string} jid - Chat JID
 * @param {string} text - Body text
 * @param {string} listTitle - Title untuk tombol list
 * @param {Array<{title: string, rows: Array<{title: string, id: string, description?: string}>}>} sections
 * @param {object} options - { title, footer, image }
 */
export async function sendSelection(sock, jid, text, listTitle, sections = [], options = {}) {
    const msg = createButton(sock)
        .setBody(text);

    if (options.title) msg.setTitle(options.title);
    if (options.footer) msg.setFooter(options.footer);
    if (options.image) msg.setImage(options.image);

    msg.addSelection(listTitle);
    for (const section of sections) {
        msg.makeSection(section.title || '', section.highlight || '');
        for (const row of (section.rows || [])) {
            msg.makeRow(row.header || '', row.title || '', row.description || '', row.id || '');
        }
    }

    return await msg.send(jid);
}

/**
 * Kirim copy button (salin teks ke clipboard)
 */
export async function sendCopyButton(sock, jid, text, copyText, buttonLabel = '📋 Copy', options = {}) {
    const msg = createButton(sock)
        .setBody(text)
        .addCopy(buttonLabel, copyText);

    if (options.title) msg.setTitle(options.title);
    if (options.footer) msg.setFooter(options.footer);

    return await msg.send(jid);
}

// Re-export original classes untuk advanced usage
export { Button, ButtonV2, Carousel, AIRich, Toolkit };
