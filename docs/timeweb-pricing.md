# Timeweb retail price source

Timeweb.com and Timeweb Cloud are separate products. This integration uses the
retail public page, not Timeweb Cloud's authenticated API. It adds no Timeweb
API key or browser-side request. Automatic collection remains **disabled**:
robots.txt does not disallow the page, but collection permission has not been
confirmed and access from the scheduled runner has not been tested.

The public HTML supplied by a user on 2026-10-30 includes a Next.js Flight
record containing 352 zone entries. The fixture
`tests/fixtures/timeweb-sanitized.html` contains only that public zone-list
record in a minimal wrapper; the original search results, queried domain,
scripts, cookies and session data are not included. The parser reads JSON only:
it never executes page scripts. The old registration price is not renewal.
Individual search results, including premium names, are not TLD prices.

The list itself has no per-zone registration or renewal duration. While the
public page FAQ states that .ru and .рф registration is for the first year
and renewal is **from** the listed annual amount, the terms for the other
zones have not been verified. In particular Timeweb's text and other sources
conflict on the minimum .ai registration period. Only .ru and .рф registration
prices are imported; the other 350 entries are not treated as annual prices.
The renewal lower bounds are preserved separately as RUB amounts and shown as
such in the prices table. They are **not** exact renewal prices and therefore
are excluded from renewal comparisons and three-year TCO calculations.

The initial import used the open.er-api.com USD/RUB rate 80.572954 published
on 2026-10-30. Registration is stored both in USD cents for comparison and in
original RUB kopecks. RUB mode shows the original registration amount when
available; older caches without it fall back to USD conversion. Other
currencies and comparisons use USD and can differ from current exchange rates.
Promotions, premium names, account terms and rounding can change the payable
amount; confirm at Timeweb. Renewal lower bounds remain in original RUB. The import
has its own timestamp, independent of the global snapshot's generation date.

The prepared parser rejects missing, ambiguous or incomplete zone lists,
missing verified zones and invalid prices. Before enabling any automated
collection, confirm permission and runner access. Additional zones must not
be added to annual calculations until their price periods are verified; do not
bypass protection or use authenticated or individual-domain results as bulk
pricing. The Timeweb buy link is a landing page because a verified per-domain
search URL was not established.
