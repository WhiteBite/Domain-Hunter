# Domain Hunter v2 — Build Specification (decision-complete)

Public, general-purpose, **100% client-side** tool for finding available domain names.
No backend, no API keys, no secrets. Hosted as a static site (GitHub Pages canonical,
Cloudflare Pages mirror). EN-first UI with RU switch.

This document is the binding contract for all implementation work. If code and SPEC
disagree, SPEC wins unless the SPEC is factually impossible.

---

## 1. Non-negotiables

1. Works when opened from `file://` (single self-contained `dist/index.html`).
2. Works under a sub-path (`https://user.github.io/Domain-Hunter/`) — all paths relative (`base: './'`).
3. Zero runtime requests to anything except: RDAP endpoints, IANA bootstrap, DoH endpoints,
    Porkbun pricing API, cfdomainpricing.com, Cloudflare RDAP aggregator
    (`rdap.cloudflare.com/domain/{domain}`), `api.digmyname.com` (per-domain premium/buy data,
    user-initiated on-demand clicks), `api.github.com` and `github.com` (Social tab GitHub device-flow
    authentication and username lookups), `www.tiktok.com` (Social tab oEmbed lookup).
    No CDNs, no fonts from network, no analytics.
4. Polite to registries: per-infra rate profiles (§8), AIMD backoff, global concurrency cap.
5. Never guess availability: three-state model (§7). Wrong "available" is worse than "unknown".
6. All registry-derived text is escaped; external links `target="_blank" rel="noopener noreferrer"`.
7. No traces of any private naming project, no hardcoded RUB, no brand theme. Neutral product design.

## 2. Stack

| Concern | Decision |
|---|---|
| Framework | Svelte 5 + TypeScript (strict) |
| Build | Vite 7 + `@sveltejs/vite-plugin-svelte` + `vite-plugin-singlefile` |
| Output | ONE self-contained `dist/index.html` (JS/CSS/fonts/worker inlined) |
| Checking engine | Web Worker, imported via `?worker&inline` (blob, works on `file://`) |
| Fonts | `@fontsource-variable/inter` (local files, latin+cyrillic) — no CDN |
| State | Svelte stores + versioned localStorage (`dh:v1:*`) |
| Tests | Vitest (pure logic) + Playwright E2E (mocked network, against `dist/index.html` over `file://`) |
| CI | GitHub Actions: deploy, weekly price snapshot, weekly zone health |

## 3. Repository layout

