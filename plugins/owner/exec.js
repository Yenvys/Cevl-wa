/**
 * plugins/owner/exec.js
 * Mengeksekusi perintah terminal shell sistem operasi VPS (Universal Chat Style)
 * Dilengkapi timeout 30 detik untuk mencegah proses menggantung
 */

import { exec } from 'child_process';

export default {
    cmd: ['exec', '$'],
    category: 'owner',
    desc: 'Execute Shell command (timeout: 30s)',
    exec: async (m, { sock, query }) => {
        if (!m.isOwner) return; 
        if (!query) return m.reply('Format salah! Masukkan baris perintah terminal shell yang ingin dieksekusi.');

        let shellCmd = query;
        
        if (shellCmd.startsWith('tree')) {
            const dirTarget = shellCmd.replace('tree', '').trim() || '.';
            const treeOutput = m.tree(dirTarget);
            return m.reply(`\`\`\`${treeOutput}\`\`\``);
        }

        const TIMEOUT_MS = 30000;

        exec(shellCmd, { timeout: TIMEOUT_MS, maxBuffer: 1024 * 512 }, async (err, stdout, stderr) => {
            if (err) {
                if (err.killed) return m.reply('```⏱️ Timeout: Eksekusi melebihi 30 detik.```');
                return m.reply(`\`\`\`ERROR\n\n${err.message}\`\`\``);
            }
            if (stderr) return m.reply(`\`\`\`STDERR\n\n${stderr}\`\`\``);
            
            if (stdout) {
                // Truncate output yang terlalu panjang
                const output = stdout.trim().length > 4000
                    ? stdout.trim().slice(0, 4000) + '\n\n... (output dipotong, terlalu panjang)'
                    : stdout.trim();
                return m.reply(`\`\`\`${output}\`\`\``);
            } else {
                return m.reply('```Eksekusi sukses tanpa Output.```');
            }
        });
    }
};