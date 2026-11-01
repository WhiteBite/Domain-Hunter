import { describe, it, expect } from 'vitest';
import tldsJson from '../src/config/tlds.json';
import registrarsJson from '../src/config/registrars.json';
import wholesaleJson from '../src/config/wholesale.json';
import pricingSnapshotJson from '../src/config/pricing.snapshot.json';

interface Infra {
  rdapBase: string;
  trust: string;
}
interface TldEntry {
  tld: string;
  infra: string;
}
interface Registrar {
  id: string;
  name: string;
  searchUrl: string;
  affiliate?: {
    program: string;
    viable: boolean;
    param?: string;
    tag?: string;
  };
}
interface ScheduledEntry {
  from: string;
  cents: number;
}
interface Coupon {
  code: string;
  firstYearOnly: boolean;
  type: string;
  amount: number;
}

const tldsConfig = tldsJson as unknown as {
  infras: Record<string, Infra>;
  tlds: TldEntry[];
  hackTlds: string[];
  premiumHeavyTlds?: string[];
};
const registrars = registrarsJson as unknown as Registrar[];
const wholesale = wholesaleJson as unknown as {
  floors: Record<string, number>;
  scheduled?: Record<string, ScheduledEntry[]>;
};
const pricingSnapshot = pricingSnapshotJson as unknown as {
  tlds: Record<string, Record<string, (number | null)[]>>;
  coupons: Record<string, Coupon[]>;
  sprinthostUpdatedAt?: string;
  webhost1UpdatedAt?: string;
  webhost1RenewalUpdatedAt?: string;
  adminvpsUpdatedAt?: string;
  sourcePromotions?: Record<string, string[]>;
  sourceRub?: Record<string, Record<string, [number | null, number | null]>>;
};

const infraKeys = new Set(Object.keys(tldsConfig.infras));
const tldStrings = new Set(tldsConfig.tlds.map((t) => t.tld));
const kebabLower = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('tlds.json', () => {
  it('every tlds[].infra references a defined infra', () => {
    for (const entry of tldsConfig.tlds) {
      expect(infraKeys.has(entry.infra)).toBe(true);
    }
  });

  it('infras have https rdapBase and high/low trust', () => {
    for (const infra of Object.values(tldsConfig.infras)) {
      expect(infra.rdapBase.startsWith('https://')).toBe(true);
      expect(['high', 'low']).toContain(infra.trust);
    }
  });

  it('tld strings are unique, lowercase, and have no leading dot', () => {
    const seen = new Set<string>();
    for (const entry of tldsConfig.tlds) {
      expect(seen.has(entry.tld)).toBe(false);
      seen.add(entry.tld);
      expect(entry.tld).toBe(entry.tld.toLowerCase());
      expect(entry.tld.startsWith('.')).toBe(false);
    }
  });

  it('hackTlds are a subset of curated tlds', () => {
    for (const hack of tldsConfig.hackTlds) {
      expect(tldStrings.has(hack)).toBe(true);
    }
  });

  it('premiumHeavyTlds entries are valid lowercase TLD strings', () => {
    // May include IANA-bootstrap-discovered TLDs (e.g. shop, click) not in the
    // curated tlds array, so we validate string shape, not subset membership.
    for (const tld of tldsConfig.premiumHeavyTlds ?? []) {
      expect(tld).toBe(tld.toLowerCase());
      expect(tld.startsWith('.')).toBe(false);
      expect(tld.length).toBeGreaterThan(0);
    }
  });
});

describe('registrars.json', () => {
  it('ids are unique and kebab-lowercase', () => {
    const seen = new Set<string>();
    for (const r of registrars) {
      expect(seen.has(r.id)).toBe(false);
      seen.add(r.id);
      expect(kebabLower.test(r.id)).toBe(true);
    }
  });

  it('every registrar has non-empty name, https searchUrl, and valid affiliate', () => {
    for (const r of registrars) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.searchUrl.startsWith('https://')).toBe(true);
      if (r.affiliate) {
        expect(r.affiliate.program.length).toBeGreaterThan(0);
        expect(typeof r.affiliate.viable).toBe('boolean');
        if (r.affiliate.param !== undefined) {
          expect(typeof r.affiliate.param).toBe('string');
        }
        if (r.affiliate.tag !== undefined) {
          expect(typeof r.affiliate.tag).toBe('string');
        }
      }
    }
  });
});