```
Domain-Hunter/
├── index.html                  # Vite entry (root)
├── SPEC.md
├── README.md
├── LICENSE                     # MIT
├── 404.html                    # meta-refresh to ./index.html (Pages fallback)
├── .nojekyll
├── package.json  vite.config.ts  tsconfig.json  svelte.config.js
├── src/
│   ├── main.ts                 # mounts App
│   ├── App.svelte              # header, tab nav, footer, tab router
│   ├── types.ts                # ALL shared contracts (§5) — do not duplicate types elsewhere
│   ├── config/
│   │   ├── tlds.json           # infras + curated zones (§6)
│   │   ├── registrars.json     # buy-link templates + affiliate meta
│   │   ├── pricing.snapshot.json  # offline pricing baseline (PricingTable shape)
│   │   ├── wholesale.json      # registry floor prices (sanity checks)
│   │   └── dictionaries/       # generator word data + LICENSES.md attribution
│   ├── core/
│   │   ├── rdap-client.ts      # fetch + status interpretation (runs inside worker)
│   │   ├── rate-limiter.ts     # per-infra AIMD token spacing
│   │   ├── queue.ts            # candidate queue, concurrency, abort, progress
│   │   ├── doh.ts              # DNS-over-HTTPS corroboration
│   │   ├── idn.ts              # punycode encode + domain validation/normalization
│   │   ├── cache.ts            # localStorage TTL cache (UI thread)
│   │   ├── bootstrap.ts        # IANA dns.json live fetch + 24h cache + stealth overrides
│   │   └── engine.worker.ts    # worker entry: message protocol (§5.4)
│   ├── pricing/
│   │   └── pricing.ts          # live fetch + merge + TTL + currency + TCO + coupons
│   ├── generators/
│   │   ├── combinator.ts  syllables.ts  pronounceability.ts  hacks.ts  mutations.ts  themes.ts
│   ├── i18n/
│   │   ├── index.ts            # t(key, params), locale store
│   │   ├── en.ts  ru.ts        # flat dot-keys, identical key sets
│   └── ui/
│       ├── tokens.css          # design tokens, light/dark via [data-theme]
│       ├── store.ts            # app stores (results, runState, settings, pricing)
│       ├── csv.ts  share.ts  theme.ts  settings.ts
│       └── components/
│           ├── CheckTab.svelte  DomainInput.svelte  TldPicker.svelte  RunControls.svelte
│           ├── ProgressBar.svelte  ResultsTable.svelte  StatusBadge.svelte  EmptyState.svelte
│           ├── GeneratorsTab.svelte  SettingsTab.svelte  AboutTab.svelte
│           └── Tooltip.svelte  Tabs.svelte
├── scripts/
│   ├── harvest-prices.mjs      # CI: Porkbun + cfdomainpricing → pricing.snapshot.json
│   ├── zone-health.mjs         # CI: probe all zones → health.json
│   └── build-worker.mjs        # regenerate root worker.js from tlds.json
├── worker.js                   # optional Cloudflare CORS proxy (generated, shared config)
├── .github/workflows/
│   ├── deploy.yml  prices.yml  zone-health.yml
└── tests/                      # vitest suites (pure logic) + e2e/ (Playwright E2E, mocked network)
```

## 4. Verified facts (do not re-litigate; re-verify only via scripts/zone-health)

- CORS `*` confirmed live (2026-08-17): `data.iana.org/rdap/dns.json` (max-age 86400),
  `cloudflare-dns.com/dns-query`, `dns.google/resolve`, `api.porkbun.com` pricing (POST, no auth,
  preflight OK), `cfdomainpricing.com/prices.json`, `rdap.verisign.com`, `pubapi.registry.google`,
  `rdap.identitydigital.services`, `rdap.nic.so`, `rdap.nic.ly`.
- RDAP semantics: 200 = registered, 404 = not in registry RDAP (see §7 trust rules),
  429 = back off (honor `Retry-After`), 5xx = retry.
- Rate limits (documented by prior art): Verisign ≈10 rps, **Google Registry ≈1 rps (strict)**,
  default unknown ≈2 rps. Google pubapi ToS explicitly restricts high-volume automation.
- IANA bootstrap misses working RDAP for: io, me, sh, ac (Identity Digital host), so, ly, de, co,
  us, uk, nl, fr, ch, ru and ~30 more ccTLDs → stealth overrides in `tlds.json`.
- RDAP has NO premium-price signaling (EPP Fee Extension only, requires auth) → premium is
  heuristic-only (§6 flags).
- .io price hikes Jan 2026 (+Jan 2027 scheduled); .ly redelegated to GACI Oct 2025 (endpoint
  `rdap.nic.ly` valid); Radix zones moved to Tucows backend Aug 2025 (endpoint unchanged).
- Verisign .com wholesale floor $10.26 → $10.97 from Nov 1 2026; .org $11.00; .net $10.91.

## 5. Shared contracts (`src/types.ts` — single source of truth)

