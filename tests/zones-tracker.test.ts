import { describe, it, expect } from 'vitest';
import { diffNewZones } from '../src/ui/zones-tracker';

describe('diffNewZones', () => {
  it('returns zones present in current but absent from seen', () => {
    expect(diffNewZones(['com', 'dev'], ['com', 'dev', 'future'])).toEqual(['future']);
  });

  it('returns [] when nothing is new and on identical lists', () => {
    expect(diffNewZones(['com'], ['com'])).toEqual([]);
    expect(diffNewZones(['com', 'io'], ['io', 'com'])).toEqual([]);
  });

  it('does not announce zones that disappeared', () => {
    expect(diffNewZones(['com', 'io', 'xyz'], ['com'])).toEqual([]);
  });

  it('first visit (null seen) announces nothing', () => {
    expect(diffNewZones(null, ['com', 'future'])).toEqual([]);
  });
});
