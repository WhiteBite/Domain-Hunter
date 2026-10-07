import { describe, it, expect, vi } from 'vitest';
import { runWatchCommand } from '../cli/core';
import type { CheckOutcome, WatchCommandOptions } from '../cli/contract';
import { formatOutcome, isOutputFormat } from '../cli/format';
import { completionScript, isCompletionShell } from '../cli/completions';

const BOM = String.fromCharCode(0xfeff);

function outcome(
  statuses: Record<string, 'available' | 'taken' | 'probably_available' | 'unknown'>,
  aborted = false,
): CheckOutcome {
  return {
    command: 'check',
    checkedAt: 0,
    durationMs: 0,
    total: Object.keys(statuses).length,
    counts: { available: 0, probably_available: 0, taken: 0, unknown: 0, error: 0 },
    results: Object.entries(statuses).map(([domain, status]) => {
      const i = domain.lastIndexOf('.');
      return { domain, tld: domain.slice(i + 1), status, source: 'rdap' as const };
    }),
    dataSource: { tlds: 'bundled' as const, bootstrapMerged: false },
    aborted,
  };
}

const baseOpts: WatchCommandOptions = { domains: ['ex.com'], intervalSec: 5 };

describe('runWatchCommand', () => {
  it('stops on flip with exit-10 semantics and records the transition', async () => {
    const check = vi
      .fn()
      .mockResolvedValueOnce(outcome({ 'ex.com': 'taken' }))
      .mockResolvedValueOnce(outcome({ 'ex.com': 'available' }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const out = await runWatchCommand({ ...baseOpts, rounds: 10 }, { check, sleep });
    expect(out.stopped).toBe('flip');
    expect(out.rounds).toBe(2);
    expect(out.flips).toEqual([
      { domain: 'ex.com', from: 'taken', to: 'available', round: 2 },
    ]);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it('never flips on round 1 (no previous statuses)', async () => {
    const check = vi.fn().mockResolvedValue(outcome({ 'ex.com': 'available' }));
    const out = await runWatchCommand({ ...baseOpts, rounds: 1 }, { check });
    expect(out.stopped).toBe('rounds');
    expect(out.flips).toEqual([]);
    expect(out.statuses).toEqual({ 'ex.com': 'available' });
  });

  it('exhausts the round budget without sleeping after the last round', async () => {
    const check = vi.fn().mockResolvedValue(outcome({ 'ex.com': 'taken' }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const out = await runWatchCommand({ ...baseOpts, rounds: 3 }, { check, sleep });
    expect(out.stopped).toBe('rounds');
    expect(out.rounds).toBe(3);
    expect(check).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('always ignores the cache when polling', async () => {
    const check = vi.fn().mockResolvedValue(outcome({ 'ex.com': 'taken' }));
    await runWatchCommand({ ...baseOpts, rounds: 1 }, { check });
    expect(check.mock.calls[0]?.[0]).toMatchObject({ ignoreCache: true, domains: ['ex.com'] });
  });

  it('clamps the interval to the 5s floor', async () => {
    const check = vi.fn().mockResolvedValue(outcome({ 'ex.com': 'taken' }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await runWatchCommand(
      { domains: ['ex.com'], intervalSec: 1, rounds: 2 },
      { check, sleep },
    );
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it('reports interrupted when a round aborts', async () => {
    const check = vi.fn().mockResolvedValue(outcome({ 'ex.com': 'taken' }, true));
    const out = await runWatchCommand({ ...baseOpts, rounds: 5 }, { check });
    expect(out.stopped).toBe('interrupted');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('detects flips across multiple domains and keeps final statuses', async () => {
    const check = vi
      .fn()
      .mockResolvedValueOnce(outcome({ 'a.com': 'taken', 'b.com': 'taken' }))
      .mockResolvedValueOnce(outcome({ 'a.com': 'taken', 'b.com': 'probably_available' }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const out = await runWatchCommand(
      { domains: ['a.com', 'b.com'], intervalSec: 5, rounds: 10 },
      { check, sleep },
    );
    expect(out.flips).toHaveLength(1);
    expect(out.flips[0]?.domain).toBe('b.com');
    expect(out.statuses).toEqual({ 'a.com': 'taken', 'b.com': 'probably_available' });
  });
});

describe('formatOutcome', () => {
  const check = outcome({ 'ex.com': 'available' });

  it('json is the identity pretty-print', () => {
    expect(formatOutcome(check, 'json')).toBe(JSON.stringify(check, null, 2) + '\n');
  });

  it('table renders aligned header + rows', () => {
    const t = formatOutcome(check, 'table');
    expect(t).toContain('domain');
    expect(t).toContain('ex.com');
    expect(t).toContain('available');
    const lines = t.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('csv carries the BOM and headers', () => {
    const c = formatOutcome(check, 'csv');
    expect(c.startsWith(BOM)).toBe(true);
    expect(c).toContain('domain,tld,status,source,price_first,price_renew');
    expect(c).toContain('ex.com');
  });

  it('drops outcome maps to domain/tld columns', () => {
    const drops = {
      command: 'drops' as const,
      generatedAt: 'x',
      source: 'y',
      total: 1,
      domains: ['foo.bar'],
    };
    expect(formatOutcome(drops, 'csv')).toContain('foo.bar,bar');
    expect(formatOutcome(drops, 'table')).toContain('foo.bar');
  });

  it('prices outcome shows best registrar and USD columns', () => {
    const prices = {
      command: 'prices' as const,
      sources: ['snapshot'],
      fetchedAt: null,
      rows: [
        {
          tld: 'com',
          best: { registrarId: 'porkbun', reg: 1026, renew: 1026 },
          tco3UsdCents: 3078,
          promoTrap: false,
          entries: {},
        },
      ],
    };
    const t = formatOutcome(prices, 'table');
    expect(t).toContain('porkbun');
    expect(t).toContain('10.26');
    expect(t).toContain('30.78');
  });

  it('isOutputFormat rejects anything else', () => {
    expect(isOutputFormat('json')).toBe(true);
    expect(isOutputFormat('yaml')).toBe(false);
    expect(isOutputFormat(true)).toBe(false);
    expect(isOutputFormat(undefined)).toBe(false);
  });
});

describe('completionScript', () => {
  it('covers every command in all three shells', () => {
    for (const shell of ['bash', 'zsh', 'fish'] as const) {
      const s = completionScript(shell);
      for (const cmd of ['check', 'prices', 'generate', 'find', 'tlds', 'drops', 'watch', 'completions']) {
        expect(s).toContain(cmd);
      }
      expect(s).toContain('--format');
    }
  });

  it('emits shell-specific wiring', () => {
    expect(completionScript('bash')).toContain('complete -F _domain_hunter domain-hunter');
    expect(completionScript('zsh')).toContain('#compdef domain-hunter');
    expect(completionScript('fish')).toContain("complete -c domain-hunter -f -n '__fish_use_subcommand' -a 'check'");
  });

  it('isCompletionShell guards the positional', () => {
    expect(isCompletionShell('bash')).toBe(true);
    expect(isCompletionShell('pwsh')).toBe(false);
    expect(isCompletionShell(undefined)).toBe(false);
  });
});