describe('wholesale.json', () => {
  it('floor values are positive integers', () => {
    for (const cents of Object.values(wholesale.floors)) {
      expect(Number.isInteger(cents)).toBe(true);
      expect(cents).toBeGreaterThan(0);
    }
  });

  it('scheduled entries have a parseable from date and positive integer cents', () => {
    const scheduled = wholesale.scheduled;
    if (scheduled) {
      for (const entries of Object.values(scheduled)) {
        for (const entry of entries) {
          expect(Number.isNaN(Date.parse(entry.from))).toBe(false);
          expect(Number.isInteger(entry.cents)).toBe(true);
          expect(entry.cents).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('pricing.snapshot.json', () => {
  it('every registrar tuple is a 3-element array of number-or-null', () => {
    for (const registrarMap of Object.values(pricingSnapshot.tlds)) {
      for (const tuple of Object.values(registrarMap)) {
        expect(Array.isArray(tuple)).toBe(true);
        expect(tuple).toHaveLength(3);
        for (const v of tuple) {
          expect(v === null || typeof v === 'number').toBe(true);
        }
      }
    }
  });

  it('coupons are well-formed arrays', () => {
    for (const coupons of Object.values(pricingSnapshot.coupons)) {
      expect(Array.isArray(coupons)).toBe(true);
      for (const c of coupons) {
        expect(typeof c.code).toBe('string');
        expect(typeof c.firstYearOnly).toBe('boolean');
        expect(['amount', 'percentage']).toContain(c.type);
        expect(typeof c.amount).toBe('number');
      }
    }
  });
});


describe('Sprinthost snapshot provenance', () => {
  it('contains dated annual prices and original rubles for the verified 88 annual prices', () => {
    const original = pricingSnapshot.sourceRub?.sprinthost;
    expect(original && Object.keys(original)).toHaveLength(88);
    expect(original?.ru).toEqual([17900, 33900]);
    expect(original?.['рф']).toEqual([17900, 33900]);
    expect(original?.com).toEqual([154800, 154800]);
    expect(original?.xyz).toEqual([150000, 170000]);
    expect(original?.['com.ru']).toEqual([34800, 34800]);
    expect(pricingSnapshot.sprinthostUpdatedAt).toMatch(/^2026-11-01T/);
    for (const [tld, native] of Object.entries(original ?? {})) {
      const entry = pricingSnapshot.tlds[tld]?.sprinthost;
      expect(entry).toBeDefined();
      expect(entry?.[0]).toBe(Math.round(native[0]! / 80.572954));
      expect(entry?.[1]).toBe(Math.round(native[1]! / 80.572954));
      expect(entry?.[2]).toBeNull();
    }
  });
});


describe('WebHOST1 snapshot provenance', () => {
  it('keeps the two dated annual public observations and original RUB', () => {
    const original = pricingSnapshot.sourceRub?.webhost1;
    expect(Object.keys(original ?? {})).toHaveLength(226);
    expect(original?.com).toBeUndefined();
    expect(original?.xyz).toEqual([240975, null]);
    expect(pricingSnapshot.webhost1RenewalUpdatedAt).toMatch(/^2026-11-01T/);
    expect(pricingSnapshot.webhost1UpdatedAt).toMatch(/^2026-11-01T/);
    for (const tld of ['ru', 'рф']) {
      expect(original?.[tld]).toEqual([18900, 39900]);
      expect(pricingSnapshot.tlds[tld]?.webhost1).toEqual([235, 495, null]);
    }
  });
});


describe('AdminVPS snapshot provenance', () => {
  it('contains dated annual prices with original rubles and seller promotion markers', () => {
    const original = pricingSnapshot.sourceRub?.adminvps;
    expect(Object.keys(original ?? {})).toHaveLength(739);
    expect(pricingSnapshot.adminvpsUpdatedAt).toMatch(/^2026-11-01T/);
    expect(pricingSnapshot.sourcePromotions?.adminvps).toHaveLength(31);
    expect(pricingSnapshot.sourcePromotions?.adminvps).toContain('ru');
    expect(original?.ru).toEqual([20300, 143900]);
    expect(pricingSnapshot.tlds.ru?.adminvps).toEqual([252, 1786, null]);
    for (const [tld, native] of Object.entries(original ?? {})) {
      const entry = pricingSnapshot.tlds[tld]?.adminvps;
      expect(entry).toEqual([Math.round(native[0]! / 80.572954), Math.round(native[1]! / 80.572954), null]);
    }
  });
});
