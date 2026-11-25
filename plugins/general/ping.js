import net from "node:net";
import { performance } from "node:perf_hooks";

export default {
  cmd: ["ping", "p", "tes"],
  category: "system",
  desc: "Cek respon bot dan latensi jaringan WhatsApp",
  exec: async (m, { sock }) => {
    const startNet = performance.now();

    const checkNet = () =>
      new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.connect(443, "g.whatsapp.net", () => {
          const lat = performance.now() - startNet;
          socket.destroy();
          resolve(`${lat.toFixed(0)}ms`);
        });
        socket.on("error", () => {
          socket.destroy();
          resolve("Error");
        });
        socket.on("timeout", () => {
          socket.destroy();
          resolve("Timeout");
        });
      });

    const netLatency = await checkNet();
    const startMsg = performance.now();
    const pingMsg = await sock.sendMessage(
      m.from,
      { text: `*Koneksi wea: ${netLatency}*\n*respon: Measuring..*` },
      { quoted: m }
    );

    const rtt = (performance.now() - startMsg).toFixed(0);
    await sock.sendMessage(m.from, {
      text: `*Koneksi wea: ${netLatency}*\n*respon latency: ${rtt}ms*`,
      edit: pingMsg.key,
    });
  },
};
