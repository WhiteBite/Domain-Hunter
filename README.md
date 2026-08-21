# Domain Hunter — Bulk Domain Availability Checker & Name Generator

**English** | [Русский](README.ru.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-gold.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/WhiteBite/Domain-Hunter?style=social)](https://github.com/WhiteBite/Domain-Hunter/stargazers)
[![Deploy](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml/badge.svg)](https://github.com/WhiteBite/Domain-Hunter/actions/workflows/deploy.yml)

Free, open-source bulk domain availability checker and name generator that runs entirely in your browser. Check thousands of domains against 148+ TLD registries via RDAP (the modern WHOIS lookup alternative), compare prices across registrars, and brainstorm available names with five built-in generators. No servers, no API keys, no tracking.

**[▶ Live demo](https://whitebite.github.io/Domain-Hunter/)** — works instantly, nothing to install.

> **This is a finished product you can use right now.** Open <https://whitebite.github.io/Domain-Hunter/> and start checking domains or generating names immediately. No install, no signup, no API keys, no tracking. The entire app compiles into a single HTML file (`dist/index.html`) that also works offline from `file://`. Download it, share it, run it anywhere.

![Domain Hunter checking five brand names across 15 TLDs — streaming results with status badges, first-year and renewal prices, CSV export](docs/screenshot-en-check.png)

Domain Hunter calls registry **RDAP** endpoints directly from the browser (Verisign, Google Registry, Identity Digital, CentralNic, Radix…) to tell you which domains are available. It generates brandable name ideas with five built-in generators, shows **live registrar prices** with 3-year total cost of ownership, and exports everything to CSV, TSV, or Markdown. It is a privacy-friendly alternative to WHOIS lookup services and paid domain APIs like WhoisXML or DomainTools — the whole app compiles into one self-contained HTML file that also works from `file://`.

## How to check domain availability in bulk

Paste up to 3,000 domain names, pick the TLDs you care about, and hit start. Results stream live into a sortable table with status badges, pricing columns, and per-domain buy links. Interrupted runs can be resumed later.

- **148 curated TLD zones** across 18 registry infrastructures (`com net io ai dev app xyz me co uk de nl fr ch so ly tech site online store cloud` and more). New gTLDs are discovered automatically via the live IANA RDAP bootstrap. Results stream live into a sortable table with status badges, pricing columns, and per-domain buy links. Interrupted runs can be resumed later. Run history with one-click restore keeps your last search ready after reload.
- **Honest three-state results** — `available`, `probably_available`, or `unknown`. For low-trust ccTLDs a 404 is corroborated with DNS-over-HTTPS (Cloudflare + Google DNS) before anything is called available. Domain Hunter never guesses.
- **Cloudflare RDAP aggregator fallback** — when the primary RDAP fetch fails, `rdap.cloudflare.com/domain/{domain}` is queried once as a transport fallback and as a contradiction cross-check for low-trust zones. A taken domain must never be reported free.
- **Polite to registries** — per-infrastructure AIMD rate limiting (Google Registry's strict ~1 rps is honored), automatic backoff on HTTP 429 with `Retry-After`, and result caching in `localStorage`.

## How to compare domain prices across registrars

The **Prices tab** shows a TLD × registrar price matrix with the cheapest cell highlighted, promo-trap flags (renewal ≥ 5× first year), and an exportable CSV. The results table includes a detail row with full **registrar price comparison** and clickable buy/search links for every available domain.

- **Live prices** from Porkbun and Cloudflare at-cost, plus weekly snapshots from Dynadot, Spaceship, ValueDomain, reg.ru, and Beget harvested via regctl.sh.
- **Coupons, promo-trap detection**, and 3-year TCO sorting. Prices shown in USD, RUB, or EUR.
- **Coverage-aware buy links** target the cheapest registrar that has a deep-link template, not merely the cheapest price in the table.

## How to find available domain name ideas

Five generators produce candidates you can check immediately:

1. **Combinator** — roots × affixes (prefix, suffix, both)
2. **Syllable mixer** — pronounceability-scored neologisms from CMUdict-derived syllable banks
3. **Thematic word sets** — curated categories (tech, nature, mythology, colors, constellations)
4. **TLD-hacks** — `family` → `fami.ly` style splits using hackable TLDs
5. **Word mutations** — vowel swaps, consonant shifts, truncation, suffixes

Every candidate collects in a persistent tray that survives tab switches and shows the projected number of checks before you run them.

## Dropped domains at registration price

The **Drops tab** scans expired/dropped domains and reports those still available at standard registration price — no aftermarket markups. Star any domain to add it to your watchlist; the app silently re-checks favorited domains on load and flags freed or taken changes.

## Social handles

The **Social tab** checks username availability across major platforms (Twitter/X, GitHub, Instagram, YouTube, TikTok, Twitch, Reddit, Telegram) so you can secure a consistent handle everywhere.

## Export, share, and organize

- **CSV download** — Excel-compatible file with BOM and proper quoting
- **Copy as CSV / Markdown / TSV** — clipboard formats for pasting into spreadsheets, docs, or Notion
- **Bulk actions for available domains** — copy the list of all available domains, favorite them all at once, or export an available-only CSV
- **Share links** — `#s=` encodes query + zones and auto-starts the run on open
- **Favorites with watchlist** — star any domain into a persistent shortlist; freed/taken badges appear on reload
- **Run history** — recent completed runs are saved locally; click to restore the full search (query, zones, results) in one tap
- **Last-search restore** — after a page reload the app restores your previous input and zone selection so you can resume instantly
- **Social checks with GitHub token** — the Social tab supports optional GitHub device-flow authentication for higher-rate username lookups
- **Registrar favicon badges** — price cells show registrar logos alongside prices for quick visual scanning

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `/` | Focus the results search box |
| `Ctrl` + `Enter` | Start the check from the input field |
| `Escape` | Close popovers and menus |

## Themes

Premium dark and light themes with smooth transitions, system preference detection, and a manual toggle in the header. All UI elements follow WCAG AA contrast ratios.

## Multilingual UI

Available in **8 languages**: English, Russian, Spanish, German, Portuguese, Chinese, Japanese, and French. Switch from the header language menu.

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

## Guides

Step-by-step articles published alongside the app:

- [How to check domain availability in bulk](https://whitebite.github.io/Domain-Hunter/how-to-check-domain-availability-in-bulk.html) — RDAP method, step-by-step bulk checking, trust and rate-limit caveats
- [Domain name ideas that are actually available](https://whitebite.github.io/Domain-Hunter/domain-name-ideas-that-are-actually-available.html) — five naming techniques: combinatorics, syllables, TLD hacks, mutations, themes

## RDAP vs WHOIS

WHOIS returns unstructured text — a human-readable wall of paragraphs that is hard to parse programmatically and slow to automate at scale. RDAP (Registration Data Access Protocol, standardized as [RFC 9083](https://www.rfc-editor.org/rfc/rfc9083)) is its JSON successor: structured, machine-readable, and designed for API consumption. Every endpoint Domain Hunter uses sends permissive CORS headers, so your browser calls registries directly with zero proxy. That makes bulk checking fast, rate-limit friendly, and free.

## Who is it for

- **Domain investors & drop-catchers** — monitor a watchlist of hundreds of names across 148+ TLDs, track dropped/expired domains, and export freed or taken changes in CSV.
- **Brand naming** — five generators (combinator, syllable mixer, thematic sets, TLD-hacks, mutations) produce candidates you can check immediately.
- **Developers** — single-file MIT build, embeddable, no backend, no dependencies. Fork it, deploy it, extend it.
- **Privacy-conscious users** — no accounts, no logs, no analytics. Everything runs locally in your browser.

## How it works

1. The browser talks **directly to registry RDAP endpoints** — all endpoints used by Domain Hunter have open CORS, so no server or proxy is required.
2. **HTTP 200 → taken**, **404 → not in the registry** (then trust rules apply: high-trust gTLDs report `available`; low-trust ccTLDs are double-checked via DNS-over-HTTPS and reported as `probably_available`).
3. **429 / 5xx → retry with backoff**; on persistent network or CORS failures the Cloudflare RDAP aggregator is tried once, then DoH corroboration takes over.
4. Results are cached locally with a configurable TTL; re-checking is one click, and an "ignore cache" toggle forces fresh lookups.

## Supported zones

148 curated zones grouped by registry infrastructure: Verisign (`com net cc tv`), Google Registry (`dev app page new day how ing meme zip mov foo dad phd prof esq nexus rsvp soy boo channel`), Identity Digital (`io ai me sh ac pro info live world email studio agency` and 54 more), CentralNic (`xyz lol icu cyou bond sbs cfd art` and 21 more), Radix (`tech site online fun space store website press host uno pw`), Uniregistry (`cloud link top win bid loan men`), stealth ccTLD endpoints (`de co us uk nl fr ch ru so ly pl`), and NASK Poland (`pl`). The live IANA bootstrap adds newly delegated gTLDs automatically.

Missing a zone? It is data-driven — adding an entry to `src/config/tlds.json` is enough, no code changes needed.

## Domain Hunter vs alternatives

| | Domain Hunter | Registrar search boxes | `whois` CLI | Paid APIs (WhoisXML, DomainTools) |
|---|---|---|---|---|
| Price | Free, MIT | Free (locks you to one registrar) | Free | From ~$19/mo |
| Bulk checking | 3,000 names × 148+ TLDs | One at a time | Scripting required | Yes, metered |
| Servers / API keys | **None — runs in browser** | N/A | Local install | API key + billing |
| Name generators | 5 built-in | Basic suggestions | None | None |
| Live prices + 3-year TCO | Multi-registrar comparison | Own prices only | None | Extra fee |
| Export formats | CSV, TSV, Markdown, share links | None | Manual | Depends |
| Privacy | No tracking, local-only | Search history logged | Private | Query logs |
| Name ideas quality | 5 generators (combinator, syllables, themes, TLD-hacks, mutations) | Basic suggestions | None | None |

Choose a paid API if you need guaranteed SLAs, premium-domain pricing feeds, or millions of checks per day. Choose Domain Hunter when you want a fast, free, private way to brainstorm and validate hundreds of candidates right now.

## FAQ

### How can it check domains without a server or API key?

Registries expose RDAP (Registration Data Access Protocol, the modern successor to WHOIS) over HTTPS, and the endpoints Domain Hunter uses send permissive CORS headers. Your browser calls them directly, exactly like it calls any public API. An optional user-supplied Cloudflare Worker proxy can take over for stubborn endpoints.

### Is the "available" status accurate?

For ICANN-contracted gTLD infrastructure (Verisign, Google, Identity Digital, …) an RDAP 404 is authoritative. For ccTLDs with less reliable RDAP, Domain Hunter corroborates with DNS NS lookups via DoH and reports `probably_available` instead of overpromising. A domain can still be registered by someone else seconds later — a check is a snapshot, so buy promptly.

### Is checking domains via RDAP legal and polite to registries?

Yes. RDAP is the registries' own public, machine-readable interface (it exists precisely to replace scraped WHOIS). Domain Hunter spaces requests per infrastructure, honors `Retry-After`, and slows down exponentially when throttled — e.g. Google Registry gets at most ~1 request/second. The global concurrency cap keeps things sane.

### What is a promo trap and why does renewal price matter?

Some registrars advertise a $0.99 first year but charge $25 to renew. Domain Hunter flags these as **promo traps** when the renewal price is 5× or more the first-year price. Always check the renewal column and the 3-year TCO, not just the headline price.

### Do you support IDN and ccTLDs like .ru or .de?

Internationalized domain names are converted to punycode automatically. `de co us uk nl fr ch ru so ly pl` are supported via dedicated RDAP endpoints (`ru` is marked experimental due to geo-restrictions on its RDAP — the optional proxy fallback covers such cases).

### Can it run offline or from disk?

Yes. The production build is a single `index.html` file that works from `file://` with zero network requests. Pricing data falls back to a bundled snapshot; availability checks require a network connection to reach RDAP endpoints.

### How is "available" determined for ccTLDs?

A ccTLD 404 triggers two parallel checks: a DNS-over-HTTPS NS probe (Cloudflare + Google DNS) and, when available, a Cloudflare RDAP aggregator query. If the aggregator returns 200 the domain is marked `taken` regardless of the DoH outcome. Otherwise the DoH result stands: NXDOMAIN → `probably_available`, NOERROR → `taken`, other → `unknown`.

### Where is my data stored?

Nowhere but your browser. Settings, cache, favorites, and custom word sets live in `localStorage` under `dh:v1:*` keys. There is no account, no server-side state, and no analytics of any kind.

## Tech stack

Svelte 5 + TypeScript (strict), Vite 7, and `vite-plugin-singlefile` — the entire app (JS, CSS, fonts, Web Worker checking engine) compiles into **one HTML file** that also works from `file://`. Tests use Vitest for pure logic and Playwright E2E (with mocked network) for UI; CI deploys to GitHub Pages via GitHub Actions.

## Contributing

Issues and PRs are welcome. Good first contributions: new curated zones (edit `src/config/tlds.json`), new thematic word sets (`src/config/dictionaries/`), translations (`src/i18n/`). See [AGENTS.md](AGENTS.md) for build/test commands and project conventions.

## Citing

If you reference Domain Hunter in academic or technical work, please use the metadata in [`CITATION.cff`](CITATION.cff):

```bibtex
@software{domain_hunter_2026,
  author = {WhiteBite},
  title = {Domain Hunter — Bulk Domain Availability Checker & Name Generator},
  version = {2.0.0},
  year = {2026},
  url = {https://github.com/WhiteBite/Domain-Hunter},
  license = {MIT}
}
```

## License

[MIT](LICENSE) — do whatever you want, attribution appreciated.

---

[![Star History Chart](https://api.star-history.com/svg?repos=WhiteBite/Domain-Hunter&type=Date)](https://star-history.com/#WhiteBite/Domain-Hunter&Date)

If Domain Hunter saved you time, a ⭐ helps others find it too.
