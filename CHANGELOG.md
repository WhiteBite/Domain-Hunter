# Changelog

Versioning policy: the package version follows the CLI/MCP JSON contract
(`cli/contract.ts`) — additive fields are a minor bump, breaking changes are
a major bump. The browser app ships continuously from `main` and is not
versioned separately.

## 2.0.0

- First npm release: `domain-hunter` CLI (`check`, `prices`, `generate`, `find`, `tlds`) and the MCP server (`dist-cli/mcp-server.mjs`).
- Browser app: 148 curated zones across 18 registry infrastructures, IANA bootstrap auto-discovery, three-state availability model, live FX rates, registrar price matrix with 3-year TCO and promo-trap flags, five name generators, daily dropped-domains snapshot, 8 UI languages.
