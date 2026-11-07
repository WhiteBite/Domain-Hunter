/** MCP tool registration, shared by stdio and protocol tests. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type * as Core from '../core';
import { createPriceSourceService } from '../sources/service';
import { createPublicSourceService } from '../public-sources/service';
import { createSharedRateCoordinator } from '../public-sources/coordination';
import type { RateCoordinator } from '../public-sources/coordination';
import { PUBLIC_SOURCE_IDS } from '../public-sources/types';

// ---- shared zod fragments ----

const currencySchema = z.enum(['USD', 'RUB', 'EUR']).optional();

const ratesSchema = z
  .object({
    RUB: z.number().positive().optional(),
    EUR: z.number().positive().optional(),
  })
  .optional();

/** Build a text-only CallToolResult. */
function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: 'text' as const, text }], isError };
}

/** Format an error into a text result. */
function errorResult(err: unknown): CallToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  return textResult(msg, true);
}

export function createMcpServer(core: typeof Core, version: string, options?: { rateCoordinator?: RateCoordinator | null }): McpServer {
  // MCP exposes keyless sources only; existing CLI credential support is separate.
  const sourceService = createPriceSourceService([]);
  const coordinator = options?.rateCoordinator === undefined ? createSharedRateCoordinator() : options.rateCoordinator;
  const publicSources = createPublicSourceService(undefined, undefined, coordinator);
  const server = new McpServer({
    name: 'domain-hunter',
    version,
  });

  // Metadata only: does not test credentials or contact external services.
  server.registerTool(
    'list_price_sources',
    {
      title: 'List optional pricing sources',
      description: 'List optional keyless TLD price adapters and identify the existing baseline feeds. No network request is made.',
      inputSchema: {},
    },
    () => textResult(JSON.stringify({ sources: sourceService.list(), baseline: [
      { id: 'snapshot', kind: 'snapshot' },
      { id: 'porkbun', kind: 'api', url: 'https://api.porkbun.com/api/json/v3/pricing/get' },
      { id: 'cloudflare', kind: 'third_party_api', url: 'https://cfdomainpricing.com/prices.json' },
    ] }, null, 2)),
  );

  server.registerTool(
    'list_public_sources',
    {
      title: 'List public domain-check sources',
      description: 'List keyless read-only third-party availability sources, limits and caveats; no network request is made.',
      inputSchema: {},
    },
    () => textResult(JSON.stringify({ sources: publicSources.list() }, null, 2)),
  );

  server.registerTool(
    'compare_public_sources',
    {
      title: 'Compare public domain availability signals',
      description: 'Explicitly send up to 10 fully qualified names to the selected public third-party services. Ask permission before sending confidential names. No key or account. Results are advisory, may be cached and can conflict; no purchase is performed. Prices, if present, are standard TLD estimates, never premium quotes.',
      inputSchema: z.strictObject({
        domains: z.array(z.string().min(1).max(253)).min(1).max(10),
        sources: z.array(z.enum(PUBLIC_SOURCE_IDS)).min(1).max(3),
      }),
    },
    async (args) => {
      try { return textResult(JSON.stringify(await publicSources.compare(args.domains, args.sources), null, 2)); }
      catch (err) { return errorResult(err); }
    },
  );

  // ---- check_availability ----
  server.registerTool(
    'check_availability',
    {
      title: 'Check domain availability',
      description:
        'Check RDAP signals: available, taken, probably_available, unknown or error. ' +
        'A 404 is not a guarantee of registration; low-trust zones may also use DNS. ' +
        'Bare labels expand over given TLDs. Cached hits skip the network. ' +
        'withPrices attaches a best standard TLD estimate, not a domain-specific or premium quote.' ,
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
          rates: args.rates,
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
        'Standard TLD registration, renewal and transfer estimates in USD cents, not individual/premium quotes. ' +
        'Returns per-field origin and date, independent cheapest renewal and estimated 3-year TCO. ' +
        'Filter TLDs or query, paginate using limit/offset and nextOffset. ' +
        'Uses keyless public feeds and snapshots only. No credentials are accepted by MCP.',
      inputSchema: z.strictObject({
        tlds: z.array(z.string()).optional(),
        query: z.string().optional(),
        currency: currencySchema,
        rates: ratesSchema,
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    },
    async (args) => {
      try {
        const outcome = await core.runPricesCommand({
          tlds: args.tlds,
          query: args.query,
          currency: args.currency,
          rates: args.rates,
          limit: args.limit,
          offset: args.offset,
          reportSourceErrors: true,
          sourceService,
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
        'within the given budget using standard TLD estimates, not actual individual or premium prices. ' +
        'RDAP availability is not a registration guarantee. Results are sorted by standard price. ' +
        'No budget means every available row is flagged withinBudget.',
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
          rates: args.rates,
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
        'infrastructure id and trust level. High-trust RDAP 404 is a preliminary ' +
        'signal, not a guarantee; low-trust zones may use DNS corroboration. Filter by infrastructure id.',
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

  // ---- list_drops ----
  server.registerTool(
    'list_drops',
    {
      title: 'List dropped domains',
      description:
        'List recently dropped domains from the bundled daily snapshot ' +
        '(registration price only, no aftermarket). Filter by name substring ' +
        'and/or a single TLD; limit caps the output size (default 200, max 2000).',
      inputSchema: {
        query: z.string().optional(),
        tld: z.string().optional(),
        limit: z.number().int().min(1).max(2000).optional(),
      },
    },
    async (args) => {
      try {
        const outcome = core.runDropsCommand({
          query: args.query,
          tld: args.tld,
          limit: args.limit,
        });
        return textResult(JSON.stringify(outcome, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---- price_trends ----
  server.registerTool(
    'price_trends',
    {
      title: 'Get TLD price trends',
      description:
        'Six-month price trend per TLD (percent change and direction) ' +
        'precomputed weekly from the CI price history. Filter by exact TLDs ' +
        'and/or substring.',
      inputSchema: {
        tlds: z.array(z.string()).optional(),
        query: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const outcome = core.runPriceTrendsCommand({
          tlds: args.tlds,
          query: args.query,
        });
        return textResult(JSON.stringify(outcome, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}
