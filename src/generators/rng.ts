/**
 * Seeded pseudo-random number generator (SPEC §10.2).
 * mulberry32 — fast, deterministic, sufficient entropy for name generation.
 * Same seed always produces the same sequence.
 */

/** Returns a deterministic PRNG function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function (): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a random element from a non-empty array using the provided RNG. */
export function pickRandom(arr: readonly string[], rng: () => number): string {
  const idx = Math.floor(rng() * arr.length);
  return arr[idx] as string;
}

/** Random integer in [min, max] inclusive using the provided RNG. */
export function randInt(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
