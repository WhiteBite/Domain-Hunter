# Domain Hunter — Bulk Domain Availability Checker & Name Generator

**English** | [Русский](README.ru.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-gold.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/WhiteBite/Domain-Hunter?style=social)](https://github.com/WhiteBite/Domain-Hunter/stargazers)
[![Deploy](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml/badge.svg)](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml)

Free, open-source bulk domain availability checker that runs entirely in your browser — no servers, no API keys, no tracking.

**[▶ Live demo](https://whitebite.github.io/Domain-Hunter/)** — works instantly, nothing to install.

![Domain Hunter checking five brand names across 15 TLDs — streaming results with status badges, first-year and renewal prices, CSV export](docs/screenshot-en-check.png)

Domain Hunter checks domain availability directly against registry **RDAP** endpoints (Verisign, Google Registry, Identity Digital, CentralNic, Radix…), generates brandable name ideas with five built-in generators, shows **live registrar prices** with 3-year TCO, and exports everything to CSV. It is a privacy-friendly alternative to WHOIS lookup services and paid domain APIs like WhoisXML or DomainTools — the whole app is one self-contained HTML file.

## Features

- **Bulk availability checking** — paste up to 3,000 names; expansion across selected TLDs yields up to 30,000 checks per run, streamed live into a sortable table. Interrupted runs can be resumed.
- **140+ curated TLD zones** — `com net io ai dev app xyz me co uk de nl fr ch so ly tech site online store cloud` and 120+ more, across 17 registry infrastructures. Additional zones are discovered automatically via the live IANA RDAP bootstrap.
- **Honest three-state results** — `available` / `probably_available` / `unknown`. For low-trust ccTLDs a 404 is corroborated with DNS-over-HTTPS (Cloudflare + Google DNS) before anything is called available. Domain Hunter never guesses.
- **Five name generators** — root × affix combinator, a pronounceability-scored syllable mixer (CMUdict-derived), curated thematic word sets, TLD-hacks (`family` → `fami.ly`), and word mutations (`midas` → `mydas`, `midaz`, `midaso`). Candidates collect in a persistent tray that survives tab switches and shows the projected number of checks before you run them.
- **Live prices and TCO** — first-year and renewal prices live from Porkbun and Cloudflare, plus a weekly harvest comparing up to five registrars (Dynadot, Spaceship, ValueDomain snapshots); coupons, promo-trap detection (renewal ≥ 5× first year), 3-year TCO sorting, and coverage-aware buy links to 13 registrars. Prices in USD, RUB, or EUR.
- **Per-domain "where to buy"** — one click on an available domain shows a registry-premium warning (with the premium price) and the currently cheapest registrar with a direct buy link (public DigMyName API, no keys).
- **Polite to registries** — per-infrastructure AIMD rate limiting (e.g. Google Registry's strict ~1 rps is honored), automatic backoff on HTTP 429 with `Retry-After`, and result caching in `localStorage`.
- **Share and export** — one-click share links (`#s=` encodes query + zones, auto-starts the run), Excel-compatible CSV export (BOM + quoting), copy/recheck per row.
- **Private by design** — no analytics, no telemetry, no accounts. All state lives in your browser's `localStorage`. Bilingual UI (English/Russian), light and dark themes, mobile-friendly.

![Domain Hunter name generators in dark theme: combinator, syllable mixer, thematic word sets, TLD-hacks and mutations](docs/screenshot-en-generators.png)

## Quick start

The build is a single self-contained HTML file — open it and it works:

- **Use the hosted version:** <https://whitebite.github.io/Domain-Hunter/>
- **Run locally:** open [`dist/index.html`](dist/index.html) straight from disk (`file://` is fully supported).
- **Build from source:**

```bash
npm install
npm run build     # produces dist/index.html — one file, everything inlined
npm run dev       # Vite dev server for development
```

No backend, no environment variables, no API keys — ever.

## Deploy your own copy

**GitHub Pages** (easiest):

1. Fork this repository.
2. Settings → Pages → Source: **GitHub Actions** (the included `deploy.yml` workflow builds and publishes automatically on every push to `main`).
3. Your copy is live at `https://<you>.github.io/Domain-Hunter/`.

**Cloudflare Pages:** import the repo, build command `npm run build`, output directory `dist`.

**Any static host or disk:** serve or open `dist/index.html`. All paths are relative (`base: './'`), so it works under any sub-path.

## How it works

1. The browser talks **directly to registry RDAP endpoints** — all endpoints used by Domain Hunter have open CORS, so no server or proxy is required.
2. **HTTP 200 → taken**, **404 → not in the registry** (then trust rules apply: high-trust gTLDs report `available`; low-trust ccTLDs are double-checked via DNS-over-HTTPS and reported as `probably_available`).
3. **429 / 5xx → retry with backoff**; on persistent network or CORS failures an optional, user-supplied Cloudflare Worker proxy can take over (see `worker.js` setup in the app settings).
4. Results are cached locally with a configurable TTL; re-checking is one click, and an "ignore cache" toggle forces fresh lookups.

## Supported zones

147 curated zones grouped by registry infrastructure: Verisign (`com net cc tv`), Google Registry (`dev app page new day how ing meme zip mov foo dad phd prof esq nexus rsvp soy boo channel`), Identity Digital (`io ai me sh ac pro info live world email studio agency` and 70+ more), CentralNic (`xyz lol icu cyou bond sbs cfd art` and 30+ more), Radix (`tech site online fun space store website press host`), Uniregistry (`cloud link top win bid loan men`), plus stealth ccTLD endpoints (`de co us uk nl fr ch ru so ly`). The live IANA bootstrap adds newly delegated gTLDs automatically.

Missing a zone? It is data-driven — adding an entry to `src/config/tlds.json` is enough, no code changes needed.

## Domain Hunter vs alternatives

| | Domain Hunter | Registrar search boxes | `whois` CLI | Paid APIs (WhoisXML, DomainTools) |
|---|---|---|---|---|
| Price | Free, MIT | Free (locks you to one registrar) | Free | From ~$19/mo |
| Bulk checking | 3,000 names × 140+ TLDs | One at a time | Scripting required | Yes, metered |
| Servers / API keys | **None — runs in browser** | N/A | Local install | API key + billing |
| Name generators | 5 built-in | Basic suggestions | None | None |
| Live prices + 3-year TCO | 12 registrars compared | Own prices only | None | Extra fee |
| Privacy | No tracking, local-only | Search history logged | Private | Query logs |

Choose a paid API if you need guaranteed SLAs, premium-domain pricing feeds, or millions of checks per day. Choose Domain Hunter when you want a fast, free, private way to brainstorm and validate hundreds of candidates right now.

## FAQ

### How can it check domains without a server or API key?

Registries expose RDAP (Registration Data Access Protocol, the modern successor to WHOIS) over HTTPS, and the endpoints Domain Hunter uses send permissive CORS headers. Your browser calls them directly, exactly like it calls any public API.

### Is the "available" status accurate?

For ICANN-contracted gTLD infrastructure (Verisign, Google, Identity Digital, …) an RDAP 404 is authoritative. For ccTLDs with less reliable RDAP, Domain Hunter corroborates with DNS NS lookups and reports `probably_available` instead of overpromising. A domain can still be registered by someone else seconds later — a check is a snapshot, so buy promptly.

### Is this legal and polite to registries?

Yes. RDAP is the registries' own public, machine-readable interface (it exists precisely to replace scraped WHOIS). Domain Hunter spaces requests per infrastructure, honors `Retry-After`, and slows down exponentially when throttled — e.g. Google Registry gets at most ~1 request/second.

### How many domains can I check at once?

Up to 3,000 input names; with TLD expansion that is capped at 30,000 individual checks per run. A local cache means re-runs are nearly instant.

### Does it support IDN and ccTLDs like .ru or .de?

Internationalized names are converted to punycode automatically. `de co us uk nl fr ch ru so ly` are supported via dedicated endpoints (`ru` is marked experimental due to geo-restrictions on its RDAP — the optional proxy fallback covers such cases).

### Where is my data stored?

Nowhere but your browser. Settings, cache, and custom word sets live in `localStorage` under `dh:v1:*` keys. There is no account, no server-side state, and no analytics of any kind.

## Tech stack

Svelte 5 + TypeScript (strict), Vite 7, and `vite-plugin-singlefile` — the entire app (JS, CSS, fonts, Web Worker checking engine) compiles into **one HTML file** that also works from `file://`. Tests use Vitest; CI deploys to GitHub Pages via GitHub Actions.

## Contributing

Issues and PRs are welcome. Good first contributions: new curated zones (edit `src/config/tlds.json`), new thematic word sets (`src/config/dictionaries/`), translations (`src/i18n/`). See [AGENTS.md](AGENTS.md) for build/test commands and project conventions.

## License

[MIT](LICENSE) — do whatever you want, attribution appreciated.

---

[![Star History Chart](https://api.star-history.com/svg?repos=WhiteBite/Domain-Hunter&type=Date)](https://star-history.com/#WhiteBite/Domain-Hunter&Date)

If Domain Hunter saved you time, a ⭐ helps others find it too.
