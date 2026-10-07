/**
 * RDAP card parser (SPEC §7 addendum): extracts the slim RdapCard view from
 * an RFC 9083 domain body. Pure and total — never throws; malformed or
 * missing fields degrade to null/[]. The raw body is never retained.
 */
import type { RdapCard } from '../types';

const MAX_STATUSES = 16;
const MAX_NAMESERVERS = 16;
const MS_PER_DAY = 86_400_000;

function eventDate(events: unknown, action: string): number | null {
  if (!Array.isArray(events)) return null;
  for (const e of events) {
    if (e == null || typeof e !== 'object') continue;
    const rec = e as { eventAction?: unknown; eventDate?: unknown };
    if (typeof rec.eventAction !== 'string') continue;
    if (rec.eventAction.trim().toLowerCase() !== action) continue;
    if (typeof rec.eventDate !== 'string') return null;
    const ms = Date.parse(rec.eventDate);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

// jcard (RFC 7095): vcardArray = [name, props]; each prop is a [name, params, type, value] tuple.
function vcardFn(entity: unknown): string | null {
  if (entity == null || typeof entity !== 'object') return null;
  const arr = (entity as { vcardArray?: unknown }).vcardArray;
  if (!Array.isArray(arr) || arr.length < 2 || !Array.isArray(arr[1])) return null;
  for (const prop of arr[1]) {
    if (!Array.isArray(prop) || prop.length < 4) continue;
    if (prop[0] === 'fn' && typeof prop[3] === 'string' && prop[3].trim() !== '') {
      return prop[3].trim();
    }
  }
  return null;
}

function registrarName(entities: unknown): string | null {
  if (!Array.isArray(entities)) return null;
  for (const ent of entities) {
    if (ent == null || typeof ent !== 'object') continue;
    const roles = (ent as { roles?: unknown }).roles;
    if (!Array.isArray(roles) || !roles.includes('registrar')) continue;
    const fn = vcardFn(ent);
    if (fn != null) return fn;
  }
  return null;
}

function stringList(value: unknown, cap: number): string[] {
  const out: string[] = [];
  if (!Array.isArray(value)) return out;
  for (const s of value) {
    if (typeof s !== 'string') continue;
    const t = s.trim();
    if (t === '' || out.includes(t)) continue;
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

function nameserverList(value: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(value)) return out;
  for (const ns of value) {
    if (ns == null || typeof ns !== 'object') continue;
    const ldh = (ns as { ldhName?: unknown }).ldhName;
    if (typeof ldh !== 'string' || ldh.trim() === '') continue;
    const clean = ldh.trim().toLowerCase().replace(/\.$/, '');
    if (clean === '' || out.includes(clean)) continue;
    out.push(clean);
    if (out.length >= MAX_NAMESERVERS) break;
  }
  return out;
}

/**
 * Parse the slim card from a registry RDAP body. Returns null when the body
 * is not an object or carries none of the card fields (nothing worth storing).
 * `now` is injectable for deterministic ageDays in tests.
 */
export function parseRdapCard(body: unknown, now: number = Date.now()): RdapCard | null {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return null;
  const rec = body as Record<string, unknown>;

  const registeredAt = eventDate(rec.events, 'registration');
  const expiresAt = eventDate(rec.events, 'expiration');
  const changedAt = eventDate(rec.events, 'last changed');
  const statuses = stringList(rec.status, MAX_STATUSES);
  const nameservers = nameserverList(rec.nameservers);
  const registrar = registrarName(rec.entities);

  if (
    registeredAt == null &&
    expiresAt == null &&
    changedAt == null &&
    registrar == null &&
    statuses.length === 0 &&
    nameservers.length === 0
  ) {
    return null;
  }

  return {
    registeredAt,
    expiresAt,
    changedAt,
    ageDays:
      registeredAt != null ? Math.max(0, Math.floor((now - registeredAt) / MS_PER_DAY)) : null,
    registrar,
    statuses,
    nameservers,
  };
}
