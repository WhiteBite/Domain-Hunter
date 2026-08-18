/**
 * IANA RDAP bootstrap fixture for E2E mocks.
 *
 * Shape matches data.iana.org/rdap/dns.json as parsed by
 * src/core/bootstrap.ts: { version, publicationDate, services: [[tlds, urls], ...] }.
 * Each service entry is [string[], string[]] — TLDs sharing one RDAP base URL.
 * Base URLs are resolved from src/config/tlds.json (with {tld} placeholders
 * expanded to the actual TLD value where applicable).
 */

export interface IanaBootstrapJson {
  version: string;
  publicationDate: string;
  services: [string[], string[]][];
}

/**
 * IANA RDAP bootstrap covering every TLD used in domains.ts.
 * Base URLs are copied from src/config/tlds.json (resolved with actual TLD values):
 *   com → https://rdap.verisign.com/com/v1/domain/        (verisign, {tld} expanded)
 *   dev, app → https://pubapi.registry.google/rdap/domain/ (google, no placeholder)
 *   io → https://rdap.identitydigital.services/rdap/domain/ (identity-digital, no placeholder)
 *   xyz → https://rdap.centralnic.com/xyz/domain/         (centralnic, {tld} expanded)
 *   de → https://rdap.denic.de/domain/                    (denic, no placeholder)
 *   co → https://rdap.registry.co/co/domain/             (registry-co, no placeholder)
 *   uk → https://rdap.nominet.uk/uk/domain/              (nominet, no placeholder)
 */
export function ianaBootstrap(): IanaBootstrapJson {
  return {
    version: '1.0',
    publicationDate: '2026-08-18T00:00:00Z',
    services: [
      [['com'], ['https://rdap.verisign.com/com/v1/domain/']],
      [['dev', 'app'], ['https://pubapi.registry.google/rdap/domain/']],
      [['io'], ['https://rdap.identitydigital.services/rdap/domain/']],
      [['xyz'], ['https://rdap.centralnic.com/xyz/domain/']],
      [['de'], ['https://rdap.denic.de/domain/']],
      [['co'], ['https://rdap.registry.co/co/domain/']],
      [['uk'], ['https://rdap.nominet.uk/uk/domain/']],
    ],
  };
}
