/**
 * Type declarations for build-icons.mjs — used by tests/pwa.test.ts.
 * The actual implementation lives in scripts/build-icons.mjs (plain ESM, no TS).
 */

export declare function crc32(buf: Uint8Array): number;
export declare function encodePng(rgba: Uint8Array, size: number): Uint8Array;
export declare function renderIcon(size: number): Uint8Array;
