const originLog = console.log;

const getWIB = () =>
  new Date().toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour12: false,
  });

console.log = (...args) => {
  const isSessionLog = args.some((arg) => {
    if (typeof arg === "string") {
      return arg.includes("Closing session") || arg.includes("SessionEntry");
    }
    return (
      arg &&
      typeof arg === "object" &&
      ("_chains" in arg || "registrationId" in arg || "currentRatchet" in arg)
    );
  });

  if (isSessionLog) {
    const time = `\x1b[1;90m[${getWIB()}]\x1b[0m`;
    const tag = `\x1b[1;35m<${process.argv[2] || "BOT"}>\x1b[0m`;
    return originLog(
      `${time} ${tag} \x1b[1;31m[OFF]\x1b[0m \x1b[90mEncrypted session bundle ignored.\x1b[0m`,
    );
  }
  originLog(...args);
};

const TYPE_MAP = {
  imageMessage: "img",
  videoMessage: "vid",
  stickerMessage: "stk",
  audioMessage: "aud",
  documentMessage: "doc",
  extendedTextMessage: "txt",
  conversation: "txt",
};

export class Logger {
  constructor(prefix = "BOT") {
    this.prefix = prefix;
    this.processedMsgs = new Set();
  }

  color(code, text) {
    return `\x1b[1;${code}m${text}\x1b[0m`;
  }

  getTime() {
    return getWIB();
  }

  _formatMsg(m) {
    const body = typeof m?.body === "string" ? m.body : "";
    return body
      ? body.replace(/\n/g, " ").slice(0, 100)
      : this.color(90, `[${m?.type || "unknown"}]`);
  }

  universal(m) {
    const time = this.color(90, `[${this.getTime()}]`);
    const tag = this.color(35, `<${this.prefix}>`);

    let header = this.color(92, "PRIVATE CHAT");
    if (m.from === "status@broadcast") {
      header = this.color(93, "STATUS");
    } else if (m.isNewsletter) {
      header = this.color(94, `CHANNEL: ${m.groupName || "Unknown"} (${m.from})`);
    } else if (m.isGroup) {
      header = this.color(96, m.groupName || "Unknown Group");
    }

    const typeMsg =
      TYPE_MAP[m.type] || (m?.type ? m.type.replace("Message", "") : "unknown");

    console.log(`${time} ${tag} ${header}`);
    console.log(
      `           ${this.color(90, "╰──〉")}${this.color(33, m.pushName || "Unknown")} : ${this.color(90, `[${typeMsg}]`)} ${this._formatMsg(m)}`,
    );
  }

  cmd(m, plugin) {
    const lockKey = `${m.id}-${m.body}`;
    if (this.processedMsgs.has(lockKey)) return;
    this.processedMsgs.add(lockKey);
    setTimeout(() => this.processedMsgs.delete(lockKey), 500);

    const time = this.color(90, `[${this.getTime()}]`);
    const tag = this.color(35, `<${this.prefix}>`);
    const cmdName = Array.isArray(plugin.cmd) ? plugin.cmd[0] : plugin.cmd;

    console.log(
      `${time} ${tag} ${this.color(93, "[EXEC]")} ${this.color(37, (m.prefix || "") + cmdName)} by ${this.color(33, m.pushName || "Unknown")}`,
    );
  }

  _log(badge, colorCode, ...args) {
    console.log(
      this.color(90, `[${this.getTime()}]`),
      this.color(35, `<${this.prefix}>`),
      this.color(colorCode, badge),
      ...args,
    );
  }

  info(...args) {
    this._log("[INFO]", 96, ...args);
  }

  success(...args) {
    this._log("[OK]", 92, ...args);
  }

  warn(...args) {
    this._log("[WARN]", 93, ...args);
  }

  error(label, ...args) {
    this._log(`[ERR:${label}]`, 91, ...args);
  }

  res(m, text) {
    const snippet =
      typeof text === "string"
        ? text.replace(/\n/g, " ").slice(0, 40)
        : "Media/Object";
    this._log("[RESP]", 94, `⮕  "${snippet}..."`);
  }
}
