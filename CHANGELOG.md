# Changelog

Versioning policy: the package version follows the CLI/MCP JSON contract
(`cli/contract.ts`) — additive fields are a minor bump, breaking changes are
a major bump. The browser app ships continuously from `main` and is not
versioned separately.

## Unreleased

- Browser: explain known RDAP failures and conflicting signals in all eight locales without changing availability classifications.
- Build: pack locale dictionaries losslessly for a smaller self-contained HTML file.
- CI: verify packaged CLI/MCP and coordination on Linux, macOS and Windows; add a bounded live protocol smoke test with fixed public test domains.
- Release operations: dispatch tag-verified npm trusted publishing and HTML/checksum attachment independently from `main`.

## 3.0.0

- **Breaking MCP change:** `get_prices` now returns at most 100 rows by default (maximum 200). Follow `nextOffset` with the same filters to retrieve subsequent pages.
- MCP: add keyless, read-only DotSweep, Domainee and DigMyName availability signals with explicit source selection, conservative uncertainty, source attribution, privacy notices and standard-price caveats. Provider responses may be cached and are not registration guarantees.
- MCP: coordinate provider request pacing, cooldowns and quotas across processes for the same OS user without persisting queried domains; reject requests when coordination cannot be established.
- CLI/MCP: provide per-field price provenance, independent renewal and three-year estimates, and clearer snapshot/API limitations. The MCP server does not expose keyed registrar APIs; the existing optional CLI-only Dynadot integration remains separate.
- Browser app: no new API calls or credentials.

## 2.1.3

- Packaging: the web-font package moved to devDependencies — `npm i -g domain-hunter` now installs with zero runtime dependencies.

## 2.1.2

- Pipeline validation release: first version published via OIDC trusted publishing from GitHub Actions (tokenless, provenance attested).

## 2.1.0

- CLI: `drops`, `watch` (exit 10 on status flip), `keys`, and `completions` (bash/zsh/fish) commands; `--format table|csv` output for `check`/`prices`/`drops`.
- CLI: optional Dynadot keyed pricing source (`keys set dynadot`, `prices --source dynadot`) — see `docs/registrar-keys.md`.
- MCP: `list_drops` and `price_trends` tools.
- App: RDAP registry card in results detail rows (registration/expiry dates, age, registrar, EPP statuses, nameservers).
- App: Drops toolkit — length/digits/hyphens/pronounceability filters, score and min-registration-price columns, sorts, lazy Wayback history per row.
- App: history moved into a slide-over drawer; generator-tray rows expand into technique details and a per-zone availability preview.
- App: new-zone tracker — "+N" chip in the TLD picker for zones delegated since the last visit (one-click add).
- App: domain projects/portfolios with notes and per-project CSV/JSON export (Settings).
- App: USPTO/TMview trademark search link-outs from detail rows.
- App: scheduled watchlist re-checks with browser-notification opt-in (Settings).
- App: pronounceability score badge and sort-by-score in the generator tray.
- PWA: web app manifest, offline service worker (same-origin GET only), generated icons (`npm run build:icons`).
- Refactor: canonical `.btn` primitive and `--shadow-1/2/pop` shadow tokens; ResultsTable composables (registrar-quotes, premium-check, bulk-actions).

## 2.0.0

- First npm release: `domain-hunter` CLI (`check`, `prices`, `generate`, `find`, `tlds`) and the MCP server (`dist-cli/mcp-server.mjs`).
- Browser app: 148 curated zones across 18 registry infrastructures, IANA bootstrap auto-discovery, three-state availability model, live FX rates, registrar price matrix with 3-year TCO and promo-trap flags, five name generators, daily dropped-domains snapshot, 8 UI languages.
