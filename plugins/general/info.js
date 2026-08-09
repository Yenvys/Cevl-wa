/**
 * plugins/system/info.js
 * Menampilkan informasi detail spesifikasi server bot (Universal Chat Style)
 */

import os from 'os';

const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d} hari`);
    if (h > 0) parts.push(`${h} jam`);
    if (m > 0) parts.push(`${m} menit`);
    if (s > 0) parts.push(`${s} detik`);
    return parts.join(' ') || '0 detik';
};

export default {
    cmd: ['stats', 'info', 'i'],
    category: 'system',
    desc: 'Menampilkan informasi detail spesifikasi bot',
    exec: async (m) => {
        const uptime = process.uptime();
        const osUptime = os.uptime();
        const memUsage = process.memoryUsage();
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        const infoText = `*♯ SYSTEM STATS*
> Hostname : ${os.hostname()}
> OS : ${os.type()} ${os.release()}
> Platform : ${os.platform()}
> OS Uptime : ${formatUptime(osUptime)}
*♯ CPU & MEMORY*
> CPU Model : ${cpus[0]?.model?.trim() || 'Unknown'}
> CPU Cores : ${cpus.length} core(s)
> RAM Total : ${formatBytes(totalMem)}
> RAM Used : ${formatBytes(usedMem)}
> Mem Ussage  : ${formatBytes(memUsage.rss)}
*♯ RUNTIME*
> Node.js : ${process.version}
> V8 Engine : ${process.versions.v8}
> Bot Time : ${formatUptime(uptime)}`.trim();

        await m.reply(infoText);
    }
};