```ts
export type CheckStatus = 'available' | 'taken' | 'probably_available' | 'unknown' | 'error';
export type ResultSource = 'rdap' | 'doh' | 'cache' | 'cloudflare';

export interface InfraConfig {
  id: string;                    // 'verisign' | 'google' | 'identity-digital' | ...
  rdapBase: string;              // may contain '{tld}' placeholder
  minPauseMs: number;            // base pause between requests to this infra
  maxParallel: number;           // max in-flight requests to this infra
  trust: 'high' | 'low';         // 404 semantics reliable? (gTLD ICANN infra = high)
}

export interface TldFlags {
  experimental?: boolean;        // e.g. ru
  minYears?: number;             // e.g. ai = 2
  premiumLikely?: boolean;       // dictionary words often registry-premium here
  reputationNote?: string;       // i18n key suffix; spam-filter caution for dirt-cheap zones
  hackable?: boolean;            // participates in TLD-hacks
}

export interface TldConfig {
  tld: string;
  infra: string;                 // key into infras map; per-zone stealth infra allowed
  rdapBase?: string;             // override (stealth zones)
  trust?: 'high' | 'low';        // override infra default
  flags?: TldFlags;
}

export interface TldRegistry {
  infras: Record<string, InfraConfig>;
  tlds: TldConfig[];
  hackTlds: string[];            // subset of tld strings used by hack generator
}

export interface CheckResult {
  domain: string;                // full ascii domain
  tld: string;
  status: CheckStatus;
  source: ResultSource;
  checkedAt: number;             // epoch ms
  latencyMs?: number;
  note?: string;                 // error detail / retry info
}

// ---- Worker protocol (postMessage) ----
export type EngineCommand =
  | { type: 'start'; candidates: string[]; options: EngineOptions }
  | { type: 'stop' };

export interface EngineOptions {
  registry: TldRegistry;         // resolved registry (bootstrap merged)
  proxyUrl?: string;             // optional CORS proxy base
  fetchTimeoutMs?: number;       // default 10000
  maxRetries?: number;           // default 3
  concurrency?: number;          // global max in-flight checks (user setting)
}

export type EngineEvent =
  | { type: 'result'; result: CheckResult }
  | { type: 'batch'; results: CheckResult[] }
  | { type: 'progress'; done: number; total: number; available: number; errors: number }
  | { type: 'finished'; done: number; total: number; available: number; errors: number; aborted: boolean }
  | { type: 'log'; level: 'info' | 'warn'; message: string };

// ---- Pricing ----
export interface PriceEntry { reg: number | null; renew: number | null; transfer: number | null } // USD cents
export interface Coupon { code: string; firstYearOnly: boolean; type: 'amount' | 'percentage'; amount: number }
export interface PricingTable {
  generatedAt: string;           // ISO
  sources: string[];             // ['porkbun','cloudflare'] / ['snapshot']
  tlds: Record<string, Record<string, PriceEntry>>;   // tld -> registrarId -> entry
  coupons: Record<string, Coupon[]>;                   // tld -> coupons (porkbun)
}
export interface RegistrarConfig {
  id: string; name: string;
  searchUrl: string;             // template with '{domain}'
  affiliate?: { program: string; viable: boolean; note?: string };
}

// ---- Settings (dh:v1:settings) ----
export interface Settings {
  theme: 'system' | 'light' | 'dark';
  lang: 'en' | 'ru' | 'es' | 'de' | 'pt' | 'zh' | 'ja' | 'fr';
  currency: 'USD' | 'RUB' | 'EUR';
  rates: { RUB: number; EUR: number };        // per 1 USD
  concurrency: number;           // global, default 6
  cacheTtlHours: number;         // default 12
  proxyUrl: string;              // default ''
  githubToken: string;           // optional GitHub PAT/device flow token for Social checks
  defaultTlds: string[];         // default selection
}
```

Storage keys: `dh:v1:settings`, `dh:v1:cache` (map domain→{status,source,ts,tld}),
`dh:v1:pricing` ({table, fetchedAt}), `dh:v1:bootstrap` ({json, fetchedAt}),
`dh:v1:run` (resume snapshot), `dh:v1:lastrun` ({input, tlds, candidates, ts} —
last completed run restored on next visit from cache, no network),
`dh:v1:wordsets` (user sets), `dh:v1:genprefs` (generator technique/param preferences),
`dh:v1:favorites` (starred domains/names),
`dh:v1:history` (recent completed runs with query/zones/counts for one-click restore),
`dh:v1:watch` (Record<domain, {status: CheckStatus, ts: number}> — watchlist
baseline for detecting status flips of favorited domains on app load),
`dh:v1:watch-changes` (Record<domain, {status: CheckStatus, ts: number}> —
detected status-flip events for the watchlist UI),
`dh:v1:gentray` (generator candidate tray, survives tab switches),
`dh:v1:hint-dismissed` (boolean flag for dismissing the hint banner).

