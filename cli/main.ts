/**
 * Domain Hunter CLI entry point.
 *
 * installStorage() runs FIRST so the shimmed global localStorage is in place
 * before any module that touches it (cache.ts, bootstrap.ts, pricing.ts)
 * executes a read/write path. The command implementations are loaded via a
 * dynamic import so the source is correct whether run bundled (esbuild inlines
 * it) or unbundled via a TS-aware runner.
 *
 * Output: result JSON on stdout, progress/log lines on stderr ONLY.
 * Exit codes: 0 success, 1 runtime error, 2 usage error.
 */
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installStorage } from './shims/storage.js';
import { formatOutcome, isOutputFormat, type OutputFormat } from './format.js';
import { completionScript, isCompletionShell } from './completions.js';
import type {
  CliCurrency,
  CliRates,
  GenerateCommandOptions,
} from './contract';

const HELP = `Domain Hunter CLI — bulk domain availability checker and name generator.

Usage:
  domain-hunter <command> [options]

Commands:
  check <domain...>        Check domain availability via RDAP
  prices                   Show per-registrar pricing for TLDs
  generate <generator>     Generate domain name candidates
  find <seed>              Find available domains within budget
  tlds                     List loaded TLD zones (curated + IANA bootstrap)
  drops                    List dropped domains from the bundled daily snapshot
  watch <domain...>        Poll domains until a status flips (exit 10 on flip)
  completions <shell>      Print shell completions (bash | zsh | fish)

Global flags:
  --help, -h               Show this help
  --version, -v            Show version
  --format json|table|csv  Output format for check/prices/drops (default: json)

check options:
  <domain...>              One or more domain names or bare labels (max 3000)
  --tlds a,b,c             TLDs to expand bare labels over (default: 15 common)
  --prices                 Attach pricing info to available domains
  --no-cache                Skip the result cache
  --currency USD|RUB|EUR   Display currency for formatted prices (default: USD)
  --rate-rub N              RUB units per 1 USD (default: live FX, 7d cache)
  --rate-eur N              EUR units per 1 USD (default: live FX, 7d cache)

prices options:
  --tlds a,b,c             Filter to specific TLDs
  --query substring        Filter TLDs by substring
  --currency USD|RUB|EUR   Display currency
  --rate-rub N, --rate-eur N

generate options:
  <generator>              combinator | syllables | hacks | mutations | themes
  --roots a,b              Root words (combinator, mutations, hacks, themes)
  --affixes a,b            Affixes (combinator; default: built-in set)
  --mode prefix|suffix|both  Combinator mode (default: both)
  --count N                Max names to return (default: 100, hard cap: 500)
  --seed N                 RNG seed (syllables)
  --theme id               Theme category id (themes)
  --tlds a,b               Expand names into domains

find options:
  <seed>                   Seed name to generate candidates from
  --budget N               Budget in display currency
  --currency USD|RUB|EUR   Budget currency (default: USD)
  --rate-rub N, --rate-eur N
  --tlds a,b               TLDs to check (default: 15 common)
  --max-checks N           Max candidates to check (default: 30)

tlds options:
  --infra <id>             Filter to a specific infrastructure (e.g. verisign)
  --json                   Output JSON instead of human-readable lines

drops options:
  --query substring        Filter by name substring
  --tld com                Filter to one TLD
  --limit N                Max domains to output (default: 200, max: 2000)

watch options:
  <domain...>              Domains or bare labels to poll (same as check)
  --tlds a,b,c             TLDs to expand bare labels over
  --interval N             Poll interval in seconds (default: 300, min: 5)
  --rounds N               Max polling rounds (default: unlimited)
  --prices                 Attach pricing info to results

Output: JSON on stdout, progress on stderr.
Exit: 0 success, 1 error/abort, 2 usage, 10 watch flip detected.
Ctrl+C during a check aborts gracefully, writes partial JSON, exits 1.`;

