# HostiMan price source

The prepared server-side collector targets the public
[HostiMan domain-registration page](https://my.hostiman.ru/domain/register),
but is not registered in scheduled harvests while permission for automated
collection remains unconfirmed. The browser does not contact HostiMan for
prices or use a HostiMan API key.

The annual registration and renewal table has been checked against a public
HTML page supplied by a user on 2026-10-30. The fixture
`tests/fixtures/hostiman-sanitized.html` contains only that public pricing
table, not the full saved page, search results, session information or scripts.
The free `h1n.ru` technical subdomain is intentionally excluded. Transfers
are not currently collected. Prices do not establish domain availability or
account-specific, promotional, VAT or premium-name terms; confirm in the cart.

The parser requires exactly one explicitly labelled annual-price table, at
least five priced zones including ru, рф and com, and plain numeric amounts.
It refuses duplicate zones, ambiguous tables, unexpected price markup and
incomplete results. The harvest merge logic preserves HostiMan data and its own date when the
source does not run or fails, and is prepared to replace the entire HostiMan
subset after a successful scrape. The `--api-only` harvest also carries the
timestamp forward. Dates refer to successful collection or a manual public-page
import, not the global snapshot build time.

The bundled initial HostiMan prices were imported from the supplied page on
2026-10-30. They were converted from RUB using open.er-api.com's published
2026-10-30 USD/RUB rate of 80.572954. Source RUB amounts are also retained
as kopecks, separately from the USD comparison values. In RUB mode the UI uses
the source amounts for registration and renewal when available; old caches
without them fall back to the converted amount. Other currencies, sorting,
registrar comparisons and TCO still use USD values converted at the harvest
rate and may differ from current exchange rates. If enabled later, collections
use the harvest FX rate or its existing 90 RUB/USD fallback. Prices remain
estimates, and the price screen identifies these limitations. Only the pricing screen includes price-only zones; their presence
there does not mean they can be checked through RDAP in the app.

As checked on 2026-10-30, `https://my.hostiman.ru/robots.txt` does not disallow
the page. The published customer agreement was reviewed and no explicit
scraping permission was identified; robots alone is not permission. Do not
bypass access controls or rate limits. The direct connection from this sandbox
failed, so the scheduled runner's actual access and future parser behavior
remain unverified. Obtain confirmation of collection permission and verify
runner access before enabling the prepared source. A blocked request or an HTTP error is a source failure, not
proof that prices have been updated. A successful workflow run alone does not
prove HostiMan was successfully collected; inspect per-source logs and date.
