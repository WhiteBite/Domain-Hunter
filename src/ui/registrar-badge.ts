/**
 * Registrar monogram helper — deterministic short code + hue for the
 * registrar source badge shown next to first-year prices (ResultsTable
 * price cell) and in the Prices tab matrix column headers.
 *
 * Pure function, no i18n: display names come from registrars.json at the
 * call site. The hue drives the `.reg-badge` colors via a `--reg-hue`
 * custom property (see tokens.css) — no external assets, CSP-safe.
 */

/** Known two-letter codes; unknown ids fall back to the first two letters. */
const SHORT_CODES: Record<string, string> = {
  porkbun: 'PB',
  cloudflare: 'CF',
  dynadot: 'DD',
  spaceship: 'SS',
  valuedomain: 'VD',
  regru: 'RR',
  beget: 'BG',
};

export interface RegistrarMonogram {
  /** 1–2 uppercase letters rendered inside the badge. */
  short: string;
  /** Deterministic hue (0–359) derived from the registrar id. */
  hue: number;
}

/** djb2-style hash of the id mapped onto the hue circle. */
function hueFor(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function registrarMonogram(id: string): RegistrarMonogram {
  const short = SHORT_CODES[id] ?? id.slice(0, 2).toUpperCase();
  return { short, hue: hueFor(id) };
}
