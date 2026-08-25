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

Global flags:
  --help, -h               Show this help
  --version, -v            Show version

check options:
  <domain...>              One or more domain names or bare labels
  --tlds a,b,c             TLDs to expand bare labels over (default: 15 common)
  --prices                 Attach pricing info to available domains
  --no-cache                Skip the result cache
  --currency USD|RUB|EUR   Display currency for formatted prices (default: USD)
  --rate-rub N              RUB units per 1 USD (default: 97)
  --rate-eur N              EUR units per 1 USD (default: 0.92)

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

Output: JSON on stdout, progress on stderr. Exit: 0 success, 1 error, 2 usage.`;

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

function parseRates(flags: Record<string, string | true>): CliRates | undefined {
  const rub = parseNumber(flags['rate-rub']);
  const eur = parseNumber(flags['rate-eur']);
  if (rub == null && eur == null) return undefined;
  return {
    RUB: rub ?? 97,
    EUR: eur ?? 0.92,
  };
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
        const outcome = await core.runCheckCommand({
          domains: positionals,
          tlds: parseCsv(flags.tlds),
          currency: parseCurrency(flags.currency),
          rates: parseRates(flags),
          ignoreCache: flags['no-cache'] === true,
          withPrices: flags.prices === true,
        });
        process.stdout.write(JSON.stringify(outcome, null, 2) + '\n');
        return 0;
      }
      case 'prices': {
        const outcome = await core.runPricesCommand({
          tlds: parseCsv(flags.tlds),
          query: parseString(flags.query),
          currency: parseCurrency(flags.currency),
          rates: parseRates(flags),
        });
        process.stdout.write(JSON.stringify(outcome, null, 2) + '\n');
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

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Fatal: ${msg}\n`);
    process.exit(1);
  });
