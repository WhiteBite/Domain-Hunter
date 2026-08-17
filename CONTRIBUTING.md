# Contributing to Domain Hunter

Issues and PRs are welcome — the project is intentionally small and data-driven, so most contributions are easy to review.

## Setup

```bash
npm install
npm run dev        # Vite dev server
npm run typecheck  # tsc --noEmit — must pass
npm test           # Vitest (pure logic suites)
npm run build      # single-file dist/index.html
```

Read [AGENTS.md](AGENTS.md) for the conventions and [SPEC.md](SPEC.md) for the binding behavior contract before non-trivial changes.

## Great first contributions

- **New TLD zones** — edit `src/config/tlds.json` only (zones are data, never code). Verify the RDAP endpoint answers and has open CORS; add a stealth infra entry if IANA bootstrap misses it.
- **Thematic word sets** — add JSON under `src/config/dictionaries/` and attribute the dataset (name, source URL, license) in `src/config/dictionaries/LICENSES.md`. Permissive licenses only (CC0, MIT, BSD, Unlicense).
- **Translations** — `src/i18n/`: flat dot-keys; `en.ts` and `ru.ts` key sets must stay identical (a test enforces parity). All user-visible strings go through `t(key)`.
- **Docs and guides** — README fixes, long-tail guide pages under `public/`, FAQ entries.

## Pull request checklist

- [ ] `npm run typecheck` and `npm test` pass
- [ ] No `any`, no `@ts-ignore`, no new runtime dependencies without discussion
- [ ] No analytics/telemetry, no CDN references, no secrets — ever
- [ ] Registry politeness preserved (per-infra rate profiles, AIMD, `Retry-After`)
- [ ] The three-state availability model (SPEC §7) untouched: a wrong "available" is worse than "unknown"
- [ ] App still works from `file://` and under a sub-path (`base: './'`)

## What we will not merge

- Server-side components, accounts, or anything requiring keys in the browser
- Keyword-stuffed SEO content that does not help a reader
- Changes that weaken the CSP or the network allowlist
