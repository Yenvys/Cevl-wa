import util from "node:util";
import { res } from "../../src/response.js";

export default {
  cmd: ["eval", ">"],
  category: "owner",
  desc: "Evaluate JavaScript code (timeout: 10s)",
  exec: async (m, { query, command }) => {
    if (!m.isOwner) return m.reply(res.owner);
    if (!query) return m.reply(res.format(m.prefix, command, "1 + 1", "Masukkan kode skrip JavaScript yang ingin dievaluasi (Timeout: 10s)", "Mengeksekusi kode skrip JavaScript"));

    try {
      const result = await Promise.race([
        (async () => {
          try {
            return await eval(query);
          } catch {
            return await eval(`(async () => { ${query} })()`);
          }
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("⏱️ Timeout: Eksekusi melebihi 10 detik.")), 10000)),
      ]);

      const output = typeof result !== "string" ? util.inspect(result, { depth: 1 }) : result;
      await m.reply(String(output));
    } catch (e) {
      await m.reply(String(e));
    }
  },
};
