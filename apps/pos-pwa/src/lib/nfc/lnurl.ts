export type LnurlWithdrawInfo = {
  callback: string;
  k1: string;
  minWithdrawable: number;
  maxWithdrawable: number;
  defaultDescription?: string;
};

export function normalizeLnurlPayload(payload: string): string {
  const trimmed = payload.trim();
  if (trimmed.toLowerCase().startsWith('lightning:')) return trimmed.slice('lightning:'.length);
  return trimmed;
}

export function isLikelyLnurlWithdrawInfo(value: unknown): value is LnurlWithdrawInfo {
  const data = value as Partial<LnurlWithdrawInfo>;
  return (
    typeof data.callback === 'string' &&
    typeof data.k1 === 'string' &&
    typeof data.minWithdrawable === 'number' &&
    typeof data.maxWithdrawable === 'number'
  );
}

export async function requestLnurlWithdraw(rawUrl: string, invoice: string, fetcher: typeof fetch = fetch): Promise<void> {
  const url = normalizeLnurlPayload(rawUrl);
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("This card isn't supported. Try another payment method.");
  }

  const infoResponse = await fetcher(url);
  if (!infoResponse.ok) throw new Error('Card service is offline. Try again or use QR.');
  const info = (await infoResponse.json()) as unknown;
  if (!isLikelyLnurlWithdrawInfo(info)) {
    throw new Error("This card isn't supported. Try another payment method.");
  }

  const invoiceMsat = invoiceAmountMsat(invoice);
  if (invoiceMsat !== undefined && (invoiceMsat < info.minWithdrawable || invoiceMsat > info.maxWithdrawable)) {
    throw new Error("This card can't pay this amount.");
  }

  const callback = new URL(info.callback);
  callback.searchParams.set('k1', info.k1);
  callback.searchParams.set('pr', invoice);
  const payResponse = await fetcher(callback.toString());
  if (!payResponse.ok) throw new Error('Card declined. Try another payment method.');
  const result = (await payResponse.json().catch(() => ({}))) as { status?: string; reason?: string };
  if (result.status?.toUpperCase() === 'ERROR') {
    throw new Error(result.reason || 'Card declined. Try another payment method.');
  }
}

export function invoiceAmountMsat(invoice: string): number | undefined {
  const match = invoice.toLowerCase().match(/^lnbc(\d+)([munp]?)/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 'm') return amount * 100_000_000;
  if (unit === 'u') return amount * 100_000;
  if (unit === 'n') return amount * 100;
  if (unit === 'p') return Math.floor(amount / 10);
  return amount * 100_000_000_000;
}
