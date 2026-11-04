import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compactPricingModule } from '../scripts/compact-pricing.mjs';

async function unpack(snapshot: Record<string, unknown>): Promise<unknown> {
  const code = compactPricingModule(snapshot);
  return (await import(`data:text/javascript,${encodeURIComponent(code)}`)).default;
}

describe('browser snapshot packing', () => {
  it('preserves every zone, quote and metadata field in the reviewed snapshot', async () => {
    const snapshot = JSON.parse(readFileSync('src/config/pricing.snapshot.json', 'utf8'));
    expect(await unpack(snapshot)).toEqual(snapshot);
  });
  it('falls back without losing data when the schema changes', async () => {
    const snapshot = { tlds: { example: { seller: [1, 2, 3, 4] } }, extra: '<script>data' };
    expect(await unpack(snapshot)).toEqual(snapshot);
  });
  it('keeps unusual property names as ordinary own properties', async () => {
    const snapshot = JSON.parse('{"tlds":{"x":{"__proto__":[1,2,3]}},"extra":true}');
    expect(await unpack(snapshot)).toEqual(snapshot);
  });
  it('preserves __proto__ in metadata and fallback data', async () => {
    for (const snapshot of [
      JSON.parse('{"__proto__":{"safe":true},"tlds":{"x":{"seller":[1,2,3]}}}'),
      JSON.parse('{"tlds":{"x":{"__proto__":[1,2,3,4]}}}'),
      JSON.parse('{"tlds":{"x":{"seller":[{"__proto__":{"safe":true}},2,3]}}}'),
    ]) expect(await unpack(snapshot)).toEqual(snapshot);
  });
});