## 6. Zone registry (`src/config/tlds.json`)

Data-driven. Adding a zone = editing JSON, never code.

Infrastructures (rate profiles):

| infra id | rdapBase | minPauseMs | maxParallel | trust |
|---|---|---|---|---|
| verisign | `https://rdap.verisign.com/{tld}/v1/domain/` | 120 | 6 | high |
| verisign-cctld | `https://tld-rdap.verisign.com/{tld}/v1/domain/` | 250 | 4 | high |
| google | `https://pubapi.registry.google/rdap/domain/` | **1000** | **1** | high |
| identity-digital | `https://rdap.identitydigital.services/rdap/domain/` | 300 | 4 | high |
| centralnic | `https://rdap.centralnic.com/{tld}/domain/` | 250 | 4 | high |
| radix | `https://rdap.radix.host/rdap/domain/` | 300 | 4 | high |
| uniregistry | `https://rdap.uniregistry.net/rdap/domain/` | 300 | 4 | high |
| denic / registry-co / nic-us / nominet / sidn / afnic / switch / tcinet / nic-so / nic-ly | per-zone stealth bases | 500 | 2 | **low** |

Curated zones (~140) grouped: verisign com net; verisign-cctld cc tv; google dev app page new day
how ing meme zip mov foo dad phd prof esq nexus rsvp soy boo channel; identity-digital io ai me sh
ac pro info live world email studio agency life digital guru ninja works today news media finance
money fund estate engineering tools services support consulting business company group network
systems technology solutions global community social expert academy education university design
gallery video events market pizza bar casino games dog cat wtf cool pink blue green gold fitness
doctor taxi team tennis soccer; centralnic xyz lol icu cyou bond sbs cfd art lat monster ooo quest
cam help mom baby beauty best fans game hair homes inc pics rent skin tickets yachts college;
radix tech site online fun space store website press host uno pw; uniregistry cloud link top win
bid loan men; stealth low-trust de co us uk nl fr ch ru so ly.

Flags: `ai` minYears 2; `ru` experimental; `top icu cyou sbs cfd` reputationNote 'spamNote';
`xyz io ai dev app` premiumLikely; hackTlds: `ly io me so ai sh ac cc tv co`.

Default selection (settings.defaultTlds): com net dev app io ai xyz me info pro tech site online cloud page.

Runtime merge: curated `tlds.json` + live IANA bootstrap (24h cache) + user-added custom zones.
Bootstrap-only zones render with price "—" and trust per bootstrap (gTLD=high, ccTLD=low).
Curated always wins on conflict.

## 7. Status model (correctness contract)

| RDAP | trust high | trust low |
|---|---|---|
| 200 | `taken` | `taken` |
| 404 | `available` | DoH NS query: NXDOMAIN → `probably_available`; NOERROR → `taken`; other → `unknown` |
| 429 | retry w/ backoff (≤3), then `error` | same |
| 5xx | retry (≤3), then `error` | same |
| network/CORS fail | retry direct ×2 (transient TLS resets), then proxy once if set, then DoH corroboration (any trust; outcome never bare `available`), else `error` | same |

DoH: primary `https://cloudflare-dns.com/dns-query?name={d}&type=NS` (`Accept: application/dns-json`),
fallback `https://dns.google/resolve?name={d}&type=NS`. DoH-only results never yield bare `available`.

