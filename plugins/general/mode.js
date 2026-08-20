import { res } from '../../src/response.js';

/**
 * plugins/system/mode.js
 * Mengubah mode operasional kendali akses bot (Extended Multi-Mode System)
 */

export default {
    cmd: ['mode', 'm'],
    category: 'system',
    desc: 'Mengubah cakupan mode operasional bot (group/private/self/public).',
    exec: async (m, { handler, args }) => {
        if (!m.isOwner) return m.reply(res.owner);

        const targetMode = args[0]?.toLowerCase();

        const validModes = ['group', 'private', 'self', 'public', 'groupwl', 'userwl'];

        if (!targetMode) {
            let helpText = ` *MODE BOT*\n`;
            helpText += `> Mode Aktif: *${handler.mode.toUpperCase()}*\n\n`;
            helpText += `*Panduan Opsi Format:* \n`;
            helpText += `│ ◦ ${m.prefix}mode public _(Bisa di GC & PC)_\n`;
            helpText += `│ ◦ ${m.prefix}mode self _(Hanya merespons Owner)_\n`;
            helpText += `│ ◦ ${m.prefix}mode group _(Hanya merespons di dalam Grup)_\n`;
            helpText += `│ ◦ ${m.prefix}mode private _(Hanya merespons di Chat Pribadi)_\n`;
            helpText += `│ ◦ ${m.prefix}mode groupwl _(Hanya grup yg di-whitelist)_\n`;
            helpText += `│ ◦ ${m.prefix}mode userwl _(Hanya user yg di-whitelist)_\n`;
            helpText += `╰────────────────────────────`;
            return m.reply(helpText);
        }

        if (validModes.includes(targetMode)) {
            await handler.changeMode(targetMode);
            
            let responseText = `_Sukses! Mode bot berhasil diubah ke: *${targetMode.toUpperCase()}*_\n`;
            if (targetMode === 'group') responseText += `> _Bot saat ini hanya akan merespons perintah yang dikirim di dalam obrolan Grup._`;
            if (targetMode === 'private') responseText += `> _Bot saat ini hanya akan merespons perintah yang dikirim lewat Chat Pribadi (PC)._`;
            if (targetMode === 'self') responseText += `> _Bot saat ini hanya merespons perintah dari Owner._`;
            if (targetMode === 'public') responseText += `> _Akses dibuka penuh. Seluruh user bisa menggunakan bot baik di dalam GC maupun PC._`;
            if (targetMode === 'groupwl') responseText += `> _Bot saat ini hanya merespons di dalam Grup yang terdaftar di Whitelist._`;
            if (targetMode === 'userwl') responseText += `> _Bot saat ini hanya merespons perintah dari User yang terdaftar di Whitelist._`;

            return m.reply(responseText);
        } else {
            return m.reply(`_Opsi yang tersedia hanya: *group*, *private*, *self*, *public*, *groupwl*, atau *userwl*._`);
        }
    }
};