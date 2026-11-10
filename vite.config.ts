import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compactPricingModule } from './scripts/compact-pricing.mjs';
import { compactLocale } from './scripts/compact-locales.mjs';

export default defineConfig(({ command }) => ({
  // Relative base: required for GitHub Pages sub-path AND file:// usage.
  base: './',
  plugins: [
    ...(command === 'build' ? [{
      name: 'compact-pricing-snapshot',
      enforce: 'pre' as const,
      resolveId(source: string) {
        if (source.endsWith('/config/pricing.snapshot.json')) return '\0compact-pricing-snapshot';
      },
      load(this: import('rollup').PluginContext, id: string) {
        if (id !== '\0compact-pricing-snapshot') return;
        const file = fileURLToPath(new URL('./src/config/pricing.snapshot.json', import.meta.url));
        this.addWatchFile(file);
        return compactPricingModule(JSON.parse(readFileSync(file, 'utf8')));
      },
    }] : []),
    ...(command === 'build' ? [{
      name: 'compact-locales',
      enforce: 'pre' as const,
      transform(this: import('rollup').PluginContext, code: string, id: string) {
        const match = id.replaceAll('\\', '/').match(/\/src\/i18n\/(ru|es|de|pt|zh|ja|fr)\.ts$/);
        if (!match) return null;
        const english = fileURLToPath(new URL('./src/i18n/en.ts', import.meta.url));
        this.addWatchFile(english);
        return compactLocale(code, readFileSync(english, 'utf8'), match[1]!);
      },
    }] : []),
    svelte(), ...(command === 'build' ? [viteSingleFile()] : []),
  ],
  build: {
    target: 'es2022',
    // Inline every asset (fonts, images) into the single HTML file.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  worker: {
    // Classic (IIFE) worker: ES module workers from blob: URLs are unreliable
    // on file:// in Chromium, and the single-file build must work from disk.
    format: 'iife',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/pricing/**', 'cli/**'],
      thresholds: {
        statements: 62,
        'src/core/**': { statements: 88 },
        'src/pricing/**': { statements: 92 },
        'cli/**': { statements: 29 },
      },
    },
  },
}));
