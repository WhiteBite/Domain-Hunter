# Registrar API keys (CLI-first)

Domain Hunter prices come from keyless public sources (Porkbun, Cloudflare
at-cost, offline snapshot). Some registrars only expose bulk TLD pricing behind
an API key. The **CLI** can store such keys locally and merge them as an extra
pricing source. The browser app never handles registrar keys (see
[Browser route](#browser-route-not-implemented) below).

## Storage

Keys live in the CLI storage file:

```
~/.domain-hunter/storage.json      (directory mode 0700, file mode 0600)
```

under the internal key `dh:cli:registrar-keys`. Keys never appear in command
output — `keys list` shows only a `****`-masked tail. Nothing is sent anywhere
except the registrar's own API over HTTPS.

## Commands

```bash
# store a key
node dist-cli/domain-hunter.mjs keys set dynadot <api-key>

# list stored registrars (masked)
node dist-cli/domain-hunter.mjs keys list

# delete a key
node dist-cli/domain-hunter.mjs keys remove dynadot

# merge dynadot live prices into the prices command
node dist-cli/domain-hunter.mjs prices --source dynadot --tlds com,io
```

Without `--source`, no keyed source is contacted. A missing key is a hard error
(exit 1) when explicitly requested; a network/API failure degrades to a stderr
warning and the command continues with the keyless sources.

Merged entries appear as the `dynadot` registrar inside each TLD's entry map
and participate in best-price selection, TCO, and promo-trap detection like any
other registrar. Only TLDs already present in the curated table are merged —
zones stay data-driven (`src/config/tlds.json`).

## Supported registrars

| Registrar | Bulk TLD pricing | Status |
|---|---|---|
| Dynadot | `api.dynadot.com/api3.json?tld_price&key=` — full TLD price list, key from Dynadot → Tools → API | Supported |
| Namecheap | No bulk pricing API. `namecheap.domains.getinfo` is per-domain XML, requires an IP allowlist and account thresholds | Not possible |
| GoDaddy | No public bulk TLD pricing API (per-domain availability/pricing only, OAuth key) | Not possible |

Dynadot response prices are USD strings and are converted to integer USD cents
(unparseable/negative values become `null`, never guessed).

## Browser route (not implemented)

Storing a registrar API key in `localStorage` is unacceptable: any XSS or a
shared machine leaks it, and registrar APIs do not send CORS headers, so the
browser cannot call them directly anyway. The approved design, if ever needed,
is a **user-self-hosted worker** (same pattern as the optional CORS proxy in
Settings):

1. The user deploys the bundled `worker.js`-style script to their own
   Cloudflare Worker and sets the registrar key as a **worker secret**
   (`wrangler secret put DYNADOT_KEY`).
2. The worker exposes `GET /prices?source=dynadot`, calls the registrar API
   server-side, normalizes to the `Record<tld, PriceEntry>` shape
   (`cli/registrar-sources.ts` is the reference normalizer), and returns JSON
   with permissive CORS for the app origin.
3. The app Settings gain a "pricing worker URL" field (next to the existing
   proxy URL); `loadPricing` merges the worker response as an additional
   source, carry-over semantics unchanged.
4. The key never touches the browser. The worker URL is added to the runtime
   network allowlist (SPEC §13) only as a user-configured destination.

Until an owner decision, no key input exists in the browser UI.
