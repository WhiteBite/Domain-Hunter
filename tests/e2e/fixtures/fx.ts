export interface FxResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
}

/** er-api payload shape: {result, base_code, rates: {USD: 1, RUB, EUR, ...}}. */
export function erApiRates(rub = 80.5, eur = 0.86): FxResponse {
  return {
    result: 'success',
    base_code: 'USD',
    rates: { USD: 1, RUB: rub, EUR: eur, GBP: 0.74, JPY: 157.8 },
  };
}
