const MODULUS = 2147483647;
const MULTIPLIER = 48271;

export function normalizeSeed(seed: number) {
  const normalized = Math.floor(Math.abs(seed)) % MODULUS;
  return normalized === 0 ? 1 : normalized;
}

export function nextRandom(seed: number) {
  const nextSeed = (normalizeSeed(seed) * MULTIPLIER) % MODULUS;
  return {
    seed: nextSeed,
    value: nextSeed / MODULUS,
  };
}

export function mixSeed(seed: number) {
  let mixed = normalizeSeed(seed);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = mixed ^ (mixed >>> 16);
  return normalizeSeed(mixed);
}

export function randomInt(seed: number, min: number, max: number) {
  const safeMin = Math.ceil(Math.min(min, max));
  const safeMax = Math.floor(Math.max(min, max));
  const next = nextRandom(seed);
  return {
    seed: next.seed,
    value: safeMin + Math.floor(next.value * (safeMax - safeMin + 1)),
  };
}
