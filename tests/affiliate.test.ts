import { describe, it, expect } from 'vitest';
import { applyAffiliate } from '../src/ui/affiliate';
import type { RegistrarConfig } from '../src/types';

const make = (over: Partial<RegistrarConfig['affiliate']>): RegistrarConfig => ({
  id: 'porkbun',
  name: 'Porkbun',
  searchUrl: 'https://porkbun.com/checkout/search?q={domain}',
  affiliate: { program: 'ambassador-inhouse', viable: true, param: 'invite={tag}', ...over },
});

describe('applyAffiliate', () => {
  it('returns the url unchanged when tag is empty', () => {
    const url = 'https://porkbun.com/checkout/search?q=midas.com';
    expect(applyAffiliate(make({ tag: '' }), url)).toBe(url);
  });

  it('returns the url unchanged without affiliate config', () => {
    const reg: RegistrarConfig = { id: 'cf', name: 'CF', searchUrl: 'https://x/' };
    expect(applyAffiliate(reg, 'https://x/a?b=1')).toBe('https://x/a?b=1');
  });

  it('appends with ? when the url has no query', () => {
    expect(applyAffiliate(make({ tag: 'abc' }), 'https://porkbun.com/')).toBe(
      'https://porkbun.com/?invite=abc',
    );
  });

  it('appends with & when the url already has a query', () => {
    expect(
      applyAffiliate(make({ tag: 'abc' }), 'https://porkbun.com/checkout/search?q=m.com'),
    ).toBe('https://porkbun.com/checkout/search?q=m.com&invite=abc');
  });

  it('percent-encodes the tag', () => {
    expect(applyAffiliate(make({ tag: 'a b&c' }), 'https://porkbun.com/')).toBe(
      'https://porkbun.com/?invite=a%20b%26c',
    );
  });

  it('ignores non-viable programs even with a tag', () => {
    const url = 'https://porkbun.com/x';
    expect(applyAffiliate(make({ viable: false, tag: 'abc' }), url)).toBe(url);
  });
});
