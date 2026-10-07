# Changelog

Versioning policy: the package version follows the CLI/MCP JSON contract
(`cli/contract.ts`) — additive fields are a minor bump, breaking changes are
a major bump. The browser app ships continuously from `main` and is not
versioned separately.

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
