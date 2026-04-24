export type EsploraTx = {
  txid: string;
  status?: { confirmed?: boolean; block_height?: number };
  vout: Array<{
    scriptpubkey_address?: string;
    value: number;
    asset?: string;
  }>;
};

export type PaymentVerification = {
  detected: boolean;
  confirmed: boolean;
  receivedSat: number;
  txid?: string;
};

export async function fetchAddressTransactions(apiBase: string, address: string, fetcher: typeof fetch = fetch): Promise<EsploraTx[]> {
  const response = await fetcher(`${apiBase.replace(/\/$/, '')}/address/${address}/txs`);
  if (!response.ok) throw new Error("Can't verify Liquid payments right now.");
  return (await response.json()) as EsploraTx[];
}

export async function fetchTransactionHex(apiBase: string, txid: string, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(`${apiBase.replace(/\/$/, '')}/tx/${encodeURIComponent(txid)}/hex`);
  if (!response.ok) throw new Error("Can't fetch the Liquid transaction right now.");
  const txHex = (await response.text()).trim();
  if (!/^[0-9a-fA-F]+$/.test(txHex)) throw new Error('Liquid backend returned invalid transaction hex.');
  return txHex;
}

export async function broadcastLiquidTransaction(apiBase: string, txHex: string, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(`${apiBase.replace(/\/$/, '')}/tx`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: txHex
  });
  if (!response.ok) throw new Error("Can't broadcast the Liquid claim right now.");
  const txid = (await response.text()).trim();
  if (!txid) throw new Error("Liquid backend did not return a transaction id.");
  return txid;
}

export function verifyAddressPayment(transactions: EsploraTx[], address: string, expectedSat: number): PaymentVerification {
  let receivedSat = 0;
  let confirmed = false;
  let txid: string | undefined;
  for (const tx of transactions) {
    const paid = tx.vout
      .filter((output) => output.scriptpubkey_address === address)
      .reduce((sum, output) => sum + output.value, 0);
    if (paid > 0) {
      receivedSat += paid;
      txid ??= tx.txid;
      confirmed ||= Boolean(tx.status?.confirmed);
    }
  }
  return {
    detected: receivedSat >= expectedSat,
    confirmed: receivedSat >= expectedSat && confirmed,
    receivedSat,
    txid
  };
}
