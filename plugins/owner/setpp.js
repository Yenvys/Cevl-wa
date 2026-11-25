import { getMedia } from "../../src/helper.js";
import { res } from "../../src/response.js";

export default {
  cmd: ["setpp"],
  category: "owner",
  desc: "Ganti foto profil bot lewat gambar/reply gambar",
  exec: async (m, { sock, args }) => {
    if (!m.isOwner) return m.reply(res.owner);
    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || "";
    if (!/image/.test(mime)) {
      return m.reply(
        res.format(
          m.prefix,
          "setpp",
          ["", "full"],
          "Kirim atau reply gambar. Gunakan 'full' agar foto tidak terpotong (persegi penuh).",
          "Mengganti foto profil akun WhatsApp bot",
        ),
      );
    }

    try {
      const { buffer } = await getMedia(m, sock);
      if (args[0] === "full") {
        const sharp = (await import("sharp")).default;
        const finalBuffer = await sharp(buffer)
          .resize(640, 640, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();

        await sock.query({
          tag: "iq",
          attrs: { to: sock.user.id, type: "set", xmlns: "w:profile:picture" },
          content: [{ tag: "picture", attrs: { type: "image" }, content: finalBuffer }],
        });
      } else {
        await sock.updateProfilePicture(sock.user.id, buffer);
      }
      await sock.sendMessage(m.from, { react: { text: "✅", key: m.key } });
      return m.reply(res.success("Foto profil bot berhasil diperbarui."));
    } catch (e) {
      console.error(e);
      return m.reply(res.error(e.message));
    }
  },
};
