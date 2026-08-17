import { describe, it, expect } from 'vitest';
import { encodeShare, parseShare, clearShare } from '../src/ui/share';

describe('encodeShare / parseShare roundtrip', () => {
  it('roundtrips basic state without run', () => {
    const hash = encodeShare({ q: 'myapp', tlds: ['com', 'dev'] });
    expect(hash.startsWith('#s=')).toBe(true);
    const parsed = parseShare(hash);
    expect(parsed).not.toBeNull();
    expect(parsed?.q).toBe('myapp');
    expect(parsed?.tlds).toEqual(['com', 'dev']);
    expect(parsed?.run).toBe(false);
  });

  it('roundtrips with run=true', () => {
    const hash = encodeShare({ q: 'test', tlds: ['io'], run: true });
    const parsed = parseShare(hash);
    expect(parsed?.run).toBe(true);
  });

  it('roundtrips cyrillic query (unicode-safe)', () => {
    const hash = encodeShare({ q: 'тест', tlds: ['com'] });
    const parsed = parseShare(hash);
    expect(parsed?.q).toBe('тест');
  });

  it('roundtrips emoji and mixed unicode', () => {
    const hash = encodeShare({ q: 'café ☕', tlds: ['xyz'] });
    const parsed = parseShare(hash);
    expect(parsed?.q).toBe('café ☕');
  });

  it('roundtrips empty tlds array', () => {
    const hash = encodeShare({ q: 'hello', tlds: [] });
    const parsed = parseShare(hash);
    expect(parsed?.tlds).toEqual([]);
  });

  it('produces base64url (no +, /, or =)', () => {
    const hash = encodeShare({ q: '>>>???', tlds: ['com'] });
    const payload = hash.slice(3);
    expect(payload).not.toMatch(/[+/=]/);
  });
});

describe('parseShare validation', () => {
  it('returns null for empty string', () => {
    expect(parseShare('')).toBeNull();
  });

  it('returns null for non-share hash', () => {
    expect(parseShare('#other=stuff')).toBeNull();
  });

  it('returns null for malformed base64', () => {
    expect(parseShare('#s=!!!invalid!!!')).toBeNull();
  });

  it('returns null for #s= with no payload', () => {
    expect(parseShare('#s=')).toBeNull();
  });

  it('filters non-string tlds entries', () => {
    // Manually craft a payload with mixed-type tlds
    const json = JSON.stringify({ q: 'x', tlds: ['com', 42, null, 'dev'], run: true });
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const parsed = parseShare('#s=' + b64);
    expect(parsed?.tlds).toEqual(['com', 'dev']);
  });

  it('defaults run to false when missing', () => {
    const json = JSON.stringify({ q: 'x', tlds: ['com'] });
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const parsed = parseShare('#s=' + b64);
    expect(parsed?.run).toBe(false);
  });
});

describe('clearShare', () => {
  it('does not throw in environments without history/location', () => {
    expect(() => clearShare()).not.toThrow();
  });
});
