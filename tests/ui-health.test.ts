import { describe, it, expect } from 'vitest';
import { healthNote } from '../src/ui/health';

describe('healthNote', () => {
  it('null for a missing entry', () => {
    expect(healthNote(undefined)).toBeNull();
  });

  it('unverified when ok is false (legacy or dual-flag)', () => {
    expect(healthNote({ ok: false })).toBe('unverified');
    expect(healthNote({ ok: false, directOk: false, cfOk: false })).toBe('unverified');
  });

  it('indirect when only the CF aggregator answered', () => {
    expect(healthNote({ ok: true, directOk: false, cfOk: true })).toBe('indirect');
  });

  it('null for healthy or legacy-ok entries', () => {
    expect(healthNote({ ok: true, directOk: true, cfOk: null })).toBeNull();
    expect(healthNote({ ok: true })).toBeNull();
    expect(healthNote({})).toBeNull();
  });
});
