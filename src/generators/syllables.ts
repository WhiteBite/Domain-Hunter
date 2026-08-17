/**
 * Syllable mixer — SPEC §10.2.
 * Assembles neologisms from CMUdict-derived onset/rime banks, filters by
 * phonotactics, scores with an n-gram pronounceability model, and returns
 * the top candidates. Deterministic for a given seed.
 *
 * Signature (SyllableMixerOptions + mixSyllables) is FROZEN for UI use.
 */
import { mulberry32, pickRandom, randInt } from './rng';
import { scoreWord } from './pronounceability';
import syllableData from '../config/dictionaries/syllables.json';

export interface SyllableMixerOptions {
  count: number;
  minSyllables?: number;
  maxSyllables?: number;
  seed?: number;
}

const MAX_OUTPUT = 500;
const CONSONANTS = new Set<string>('bcdfghjklmnpqrstvwxyz'.split(''));

/** Onsets that are valid at the START of an English word (medial syllables may use the full bank). */
const INITIAL_ONSETS: string[] = [
  '', 'b', 'c', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'z',
  'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'sh', 'sk', 'sl', 'sm',
  'sn', 'sp', 'st', 'sw', 'th', 'tr', 'tw', 'ch', 'qu', 'str', 'spr', 'spl', 'scr',
];

/** Word-final letters/digraphs that sound natural in English. */
const GOOD_ENDING =
  /[aeioubdfgklmnpstvz]$|(sh|ch|th|ng|nd|nt|ld|rd|st|rk|rm|rn|rt|ft|ct|pt|lk|lp|lm)$/;

/**
 * Phonotactic filter (SPEC §10.2):
 * - total length 4–12
 * - at least one vowel
 * - no 3+ consecutive consonants
 * - no double identical vowels (aa, ee, ii, oo, uu)
 * - no leading/trailing 3+ consonant cluster (subsumed by the global rule)
 */
function passesPhonotactics(word: string): boolean {
  if (word.length < 4 || word.length > 12) return false;

  let hasVowel = false;
  let consRun = 0;
  let prevVowel = '';

  for (let i = 0; i < word.length; i++) {
    const c = word.charAt(i);
    if (CONSONANTS.has(c)) {
      consRun++;
      if (consRun >= 3) return false;
      prevVowel = '';
    } else {
      consRun = 0;
      hasVowel = true;
      if (c === prevVowel) return false; // double identical vowel
      prevVowel = c;
    }
  }
  return hasVowel;
}

export function mixSyllables(opts: SyllableMixerOptions): string[] {
  const count = Math.max(0, Math.min(MAX_OUTPUT, Math.floor(opts.count)));
  if (count === 0) return [];

  const minSyl = Math.max(1, opts.minSyllables ?? 2);
  const maxSyl = Math.max(minSyl, opts.maxSyllables ?? 3);
  const seed = opts.seed ?? 1;
  const rng = mulberry32(seed);

  const onsets = syllableData.onsets;
  const rimes = syllableData.rimes;
  if (onsets.length === 0 || rimes.length === 0) return [];

  // Medial syllables stay open (vowel or vowel + sonorant) so syllable
  // boundaries never pile consonants; only the final syllable may close.
  const openRimes = rimes.filter((r) => /[aeiou]$/.test(r) || /[aeiou][lmnr]$/.test(r));
  const medialRimes = openRimes.length > 0 ? openRimes : rimes;

  // Generate 5×count candidates, filter by phonotactics, score, return top count.
  const target = count * 5;
  const seen = new Set<string>();
  const candidates: { word: string; score: number }[] = [];
  const maxAttempts = target * 100;

  let attempts = 0;
  while (candidates.length < target && attempts < maxAttempts) {
    attempts++;
    const numSyl = randInt(minSyl, maxSyl, rng);
    let word = '';
    for (let s = 0; s < numSyl; s++) {
      const onset = s === 0 ? pickRandom(INITIAL_ONSETS, rng) : pickRandom(onsets, rng);
      const rime = s === numSyl - 1 ? pickRandom(rimes, rng) : pickRandom(medialRimes, rng);
      word += onset + rime;
    }
    if (!GOOD_ENDING.test(word)) continue;
    if (!passesPhonotactics(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    candidates.push({ word, score: scoreWord(word) });
  }

  // Sort by pronounceability score descending; return top `count`.
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, count).map((c) => c.word);
}
