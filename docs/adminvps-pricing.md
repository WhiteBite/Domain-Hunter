# AdminVPS price research

AdminVPS prices have **not** been imported or enabled for automatic collection.
The public [renewal page](https://adminvps.ru/domains/domain_renew.php) observed
on 2026-11-01 states 1439 RUB per year for .ru/.рф. An older search snippet
advertised 349 RUB; it is not reliable as a current price. The visible
[.xyz page](https://adminvps.ru/domains/xyz.php) advertises prices, but did not
clearly establish the period of its registration quote. These observations
alone do not establish a complete annual public registration/renewal table.

The billing host's [robots.txt](https://my.adminvps.ru/robots.txt) disallows
`/cart` and URLs with query strings. Do not automate requests to its cart.
The public site's robots file does not explicitly disallow the domain pages,
but does not establish permission for regular automated collection either.
Runner access and any relevant account or promotion conditions also require
verification. Do not bypass protection; separately agree any CI changes.

A user-supplied, sanitized public annual price table or an authorized bulk API,
with registration and renewal periods and terms, would help determine which
prices can be imported without guessing. Do not commit account or session data.
