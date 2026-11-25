export const formatYen = (angka) =>
  `¥${(Number(angka) || 0).toLocaleString("id-ID")}`;

export const checkLevelUp = (xpSekarang, levelSekarang) => {
  const butuhXp = Number(levelSekarang) * 100;
  if (xpSekarang >= butuhXp) {
    const levelBaru = Number(levelSekarang) + 1;
    return {
      isNaik: true,
      sisaXp: xpSekarang - butuhXp,
      levelBaru,
      hadiah: levelBaru * 500,
    };
  }
  return { isNaik: false };
};

export const getCooldown = (lastTime, cooldownMs) => {
  const sisa = (new Date(lastTime).getTime() || 0) + cooldownMs - Date.now();
  return {
    isReady: sisa <= 0,
    sisaWaktu: Math.ceil(sisa / 1000),
  };
};

export const getRandom = (min, max) =>
  Math.floor(Math.random() * (max - min + 1) + min);

export const refreshUser = async (user) => {
  if (!user) return null;
  const now = Date.now();
  const diff = now - (user.lastRegen || now);
  const interval = 60000;

  if (diff >= interval) {
    user.stamina = Math.min(100, (user.stamina || 0) + Math.floor(diff / interval));
    user.lastRegen = now - (diff % interval);
    await user.save();
  }
  return user;
};
