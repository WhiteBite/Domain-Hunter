# Updating manually reviewed price tables

Automatic collection from HostiMan, Timeweb, Sprinthost, WebHOST1 and AdminVPS
remains disabled. The owner must first confirm each seller permits regular
collection and that the runner can reach the allowed source; robots.txt alone
is not explicit permission. AdminVPS's `/cart` is disallowed. Do not bypass
bot protection or fetch authenticated/account-specific pages. No browser
requests to these sellers are added. A manual dispatch of the full-scrape
workflow also performs HEAD-only checks of public pages from its GitHub runner;
these checks do not follow redirects or collect prices, and do not establish
permission or guarantee a usable GET response.

Until then, an operator can prepare a replacement from a **manually obtained,
reviewed** source file, without any network access:

```sh
node scripts/import-reviewed-prices.mjs \
  --source sprinthost --input /path/to/reviewed-annual.html \
  --observed-at 2026-11-01T19:00:00Z --rub-per-usd 80.572954 \
  --output /tmp/reviewed-snapshot.json
```

- Sources `hostiman`, `timeweb` and `sprinthost` accept their respective
  reviewed HTML table formats; they are parsed as data, never executed.
  `adminvps` requires a sanitized annual-price JSON transcription matching
  `tests/fixtures/adminvps-annual-prices.json`.
- `webhost1` requires a sanitized annual-list JSON matching
  `tests/fixtures/webhost1-annual-prices.json`, plus `--renewals FILE`
  matching the two reviewed public-page observations in
  `tests/fixtures/webhost1-public-observations.json` and a separate
  `--renewal-observed-at UTC`. Conflicts and changed registrations require
  manual review; the importer does not invent renewal prices or dates.
- The timestamp must be the actual observation time, not the import time;
  provide a separately verified RUB-per-USD rate. Parser validation checks
  structure, not whether the input is trustworthy or current.
- Output must be a new file; the existing snapshot is never overwritten.
  Inspect the diff, dates, currencies and seller terms before replacing
  `src/config/pricing.snapshot.json` and opening a PR. Passing `--snapshot`
  allows reviewing a different compact snapshot as the baseline.

Only the chosen seller's subset and metadata are replaced; other seller data
and dates remain intact. Existing CI harvesting preserves the result on source
failure. The site's estimates are not a substitute for a seller's cart quote.
