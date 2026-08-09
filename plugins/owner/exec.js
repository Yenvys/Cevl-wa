/**
 * plugins/owner/exec.js
 * Mengeksekusi perintah terminal shell sistem operasi VPS (Universal Chat Style)
 */

import { exec } from 'child_process';

export default {
    cmd: ['exec', '$'],
    category: 'owner',
    desc: 'Execute Shell command',
    exec: async (m, { sock, query }) => {
        if (!m.isOwner) return; 
        if (!query) return m.reply('Format salah! Masukkan baris perintah terminal shell yang ingin dieksekusi.');

        let shellCmd = query;
        
        if (shellCmd.startsWith('tree')) {
            const dirTarget = shellCmd.replace('tree', '').trim() || '.';
            const treeOutput = m.tree(dirTarget);
            return m.reply(`\`\`\`${treeOutput}\`\`\``);
        }

        exec(shellCmd, async (err, stdout, stderr) => {
            if (err) return m.reply(`\`\`\`ERROR\n\n${err.message}\`\`\``);
            if (stderr) return m.reply(`\`\`\`STDERR\n\n${stderr}\`\`\``);
            
            if (stdout) {
                return m.reply(`\`\`\`${stdout.trim()}\`\`\``);
            } else {
                return m.reply('```Eksekusi sukses tanpa Output.```');
            }
        });
    }
};