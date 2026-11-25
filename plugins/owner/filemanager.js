import { readdir, mkdir, writeFile, unlink, readFile, rm } from "node:fs/promises";
import { join, resolve, basename, dirname, relative, sep } from "node:path";
import fs from "node:fs";
import mimes from "mime-types";
import { res } from "../../src/response.js";

const ROOT_DIR = join(process.cwd(), "data", "doc");
const isSafePath = (target) => target === ROOT_DIR || target.startsWith(ROOT_DIR + sep);

export default {
  cmd: ["filemanager", "fm"],
  category: "owner",
  desc: "File manager berbasis perintah dokumen.",
  exec: async (m, { sock, args, command }) => {
    if (!m.isOwner) return m.reply(res.owner);
    if (!fs.existsSync(ROOT_DIR)) await mkdir(ROOT_DIR, { recursive: true });

    if (!args.length) {
      return m.reply(
        res.format(
          m.prefix,
          `${command} <opsi>`,
          [
            "-ls <subfolder>",
            "-mkdir <nama_folder>",
            "-s <nama_berkas> [subfolder]",
            "-cat <path_file>",
            "-rm <path_file>",
            "-rm -rf <path_folder>",
          ],
          "Operasi pengelolaan berkas pada direktori doc server bot",
          "Manajemen berkas dan direktori dokumen",
        ),
      );
    }

    const flag = args[0].toLowerCase();
    const subArgs = args.slice(1);

    try {
      if (flag === "-ls") {
        const targetPath = resolve(join(ROOT_DIR, subArgs.join("/")));
        if (!isSafePath(targetPath)) return m.reply(res.owner);
        if (!fs.existsSync(targetPath)) return m.reply(res.error);

        const buildTree = async (dir, prefix = "") => {
          let tree = "";
          const items = await readdir(dir, { withFileTypes: true });
          const sorted = items.sort((a, b) =>
            a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1
          );

          for (let i = 0; i < sorted.length; i++) {
            const item = sorted[i];
            const isLast = i === sorted.length - 1;
            tree += `${prefix}${isLast ? "   └── " : "   ├── "}${item.name}${item.isDirectory() ? "/" : ""}\n`;
            if (item.isDirectory()) {
              tree += await buildTree(join(dir, item.name), prefix + (isLast ? "    " : "   │   "));
            }
          }
          return tree;
        };

        const outputTree = await buildTree(targetPath);
        const rel = relative(ROOT_DIR, targetPath) || "root";
        return m.reply(`\`\`\`doc/${rel}/\n${outputTree || "(empty directory)"}\`\`\``);
      }

      if (flag === "-mkdir") {
        if (!subArgs.length) return m.reply(res.format(m.prefix, `${command} -mkdir`, "<nama_folder>", "Tentukan nama direktori baru yang ingin dibuat", "Membuat direktori baru pada penyimpanan doc"));
        const targetPath = resolve(join(ROOT_DIR, subArgs.join("/")));
        if (!isSafePath(targetPath)) return m.reply(res.warn("Akses pembuatan ditolak."));
        if (fs.existsSync(targetPath)) return m.reply(res.warn("Direktori folder tersebut sudah ada."));

        await mkdir(targetPath, { recursive: true });
        return m.reply(res.success(`Sukses membuat direktori baru:\nPath: \`doc/${relative(ROOT_DIR, targetPath)}\``));
      }

      if (flag === "-s") {
        if (!subArgs.length) return m.reply(res.format(m.prefix, `${command} -s`, "<nama_berkas> [subfolder]", "Reply berkas media yang ingin disimpan ke server", "Menyimpan berkas media dari chat ke server"));
        const q = m.quoted || m;
        const mime = (q.msg || q)?.mimetype || "";
        if (!mime) return m.reply(res.noMedia());

        await sock.sendMessage(m.from, { react: { text: "⏳", key: m.key } });
        const buffer = await q.download();
        if (!buffer) {
          await sock.sendMessage(m.from, { react: { text: "❌", key: m.key } });
          return m.reply(res.error);
        }

        const ext = mimes.extension(mime) || "bin";
        const fileName = subArgs[0].replace(/\s+/g, "_").toLowerCase();
        const fullFileName = fileName.endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`;
        const finalPath = join(resolve(join(ROOT_DIR, subArgs.slice(1).join("/") || "")), fullFileName);

        if (!isSafePath(finalPath)) return m.reply(res.warn("Akses penyimpanan ditolak."));
        await mkdir(dirname(finalPath), { recursive: true });
        await writeFile(finalPath, buffer);

        await sock.sendMessage(m.from, { react: { text: "", key: m.key } });
        return m.reply(res.success(`*Berkas Berhasil Disimpan!*\nPath: \`doc/${relative(ROOT_DIR, finalPath)}\``));
      }

      if (flag === "-cat") {
        if (!subArgs.length) return m.reply(res.format(m.prefix, `${command} -cat`, "<path_berkas>", "Masukkan path file yang ingin dibuka/diunduh", "Membaca dan mengambil berkas dokumen dari server"));
        const targetPath = resolve(join(ROOT_DIR, subArgs.join(" ")));
        if (!isSafePath(targetPath)) return m.reply(res.warn("Akses pembacaan ditolak."));
        if (!fs.existsSync(targetPath) || fs.lstatSync(targetPath).isDirectory()) return m.reply(res.error);

        const buffer = await readFile(targetPath);
        const mime = mimes.lookup(targetPath) || "application/octet-stream";
        const fileName = basename(targetPath);

        if (/image/.test(mime)) return await sock.sendMessage(m.from, { image: buffer, caption: fileName }, { quoted: m });
        if (/video/.test(mime)) return await sock.sendMessage(m.from, { video: buffer, caption: fileName }, { quoted: m });
        return await sock.sendMessage(m.from, { document: buffer, fileName, mimetype: mime }, { quoted: m });
      }

      if (flag === "-rm") {
        if (!subArgs.length) return m.reply(res.format(m.prefix, `${command} -rm`, ["<path_berkas>", "-rf <path_folder>"], "Gunakan -rf untuk folder: -rm -rf <path>", "Menghapus berkas atau direktori dokumen"));

        if (subArgs[0] === "-rf") {
          const folder = subArgs.slice(1).join(" ");
          if (!folder) return m.reply(res.warn("Tentukan path direktori folder yang ingin dihapus."));
          const targetPath = resolve(join(ROOT_DIR, folder));
          if (!isSafePath(targetPath) || targetPath === ROOT_DIR) return m.reply(res.owner);
          if (!fs.existsSync(targetPath)) return m.reply(res.empty("Direktori tidak ditemukan."));

          await rm(targetPath, { recursive: true, force: true });
          return m.reply(res.success(`Sukses menghapus folder:\nPath: \`doc/${relative(ROOT_DIR, targetPath)}\``));
        }

        const targetPath = resolve(join(ROOT_DIR, subArgs.join(" ")));
        if (!isSafePath(targetPath)) return m.reply(res.warn("Akses modifikasi ditolak."));
        if (!fs.existsSync(targetPath)) return m.reply(res.empty("Berkas tidak ditemukan."));
        if (fs.lstatSync(targetPath).isDirectory()) {
          return m.reply(res.warn(`Target adalah direktori. Gunakan: ${m.prefix}${command} -rm -rf ${subArgs.join(" ")}`));
        }

        await unlink(targetPath);
        return m.reply(res.success("Berkas dokumen berhasil dihapus secara permanen."));
      }

      return m.reply(res.warn(`Flag "${flag}" tidak dikenali. Ketik ${m.prefix}${command} untuk bantuan.`));
    } catch (err) {
      console.error("[FILE_MANAGER_CRASH]", err);
      return m.reply(`Terjadi kesalahan sistem berkas: ${err.message}`);
    }
  },
};
