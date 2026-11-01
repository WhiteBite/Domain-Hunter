# AdminVPS price source

The user supplied a browser-saved AdminVPS domain registration cart on
2026-11-01 UTC. Its displayed table had separate «Домен», «Регистрация» and
«Продление» columns and explicitly showed one year for both prices in 739
complete paid rows. The snapshot imports these 739 annual registration and
renewal quotes; transfer is unknown. In 31 rows the seller marked the zone
«Акция»; the snapshot preserves this as a seller-labeled promotion, not as a
coupon or as proof of the promotion duration. The .бел row was N/A and the
.desi row showed zero registration and N/A renewal; both were excluded.

The submitted classification page stated that its prices are for one year,
but its saved content did not contain the price rows. The [public renewal
page](https://adminvps.ru/domains/domain_renew.php) also showed 1439 RUB/year
for .ru/.рф, matching the saved cart. An older search snippet showed 349 RUB;
that snippet was not used as a current price.

`tests/fixtures/adminvps-annual-prices.json` is a **sanitized extraction** of
only the price rows and headers, not the original HTML. It contains no form,
script, account, session or search input data. `normalizeAdminvpsAnnual`
validates the extracted annual fields, zone uniqueness, positive ruble amounts
and promotion markers; it never fetches or executes the original page. The
fixture also records excluded rows. Some prices are for multi-label zones;
being in the price matrix does not establish checker or RDAP support.

The saved cart is a point-in-time indicative source, not a guaranteed public
or account-independent quote. Promotion conditions, account terms and premium
names require confirmation with the seller. The app marks seller promotions
separately from its ratio-based promo-trap heuristic. Source rubles are stored
in kopecks; the initial import converts USD at 80.572954 RUB/USD (2026-10-30).
RUB display uses the original amounts where available, while comparisons,
ranking and TCO use converted USD and may differ from an actual bill.

The billing host's [robots.txt](https://my.adminvps.ru/robots.txt) disallows
`/cart` and URLs with query strings. **No automatic collection is enabled**, and
the cart must not be crawled automatically. The public site's robots file does
not explicitly disallow its domain pages but does not establish permission for
regular automated collection. Before enabling any separate source, confirm
permission and runner access, do not bypass protection, and separately agree
any CI changes. The browser makes no automatic price requests to AdminVPS.
