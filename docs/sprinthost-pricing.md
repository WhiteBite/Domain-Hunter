# Sprinthost price source

The bundled snapshot contains 88 annual registration and renewal prices from
[Sprinthost's public annual price list](https://sprinthost.ru/tariffs/domain-prices),
supplied by the user and imported on 2026-11-01. The separately supplied landing
page contains 12 cards; all 12 matched the annual table at import time. The
fixtures `tests/fixtures/sprinthost-annual-sanitized.html` and
`tests/fixtures/sprinthost-sanitized.html` contain only the public price table,
its embedded price data, and the public card grid, without search input, account
information, or scripts. Three entries are multi-label zones: com.ru, msk.ru
and spb.ru. Presence in the price table does not establish RDAP support or
availability in the checker; the curated registry was not expanded.

Prices are indicative, not cart quotes. As documented by Sprinthost, the
.ru/.рф amounts apply to domains at registrar Sprintnames; the 2026 price
announcement lists different prices at other registrars. Renewal can vary with
portfolio size and other account conditions. For domains delegated to external
nameservers Sprinthost documents an additional 270 RUB for renewal, except
when renewal is through Sprintnames. The application cannot infer these
conditions and does not add the surcharge. Confirm registration and renewal
terms with Sprinthost before purchase. Relevant sources:

- https://sprinthost.ru/tariffs/domains
- https://sprinthost.ru/tariffs/domain-prices
- https://sprinthost.ru/tariffs/prolong/info
- https://sprinthost.ru/news/20260116

Original amounts are stored in RUB kopecks alongside USD cents. The initial
import converted at the published 2026-10-30 USD/RUB rate of 80.572954, also
used by the HostiMan and Timeweb imports. RUB mode displays original amounts
where available; legacy caches fall back to currency conversion. Other
currencies, ranking and TCO still use converted USD amounts and may diverge
from today's rates and the eventual bill. Transfers are not included.

`normalizeSprinthostAnnual` is an offline parser for the supplied annual price
page. It requires one annual table and embedded JSON list, at least 88 unique
entries including .ru, .рф and .com, the annual column labels, unambiguous
ruble prices, and exact agreement between the table and JSON. It rejects
changed labels, duplicates, non-zero old prices, ambiguous markup, missing
rows and mismatches, and it never executes scripts. `normalizeSprinthost`
remains an offline parser for the 12 landing-page cards. Successful source
replacement, source date and native RUB carry-over are prepared, but **no
fetcher or scheduled collection is enabled**. The supplied HTML is a saved
browser page; whether both table and JSON are present in the server response
has not been verified, so an automatic fetcher must be tested separately.

The robots file checked on 2026-11-01 does not disallow the public tariff
pages, but that is not explicit permission for regular automated collection.
The direct connection from this sandbox previously failed; runner access is
unverified. Do not bypass bot protection. Before enabling collection, confirm
permission and access, and separately agree any CI changes. The browser makes
no price requests to Sprinthost. The snapshot must be published through the
project's release/deploy path before users of the hosted site receive it.
