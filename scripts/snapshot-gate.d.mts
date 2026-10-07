/**
 * Type declarations for snapshot-gate.mjs — used by tests/snapshot-gate.test.ts.
 */
export declare function diffLeaves(
  a: unknown,
  b: unknown,
): { total: number; changed: number; ratio: number };
