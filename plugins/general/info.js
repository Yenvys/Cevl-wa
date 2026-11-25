import os from "node:os";

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(2)} ${["B", "KB", "MB", "GB", "TB"][i]}`;
};

const formatUptime = (seconds) => {
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [d && `${d} hari`, h && `${h} jam`, m && `${m} menit`, `${sec} detik`].filter(Boolean).join(" ");
};

export default {
  cmd: ["stats", "info", "i"],
  category: "system",
  desc: "Menampilkan informasi detail spesifikasi bot",
  exec: async (m) => {
    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    const cpus = os.cpus();

    const infoText = `*♯ SYSTEM STATS*
> Hostname : ${os.hostname()}
> OS : ${os.type()} ${os.release()}
> Platform : ${os.platform()}
> OS Uptime : ${formatUptime(os.uptime())}
*♯ CPU & MEMORY*
> CPU Model : ${cpus[0]?.model?.trim() || "Unknown"}
> CPU Cores : ${cpus.length} core(s)
> RAM Total : ${formatBytes(totalMem)}
> RAM Used : ${formatBytes(usedMem)}
> Mem Usage : ${formatBytes(process.memoryUsage().rss)}
*♯ RUNTIME*
> Node.js : ${process.version}
> V8 Engine : ${process.versions.v8}
> Bot Time : ${formatUptime(process.uptime())}`.trim();

    await m.reply(infoText);
  },
};
