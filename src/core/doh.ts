/**
 * DNS-over-HTTPS corroboration for low-trust zones (SPEC §7).
 * NS-record probe: NXDOMAIN / NOERROR. DoH-only outcomes never yield bare 'available'.
 */
export type DohOutcome = 'nxdomain' | 'noerror' | 'error';

interface DohEndpoint {
  buildUrl(domain: string): string;
  accept?: string;
}

const ENDPOINTS: DohEndpoint[] = [
  {
    buildUrl: (d) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(d)}&type=NS`,
    accept: 'application/dns-json',
  },
  {
    buildUrl: (d) => `https://dns.google/resolve?name=${encodeURIComponent(d)}&type=NS`,
  },
];

interface DohResponse {
  Status?: number;
  Answer?: Array<{ name?: string; type?: number; data?: string }>;
}

export async function queryNs(
  domain: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<DohOutcome> {
  for (const endpoint of ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      const abort = (): void => ctrl.abort();
      signal?.addEventListener('abort', abort);
      if (signal?.aborted) ctrl.abort();
      const timer = setTimeout(abort, 8000);
      let resp: Response;
      try {
        const init: RequestInit = { signal: ctrl.signal, ...(endpoint.accept ? { headers: { Accept: endpoint.accept } } : {}) };
        resp = await fetchImpl(endpoint.buildUrl(domain), init);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
      if (!resp.ok) continue;
      const data = (await resp.json()) as DohResponse;
      if (data.Status === 3) return 'nxdomain';
      if (data.Status === 0) {
        const name = domain.toLowerCase().replace(/\.$/, '');
        if (Array.isArray(data.Answer) && data.Answer.some((rr) =>
          rr.type === 2 && typeof rr.name === 'string' && rr.name.toLowerCase().replace(/\.$/, '') === name && typeof rr.data === 'string' && rr.data.length > 0)) return 'noerror';
        continue;
      }
      if (data.Status === 2) continue; // SERVFAIL → try the next resolver
      return 'error';
    } catch {
      // network failure → try the next endpoint
    }
  }
  return 'error';
}
