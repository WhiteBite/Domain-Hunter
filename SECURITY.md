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

## Out of scope

- Vulnerabilities in third-party registry RDAP endpoints or DoH resolvers.
- Anything requiring a modified browser or physical access.
- Social engineering of maintainers.

## Safe harbor

Good-faith research following this policy is authorized. Thank you for keeping Domain Hunter safe.
