/**
 * lib/rpg/core.js
 * Logic utama ekonomi, leveling, dan regenerasi.
 */

export const formatYen = (angka) => {
    const nominal = Number(angka) || 0;
    return `¥${nominal.toLocaleString('id-ID')}`;
};

export const checkLevelUp = (xpSekarang, levelSekarang) => {
    const butuhXp = Number(levelSekarang) * 100;

    if (xpSekarang >= butuhXp) {
        return {
            isNaik: true,
            sisaXp: xpSekarang - butuhXp,
            levelBaru: levelSekarang + 1,
            hadiah: (levelSekarang + 1) * 500
        };
    }

    return { isNaik: false };
};

export const getCooldown = (lastTime, cooldownMs) => {
    const skrg = Date.now();
    const last = new Date(lastTime).getTime() || 0;
    const sisa = (last + cooldownMs) - skrg;
    return {
        isReady: sisa <= 0,
        sisaWaktu: Math.ceil(sisa / 1000)
    };
};

export const getRandom = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
};

export const refreshUser = async (user) => {
    if (!user) return null;

    const now = Date.now();
    const last = user.lastRegen || now;
    const diff = now - last;
    const interval = 60000;

    if (diff >= interval) {
        const staminaNambah = Math.floor(diff / interval);
        user.stamina = Math.min(100, (user.stamina || 0) + staminaNambah);
        user.lastRegen = now - (diff % interval);
        await user.save();
    }
    return user;
};