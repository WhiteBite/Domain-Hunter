# Verifying price publication

The PR publication check exercises the actual commit step in isolated Git
repositories and builds/uploads a Pages artifact in `dry_run` mode; it does not
publish. A successful ordinary Pages deploy also does not, by itself, prove the
bot's changed-snapshot path. The five reviewed Russian seller imports remain
manual until their collection rights and parser coverage are established.

For an end-to-end production check, a repository owner can:

1. Open Actions → **Harvest Prices (Full Scrape)** → **Run workflow**, select
   `main`, and run it. This is a real harvest: it can commit new pricing data
   to `main` and publish Pages. Alternatively, wait for its scheduled run.
2. Inspect the harvest job and its **Commit snapshot if changed** step. An
   unchanged snapshot should not trigger publication; that is not a failure,
   but it also does not verify the changed-snapshot path. Do not force a fake
   price change into production just to trigger this check.
3. If a snapshot was committed and pushed, confirm the dependent **publish**
   job runs its reusable deploy workflow, and its Pages deployment succeeds.
   Compare the published page's actual changed quote and source date with the
   committed snapshot, allowing for caching. A green harvest alone is not proof
   that a source succeeded: harvest permits partial failures.
4. If the run cannot be dispatched, check the GitHub integration's Actions
   write permission or ask a repository administrator to initiate it. If a
   publish job is skipped or fails, inspect the step output and environment
   approval/settings before retrying.

The isolated workflow test is `npx vitest run tests/workflow-publication.test.ts`.
