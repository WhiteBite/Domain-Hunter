# WebHOST1 price source

The user supplied a browser-saved [domain registration list](https://webhost1.ru/domains)
on 2026-11-01 UTC. Its 227 rendered zone cards display registration prices per
year. The bundled snapshot imports **226** annual registration prices. The
.com card showed 2133.60 RUB/year while a saved modal displayed 1960 RUB/year
for .com; its conditions are unclear, so .com is excluded rather than choosing
a price. The list does not supply renewal prices.

The earlier public [.ru](https://webhost1.ru/domains/ru) and
[.рф](https://webhost1.ru/domains/rf) observations separately showed 189 RUB
registration and 399 RUB renewal, both per year. The new list matches the two
registration amounts, allowing those two earlier renewal quotes to be retained
with their **own** observation timestamp. Renewal is null for the other zones;
transfer remains unknown. The price-only list includes a multi-label zone,
which does not establish checker or RDAP support.

`tests/fixtures/webhost1-annual-prices.json` contains only sanitized card values
and the conflicting .com modal value, not original HTML, scripts or account and
session data. `tests/fixtures/webhost1-public-observations.json` is the earlier
manual extraction of two public-page quotes. `normalizeWebhost1Annual` checks
annual terms, uniqueness and the conflict, and retains the old renewals only
if the new registration values match. These are offline transcriptions, not
HTML fetchers or evidence that automatic collection is possible. Prices are
indicative rather than cart quotes; account terms, promotions and premium
names may change the actual amount, so confirm with WebHOST1.

Original amounts are stored in kopecks. The import converted to USD at
80.572954 RUB/USD from 2026-10-30, consistent with other recent imports. RUB
mode displays original amounts where available; comparisons, ranking, TCO and
other currencies use converted USD and may differ from the eventual bill.
Source dates record observations/imports, not the date the seller changed prices.

**No automatic collection is enabled.** The robots file checked on 2026-11-01
did not disallow these public paths, but that is not explicit permission for
regular automated collection. Direct access from this sandbox failed and a
prior page retrieval encountered bot protection. Do not bypass protection.
Before enabling collection, confirm permission and runner access and separately
agree any CI changes. The browser makes no automatic price requests to WebHOST1.
