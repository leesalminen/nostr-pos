export type EsploraTx = {
  txid: string;
  status?: { confirmed?: boolean; block_height?: number; block_time?: number };
  vout: Array<{
    scriptpubkey_address?: string;
    value?: number;
    valuecommitment?: string;
    asset?: string;
    assetcommitment?: string;
  }>;
};

export type EsploraTransactionStatus = {
  txid: string;
  confirmed: boolean;
  blockHeight?: number;
};

export type PaymentVerification = {
  detected: boolean;
  confirmed: boolean;
  receivedSat: number;
  txid?: string;
};

export type PaymentVerificationOptions = {
  minCreatedAt?: number;
};

export type ConfidentialPaymentVerificationOptions = PaymentVerificationOptions & {
  apiBase: string;
  descriptor: string;
  addressIndex?: number;
  fetcher?: typeof fetch;
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

export async function fetchTransactionStatus(apiBase: string, txid: string, fetcher: typeof fetch = fetch): Promise<EsploraTransactionStatus> {
  const response = await fetcher(`${apiBase.replace(/\/$/, '')}/tx/${encodeURIComponent(txid)}`);
  if (!response.ok) throw new Error("Can't fetch the Liquid transaction right now.");
  const json = (await response.json()) as { txid?: string; status?: { confirmed?: boolean; block_height?: number } };
  return {
    txid: json.txid ?? txid,
    confirmed: Boolean(json.status?.confirmed),
    blockHeight: json.status?.block_height
  };
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

function isConfidentialAddress(address: string): boolean {
  return /^(lq1|tlq1)/i.test(address);
}

function txIsRecentEnough(tx: EsploraTx, minCreatedAt?: number): boolean {
  if (!minCreatedAt) return true;
  const blockTimeMs = tx.status?.block_time ? tx.status.block_time * 1000 : undefined;
  return blockTimeMs === undefined || blockTimeMs >= minCreatedAt;
}

function outputAddressMatches(outputAddress: { toString(): string; toUnconfidential(): { toString(): string } }, address: string, unconfidential: string): boolean {
  return outputAddress.toString() === address || outputAddress.toUnconfidential().toString() === unconfidential;
}

export function verifyAddressPayment(
  transactions: EsploraTx[],
  address: string,
  expectedSat: number,
  options: PaymentVerificationOptions = {}
): PaymentVerification {
  let receivedSat = 0;
  let confirmed = false;
  let txid: string | undefined;
  for (const tx of transactions) {
    if (!txIsRecentEnough(tx, options.minCreatedAt)) continue;
    const paid = tx.vout
      .filter((output) => output.scriptpubkey_address === address)
      .reduce((sum, output) => sum + (output.value ?? 0), 0);
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

export async function verifyConfidentialAddressPayment(
  transactions: EsploraTx[],
  address: string,
  expectedSat: number,
  options: ConfidentialPaymentVerificationOptions
): Promise<PaymentVerification> {
  if (!isConfidentialAddress(address)) {
    return verifyAddressPayment(transactions, address, expectedSat, options);
  }

  const { Address, Network, Transaction, Wollet, WolletDescriptor } = await import('lwk_wasm');
  const target = new Address(address);
  const targetUnconfidential = target.toUnconfidential().toString();
  const descriptor = new WolletDescriptor(options.descriptor);
  const network = target.isMainnet() ? Network.mainnet() : Network.testnet();
  const wallet = new Wollet(network, descriptor);
  const policyAsset = network.policyAsset().toString();

  if (options.addressIndex !== undefined) {
    const derived = wallet.address(options.addressIndex).address();
    if (derived.toString() !== address && derived.toUnconfidential().toString() !== targetUnconfidential) {
      return { detected: false, confirmed: false, receivedSat: 0 };
    }
  }

  let receivedSat = 0;
  let confirmed = false;
  let txid: string | undefined;
  const countedOutpoints = new Set<string>();
  for (const tx of transactions) {
    if (!txIsRecentEnough(tx, options.minCreatedAt)) continue;
    let walletTx;
    try {
      const txHex = await fetchTransactionHex(options.apiBase, tx.txid, options.fetcher ?? fetch);
      const transaction = Transaction.fromString(txHex);
      wallet.applyTransaction(transaction);
      walletTx = wallet.transactions().find((candidate) => candidate.txid().toString() === tx.txid);
    } catch {
      continue;
    }
    if (!walletTx) continue;
    for (const output of [...walletTx.outputs(), ...walletTx.inputs()]) {
      const walletOutput = output.get();
      if (!walletOutput) continue;
      if (options.addressIndex !== undefined && walletOutput.wildcardIndex() !== options.addressIndex) continue;
      const outputAddress = walletOutput.address();
      if (!outputAddressMatches(outputAddress, address, targetUnconfidential)) continue;
      const unblinded = walletOutput.unblinded();
      if (unblinded.asset().toString() !== policyAsset) continue;
      const outpoint = walletOutput.outpoint();
      const outpointKey = `${outpoint.txid().toString()}:${outpoint.vout()}`;
      if (countedOutpoints.has(outpointKey)) continue;
      countedOutpoints.add(outpointKey);
      receivedSat += Number(unblinded.value());
      txid ??= outpoint.txid().toString();
      confirmed ||= Boolean(tx.status?.confirmed) || walletOutput.height() !== undefined;
    }
  }

  return {
    detected: receivedSat >= expectedSat,
    confirmed: receivedSat >= expectedSat && confirmed,
    receivedSat,
    txid
  };
}