**Cloudflare RDAP aggregator** (`rdap.cloudflare.com/domain/{domain}`) is a secondary
registry-level source used in two places, both honest per the three-state model:
(1) **Transport fallback** — when the primary RDAP fetch fails transport-level (after the
optional proxy, before the DoH last resort), the aggregator is queried once (8s timeout, no
retries). HTTP 200 → `taken` (source `cloudflare`); HTTP 404 → `conclude404` (trust rules
still apply); anything else → fall through to DoH unchanged.
(2) **Low-trust cross-check** — in `conclude404` for low-trust zones, the aggregator is
queried in parallel with the DoH NS probe (no added latency). If the aggregator returns
HTTP 200, the result is `taken` (source `cloudflare`, note "registry 404 contradicted by
cloudflare rdap") overriding the DoH outcome — a taken domain must never be reported free.
Otherwise the DoH-based outcomes stand exactly as before.

UI badges: available (green), probably_available (green outline + tooltip), taken (neutral),
unknown (amber), error (red). Filters: all / available (includes probably) / taken / problems.

## 8. Queue & rate limiting

- Candidate list = parsed domains (cap 3000 names; expansion names×TLDs; hard cap 30000 candidates).
- Per-infra FIFO sub-queues; spacing ≥ current pause; in-flight ≤ infra.maxParallel;
  global in-flight ≤ settings.concurrency.
- AIMD per infra: on 429 → pause ×2 (cap 10000ms), honor Retry-After; after 20 consecutive OK →
  pause ×0.9 (floor minPauseMs).
- Abort: `stop` command → abort all in-flight fetches, emit `finished{aborted:true}`.
- Resume: UI persists `dh:v1:run` {pending candidates, options, ts} every 25 results; cleared on
  finish. On load, if present → offer "Resume interrupted run?".
- Cache (UI thread): fresh cached result (per TTL, unless ignoreCache) → skip network, emit from cache.

## 9. Pricing

- Internal unit: **USD cents**. Display converts via settings.rates; symbol per currency.
- Boot (idle, after first paint): if `dh:v1:pricing` < 12h old → use; else fetch Porkbun
  `POST https://api.porkbun.com/api/json/v3/pricing/get` body `{}` + `GET cfdomainpricing.com/prices.json`
  in parallel (Promise.allSettled), normalize → PricingTable, persist. Both fail → bundled
  `pricing.snapshot.json` (sources: ['snapshot']).
- Porkbun `coupons[]` parsed into PricingTable.coupons; UI shows best coupon per TLD
  ("$0.95 with code XYZ52" style, first-year-only marked).
- `wholesale.json` floors (USD cents): com 1097, net 1091, org 1100 (Nov 2026 values), de 116,
  uk 526, nl 506, fr 586. Displayed price < floor → "promo" chip.
- TCO: `tco3(tld) = min over registrars (reg + 2×renew)`; results sortable by TCO;
  "promo trap" badge when renew ≥ 5×reg.
- Renewal column shows the cheapest renewal over registrars (badge of that
  registrar); first-year cell is coupon-aware: when the best coupon lowers the
  price, the effective price renders with the standard reg price struck through
  (registry-premium override wins over coupon).
- Harvest carry-over: snapshot builds start from the previous snapshot; fresh
  sources win per registrar and coupons dedupe fresh-wins — a flaky source never
  erases coverage.
- Price history: a weekly CI job appends one monthly min-reg/min-renew point per
  TLD to `src/config/price-history.json` (13-month window); the Prices tab shows
  a 6-month trend indicator (▲/▼ when |Δ| ≥ 2%, flat otherwise, hidden when
  history is insufficient).
- Instant "possible premium" heuristic chip on available rows: dictionary words
  and ≤4-char labels in premium-heavy zones (no network call); the on-demand
  DigMyName check remains authoritative.
- UI always shows price freshness: "just now" / "N h ago" / "snapshot {date}".
- Disclaimer (About + tooltip): estimates; premium names cost more; check registrar cart.

## 10. Generators

All pure functions over data; output = string[] of ASCII labels (≤63 chars, RFC 1035 valid).

1. **Combinator**: roots × affixes, mode prefix/suffix/both; neutral presets (app, pro, hq, hub,
   ai, io, get, use, my, go, try, top, one, lab, kit, base, flow, forge, nest, peak).
2. **Syllable mixer**: syllable banks derived at build-time from CMUdict (BSD-2) into
   `dictionaries/syllables.json` (onsets/rimes); generator assembles 2–3 syllable neologisms,
   filters by phonotactics (no 3+ consonant cluster, no double vowels, sane endings) and scores
   with n-gram pronounceability model (port of felixdorn/pronounceable, MIT) trained on the
   shipped wordlist; limit output, deterministic with seed.
3. **Themes**: curated neutral categories from dariusk/corpora (CC0) + meodai/color-names (MIT) +
   repushko/mythology (CC0) + latincy/verba (CC0) + pirtleshell/constellations (MIT) →
   `dictionaries/themes/*.json` with i18n-able category names + optional meaning hints.
   User custom sets in `dh:v1:wordsets`, JSON export/import.
4. **TLD-hacks**: wordlist × suffix match against registry.hackTlds (fami.ly style); show split.
5. **Mutations**: vowel swap i↔y, s↔z, doubling, truncation, suffix -o/-a/-y/-io/-ify.

Every generator panel: output list (deduped, cap 500), "Check now" (fills Check tab + runs),
"Add to check list" (appends without running).

`dictionaries/LICENSES.md` must attribute every dataset (name, source URL, license).

## 11. i18n

- `t(key)` / `t(key, {n})` with `{n}` interpolation; flat dot-keys; all 8 locales (en ru es de pt zh ja fr) MUST have identical key sets (test enforces parity).
- Locale persists; default from `detectLocale()` which tries exact match then base-language match (`pt-br` → `pt`, `de-at` → `de`) then falls back to `en`; switcher in header.
- ALL user-visible strings through i18n, including tooltips, aria-labels, empty states, errors.

## 12. UX requirements

- Design language: calm, product-grade (Linear/Vercel/Raycast tier, no copying): light+dark themes
  (`[data-theme]`, respects system, toggle persists), Inter Variable, 4px spacing grid, subtle
  shadows/borders, micro-transitions (150–200ms), visible focus rings, WCAG AA contrast.
- Layout: header (wordmark, theme toggle, language toggle) → tab bar (Check / Generators /
  Settings / About) → content → footer (MIT, GitHub link, privacy note "no tracking").
- Check tab: textarea input with live parse preview (N names × M zones = K checks); TLD picker
  (chips with 1st-year price, search box, presets: Popular / Cheapest renewal / All); run controls
  (Start/Stop, ignore-cache checkbox); progress (bar + "checked X of Y, Z available" + elapsed);
  results table streaming in batches (≤100 rows per rAF), columns: domain (link to registrar search),
  status badge, 1st-year price (color-coded vs thresholds: cheap ≤$5, mid ≤$15, expensive >$15),
  renewal, TCO3, actions (copy, recheck, buy-link); filters all/available/taken/problems; sorting
  by name/price/tco/status; available rows visually highlighted; CSV export (BOM, comma, quoted);
  share link button (copies `#s=` URL); empty state explains what to do.
- Tooltips explain every non-obvious block (product for non-technical users too).
- Mobile: single column, chips wrap, table scrolls horizontally, tap targets ≥40px.
- Share link: `#s=` + base64url(JSON {q, tlds, run}); on load with `run:true` or when the decoded object contains a `q` field, the app auto-starts the check immediately (matching README behavior).

## 13. Security & privacy

- CSP meta in index.html: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'
  'unsafe-inline'; img-src 'self' data:; connect-src https: blob:; font-src 'self' data:;
  worker-src blob:; base-uri 'self'; form-action 'none'`.
- No analytics, no telemetry. README states it.
- Registry responses: only HTTP status + our own config rendered; RDAP bodies never injected into DOM.
- `worker.js` proxy: only resolves TLDs from its embedded map (generated from tlds.json by
  scripts/build-worker.mjs); no arbitrary URL passthrough (anti-abuse).

## 14. CI/CD

- `deploy.yml`: on push to main → node 22 → npm ci → typecheck + vitest → vite build →
  actions/deploy-pages (artifact dist/).
- `prices.yml`: weekly cron + dispatch → `node scripts/harvest-prices.mjs` → commit
  `src/config/pricing.snapshot.json` if changed (bot identity). Script must exit 0 on partial
  source failure; exit 1 only if ALL sources fail.
- `zone-health.yml`: weekly cron → `node scripts/zone-health.mjs` → commit `health.json`
  (tld → {rdap, cors, httpStatus, ms, ts}); failures visible in repo.

## 15. Acceptance criteria (agent must run through all)

1. `google.com`, `web.dev`, `notion.so` → taken; random `zzqx…` → available in every curated high-trust zone.
2. 500 names × 10 zones complete without 429 storm (progress visible, no UI freeze).
3. `dist/index.html` opens from `file://` and via static server; identical behavior.
4. GitHub Pages deploy under `/Domain-Hunter/` works (relative base; share links work).
5. Light+dark themes; mobile layout; empty states; tooltips; EN/RU parity test passes.
6. CSV opens in Excel correctly (BOM + delimiter); prices color-coded; TCO sort works.
7. No secrets, no external CDN references in dist (grep check).
8. Vitest suite green: status interpretation, AIMD, queue caps, punycode, CSV BOM, i18n parity,
   generators determinism, pricing merge.
9. README: screenshot, description, local run, Pages deploy, price/availability disclaimers.
10. Playwright E2E suite green: per-tab specs, cross-cutting, inventory meta-test.

## 16. Out of scope for v2 (roadmap v2.1+)

Aftermarket domain search, custom domain (CNAME), more registrars in price matrix (keys required),
affiliate link activation (config already affiliate-ready: Porkbun Ambassador + Dynadot Ambassador first).

## 17. Post-spec evolutions (implemented after §1–16)

- **Drops tab**: scans expired/dropped domains via a bundled snapshot — refreshed weekly by `scripts/harvest-drops.mjs` from the WhoisFreaks daily dropped-domains CSV (ASCII labels 4–12 chars, pronounceable, deduped, cap 2000) — and reports those still available at standard registration price, no aftermarket markups. Star any domain to add it to your watchlist; the app silently re-checks favorited domains on load and flags freed or taken changes.
- **Social tab**: checks username availability across major platforms (Twitter/X, GitHub, Instagram, YouTube, TikTok, Twitch, Reddit, Telegram) so you can secure a consistent handle everywhere. Supports optional GitHub device-flow authentication for higher-rate lookups.
- **Interrupted runs**: leaving the Check tab mid-run settles `runState` to
  `done` and persists a resume snapshot (`dh:v1:run`); the resume banner
  renders at the top of the Check tab; a fresh run request (share link
  `run:true` or Generators "Check now") supersedes and discards it.
- **Candidate tray**: generator output lives in a persisted store
  (`dh:v1:gentray`), survives tab switches and reloads; the tray shows the
  projected check count (bare names × selected zones) before running.
- **Coverage-aware buy links**: the buy button targets the cheapest registrar
  that has a deep-link template in `registrars.json`, not merely the cheapest
  price in the table (snapshots may contain registrars without links).
- **Per-domain detail row**: on-demand lookup via the public DigMyName API
  (no auth, CORS `*`, rate-limited client-side to on-demand clicks) shows a
  registry-premium warning with price and the currently cheapest registrar
  with a buy URL.
- **Harvest sources**: Porkbun + cfdomainpricing (live and harvest); beget HTML
  scraper best-effort (works). reg.ru (JS cookie challenge), Spaceship
  (Cloudflare 403) and regctl.sh (TLS-blocked from CI) stay wired but are
  bot-blocked as of Aug 2026; Dynadot `tld_price` API requires an account key
  (no GUEST access). The carry-over merge keeps last-known coverage whenever a
  source fails, so partial harvests never shrink the snapshot.
- **Results table**: sticky header inside its own scroll area, right-aligned
  tabular-numeral price columns, subtle zebra striping, sticky domain column
  on narrow screens; renewal column with the cheapest-renewal registrar badge;
  the available filter defaults to TCO sort; coupon-effective first-year price
  with the standard price struck through; heuristic "possible premium" chip on
  available rows.
