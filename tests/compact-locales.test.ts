import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compactLocale } from '../scripts/compact-locales.mjs';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { es } from '../src/i18n/es';
import { de } from '../src/i18n/de';
import { pt } from '../src/i18n/pt';
import { zh } from '../src/i18n/zh';
import { ja } from '../src/i18n/ja';
import { fr } from '../src/i18n/fr';

const english = readFileSync('src/i18n/en.ts', 'utf8');

describe('lossless browser locale packing', () => {
  for (const [name, original] of Object.entries({ ru, es, de, pt, zh, ja, fr })) {
    it(`preserves the ${name} dictionary exactly`, async () => {
      const packed = compactLocale(readFileSync(`src/i18n/${name}.ts`, 'utf8'), english, name);
      expect(packed).not.toBeNull();
      const executable = packed!.replace("import { en } from './en';", `const en = ${JSON.stringify(en)};`);
      const decoded = await import(`data:text/javascript,${encodeURIComponent(executable)}`);
      expect(decoded[name]).toEqual(original);
      expect(Object.keys(decoded[name])).toEqual(Object.keys(en));
    });
  }
  it('falls back for unsupported schemas, changed key sets and side effects', () => {
    for (const source of [
      "export const ru = { 'other': 'x' };",
      "export const ru = { '__proto__': 'x' };",
      "export const ru = { 'test': String('x') };",
      "console.log('side effect'); export const ru = { 'test': 'x' };",
      "export const ru = { 'test': 'x', 'test': 'y' };",
    ]) expect(compactLocale(source, "export const en = { 'test': 'x' };", 'ru')).toBeNull();
    expect(compactLocale('', english, 'en')).toBeNull();
    expect(compactLocale("export const ru = { 'b': 'x', 'a': 'y' };", "export const en = { 'a': 'x', 'b': 'y' };", 'ru')).toBeNull();
    expect(compactLocale("export const ru = { '1': 'x' };", "export const en = { '1': 'x' };", 'ru')).toBeNull();
  });
});
