/**
 * Minimal ambient types for node:fs used by tests/e2e/inventory.spec.ts.
 * The project's tsconfig has types: ["vite/client"] (no @types/node), but
 * Playwright's runner executes specs in Node, so the real module exists at
 * runtime — these declarations only satisfy tsc.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string): string[];
  export function readdirSync(
    path: string,
    options: { withFileTypes: true },
  ): Array<{ name: string; isDirectory(): boolean }>;
}
