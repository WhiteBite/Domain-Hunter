/**
 * Domain input normalization + IDN (punycode, RFC 3492).
 * Export signatures are consumed by UI code — keep stable.
 */

export interface ParsedInput {
  /** Unique valid tokens: bare names and full domains, ASCII form. */
  names: string[];
  /** Count of skipped invalid tokens. */
  invalid: number;
}

// ---- RFC 3492 punycode encoding ----

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, first: boolean): number {
  let d = first ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > Math.floor(((BASE - TMIN) * TMAX) / 2)) {
    d = Math.floor(d / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * d) / (d + SKEW));
}

function encodeDigit(digit: number): string {
  // 0–25 → 'a'–'z', 26–35 → '0'–'9'
  return String.fromCharCode(digit < 26 ? digit + 97 : digit + 22);
}

/** Encode a single label (no dots) per RFC 3492. Returns the bare code (no 'xn--'). */
export function punycodeEncodeLabel(input: string): string {
  const codePoints: number[] = [];
  for (const char of input) codePoints.push(char.codePointAt(0) ?? 0);

  const basic = codePoints.filter((cp) => cp < 128);
  let output = basic.map((cp) => String.fromCharCode(cp)).join('');
  const b = basic.length;
  let h = b;
  if (b > 0) output += '-';

  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;

  while (h < codePoints.length) {
    let m = Infinity;
    for (const cp of codePoints) {
      if (cp >= n && cp < m) m = cp;
    }
    delta += (m - n) * (h + 1);
    n = m;
    for (const cp of codePoints) {
      if (cp < n) delta += 1;
      if (cp === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (q < t) break;
          output += encodeDigit(t + ((q - t) % (BASE - t)));
          q = Math.floor((q - t) / (BASE - t));
        }
        output += encodeDigit(q);
        bias = adapt(delta, h + 1, h === b);
        delta = 0;
        h += 1;
      }
    }
    delta += 1;
    n += 1;
  }
  return output;
}

/** Convert a domain to its ASCII (ACE) form; non-ASCII labels get 'xn--' prefixes. */
export function toAscii(domain: string): string {
  return domain
    .normalize('NFKC')
    .toLowerCase()
    .split('.')
    .map((label) =>
      /^[\u0000-\u007F]+$/.test(label) ? label : `xn--${punycodeEncodeLabel(label)}`,
    )
    .join('.');
}

// ---- validation ----

/** RFC 1035 label check (ASCII form, punycode labels included). */
export function isValidLabel(label: string): boolean {
  return (
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)
  );
}

export function isValidDomain(domain: string): boolean {
  const labels = domain.split('.');
  return labels.length >= 1 && labels.every(isValidLabel);
}

// ---- input parsing ----

/** Strip protocol/www/path/port, lowercase, punycode-encode, extract candidate tokens. */
export function normalizeDomainInput(text: string): ParsedInput {
  const names = new Set<string>();
  let invalid = 0;
  const tokens = text
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const raw of tokens) {
    const cleaned = raw
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '') // protocol
      .replace(/^www\./, '')
      .replace(/\/.*$/, '') // path
      .replace(/:\d+$/, '') // port
      .replace(/\.+$/, '');
    if (!cleaned) continue;
    const ascii = toAscii(cleaned);
    if (!isValidDomain(ascii)) {
      invalid += 1;
      continue;
    }
    names.add(ascii);
  }
  return { names: [...names], invalid };
}

/**
 * Expand a parsed token into concrete candidate domains.
 * Token with dots → itself; bare name → name × each selected TLD.
 */
export function parseCandidate(token: string, selectedTlds: string[]): string[] {
  const ascii = toAscii(token);
  if (ascii.includes('.')) return [ascii];
  return selectedTlds.map((tld) => `${ascii}.${tld}`);
}