// ---- arg parsing (zero-dependency) ----

interface ParsedFlags {
  positionals: string[];
  flags: Record<string, string | true>;
}

function parseFlags(args: string[]): ParsedFlags {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a == null) continue;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next == null || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function parseCsv(value: string | true | undefined): string[] | undefined {
  if (value == null || value === true) return undefined;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseString(value: string | true | undefined): string | undefined {
  if (value == null || value === true) return undefined;
  return value;
}

function parseNumber(value: string | true | undefined): number | undefined {
  if (value == null || value === true) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseCurrency(value: string | true | undefined): CliCurrency | undefined {
  if (value == null || value === true) return undefined;
  if (value === 'USD' || value === 'RUB' || value === 'EUR') return value;
  process.stderr.write(`Error: invalid currency '${value}' (expected USD, RUB, or EUR)\n`);
  process.exit(2);
}

function parseMode(
  value: string | true | undefined,
): 'prefix' | 'suffix' | 'both' | undefined {
  if (value == null || value === true) return undefined;
  if (value === 'prefix' || value === 'suffix' || value === 'both') return value;
  process.stderr.write(
    `Error: invalid mode '${value}' (expected prefix, suffix, or both)\n`,
  );
  process.exit(2);
}

function parseFormat(value: string | true | undefined): OutputFormat {
  if (value == null || value === true) return 'json';
  if (isOutputFormat(value)) return value;
  process.stderr.write(`Error: invalid format '${value}' (expected json, table, or csv)\n`);
  process.exit(2);
}

function parseRates(flags: Record<string, string | true>): Partial<CliRates> | undefined {
  const rub = parseNumber(flags['rate-rub']);
  const eur = parseNumber(flags['rate-eur']);
  if (rub == null && eur == null) return undefined;
  const partial: Partial<CliRates> = {};
  if (rub != null) partial.RUB = rub;
  if (eur != null) partial.EUR = eur;
  return partial;
}

function isGeneratorName(s: string): s is GenerateCommandOptions['generator'] {
  return (
    s === 'combinator' ||
    s === 'syllables' ||
    s === 'hacks' ||
    s === 'mutations' ||
    s === 'themes'
  );
}

// ---- version ----

function printVersion(): void {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    process.stdout.write(`domain-hunter ${pkg.version ?? 'unknown'}\n`);
  } catch {
    process.stdout.write('domain-hunter (version unknown)\n');
  }
}

// ---- main ----

async function main(): Promise<number> {
  // FIRST — install the localStorage shim before any module touches it.
  installStorage();

  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stdout.write(HELP + '\n');
    return 0;
  }

  const sub = args[0];
  if (sub === '--help' || sub === '-h') {
    process.stdout.write(HELP + '\n');
    return 0;
  }
  if (sub === '--version' || sub === '-v') {
    printVersion();
    return 0;
  }

  const rest = args.slice(1);
  const { positionals, flags } = parseFlags(rest);

  // Dynamic import so the source is correct whether run bundled or unbundled.
  const core = await import('./core.js');

  try {
    switch (sub) {
      case 'check': {
        if (positionals.length === 0) {
          process.stderr.write('Error: check requires at least one domain\n');
          return 2;
        }
        if (positionals.length > 3000) {
          process.stderr.write(
            `Error: check accepts at most 3000 domains (got ${positionals.length})\n`,
          );
          return 2;
        }
        const outcome = await core.runCheckCommand({
          domains: positionals,
          tlds: parseCsv(flags.tlds),
          currency: parseCurrency(flags.currency),
          rates: parseRates(flags),
          ignoreCache: flags['no-cache'] === true,
          withPrices: flags.prices === true,
        });
        process.stdout.write(formatOutcome(outcome, parseFormat(flags.format)));
        return outcome.aborted ? 1 : 0;
      }
      case 'prices': {
        const outcome = await core.runPricesCommand({
          tlds: parseCsv(flags.tlds),
          query: parseString(flags.query),
          currency: parseCurrency(flags.currency),
          rates: parseRates(flags),
        });
        process.stdout.write(formatOutcome(outcome, parseFormat(flags.format)));
        return 0;
      }
      case 'generate': {
        const generator = positionals[0];
        if (generator == null) {
          process.stderr.write('Error: generate requires a generator name\n');
          return 2;
        }
        if (!isGeneratorName(generator)) {
          process.stderr.write(
            `Error: unknown generator '${generator}' (expected combinator, syllables, hacks, mutations, or themes)\n`,
          );
          return 2;
        }
        const outcome = await core.runGenerateCommand({
          generator,
          roots: parseCsv(flags.roots),
          affixes: parseCsv(flags.affixes),
          mode: parseMode(flags.mode),
          count: parseNumber(flags.count),
          seed: parseNumber(flags.seed),
          theme: parseString(flags.theme),
          tlds: parseCsv(flags.tlds),
        });
        process.stdout.write(JSON.stringify(outcome, null, 2) + '\n');
        return 0;
      }
      case 'find': {
        const seedName = positionals[0];
        if (seedName == null) {
          process.stderr.write('Error: find requires a seed name\n');
          return 2;
        }
        const outcome = await core.runFindCommand({
          seedName,
          budget: parseNumber(flags.budget),
          currency: parseCurrency(flags.currency),
          rates: parseRates(flags),
          tlds: parseCsv(flags.tlds),
          maxChecks: parseNumber(flags['max-checks']),
        });
        process.stdout.write(JSON.stringify(outcome, null, 2) + '\n');
        return 0;
      }
      case 'tlds': {
        const outcome = await core.runTldsCommand({
          infra: parseString(flags.infra),
        });
        if (flags.json === true) {
          process.stdout.write(JSON.stringify(outcome, null, 2) + '\n');
        } else {
          const lines = outcome.tlds.map((z) => `${z.tld} (${z.infra}, ${z.trust})`);
          process.stdout.write(lines.join('\n') + '\n');
        }
        return 0;
      }
      case 'drops': {
        const outcome = core.runDropsCommand({
          query: parseString(flags.query),
          tld: parseString(flags.tld),
          limit: parseNumber(flags.limit),
        });
        process.stdout.write(formatOutcome(outcome, parseFormat(flags.format)));
        return 0;
      }
      case 'watch': {
        if (positionals.length === 0) {
          process.stderr.write('Error: watch requires at least one domain\n');
          return 2;
        }
        const outcome = await core.runWatchCommand({
          domains: positionals,
          tlds: parseCsv(flags.tlds),
          currency: parseCurrency(flags.currency),
          rates: parseRates(flags),
          withPrices: flags.prices === true,
          intervalSec: parseNumber(flags.interval),
          rounds: parseNumber(flags.rounds),
        });
        process.stdout.write(JSON.stringify(outcome, null, 2) + '\n');
        if (outcome.stopped === 'flip') return 10;
        return outcome.stopped === 'interrupted' ? 1 : 0;
      }
      case 'completions': {
        const shell = positionals[0];
        if (!isCompletionShell(shell)) {
          process.stderr.write(
            'Error: completions requires a shell (bash, zsh, or fish)\n',
          );
          return 2;
        }
        process.stdout.write(completionScript(shell));
        return 0;
      }
      default:
        process.stderr.write(`Error: unknown command '${sub}'\n`);
        process.stdout.write(HELP + '\n');
        return 2;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    return 1;
  }
}

// Exit via process.exitCode and let the loop drain naturally: a hard
// process.exit() while fetch keep-alive sockets are still open trips a
// libuv async-handle assertion on Windows (src/win/async.c). Undici's idle
// sockets do not hold the loop, so natural termination is immediate.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Fatal: ${msg}\n`);
    process.exitCode = 1;
  });
