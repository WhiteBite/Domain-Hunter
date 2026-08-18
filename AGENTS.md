# AGENTS.md — instructions for AI coding agents

## What is this project?

Domain Hunter is a free, open-source, **100% client-side** bulk domain availability checker and name generator. The browser talks directly to registry RDAP endpoints — there is no backend, no API key, no analytics. The production build is a **single self-contained `dist/index.html`** that also works from `file://`.

`SPEC.md` is the binding contract for all behavior. If code and SPEC disagree, SPEC wins unless it is factually impossible. Read it before non-trivial changes.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build → single-file `dist/index.html`
- `npm run preview` — serve the production build locally
- `npm run typecheck` — `tsc --noEmit`, must pass before committing
- `npm test` — Vitest suites in `tests/` (pure logic only: status interpretation, AIMD, queue, punycode, CSV, i18n parity, generators, pricing merge)
- `npm run test:e2e` — Playwright E2E against `dist/index.html` (all network mocked, build dist first)
- `npm run test:e2e:ui` — Playwright E2E in interactive UI mode
- `npm run build:worker` — regenerate the optional Cloudflare CORS proxy `worker.js` from `src/config/tlds.json`

## Project layout

```
index.html              # Vite entry: meta/OG/JSON-LD, CSP, mounts src/main.ts
src/
  main.ts               # mounts App
  App.svelte            # header, tab router, footer
  types.ts              # ALL shared contracts — single source of truth, never duplicate
  config/
    tlds.json           # 17 infras + 147 curated zones (data-driven: add zones here, never in code)
    registrars.json     # 12 registrars: buy-link templates
    pricing.snapshot.json  # offline pricing baseline
    wholesale.json      # registry floor prices (promo detection)
    dictionaries/       # generator word data + LICENSES.md attribution (required)
  core/
    engine.ts  engine.worker.ts  # checking engine; worker runs fetch+interpretation
    rdap-client.ts  rate-limiter.ts  queue.ts  doh.ts  idn.ts  cache.ts  bootstrap.ts
  pricing/pricing.ts    # live fetch + merge + TTL + currency + TCO + coupons
  generators/           # combinator, syllables, hacks, mutations, themes (pure functions)
  i18n/                 # en.ts + ru.ts — flat dot-keys, identical key sets (parity enforced)
  ui/                   # tokens.css, stores, csv/share/theme/settings, components/
tests/                  # Vitest suites (pure logic) + e2e/ (Playwright E2E, mocked network)
scripts/                # CI helpers (price harvest, zone health, worker build)
```

## Conventions (must follow)

- **TypeScript strict.** Shared types live only in `src/types.ts`. No `any`, no `@ts-ignore`.
- **All user-visible strings go through i18n** (`t(key)`), including tooltips, aria-labels, empty states, and errors. `en.ts` and `ru.ts` key sets must stay identical — a test enforces parity.
- **Zones are data, not code.** Adding/changing a TLD means editing `src/config/tlds.json` only.
- **Never guess availability.** Honor the three-state model in SPEC §7 (`available` / `probably_available` / `unknown`); DoH-only results never yield bare `available`. A wrong "available" is worse than "unknown".
- **Be polite to registries.** Per-infra rate profiles, AIMD backoff, honor `Retry-After`, global concurrency cap. Google Registry ≈1 rps is strict.
- **Network allowlist.** Runtime requests only to: RDAP endpoints, IANA bootstrap, DoH endpoints, Porkbun pricing, cfdomainpricing.com. No CDNs, no webfonts from network, no analytics.
- **Security.** Registry-derived text is escaped; external links use `target="_blank" rel="noopener noreferrer"`; keep the CSP meta in `index.html` intact.
- **Pricing unit is USD cents** internally; display converts via `settings.rates`.
- **Storage keys** are versioned: `dh:v1:*` (see SPEC §5). Migrate, don't silently break.

## Boundaries

- ✅ Always: run `npm run typecheck` after changes; add/update tests for changed logic; keep README/llms.txt facts (zone counts, feature lists) in sync with code.
- ✅ Always: run `npm run test:e2e` after changing UI components or adding interactive elements (inventory meta-test enforces data-testid coverage).
- ⚠️ Ask first: changing the status model (SPEC §7), adding runtime network destinations, adding dependencies, touching CI workflows.
- 🚫 Never: commit secrets or API keys, add analytics/telemetry of any kind, hardcode credentials, add CDN references, inject RDAP response bodies into the DOM.

## Notes

- `dist/` is build output — never edit by hand.
- When adding a dictionary dataset, attribute it in `src/config/dictionaries/LICENSES.md` (name, source URL, license).
- The app must keep working from `file://` and under a sub-path (`base: './'`) — verify after routing/asset changes.
