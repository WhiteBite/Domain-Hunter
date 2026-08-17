import { describe, expect, it } from 'vitest';
import {
  isValidDomain,
  isValidLabel,
  normalizeDomainInput,
  parseCandidate,
  punycodeEncodeLabel,
  toAscii,
} from '../src/core/idn';

describe('punycode (RFC 3492)', () => {
  it('encodes münchen → mnchen-3ya', () => {
    expect(punycodeEncodeLabel('münchen')).toBe('mnchen-3ya');
  });

  it('encodes bücher → bcher-kva', () => {
    expect(punycodeEncodeLabel('bücher')).toBe('bcher-kva');
  });

  it('toAscii prefixes xn-- per label and lowercases', () => {
    expect(toAscii('münchen.de')).toBe('xn--mnchen-3ya.de');
    expect(toAscii('EXAMPLE.com')).toBe('example.com');
  });
});

describe('validation', () => {
  it('accepts valid labels', () => {
    expect(isValidLabel('ok')).toBe(true);
    expect(isValidLabel('a1-b2')).toBe(true);
    expect(isValidLabel('xn--mnchen-3ya')).toBe(true);
  });

  it('rejects invalid labels', () => {
    expect(isValidLabel('-a')).toBe(false);
    expect(isValidLabel('a-')).toBe(false);
    expect(isValidLabel('a'.repeat(64))).toBe(false);
    expect(isValidLabel('')).toBe(false);
    expect(isValidLabel('has_underscore')).toBe(false);
  });

  it('validates domains', () => {
    expect(isValidDomain('myapp.dev')).toBe(true);
    expect(isValidDomain('myapp..dev')).toBe(false);
  });
});

describe('normalizeDomainInput', () => {
  it('strips protocols, www, paths, ports', () => {
    const parsed = normalizeDomainInput(
      'https://www.Example.com/some/path http://foo.io:8080/x',
    );
    expect(parsed.names).toContain('example.com');
    expect(parsed.names).toContain('foo.io');
    expect(parsed.invalid).toBe(0);
  });

  it('counts invalid tokens', () => {
    const parsed = normalizeDomainInput('good.com bad_ -bad');
    expect(parsed.names).toEqual(['good.com']);
    expect(parsed.invalid).toBe(2);
  });

  it('punycodes IDN input', () => {
    const parsed = normalizeDomainInput('münchen.de');
    expect(parsed.names).toEqual(['xn--mnchen-3ya.de']);
  });

  it('dedupes case-insensitively', () => {
    const parsed = normalizeDomainInput('a.com a.com A.COM');
    expect(parsed.names).toEqual(['a.com']);
  });
});

describe('parseCandidate', () => {
  it('expands bare names across tlds', () => {
    expect(parseCandidate('myapp', ['dev', 'com'])).toEqual(['myapp.dev', 'myapp.com']);
  });

  it('keeps full domains as-is', () => {
    expect(parseCandidate('myapp.dev', ['com'])).toEqual(['myapp.dev']);
  });
});
