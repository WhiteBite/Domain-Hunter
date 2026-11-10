# MCP keyless-source architecture

The browser app remains standalone: it uses its existing snapshot and existing
public fetches. No new browser calls, keys, or CORS workarounds are added. MCP is
a separate Node process and currently exposes **only keyless, read-only APIs**.
The pre-existing optional keyed Dynadot adapter is CLI-only and is not accepted
by MCP. No tool registers or buys domains.

## Price sources

`get_prices` uses the existing bundled snapshot and public Porkbun and
third-party cfdomainpricing.com feeds. `list_price_sources` lists those baseline
sources and any implemented keyless opt-in TLD-price adapters (currently none).
Pricing rows retain their individual origins; a table's fetch time is not a
quote's publication time. Prices are standard TLD estimates, not guaranteed
per-domain or premium quotes.

## External availability signals

`list_public_sources` is local metadata discovery. `compare_public_sources`
requires explicit source selection and sends at most ten exact domains to the
selected third parties. Users must authorize disclosure of sensitive names.
Only fixed endpoints are used; arbitrary URLs, IP addresses and paths are
rejected. Results are not automatically merged into the RDAP check or the price
matrix.

| Adapter | Official documentation | Method and advertised limits | Interpretation |
| --- | --- | --- | --- |
| DotSweep | [batch check](https://dotsweep.com/docs/check-batch) | POST, up to 10 names; 120 requests/minute/client | `certain` registry or WHOIS signals are advisory; DNS and unspecified cached evidence remain unknown. Standard prices are not premium quotes. |
| Domainee | [availability checker](https://domainee.dev/free-apis/domain-availability-checker) | GET, one name; 30 requests/minute and 500/day/IP | A reported RDAP positive is a preliminary signal, not independently verified; DNS and missing methods remain unknown. The sampled IDN TLD was rejected. No uptime commitment. |
| DigMyName | [public API](https://digmyname.com/api) | GET, one name; 60 requests/minute and 5,000 domains/day/IP | Uncertain answers remain unknown; a premium flag does not include a premium price. Attribute results using the returned DigMyName link. |

These are provider claims from documentation, not guarantees. Outputs retain
individual signals, provider status and known confidence/method. A consensus
status requires a non-unknown result from every selected source and no conflict;
`possibly_available` is never a registration guarantee. An uncheckable or
missing response stays `unknown`, not taken. `fetchedAt` records receipt by this
process; `observedAt` remains null because the provider may use an undated cache.
Provider content and returned HTTPS links are untrusted third-party data.

MCP batches DotSweep requests, serializes calls per provider, uses conservative
pacing after completion, and caches valid per-domain responses in memory for
60 seconds. Failed and unresolved results are not cached. It honors 429
`Retry-After`, applies DigMyName's daily-quota cooldown, caps its local queue,
and uses conservative rolling daily caps of 400 Domainee and 4,000 DigMyName
requests. There are no automatic retries.

Pacing, quotas and provider cooldowns are coordinated across MCP processes
running under the same OS user, using per-provider locks and private state files
under `~/.domain-hunter/public-rate-limits/` (POSIX directory mode 0700 and files 0600). On Windows, access is controlled by inherited account ACLs; POSIX mode bits do not establish ACL privacy.
Only timestamps and counters are persisted, **not searched domains**. A request
is counted before it is sent, so a crash cannot silently refund quota. If a lock
is held, the response reports `busy`; if state or locking fails, it reports
`coordination_error` and does not call the provider. Locks recover from crashed
processes using a stale-lock timeout. Do not delete state to bypass a quota;
other users, machines and applications on the same IP are not coordinated, so
providers can still impose a limit earlier. The per-domain response cache is
process-local, and provider caches can be older.

Fixture/protocol tests include concurrent coordinator instances and separate
Node processes. Using a separate web-fetch proxy, small GET samples were taken
for `example.com`, `github.com`, a randomly named `.com`, an IDN and reserved
`.invalid`/`.example` names. DotSweep returned `certain`/`dns` for known taken
names and `available`/`estimated` for `.invalid`; these remain unknown locally.
Domainee rejected the sampled IDN TLD, and its DNS-based `.invalid` positive
remains unknown. For the sampled random `.com` all three reported a positive
signal; prices from DotSweep and DigMyName differed and are kept separate.
The MCP process's live network path and DotSweep batch POST could not be verified
from this environment. These samples do not establish accuracy or coverage.

## Boundaries for adding sources

Add keyless providers only after checking their official documentation, terms,
limits, output semantics, privacy implications and attribution requirements.
Implement a fixed endpoint, strict normalizer, explicit uncertainty, partial and
error handling, bounded response sizes, timeouts and fixture/protocol tests.
Do not treat DNS absence as proof of availability, infer a quote's currency or
mix a domain-specific price into the standard TLD table. Paid operations, keys,
account creation, retries that ignore provider limits and automatic transmission
of names to additional services are out of scope.

## Opt-in live protocol smoke test

The `MCP public sources live smoke` workflow runs the built
MCP server over stdio using only `example.com` and `example.net`. It performs
one DotSweep batch POST and two GETs for each other provider. It runs manually or on pull requests that change the smoke script or workflow.
It does not use credentials or send user-provided names. Non-OK, partial,
rate-limited or malformed responses fail the run rather than guessing a result.
A passing run checks the current protocol, not availability accuracy, terms or
service uptime. Avoid frequent execution and follow each provider's limits.
