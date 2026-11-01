# REG.RU pricing limitations

The current REG.RU integration is a best-effort scrape of the existing
`https://www.reg.ru/domain/new/` page, not a registrar API integration.
It extracts registration prices from the `popularTlds` and `discountTlds`
collections, not a complete price list. DOM or Nuxt data changes may break it.

`oldPrice` is not known to be the renewal price. We therefore leave REG.RU
renewal and transfer prices unknown. This applies to legacy bundled snapshots,
CLI-fetched snapshots and browser caches as well as new scrapes. No TCO should
be calculated from an unverified REG.RU renewal price.

Prices are collected in RUB, converted to USD cents using the harvest FX rate
(or the fallback rate if FX is unavailable), and converted again for display.
They are estimates and may differ from the registrar's final checkout price,
including due to promotional conditions and premium domain pricing.

`regruUpdatedAt` records the most recent successful scrape. On failure or an
API-only harvest, carried-over data retains its previous timestamp. Legacy
snapshots have an unknown timestamp; the overall snapshot generation time is
not evidence of REG.RU freshness. A successful scrape replaces all previous
REG.RU coverage so old omitted TLDs cannot masquerade as fresh. Snapshot-only
commits do not currently trigger a Pages deployment: published data can lag the
repository until a separate deployment occurs.

Before claiming full or real-time integration, verify the source's official
contract, price meaning, currency, taxes, update interval and terms; add tests
for actual responses and a separately approved network destination if necessary.
