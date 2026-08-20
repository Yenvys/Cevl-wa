import UserRPG from '../../src/rpg/schema.js';
import { jobs } from '../../src/rpg/jobs.js';
import { refreshUser, formatYen, checkLevelUp } from '../../src/rpg/core.js';

export default {
    cmd: ['kerja', 'work'],
    category: 'rpg',
    exec: async (m, { sock }) => {
        try {
            let user = await UserRPG.findOne({ noWa: m.sender });
            if (!user)
                return m.reply("_Anda belum terdaftar. Silakan ketik .daftar terlebih dahulu._");
            
            if (user.pekerjaan === 'Pengangguran')
                return m.reply("_Anda belum memiliki pekerjaan. Silakan gunakan perintah .apply untuk melamar kerja._");

            user = await refreshUser(user);

            const timeout = 120000; 
            if (new Date() - user.terakhirKerja < timeout) {
                const sisa = Math.ceil((timeout - (new Date() - user.terakhirKerja)) / 1000);
                return m.reply(`Mohon tunggu selama *${sisa} detik* lagi untuk menghindari kelelahan.`);
            }

            if (user.stamina < 20) return m.reply("_Stamina Anda tidak mencukupi. Silakan gunakan perintah .tidur terlebih dahulu._");

            const jobKey = Object.keys(jobs).find(key => jobs[key].nama === user.pekerjaan);
            const jobData = jobs[jobKey];
            const task = jobData.tasks[Math.floor(Math.random() * jobData.tasks.length)];

            if (!sock.workSession) sock.workSession = {};
            sock.workSession[m.sender] = {
                jawaban: task.jawab,
                expired: Date.now() + 10000,
                jobKey: jobKey,
                isDone: false 
            };

            await m.reply(`『 *${user.pekerjaan.toUpperCase()}* 』\n\n*KETIK CEPAT:*\n ╰─ ${task.soal}\n\n_(Waktu pengerjaan: 10 detik!)_`);

            setTimeout(async () => {
                const session = sock.workSession?.[m.sender];
                if (session && !session.isDone) {
                    delete sock.workSession[m.sender];
                    await sock.sendMessage(m.from, { text: `🐌 *WAKTU HABIS!*\nAnda terlalu lama merespons. Manajemen menganggap Anda lalai dalam menjalankan tugas.` }, { quoted: m });
                }
            }, 10500);

        } catch (err) {
            console.error(err);
            m.reply("Terjadi kesalahan pada server.");
        }
    },

    async after(m, { sock }) {
        const session = sock.workSession?.[m.sender];
        if (!session || session.isDone) return;

        const input = (m.text || m.body || "").toLowerCase().trim();
        if (!input) return;

        if (Date.now() > session.expired) {
            delete sock.workSession[m.sender];
            return;
        }
        
        if (input === session.jawaban) {
            session.isDone = true;
            delete sock.workSession[m.sender];
            
            try {
                let user = await UserRPG.findOne({ noWa: m.sender });
                const jobData = jobs[session.jobKey];

                const level = user.level || 1;
                const gajiBase = jobData.gaji || 0;
                const totalGaji = Number(gajiBase) + (Number(level) * 20);
                const dapetExp = Math.floor(Math.random() * 25) + 15;

                user.yen = Number(user.yen || 0) + totalGaji;
                user.exp = Number(user.exp || 0) + dapetExp;
                user.stamina -= 15;
                user.terakhirKerja = new Date();

                const up = checkLevelUp(user.exp, user.level);
                let levelUpMsg = "";

                if (up.isNaik) {
                    user.level = up.levelBaru;
                    user.exp = up.sisaXp;
                    user.yen += up.hadiah;
                    levelUpMsg = `\n\n🎊 *LEVEL UP!* 🎊\n📈 Level: *${up.levelBaru - 1}* ➔ *${up.levelBaru}*\n🎁 Bonus Kenaikan: *${formatYen(up.hadiah)}*`;
                }

                await user.save();

                return m.reply(`*TUGAS SELESAI!*\n\n💰 *Pendapatan:* +${formatYen(totalGaji)}\n✨ *Exp:* +${dapetExp}\n💪 *Stamina:* -15${levelUpMsg}\n\n_Total Saldo : ${formatYen(user.yen)}¥_`);
            } catch (err) {
                console.log(err);
            }
        }
    }
};