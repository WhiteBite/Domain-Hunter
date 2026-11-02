import { describe, expect, it, vi } from 'vitest';
import { runPriceTrendsCommand } from '../cli/core';

vi.mock('../src/config/pricing.snapshot.json', () => ({
  default: {
    tlds: {}, coupons: {}, sources: ['snapshot'], generatedAt: '2026-11-01',
    trends: {
      single: { pct: null, dir: null },
      established: { pct: -3, dir: 'down', spark: [100, 97] },
    },
  },
}));

describe('CLI trends with insufficient history', () => {
  it('preserves nulls without inventing a direction and excludes spark data', () => {
    expect(runPriceTrendsCommand({}).trends).toEqual({
      established: { pct: -3, dir: 'down' },
      single: { pct: null, dir: null },
    });
  });
});
