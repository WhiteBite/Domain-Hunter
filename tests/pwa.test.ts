import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { crc32, encodePng, renderIcon } from '../scripts/build-icons.mjs';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readBytes(path: string): Uint8Array {
  return Uint8Array.from(readFileSync(path, 'binary'), (c) => c.charCodeAt(0));
}

function u32be(b: Uint8Array, off: number): number {
  return new DataView(b.buffer, b.byteOffset + off, 4).getUint32(0);
}

function ascii(b: Uint8Array, start: number, end: number): string {
  return new TextDecoder().decode(b.subarray(start, end));
}

function ihdr(png: Uint8Array): {
  width: number;
  height: number;
  depth: number;
  colorType: number;
} {
  return {
    width: u32be(png, 16),
    height: u32be(png, 20),
    depth: png[24] ?? 0,
    colorType: png[25] ?? 0,
  };
}

function chunkCrcValid(png: Uint8Array, offset: number): boolean {
  const len = u32be(png, offset);
  const body = png.subarray(offset + 4, offset + 8 + len);
  return crc32(body) === u32be(png, offset + 8 + len);
}

describe('crc32', () => {
  it('matches the known check value for "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('renderIcon', () => {
  it('produces RGBA pixels of the exact size with opaque alpha', () => {
    const px = renderIcon(8);
    expect(px).toHaveLength(8 * 8 * 4);
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });

  it('paints the indigo mark somewhere and keeps the dark background at the corners', () => {
    const size = 64;
    const px = renderIcon(size);
    expect([px[0] ?? 0, px[1] ?? 0, px[2] ?? 0]).toEqual([0x0b, 0x0c, 0x0f]);
    let hasFg = false;
    for (let i = 0; i < px.length; i += 4) {
      if ((px[i] ?? 0) === 0x63 && (px[i + 1] ?? 0) === 0x66) hasFg = true;
    }
    expect(hasFg).toBe(true);
  });
});

describe('encodePng', () => {
  it('emits a valid PNG structure with correct IHDR and CRCs', () => {
    const size = 8;
    const png = encodePng(renderIcon(size), size);
    for (let i = 0; i < 8; i++) expect(png[i]).toBe(PNG_SIG[i]);
    expect(ascii(png, 12, 16)).toBe('IHDR');
    expect(ihdr(png)).toEqual({ width: size, height: size, depth: 8, colorType: 6 });
    expect(chunkCrcValid(png, 8)).toBe(true);
    const idatLen = u32be(png, 33);
    expect(ascii(png, 37, 41)).toBe('IDAT');
    expect(chunkCrcValid(png, 33)).toBe(true);
    const iendOff = 33 + 12 + idatLen;
    expect(ascii(png, iendOff + 4, iendOff + 8)).toBe('IEND');
    expect(chunkCrcValid(png, iendOff)).toBe(true);
  });
});

describe('shipped PWA assets', () => {
  it('icon files exist with the declared dimensions', () => {
    for (const size of [192, 512]) {
      const png = readBytes(join('public', 'icons', `icon-${size}.png`));
      for (let i = 0; i < 8; i++) expect(png[i]).toBe(PNG_SIG[i]);
      expect(ihdr(png).width).toBe(size);
      expect(ihdr(png).height).toBe(size);
      expect(chunkCrcValid(png, 8)).toBe(true);
    }
  });

  it('icons on disk match the deterministic renderer output', () => {
    const expected = Uint8Array.from(encodePng(renderIcon(192), 192));
    const actual = readBytes(join('public', 'icons', 'icon-192.png'));
    expect(actual).toEqual(expected);
  });

  it('manifest is valid JSON with the required installability fields', () => {
    const raw = readFileSync(join('public', 'manifest.webmanifest'), 'utf8');
    const m = JSON.parse(raw) as {
      name: string;
      short_name: string;
      start_url: string;
      display: string;
      icons: { src: string; sizes: string }[];
    };
    expect(m.name).toBe('Domain Hunter');
    expect(m.short_name.length).toBeGreaterThan(0);
    expect(m.start_url).toBe('.');
    expect(m.display).toBe('standalone');
    const sizes = m.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('sw.js registers the lifecycle handlers and a versioned cache', () => {
    const sw = readFileSync(join('public', 'sw.js'), 'utf8');
    expect(sw).toContain("const CACHE = 'dh-v1'");
    for (const ev of ['install', 'activate', 'fetch']) {
      expect(sw).toContain(`addEventListener('${ev}'`);
    }
    expect(sw).toContain('self.location.origin');
  });

  it('index.html links the manifest and allows same-origin workers in the CSP', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('manifest.webmanifest');
    expect(html).toContain("worker-src 'self' blob:");
    expect(html).toContain('name="theme-color"');
  });
});
