/**
 * src/utils.js
 */

export const Tools = {
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    formatSize: (bytes) => {
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
    },

    runtime: (seconds) => {
        seconds = Number(seconds);
        var d = Math.floor(seconds / (3600 * 24));
        var h = Math.floor(seconds % (3600 * 24) / 3600);
        var m = Math.floor(seconds % 3600 / 60);
        var s = Math.floor(seconds % 60);
        return `${d > 0 ? d + 'd ' : ''}${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
    }
};

export const Midware = {
    isOwner: (m) => m.isOwner,
    isGroup: (m) => m.isGroup,
    isAdmin: (m) => m.isAdmin,
    isBotAdmin: (m) => m.isBotAdmin
};

