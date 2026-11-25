export const Tools = {
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

  formatSize: (bytes) => {
    if (!bytes) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / 1024 ** i).toFixed(2)} ${["B", "KB", "MB", "GB"][i]}`;
  },

  runtime: (seconds = 0) => {
    const s = Math.floor(Number(seconds) || 0);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${d ? d + "d " : ""}${h ? h + "h " : ""}${m ? m + "m " : ""}${sec}s`;
  },
};

export const Midware = {
  isOwner: (m) => !!m.isOwner,
  isGroup: (m) => !!m.isGroup,
  isAdmin: (m) => !!m.isAdmin,
  isBotAdmin: (m) => !!m.isBotAdmin,
};
