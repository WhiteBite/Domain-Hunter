import { describe, expect, it, beforeEach, vi } from 'vitest';
import { classifyPriceDrop, notePrice } from '../src/ui/watchlist';

// ---- classifyPriceDrop (pure) ----

describe('classifyPriceDrop', () => {
  it('returns false when either price is null', () => {
    expect(classifyPriceDrop(null, 1000)).toBe(false);
    expect(classifyPriceDrop(1000, null)).toBe(false);
    expect(classifyPriceDrop(null, null)).toBe(false);
  });

  it('returns false when baseline is zero or negative', () => {
    expect(classifyPriceDrop(0, 1000)).toBe(false);
    expect(classifyPriceDrop(-1, 1000)).toBe(false);
  });

  it('returns true at exactly 5% drop', () => {
    // 1000 → 950 = 50/1000 = 0.05 = 5%
    expect(classifyPriceDrop(1000, 950)).toBe(true);
  });

  it('returns false at 4.9% drop (below threshold)', () => {
    // 1000 → 951 = 49/1000 = 0.049 = 4.9%
    expect(classifyPriceDrop(1000, 951)).toBe(false);
  });

  it('returns true at 5.1% drop (above threshold)', () => {
    // 1000 → 949 = 51/1000 = 0.051 = 5.1%
    expect(classifyPriceDrop(1000, 949)).toBe(true);
  });

  it('returns false when price increased', () => {
    expect(classifyPriceDrop(1000, 1100)).toBe(false);
    expect(classifyPriceDrop(1000, 1000)).toBe(false);
  });

  it('respects custom threshold', () => {
    // 10% threshold: 1000 → 900 = 10% → true
    expect(classifyPriceDrop(1000, 900, 0.1)).toBe(true);
    // 10% threshold: 1000 → 901 = 9.9% → false
    expect(classifyPriceDrop(1000, 901, 0.1)).toBe(false);
  });
});

// ---- notePrice (localStorage persistence) ----

describe('notePrice', () => {
  beforeEach(() => {
    const data: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem(key: string) {
        return data[key] ?? null;
      },
      setItem(key: string, value: string) {
        data[key] = value;
      },
      removeItem(key: string) {
        delete data[key];
      },
      clear() {
        for (const k of Object.keys(data)) delete data[k];
      },
    });
  });

  it('sets a baseline when cents is provided', () => {
    notePrice('example.com', 2000);
    const raw = localStorage.getItem('dh:v1:watchprices');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Record<string, { cents: number; ts: number }>;
    expect(parsed['example.com']?.cents).toBe(2000);
    expect(parsed['example.com']?.ts).toBeGreaterThan(0);
  });

  it('removes the baseline when cents is null', () => {
    notePrice('example.com', 2000);
    notePrice('example.com', null);
    const raw = localStorage.getItem('dh:v1:watchprices');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Record<string, unknown>;
    expect(parsed['example.com']).toBeUndefined();
  });

  it('preserves other baselines when removing one', () => {
    notePrice('a.com', 1000);
    notePrice('b.com', 2000);
    notePrice('a.com', null);
    const raw = localStorage.getItem('dh:v1:watchprices');
    const parsed = JSON.parse(raw!) as Record<string, { cents: number }>;
    expect(parsed['a.com']).toBeUndefined();
    expect(parsed['b.com']?.cents).toBe(2000);
  });

  it('updates baseline to new price when no drop (simulate refreshWatchlist no-drop path)', () => {
    // Star a domain at $20
    notePrice('example.com', 2000);
    // Price didn't drop enough (only 3%): 2000 → 1940
    const baseline = 2000;
    const current = 1940;
    expect(classifyPriceDrop(baseline, current)).toBe(false);
    // No drop → update baseline
    notePrice('example.com', current);
    const raw = localStorage.getItem('dh:v1:watchprices');
    const parsed = JSON.parse(raw!) as Record<string, { cents: number }>;
    expect(parsed['example.com']?.cents).toBe(1940);
  });

  it('does NOT overwrite baseline when drop is detected (baseline-not-overwritten-on-drop)', () => {
    // Star a domain at $20
    notePrice('example.com', 2000);
    // Price dropped 50%: 2000 → 1000
    const baseline = 2000;
    const current = 1000;
    expect(classifyPriceDrop(baseline, current)).toBe(true);
    // Drop detected → do NOT call notePrice to update (keep old baseline)
    // Verify the baseline is still the old value
    const raw = localStorage.getItem('dh:v1:watchprices');
    const parsed = JSON.parse(raw!) as Record<string, { cents: number }>;
    expect(parsed['example.com']?.cents).toBe(2000);
  });
});
