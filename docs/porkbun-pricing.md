# Porkbun pricing observations

On 2026-11-02 the public Porkbun pricing API returned comma-grouped decimal
strings, for example `"2,060.25"` for `.car`. The previous parser used
`parseFloat`, which read this as two dollars. The same defect affected other
expensive TLDs, including the renewal of `.inc` and `.dealer`. A reviewed
subset of the public API response is in `tests/fixtures/porkbun-grouped-prices.json`;
prices are observations, not guarantees, and can change.

Porkbun's public [.web](https://porkbun.com/tld/web) and
[.dot](https://porkbun.com/tld/dot) pages stated that those zones were not yet
priced. Their API returned three zeroes, which are treated as unknown for those
specific zones, not as free offers. Zero prices for other zones and free
transfers remain intact.

The bundled snapshot now contains the reviewed quotes. Old browser pricing
caches are invalidated once and repopulated from live sources or the corrected
bundled snapshot; other settings and cached domains are untouched. Old
snapshots encountered by the CLI, harvester, or history seeding have the
known truncated fields masked as unknown rather than guessed. Historical
monthly minima with the observed bad values were cleared; their original
untruncated historical amounts cannot be reconstructed from those minima.
No new browser network endpoints were added.
