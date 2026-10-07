# Security Policy

## Supported versions

Domain Hunter is a static, client-side app. Only the latest commit on `main` (and the deployed GitHub Pages build) is supported. There are no server-side components to patch.

## Reporting a vulnerability

Please report security issues privately via GitHub's **private vulnerability reporting** (repo → Security → "Report a vulnerability"), or open a public issue for non-sensitive concerns. Expect an acknowledgment within a few days.

## What to look at

The most interesting attack surface is small but real:

- **Registry-derived data handling** — RDAP/DoH responses must never reach the DOM unescaped; only HTTP status codes and our own config are rendered.
- **CSP** — the meta CSP in `index.html` is the primary injection control; do not weaken it.
- **Optional CORS proxy (`worker.js`)** — it resolves only TLDs from its embedded map; arbitrary URL passthrough would be an SSRF vector and must never be added.
- **Share links (`#s=`)** — decoded state must be validated, never trusted.

## Network reachability (CSP trade-off)

The app connects to registry RDAP hosts discovered through the live IANA bootstrap — newly delegated gTLDs join at any time — so `connect-src` cannot be a fixed host list and is set to `https:`. The reachable set is enforced by convention instead:

- SPEC §13's runtime allowlist is the single source of truth for destinations.
- The E2E suite runs behind a catch-all network mock: any request outside the mocked allowlist fails the spec.
- Adding a runtime destination requires SPEC §13 + SECURITY.md + e2e-mock review before code lands (AGENTS.md "Ask first").

## User-provided keys

- By default no keys exist anywhere. The optional GitHub token lives only in `localStorage` and is sent only to `api.github.com`.
- Registrar API keys (planned): CLI keys are stored in `~/.domain-hunter/storage.json` (mode 0600 at creation) and never leave the machine. The optional browser path runs through a user-hosted worker, so keys never leave your own infrastructure.
- Keys are never stored in the app bundle, CI configuration, or the hosted deployment.

## Out of scope

- Vulnerabilities in third-party registry RDAP endpoints or DoH resolvers.
- Anything requiring a modified browser or physical access.
- Social engineering of maintainers.

## Safe harbor

Good-faith research following this policy is authorized. Thank you for keeping Domain Hunter safe.
