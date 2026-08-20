import { describe, it, expect } from 'vitest';
import { registrarMonogram } from '../src/ui/registrar-badge';

describe('registrarMonogram', () => {
  it('returns the known short codes for priced registrars', () => {
    expect(registrarMonogram('porkbun').short).toBe('PB');
    expect(registrarMonogram('cloudflare').short).toBe('CF');
    expect(registrarMonogram('dynadot').short).toBe('DD');
    expect(registrarMonogram('spaceship').short).toBe('SS');
    expect(registrarMonogram('valuedomain').short).toBe('VD');
    expect(registrarMonogram('regru').short).toBe('RR');
    expect(registrarMonogram('beget').short).toBe('BG');
  });

  it('falls back to the first two id letters uppercased', () => {
    expect(registrarMonogram('namecheap').short).toBe('NA');
    expect(registrarMonogram('godaddy').short).toBe('GO');
    expect(registrarMonogram('hover').short).toBe('HO');
  });

  it('derives a deterministic hue in [0, 360)', () => {
    const a = registrarMonogram('porkbun').hue;
    expect(a).toBe(registrarMonogram('porkbun').hue);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
  });

  it('assigns distinct hues to the priced registrars', () => {
    const ids = [
      'porkbun',
      'cloudflare',
      'dynadot',
      'spaceship',
      'valuedomain',
      'regru',
      'beget',
    ];
    const hues = new Set(ids.map((id) => registrarMonogram(id).hue));
    expect(hues.size).toBe(ids.length);
  });
});
