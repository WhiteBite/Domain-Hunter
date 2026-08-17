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
}

export async function queryNs(
  domain: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DohOutcome> {
  for (const endpoint of ENDPOINTS) {
    try {
      const init: RequestInit = endpoint.accept
        ? { headers: { Accept: endpoint.accept } }
        : {};
      const resp = await fetchImpl(endpoint.buildUrl(domain), init);
      if (!resp.ok) continue;
      const data = (await resp.json()) as DohResponse;
      if (data.Status === 3) return 'nxdomain';
      if (data.Status === 0) return 'noerror';
      if (data.Status === 2) continue; // SERVFAIL → try the next resolver
      return 'error';
    } catch {
      // network failure → try the next endpoint
    }
  }
  return 'error';
}
