import { describe, expect, it } from 'vitest';
import { runGenerateCommand } from '../cli/core';

// runGenerateCommand dispatches to one of five pure generators. Only the
// 'hacks' generator calls loadRegistry (which may fetch from GitHub). The
// other four — combinator, syllables, mutations, themes — are fully
// offline-safe and need no fetchImpl or localStorage shim.

describe('runGenerateCommand — offline-safe generators', () => {
  describe('combinator', () => {
    it('generates names from roots × affixes', async () => {
      const outcome = await runGenerateCommand({
        generator: 'combinator',
        roots: ['test'],
        affixes: ['x'],
        mode: 'both',
      });
      expect(outcome.command).toBe('generate');
      expect(outcome.generator).toBe('combinator');
      expect(outcome.names.length).toBeGreaterThan(0);
      // No tlds → domains stays empty.
      expect(outcome.domains).toEqual([]);
    });

    it('expands names into domains when tlds are given', async () => {
      const outcome = await runGenerateCommand({
        generator: 'combinator',
        roots: ['test'],
        affixes: ['x'],
        mode: 'both',
        tlds: ['com'],
      });
      expect(outcome.domains.length).toBeGreaterThan(0);
      for (const d of outcome.domains) {
        expect(d.endsWith('.com')).toBe(true);
      }
    });

    it('respects the count cap', async () => {
      const outcome = await runGenerateCommand({
        generator: 'combinator',
        roots: ['a', 'b', 'c'],
        affixes: ['x', 'y', 'z'],
        mode: 'both',
        count: 5,
      });
      expect(outcome.names.length).toBeLessThanOrEqual(5);
    });
  });

  describe('mutations', () => {
    it('generates mutations of a root word', async () => {
      const outcome = await runGenerateCommand({
        generator: 'mutations',
        roots: ['test'],
      });
      expect(outcome.command).toBe('generate');
      expect(outcome.generator).toBe('mutations');
      expect(outcome.names.length).toBeGreaterThan(0);
    });

    it('handles multiple roots', async () => {
      const outcome = await runGenerateCommand({
        generator: 'mutations',
        roots: ['one', 'two'],
      });
      expect(outcome.names.length).toBeGreaterThan(0);
    });
  });

  describe('syllables', () => {
    it('generates pronounceable neologisms deterministically with a seed', async () => {
      const a = await runGenerateCommand({
        generator: 'syllables',
        count: 10,
        seed: 42,
      });
      const b = await runGenerateCommand({
        generator: 'syllables',
        count: 10,
        seed: 42,
      });
      expect(a.names).toEqual(b.names);
      expect(a.names).toHaveLength(10);
    });
  });

  describe('themes', () => {
    it('returns themed word lists', async () => {
      const outcome = await runGenerateCommand({
        generator: 'themes',
      });
      expect(outcome.names.length).toBeGreaterThan(0);
    });
  });
});
