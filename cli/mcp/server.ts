/**
 * Domain Hunter MCP server — exposes the five CLI commands as MCP tools.
 *
 * Mirrors cli/main.ts: installStorage() runs FIRST (before any module that
 * touches localStorage), then core is loaded via dynamic import. The five
 * run*Command functions are wrapped 1:1 as MCP tools; no logic is reimplemented.
 *
 * Transport: stdio. Diagnostics to stderr ONLY — stdout is the MCP transport.
 */
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { installStorage } from '../shims/storage.js';
import type { CliRates } from '../contract.js';

// ---- version (same technique as cli/main.ts) ----

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// ---- shared zod fragments ----

const currencySchema = z.enum(['USD', 'RUB', 'EUR']).optional();

const ratesSchema = z
  .object({
    RUB: z.number().positive().optional(),
    EUR: z.number().positive().optional(),
  })
  .optional();

type RatesInput = { RUB?: number; EUR?: number } | undefined;

/**
 * Map the optional rates shape to CliRates, mirroring cli/main.ts parseRates:
 * when at least one rate is provided, the missing one falls back to the same
 * defaults the CLI uses (RUB 97, EUR 0.92). core.ts buildSettings applies its
 * own DEFAULT_SETTINGS fallback on top, so this is purely for type alignment.
 */
function toCliRates(rates: RatesInput): CliRates | undefined {
  if (rates == null) return undefined;
  if (rates.RUB == null && rates.EUR == null) return undefined;
  return { RUB: rates.RUB ?? 97, EUR: rates.EUR ?? 0.92 };
}

/** Build a text-only CallToolResult. */
function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: 'text' as const, text }], isError };
}

/** Format an error into a text result. */
function errorResult(err: unknown): CallToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  return textResult(msg, true);
}

// ---- main ----

async function main(): Promise<void> {
  // FIRST — install the localStorage shim before any module touches it.
  installStorage();

  // Dynamic import so the source is correct whether run bundled or unbundled.
  const core = await import('../core.js');

  const server = new McpServer({
    name: 'domain-hunter',
    version: readVersion(),
  });

  // ---- check_availability ----
  server.registerTool(
    'check_availability',
    {
      title: 'Check domain availability',
      description:
        'Check domain availability via RDAP (the modern WHOIS replacement). ' +
        'Returns the honest three-state model: "available", "probably_available", ' +
        'or "unknown". For low-trust ccTLDs a 404 is corroborated via ' +
        'DNS-over-HTTPS before reporting available. Bare labels (e.g. "example") ' +
        'expand over the given TLDs. Cached hits skip the network. Set ' +
        'withPrices to attach per-registrar pricing to available rows.',
      inputSchema: {
        domains: z.array(z.string()).min(1).max(3000),
        tlds: z.array(z.string()).optional(),
        currency: currencySchema,
        rates: ratesSchema,
        ignoreCache: z.boolean().optional(),
        withPrices: z.boolean().optional(),
        cacheTtlHours: z.number().positive().optional(),
      },
    },
    async (args) => {
      try {
        const outcome = await core.runCheckCommand({
          domains: args.domains,
          tlds: args.tlds,
          currency: args.currency,
          rates: toCliRates(args.rates),
          ignoreCache: args.ignoreCache,
          withPrices: args.withPrices,
          cacheTtlHours: args.cacheTtlHours,
        });
        return textResult(JSON.stringify(outcome, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---- get_prices ----
  server.registerTool(
    'get_prices',
    {
      title: 'Get domain pricing',
      description:
        'Per-registrar first-year and renewal prices in USD cents plus ' +
        'formatted strings in the chosen currency. Includes 3-year TCO, ' +
        'promo-trap flags (renewal >= 5x first year), and the full ' +
        'registrar->entry map per TLD. Filter by exact TLDs and/or substring.',
      inputSchema: {
        tlds: z.array(z.string()).optional(),
        query: z.string().optional(),
        currency: currencySchema,
        rates: ratesSchema,
      },
    },
    async (args) => {
      try {
        const outcome = await core.runPricesCommand({
          tlds: args.tlds,
          query: args.query,
          currency: args.currency,
          rates: toCliRates(args.rates),
        });
        return textResult(JSON.stringify(outcome, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---- generate_names ----
  server.registerTool(
    'generate_names',
    {
      title: 'Generate domain name candidates',
      description:
        'Generate brandable domain name candidates via one of five generators: ' +
        'combinator (roots x affixes), syllables (pronounceability-scored ' +
        'neologisms), hacks (TLD-hacks like fami.ly), mutations (vowel/consonant ' +
        'shifts), themes (curated word sets). When tlds are given (and generator ' +
        'is not hacks), names are expanded into domains (name.tld).',
      inputSchema: {
        generator: z.enum(['combinator', 'syllables', 'hacks', 'mutations', 'themes']),
        roots: z.array(z.string()).optional(),
        affixes: z.array(z.string()).optional(),
        mode: z.enum(['prefix', 'suffix', 'both']).optional(),
        count: z.number().int().min(1).max(500).optional(),
        seed: z.number().optional(),
        theme: z.string().optional(),
        tlds: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      try {
        const outcome = await core.runGenerateCommand({
          generator: args.generator,
          roots: args.roots,
          affixes: args.affixes,
          mode: args.mode,
          count: args.count,
          seed: args.seed,
          theme: args.theme,
          tlds: args.tlds,
        });
        return textResult(JSON.stringify(outcome, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---- find_domains ----
  server.registerTool(
    'find_domains',
    {
      title: 'Find available domains within budget',
      description:
        'Generate candidate domains around a seed name (combinator + mutations + ' +
        'TLD-hacks), check availability via RDAP, attach prices, and flag those ' +
        'within the given budget. Returns available/probably_available rows ' +
        'sorted by cheapest registration price. No budget means every available ' +
        'row is flagged withinBudget.',
      inputSchema: {
        seedName: z.string(),
        budget: z.number().optional(),
        currency: currencySchema,
        rates: ratesSchema,
        tlds: z.array(z.string()).optional(),
        maxChecks: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => {
      try {
        const outcome = await core.runFindCommand({
          seedName: args.seedName,
          budget: args.budget,
          currency: args.currency,
          rates: toCliRates(args.rates),
          tlds: args.tlds,
          maxChecks: args.maxChecks,
        });
        return textResult(JSON.stringify(outcome, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---- list_zones ----
  server.registerTool(
    'list_zones',
    {
      title: 'List checkable TLD zones',
      description:
        'List the loaded TLD registry (curated tlds.json merged with the ' +
        'live IANA RDAP bootstrap). Each entry carries the TLD, its registry ' +
        'infrastructure id, and trust level (high = RDAP 404 authoritatively ' +
        'means free; low = corroborated via DoH). Filter by infrastructure id.',
      inputSchema: {
        infra: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const outcome = await core.runTldsCommand({
          infra: args.infra,
        });
        return textResult(JSON.stringify(outcome, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${msg}\n`);
  process.exit(1);
});
