/**
 * plugins/owner/filemanager.js
 * Manajer Berkas Cloud Berbasis Perintah CLI Linux (Universal Chat Style)
 */

import { readdir, mkdir, writeFile, unlink, readFile, rm } from "node:fs/promises";
import { join, resolve, basename, dirname, relative, sep } from "node:path";
import fs from "node:fs";
import mimes from "mime-types";
import { res } from '../../lib/response.js';


const ROOT_DIR = join(process.cwd(), 'data', 'doc');

export default {
    cmd: ['filemanager', 'fm'],
    category: 'owner',
    desc: 'File manager ini harusnya.',
    exec: async (m, { sock, args, command }) => {
        if (!m.isOwner) return m.reply(res.owner);

        const isSafePath = (target) => target === ROOT_DIR || target.startsWith(ROOT_DIR + sep);

        if (!fs.existsSync(ROOT_DIR)) await mkdir(ROOT_DIR, { recursive: true });

        if (!args.length) {
            let helpText = `『 *FILE MANAGER* 』\n\n`;
            helpText += `*Daftar Perintah Eksekusi:*\n`;
            helpText += `│ ◦ ${m.prefix}${command} -ls <subfolder> - Menampilkan struktur dir tree\n`;
            helpText += `│ ◦ ${m.prefix}${command} -mkdir <nama_folder> - Membuat direktori folder baru\n`;
            helpText += `│ ◦ ${m.prefix}${command} -s <nama_berkas> [subfolder] - Menyimpan/mengunduh media dari chat\n`;
            helpText += `│ ◦ ${m.prefix}${command} -cat <path_file> - Mengambil & memuat berkas dari server\n`;
            helpText += `│ ◦ ${m.prefix}${command} -rm <path_file> - Menghapus berkas dokumen spesifik\n`;
            helpText += `│ ◦ ${m.prefix}${command} -rm -rf <path_folder> - Menghapus direktori folder beserta isinya\n`;
            helpText += `╰───────────────────────────`;
            return m.reply(helpText);
        }

        const flag = args[0].toLowerCase();
        const subArgs = args.slice(1);

        try {
            // ==========================================
            // PERINTAH: -ls (TREE / LIST DIRECTORY)
            // ==========================================
            if (flag === '-ls') {
                const subPath = subArgs.join('/');
                const targetPath = resolve(join(ROOT_DIR, subPath));

                if (!isSafePath(targetPath)) return m.reply(res.owner);
                if (!fs.existsSync(targetPath)) return m.reply(res.error);

                const buildTree = async (dir, prefix = "") => {
                    let tree = "";
                    const items = await readdir(dir, { withFileTypes: true });
                    const sorted = items.sort((a, b) => a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1);

                    for (let i = 0; i < sorted.length; i++) {
                        const item = sorted[i];
                        const isLast = i === sorted.length - 1;
                        const glyph = isLast ? "   └── " : "   ├── ";
                        
                        tree += `${prefix}${glyph}${item.name}${item.isDirectory() ? "/" : ""}\n`;

                        if (item.isDirectory()) {
                            const nextPrefix = prefix + (isLast ? "    " : "   │   ");
                            tree += await buildTree(join(dir, item.name), nextPrefix);
                        }
                    }
                    return tree;
                };

                const outputTree = await buildTree(targetPath);
                const relativeFolder = relative(ROOT_DIR, targetPath) || 'root';
                return m.reply(`\`\`\`doc/${relativeFolder}/\n${outputTree || '(empty directory)'}\`\`\``);
            }

            // ==========================================
            // PERINTAH: -mkdir (CREATE DIRECTORY)
            // ==========================================
            if (flag === '-mkdir') {
                if (!subArgs.length) return m.reply(res.format(m.prefix, `${command} -mkdir`, `<nama_folder_baru>`));
                
                const folderName = subArgs.join('/');
                const targetPath = resolve(join(ROOT_DIR, folderName));

                if (!isSafePath(targetPath)) return m.reply("_Akses pembuatan ditolak._");
                if (fs.existsSync(targetPath)) return m.reply("_Direktori folder tersebut sudah ada._");

                await mkdir(targetPath, { recursive: true });
                return m.reply(`_Sukses membuat direktori folder baru:_\nPath: \`doc/${relative(ROOT_DIR, targetPath)}\``);
            }

            // ==========================================
            // PERINTAH: -s (SAVE FILE CONTENT)
            // ==========================================
            if (flag === '-s') {
                if (!subArgs.length) return m.reply(`Format salah!\n\n*Opsi Simpan File (Reply Media):*\n${m.prefix}${command} -s <nama_berkas> [subfolder]`);
                
                const newFileNameInput = subArgs[0].replace(/\s+/g, '_').toLowerCase();
                const subFolderTarget = subArgs.slice(1).join('/') || "";
                const targetDirectory = resolve(join(ROOT_DIR, subFolderTarget));

                const quotedMessage = m.quoted ? m.quoted : m;
                const messageMime = (quotedMessage?.msg || quotedMessage)?.mimetype || "";
                if (!messageMime) return m.reply("_Format salah! reply dokumen atau berkas media yang ingin disimpan._");

                await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });

                const downloadedBuffer = await quotedMessage.download();
                if (!downloadedBuffer) {
                    await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
                    return m.reply(res.error);
                }

                const extension = mimes.extension(messageMime) || "bin";
                const absoluteFileName = newFileNameInput.endsWith(`.${extension}`) ? newFileNameInput : `${newFileNameInput}.${extension}`;
                const finalFileAbsolutePath = join(targetDirectory, absoluteFileName);

                if (!isSafePath(finalFileAbsolutePath)) return m.reply("_Akses penyimpanan ditolak._");

                await mkdir(dirname(finalFileAbsolutePath), { recursive: true });
                await writeFile(finalFileAbsolutePath, downloadedBuffer);

                await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
                return m.reply(`*BERKAS BERHASIL DISIMPAN!*\n\nPath: \`doc/${relative(ROOT_DIR, finalFileAbsolutePath)}\``);
            }

            // ==========================================
            // PERINTAH: -cat (GET FILE CONTENT)
            // ==========================================
            if (flag === '-cat') {
                if (!subArgs.length) return m.reply(`Format salah!\n\n*Opsi Ambil File:*\n${m.prefix}${command} -cat <path_file>`);
                
                const filePath = subArgs.join(' ');
                const targetPath = resolve(join(ROOT_DIR, filePath));

                if (!isSafePath(targetPath)) return m.reply("_Akses pembacaan berkas di luar akar ditolak._");
                if (!fs.existsSync(targetPath) || fs.lstatSync(targetPath).isDirectory()) {
                    return m.reply(res.error);
                }

                const fileBuffer = await readFile(targetPath);
                const mimeType = mimes.lookup(targetPath) || "application/octet-stream";

                if (/image/.test(mimeType)) {
                    return await sock.sendMessage(m.from, { image: fileBuffer, caption: basename(targetPath) }, { quoted: m });
                } 
                if (/video/.test(mimeType)) {
                    return await sock.sendMessage(m.from, { video: fileBuffer, caption: basename(targetPath) }, { quoted: m });
                }

                return await sock.sendMessage(m.from, {
                    document: fileBuffer,
                    fileName: basename(targetPath),
                    mimetype: mimeType
                }, { quoted: m });
            }

            // ==========================================
            // PERINTAH: -rm (REMOVE FILE OR DIRECTORY)
            // ==========================================
            if (flag === '-rm') {
                if (!subArgs.length) return m.reply(`Format salah!\n\n*Hapus Berkas:*\n${m.prefix}${command} -rm <path_file>\n\n*Hapus Direktori/Folder:* \n${m.prefix}${command} -rm -rf <path_folder>`);

                if (subArgs[0] === '-rf') {
                    const folderPath = subArgs.slice(1).join(' ');
                    if (!folderPath) return m.reply("tentukan nama path direktori folder yang ingin dibersihkan.");

                    const targetPath = resolve(join(ROOT_DIR, folderPath));
                    if (!isSafePath(targetPath) || targetPath === ROOT_DIR) return m.reply(res.owner);
                    if (!fs.existsSync(targetPath)) return m.reply("_Direktori tidak ditemukan/Tidak ada._");

                    await rm(targetPath, { recursive: true, force: true });
                    return m.reply(`_Sukses menghapus direktori folder dan isinya:_\nPath: \`doc/${relative(ROOT_DIR, targetPath)}\``);
                }

                const filePath = subArgs.join(' ');
                const targetPath = resolve(join(ROOT_DIR, filePath));

                if (!isSafePath(targetPath)) return m.reply("_Akses modifikasi ditolak._");
                if (!fs.existsSync(targetPath)) return m.reply("__Direktori yang dituju memang sudah tidak ada._");
                
                if (fs.lstatSync(targetPath).isDirectory()) {
                    return m.reply(`_Objek target merupakan direktori folder. Gunakan perintah berikut untuk membersihkannya:_\n\`${m.prefix}${command} -rm -rf ${filePath}\``);
                }

                await unlink(targetPath);
                return m.reply("_Berkas dokumen berhasil dihapus secara permanen dari server server._");
            }

            // Jika flag tidak dikenali
            return m.reply(`Flag \`${flag}\` tidak dikenali. Ketik \`${m.prefix}${command}\` untuk melihat daftar flag yang tersedia.`);

        } catch (err) {
            console.error('[FILE_MANAGER_CRASH]', err);
            return m.reply(`Terjadi kesalahan pada sistem manajemen berkas internal: ${err.message}`);
        }
    }
};