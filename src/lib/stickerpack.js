const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function classifySticker(webpBuffer, msgObj = {}) {
  let isAnimated = false;
  if (Buffer.isBuffer(webpBuffer) && webpBuffer.length > 20) {
    if (webpBuffer.toString("ascii", 12, 16) === "VP8X" && (webpBuffer[20] & 0x02) !== 0) {
      isAnimated = true;
    } else if (webpBuffer.includes(Buffer.from("ANIM"))) {
      isAnimated = true;
    }
  }
  if (msgObj?.isAnimated || msgObj?.message?.stickerMessage?.isAnimated) {
    isAnimated = true;
  }
  return {
    isAnimated,
    mimetype: "image/webp",
  };
}

export async function sendCustomStickerPack(sock, jid, stickerBuffers, options = {}) {
  const { name = "Cevl", publisher = "Yenvys", quoted = null } = options;

  for (let i = 0; i < stickerBuffers.length; i++) {
    const item = stickerBuffers[i];
    const buf = item.buffer || item;
    const isAnim = Boolean(item.isAnimated);

    await sock.sendMessage(
      jid,
      {
        sticker: buf,
        isAnimated: isAnim,
      },
      i === 0 && quoted ? { quoted } : {}
    );

    if (i < stickerBuffers.length - 1) {
      await sleep(350);
    }
  }

  if (sock.sendMessage && quoted) {
    await sock.sendMessage(
      jid,
      {
        text: `📦 *STICKER PACK SELESAI*\n> • *Nama Pack:* ${name}\n> • *Author:* ${publisher}\n> • *Jumlah:* ${stickerBuffers.length} Stiker terkirim!`,
      },
      { quoted }
    ).catch(() => {});
  }
}

export default {
  classifySticker,
  sendCustomStickerPack,
};
