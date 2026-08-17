import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ command }) => ({
  // Relative base: required for GitHub Pages sub-path AND file:// usage.
  base: './',
  plugins: [svelte(), ...(command === 'build' ? [viteSingleFile()] : [])],
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
  },
}));
