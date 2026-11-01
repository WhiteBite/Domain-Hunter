# WebHOST1 price source

On 2026-11-01, the visible text returned for the public pages
[.ru](https://webhost1.ru/domains/ru) and [.рф](https://webhost1.ru/domains/rf)
stated registration for one year at 189 RUB and renewal for one year at
399 RUB for each zone. These two public quotes were manually transcribed into
`tests/fixtures/webhost1-public-observations.json` and imported into the bundled
snapshot. The fixture is a human-reviewed extraction from page text, **not**
an original HTML response and not evidence that a fetcher can access or parse
the pages. An older search-result snippet showed different amounts; it was not
used as a current price. No other zones, transfer prices, account-specific
prices or promotions were inferred.

Prices are indicative rather than cart quotes. Confirm terms and price at the
seller; account conditions, promotions or premium names may affect the actual
cost. Original amounts are stored in kopecks. The import converted to USD at
80.572954 RUB/USD from 2026-10-30, consistent with the other recent imports.
RUB mode shows original amounts where available; comparisons, ranking, TCO,
and other currencies use converted USD and may differ from the eventual bill.
The source date records the observation/import, not the date the seller last
changed the prices.

`normalizeWebhost1Observed` validates the manually transcribed two annual
quotes; it is not an HTML parser or network client. Refresh replacement, source
date and original RUB carry-over are prepared, but **no automatic collection is
enabled**. The robots file checked on 2026-11-01 did not disallow these paths;
this is not explicit permission for regular automated collection. Direct
access from this sandbox failed and a prior page retrieval encountered bot
protection. Do not bypass protection. Before enabling collection, confirm
permission and runner access and separately agree any CI changes. The browser
makes no automatic price requests to WebHOST1. The snapshot must be published
through the project's release/deploy path for the hosted site to receive it.
