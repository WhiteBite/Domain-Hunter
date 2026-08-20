import { describe, expect, it } from 'vitest';
import { capGenTray, GEN_TRAY_CAP } from '../src/ui/store';
import type { Candidate } from '../src/types';

function cand(n: string, src: Candidate['src'] = 'combinator'): Candidate {
  return { n, src };
}

describe('capGenTray (gentray cap enforcement)', () => {
  it('keeps all entries when below the cap', () => {
    const list = [cand('a'), cand('b')];
    expect(capGenTray(list)).toHaveLength(2);
  });

  it('drops oldest entries (front) when above the cap', () => {
    const list = [cand('old'), cand('mid'), cand('new')];
    const capped = capGenTray(list, 2);
    expect(capped).toHaveLength(2);
    expect(capped[0]?.n).toBe('mid');
    expect(capped[1]?.n).toBe('new');
  });

  it('default cap is GEN_TRAY_CAP (5000)', () => {
    expect(GEN_TRAY_CAP).toBe(5000);
    const list: Candidate[] = [];
    for (let i = 0; i < GEN_TRAY_CAP + 5; i++) list.push(cand(`n${i}`));
    const capped = capGenTray(list);
    expect(capped).toHaveLength(GEN_TRAY_CAP);
    // Oldest 5 dropped.
    expect(capped[0]?.n).toBe('n5');
  });

  it('handles empty input', () => {
    expect(capGenTray([])).toEqual([]);
  });

  it('does not mutate the input list', () => {
    const list = [cand('a'), cand('b'), cand('c')];
    capGenTray(list, 2);
    expect(list).toHaveLength(3);
  });
});
