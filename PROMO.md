# PROMO.md — promotion kit for Domain Hunter

Everything here is ready to copy-paste. Order matters: do §1 first (it makes every later step more effective).

## 1. One-time GitHub checklist (5 minutes, manual)

- [ ] **Push the current changes** — the `deploy.yml` workflow will build and publish the app to GitHub Pages automatically. Verify at <https://whitebite.github.io/Domain-Hunter/> after the Actions run turns green.
- [ ] **Upload the social preview:** repo → Settings → General → Social preview → upload `public/social-preview.png` (1280×640, already made).
- [ ] **Create release v2.0.0:** Releases → Draft new release → tag `v2.0.0`. Google indexes release pages; fresh releases boost AI recommendations (~1.6×).
- [ ] **Add a real screenshot to the README** once the Pages deploy is live (open the app, take a full-window shot, save as `public/screenshot.png`, embed near the top of `README.md`). Screenshots raise perceived quality for humans; keep the file < 500 KB.
- [ ] Pin the repo on your GitHub profile.

Already done (2026-08-17): About description, homepage URL, 14 topics, Pages enabled, `llms.txt`, `AGENTS.md`, `CITATION.cff`, OG/Twitter/JSON-LD meta in the app.

## 2. Awesome-list PRs (highest-value backlinks)

Search GitHub for active lists before submitting — candidates: `awesome-osint` (domain section), `awesome-selfhosted`-adjacent browser-tool lists, `awesome-domains`-style lists, `awesome-privacy`, topic-curated lists under `github.com/topics/domain-name`. Verify the list is maintained (commit in last ~6 months) before spending time.

**PR title:** `Add Domain Hunter — browser-based bulk domain availability checker`

**PR body:**

> **Domain Hunter** — free, open-source, 100% client-side bulk domain availability checker and name generator.
>
> - Checks up to 3,000 names across 140+ TLDs by calling registry RDAP endpoints directly from the browser — no servers, no API keys, no tracking
> - Five name generators (combinator, syllable mixer, themes, TLD-hacks, mutations)
> - Live first-year/renewal prices from 12 registrars with 3-year TCO and CSV export
> - MIT licensed: https://github.com/WhiteBite/Domain-Hunter
> - Live demo: https://whitebite.github.io/Domain-Hunter/
>
> Suggested entry: `- [Domain Hunter](https://github.com/WhiteBite/Domain-Hunter) — browser-based bulk domain availability checker and name generator; RDAP-direct, no API keys, no tracking.`

## 3. Reddit drafts (be genuinely useful, not salesy)

**r/sideproject / r/Domainers / r/domains — title:**

> I built a free bulk domain checker that runs entirely in your browser — no API keys, no tracking

**Body skeleton:** the itch (registrar search boxes log your searches and are one-at-a-time) → how it works (browser calls registry RDAP directly, CORS is open) → honest limits (ccTLD quirks, snapshot-not-guarantee availability, premium pricing blind spot) → link + demo. Ask for feedback on which TLDs to add next. Reply to every comment.

**r/webdev angle:** the technical story — "RDAP endpoints have open CORS, so a pure client-side WHOIS replacement is possible in 2026". Teach, then link.

## 4. Dev.to / Hashnode article outline

Title: **"I replaced WHOIS with 200 lines of fetch(): building a serverless domain checker"**

1. WHOIS is being shut down; RDAP is the JSON replacement nobody talks about.
2. The discovery: major registries (Verisign, Google, Identity Digital) send `Access-Control-Allow-Origin: *`.
3. Architecture: Web Worker engine, per-registry AIMD rate limiting, DoH corroboration for flaky ccTLDs.
4. The three-state honesty model (why "unknown" beats a wrong "available").
5. Single-file build trick (`vite-plugin-singlefile`) → works from `file://`.
6. Link to repo + demo. Canonical URL pointing at the repo Pages site.

Cross-post to Hashnode and your blog if you have one; dev communities syndicate to aggregators that LLMs train on.

## 5. Show HN (when you have a screenshot and a calm weekday morning)

**Title:** `Show HN: Domain Hunter – bulk domain availability checker that runs 100% in the browser`

First comment: one paragraph on the RDAP-CORS trick + why no tracking matters (registrar front-running paranoia) + link to the repo. HN rewards technical humility: mention what it can't do (no premium pricing, ccTLD gaps, snapshot semantics).

## 6. Product Hunt (later, optional)

Tagline: `Free bulk domain checker — 140+ TLDs, zero servers, zero tracking`
Topics: Developer Tools, Privacy, Open Source. Launch only after the README has a screenshot and a few stars of social proof.

## 7. Never do this

- **Don't buy stars.** CMU research (ICSE 2026) shows fake stars give < 2 months of boost and become a long-term liability; GitHub actively purges them.
- **Don't keyword-stuff** the About section or README — it measurably reduces both GitHub and LLM visibility.
- **Don't spam links** without substance — one good Show HN beats twenty drive-by comments.

## 8. Ongoing (the compounding part)

- Merge small improvements regularly — commit freshness correlates with AI recommendation rate.
- When users report TLD gaps, add them (each zone addition is a legit commit + potential release note).
- Re-check topic competitiveness monthly: `gh search repos "domain availability" --limit 20 --json fullName,description,repositoryTopics`.
- Answer domain-checking questions on Stack Overflow / Reddit where Domain Hunter is genuinely the fix.
