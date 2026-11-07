# Registrar API keys (CLI-first)

Domain Hunter prices come from keyless public sources (Porkbun, Cloudflare
at-cost, offline snapshot). Some registrars only expose bulk TLD pricing behind
an API key. The **CLI** can store such keys locally and merge them as an extra
pricing source. The MCP server does not expose keyed APIs. The browser app never handles registrar keys (see
[Browser route](#browser-route-not-implemented) below).

## Storage

Keys live in the CLI storage file:

```
~/.domain-hunter/storage.json      (directory mode 0700, file mode 0600)
```

under the internal key `dh:cli:registrar-keys`. The `keys set` positional argument can be visible in shell history or process
listings; avoid running it on a shared machine. Keys never appear in command
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

### Legacy CLI security

This optional source is not exposed by MCP. The browser also does not use it.

Legacy Dynadot authentication places the API key in the HTTPS request URL.
While this application does not print that URL or return it to the model, URLs
may be recorded by proxies, network instrumentation or the provider. Consider
this risk before opting in and restrict the API key's permissions where possible.
No real account was used to validate this integration. Nothing is purchased.

## Supported registrars

| Registrar | Bulk TLD pricing | Status |
|---|---|---|
| Dynadot | [Legacy `tld_price` API](https://www.dynadot.com/domain/api-commands#tld_price), key from Dynadot → Tools → API | Supported only in CLI; legacy API scheduled for retirement |
| Namecheap | [`namecheap.users.getPricing`](https://www.namecheap.com/support/api/methods/users/get-pricing/) returns bulk XML pricing; requires API access and IP allowlisting | Not implemented |
| GoDaddy | No public bulk TLD pricing API (per-domain availability/pricing only, OAuth key) | Not possible |

Dynadot responses are requested explicitly in USD and parsed from the documented
`TldPriceResponse` JSON. Only one-year price units are used; a registration
with an unknown or greater-than-one-year minimum term is not shown as a
one-year registration. Invalid amounts are ignored. The API supports pagination;
the current integration makes one request and may not receive every TLD. It
preserves the snapshot for any zones not returned. Coupon eligibility and
account-specific pricing can differ. The vendor marks the legacy API as
scheduled for retirement; migration to its newer REST API requires separate
verification. No live account response was available for this change.

## Dynadot REST migration checklist

Dynadot recommends its [REST API](https://www.dynadot.com/domain/api-document)
instead of the legacy API. Its pricing documentation describes a required
`currency`, optional `page`, `page_size`, `tlds` and `show_multi_year`, and a
result containing `currency`, paging fields and `tld_price_list`. Pricing uses
`all_years_register_price`, `all_years_renew_price`, `transfer_price`,
`price_unit` and minimum/maximum duration. Authentication is via a Bearer key;
confirm the vendor's current signing requirements for the pricing call. Do not
log headers, response bodies containing credentials, or full legacy URLs.

Before replacing the current implementation, use a real test account to verify:

- the actual response envelope, amount strings, currency, one-year units and
  how multi-year arrays behave for TLDs with a minimum term over one year;
- pagination start, limit, ordering, termination, empty pages, repeated pages,
  rate limits and errors — do not silently report a partial list as complete;
- a handful of prices against the account's actual quotes, without placing an
  order, and behavior when the account cannot access a TLD;
- safe fallback to existing snapshot data for missing zones and failures.

No account key or live REST response was available during this investigation,
so the REST endpoint is **not yet used** and its details are not assumed from
third-party examples.

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
