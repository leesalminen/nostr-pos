export type FxRate = {
  fromCurrency: string;
  toCurrency: string;
  priceCurrency: string;
  indexPrice: number;
  precision: number;
  createdAt: string;
};

let cached: { rate: FxRate; fetchedAt: number } | undefined;

export function decodeIndexPrice(rate: Pick<FxRate, 'indexPrice' | 'precision'>): number {
  return rate.indexPrice / 10 ** rate.precision;
}

export function fiatToSats(fiatAmount: number, rate: Pick<FxRate, 'indexPrice' | 'precision'>): number {
  return Math.round((fiatAmount / decodeIndexPrice(rate)) * 100_000_000);
}

export async function getBullBitcoinRate(fromCurrency: string): Promise<FxRate> {
  if (cached && cached.rate.fromCurrency === fromCurrency && Date.now() - cached.fetchedAt < 60_000) {
    return cached.rate;
  }

  const response = await fetch('https://www.bullbitcoin.com/api/price', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: String(Date.now()),
      method: 'getUserRate',
      params: { element: { fromCurrency, toCurrency: 'BTC' } }
    })
  });

  if (!response.ok) {
    throw new Error('Could not get current exchange rate. Try again.');
  }

  const body = await response.json();
  const element = body?.result?.element;
  if (!element) {
    throw new Error('Could not get current exchange rate. Try again.');
  }

  const rate: FxRate = {
    fromCurrency: element.fromCurrency,
    toCurrency: element.toCurrency,
    priceCurrency: element.priceCurrency,
    indexPrice: element.indexPrice,
    precision: element.precision,
    createdAt: element.createdAt
  };
  cached = { rate, fetchedAt: Date.now() };
  return rate;
}
