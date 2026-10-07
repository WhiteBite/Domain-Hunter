import { describe, it, expect } from 'vitest';
import { diffLeaves } from '../scripts/snapshot-gate.mjs';

describe('diffLeaves', () => {
  it('counts identical trees as zero changes', () => {
    const a = { tlds: { com: { reg: 100, renew: 200 } }, coupons: {} };
    expect(diffLeaves(a, structuredClone(a))).toEqual({ total: 2, changed: 0, ratio: 0 });
  });

  it('counts changed and added leaves', () => {
    const a = { com: { reg: 100, renew: 200 } };
    const b = { com: { reg: 101, renew: 200, transfer: 5 } };
    const r = diffLeaves(a, b);
    expect(r.total).toBe(3);
    expect(r.changed).toBe(2);
    expect(r.ratio).toBeCloseTo(2 / 3);
  });

  it('treats removed keys as changed leaves', () => {
    const r = diffLeaves({ a: 1, b: 2 }, { a: 1 });
    expect(r.total).toBe(2);
    expect(r.changed).toBe(1);
  });

  it('compares arrays element-wise', () => {
    const r = diffLeaves({ c: [{ code: 'X', amount: 1 }] }, { c: [{ code: 'X', amount: 2 }] });
    expect(r.total).toBe(2);
    expect(r.changed).toBe(1);
  });

  it('returns ratio 0 for empty trees', () => {
    expect(diffLeaves({}, {}).ratio).toBe(0);
  });

  it('null vs number is a leaf change', () => {
    const r = diffLeaves({ x: null }, { x: 5 });
    expect(r.total).toBe(1);
    expect(r.changed).toBe(1);
  });
});
