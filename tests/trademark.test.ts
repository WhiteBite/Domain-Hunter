import { describe, it, expect } from 'vitest';
import { tmviewSearchUrl, trademarkLabel, usptoSearchUrl } from '../src/ui/trademark';

describe('trademarkLabel', () => {
  it('strips the TLD from a domain', () => {
    expect(trademarkLabel('example.com')).toBe('example');
    expect(trademarkLabel('my-brand.io')).toBe('my-brand');
  });

  it('keeps everything before the last dot for subdomains', () => {
    expect(trademarkLabel('ns1.example.com')).toBe('ns1.example');
  });

  it('returns the input when no dot is present', () => {
    expect(trademarkLabel('example')).toBe('example');
  });
});

describe('search URLs', () => {
  it('encodes the label into the USPTO query', () => {
    expect(usptoSearchUrl('my brand')).toBe(
      'https://tmsearch.uspto.gov/search/search-results?searchText=my%20brand',
    );
  });

  it('encodes the label into the TMview query', () => {
    expect(tmviewSearchUrl('my brand')).toBe(
      'https://www.tmdn.org/tmview/#/tmview/search?basicSearch=my%20brand',
    );
  });
});
