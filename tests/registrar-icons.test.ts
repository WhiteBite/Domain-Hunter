import { describe, expect, it } from 'vitest';
import { REGISTRAR_ICONS } from '../src/ui/registrar-icons';

describe('embedded registrar icons', () => {
  it('contains image bytes, not an HTML challenge or error page', () => {
    for (const [id, uri] of Object.entries(REGISTRAR_ICONS)) {
      const match = /^data:(image\/(?:png|x-icon|svg\+xml));base64,(.+)$/.exec(uri);
      expect(match, id).not.toBeNull();
      const bytes = Buffer.from(match![2]!, 'base64');
      if (match![1] === 'image/png') expect(bytes.subarray(0, 8).toString('hex'), id).toBe('89504e470d0a1a0a');
      if (match![1] === 'image/x-icon') expect(bytes.subarray(0, 4).toString('hex'), id).toBe('00000100');
      if (match![1] === 'image/svg+xml') expect(bytes.toString('utf8').trimStart(), id).toMatch(/^<svg[\s>]/);
    }
  });
});
