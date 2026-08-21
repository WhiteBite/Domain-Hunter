/**
 * Minimal ambient types for node:fs/node:path/node:os used by tests.
 * The project's tsconfig has types: ["vite/client"] (no @types/node), but
 * vitest and Playwright runners execute in Node, so the real modules exist
 * at runtime — these declarations only satisfy tsc.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string): string[];
  export function readdirSync(
    path: string,
    options: { withFileTypes: true },
  ): Array<{ name: string; isDirectory(): boolean }>;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options: { recursive: true }): string;
  export function rmSync(path: string, options: { recursive: true }): void;
}

declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}
