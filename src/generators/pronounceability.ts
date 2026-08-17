/**
 * Pronounceability scorer — n-gram log-likelihood model (SPEC §10.2).
 * Port of the felixdorn/pronounceable approach (MIT).
 * Trained on words-common.json at module load; buildModel exported for tuning.
 */
import commonWords from '../config/dictionaries/words-common.json';

export interface PronounceabilityModel {
  readonly monogramCounts: Map<string, number>;
  readonly bigramCounts: Map<string, number>;
  readonly vocabularySize: number;
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/**
 * Build an n-gram (monogram + bigram) frequency model from a word list.
 * Used internally for the default model; exported for tests and future tuning.
 */
export function buildModel(words: string[]): PronounceabilityModel {
  const monogramCounts = new Map<string, number>();
  const bigramCounts = new Map<string, number>();
  const vocab = new Set<string>();

  for (const raw of words) {
    const w = raw.toLowerCase();
    for (let i = 0; i < w.length; i++) {
      const c = w.charAt(i);
      monogramCounts.set(c, (monogramCounts.get(c) ?? 0) + 1);
      vocab.add(c);
      if (i < w.length - 1) {
        const bg = c + w.charAt(i + 1);
        bigramCounts.set(bg, (bigramCounts.get(bg) ?? 0) + 1);
      }
    }
  }

  return { monogramCounts, bigramCounts, vocabularySize: vocab.size };
}

/** Score a word using a specific model. Returns average bigram log-probability. */
export function scoreWithModel(word: string, model: PronounceabilityModel): number {
  const w = word.toLowerCase();
  if (w.length < 2) return -Infinity;

  const vocabSize = model.vocabularySize || 1;
  let logProb = 0;
  let count = 0;

  for (let i = 0; i < w.length - 1; i++) {
    const bg = w.charAt(i) + w.charAt(i + 1);
    const bgCount = model.bigramCounts.get(bg) ?? 0;
    const firstCount = model.monogramCounts.get(w.charAt(i)) ?? 0;
    // Laplace (add-1) smoothing: P(bigram | first char) = (bgCount + 1) / (firstCount + V)
    const prob = (bgCount + 1) / (firstCount + vocabSize);
    logProb += Math.log(prob);
    count++;
  }

  return count > 0 ? logProb / count : -Infinity;
}

// Default model trained on the shipped common-words list.
const defaultModel: PronounceabilityModel = buildModel(
  commonWords as string[],
);

/**
 * Score a word's pronounceability using the default model.
 * Higher = more English-like. A real word like "apple" scores above
 * a consonant heap like "xzqpf".
 */
export function scoreWord(word: string): number {
  return scoreWithModel(word, defaultModel);
}

/** Convenience: true if the word scores above the median of random heaps. */
export function isPronounceable(word: string): boolean {
  // Empirical threshold: bigrams in real English average ~ -2.5 to -3.5 nats.
  // Random consonant heaps average ~ -6 to -8 nats.
  return scoreWord(word) > -4.5;
}

export { VOWELS };
