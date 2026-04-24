export type EsploraTx = {
  txid: string;
  status?: { confirmed?: boolean; block_height?: number; block_time?: number };
  vin?: Array<{
    txid?: string;
    vout?: number;
    prevout?: {
      scriptpubkey_address?: string;
      value?: number;
      valuecommitment?: string;
      asset?: string;
      assetcommitment?: string;
    };
  }>;
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

const LIQUID_DEBUG_STORAGE_KEY = 'nostr-pos:debug:liquid';
const LIQUID_BLOCK_TIME_GRACE_MS = 10 * 60_000;
const liquidScanInFlight = new Map<string, Promise<unknown>>();

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
  return blockTimeMs === undefined || blockTimeMs >= minCreatedAt - LIQUID_BLOCK_TIME_GRACE_MS;
}

function outputAddressMatches(outputAddress: { toString(): string; toUnconfidential(): { toString(): string } }, address: string, unconfidential: string): boolean {
  return outputAddress.toString() === address || outputAddress.toUnconfidential().toString() === unconfidential;
}

export function liquidVerificationDebugEnabled(): boolean {
  if (import.meta.env.MODE === 'test') return false;
  if (import.meta.env.DEV) return true;
  try {
    return globalThis.localStorage?.getItem(LIQUID_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function debugLiquidVerification(message: string, details: Record<string, unknown> = {}): void {
  if (liquidVerificationDebugEnabled()) {
    console.info('[nostr-pos] confidential liquid verification', message, details);
  }
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

  const { Address, EsploraClient, Network, Transaction, Wollet, WolletDescriptor } = await import('lwk_wasm');
  const target = new Address(address);
  const targetUnconfidential = target.toUnconfidential().toString();
  const descriptor = new WolletDescriptor(options.descriptor);
  const network = target.isMainnet() ? Network.mainnet() : Network.testnet();
  const wallet = new Wollet(network, descriptor);
  const policyAsset = network.policyAsset().toString();
  debugLiquidVerification('started confidential verification', {
    address,
    targetUnconfidential,
    expectedSat,
    addressIndex: options.addressIndex,
    candidateCount: transactions.length
  });

  if (options.addressIndex !== undefined) {
    const derived = wallet.address(options.addressIndex).address();
    if (derived.toString() !== address && derived.toUnconfidential().toString() !== targetUnconfidential) {
      debugLiquidVerification('stored address index does not derive target address', {
        addressIndex: options.addressIndex,
        derived: derived.toString(),
        derivedUnconfidential: derived.toUnconfidential().toString(),
        targetUnconfidential
      });
    }
  }

  let receivedSat = 0;
  let confirmed = false;
  let txid: string | undefined;
  const countedOutpoints = new Set<string>();
  const appliedTxids = new Set<string>();

  async function applyTx(txidToApply: string): Promise<boolean> {
    if (appliedTxids.has(txidToApply)) return true;
    try {
      const txHex = await fetchTransactionHex(options.apiBase, txidToApply, options.fetcher ?? fetch);
      wallet.applyTransaction(Transaction.fromString(txHex));
      appliedTxids.add(txidToApply);
      debugLiquidVerification('applied tx', { txid: txidToApply });
      return true;
    } catch (err) {
      debugLiquidVerification('could not apply tx', {
        txid: txidToApply,
        reason: err instanceof Error ? err.message : String(err)
      });
      return false;
    }
  }

  function countWalletTx(walletTx: ReturnType<typeof wallet.transactions>[number], fallbackConfirmed: boolean): void {
    const walletTxid = walletTx.txid().toString();
    let inspected = 0;
    for (const output of [...walletTx.outputs(), ...walletTx.inputs()]) {
      inspected += 1;
      const walletOutput = output.get();
      if (!walletOutput) {
        debugLiquidVerification('skipped empty wallet output', { walletTxid });
        continue;
      }
      const wildcardIndex = walletOutput.wildcardIndex();
      if (options.addressIndex !== undefined && wildcardIndex !== options.addressIndex) {
        debugLiquidVerification('wallet output index differs from stored attempt index', {
          walletTxid,
          wildcardIndex,
          expectedIndex: options.addressIndex
        });
      }
      const outputAddress = walletOutput.address();
      const outputAddressString = outputAddress.toString();
      const outputUnconfidential = outputAddress.toUnconfidential().toString();
      if (!outputAddressMatches(outputAddress, address, targetUnconfidential)) {
        debugLiquidVerification('skipped wallet output with different address', {
          walletTxid,
          outputAddress: outputAddressString,
          outputUnconfidential,
          targetUnconfidential
        });
        continue;
      }
      const unblinded = walletOutput.unblinded();
      const asset = unblinded.asset().toString();
      if (asset !== policyAsset) {
        debugLiquidVerification('skipped wallet output with different asset', {
          walletTxid,
          asset,
          policyAsset
        });
        continue;
      }
      const outpoint = walletOutput.outpoint();
      const outpointKey = `${outpoint.txid().toString()}:${outpoint.vout()}`;
      if (countedOutpoints.has(outpointKey)) continue;
      countedOutpoints.add(outpointKey);
      receivedSat += Number(unblinded.value());
      txid ??= outpoint.txid().toString();
      confirmed ||= fallbackConfirmed || walletOutput.height() !== undefined;
      debugLiquidVerification('counted wallet output', {
        outpoint: outpointKey,
        receivedSat,
        confirmed
      });
    }
    debugLiquidVerification('inspected wallet tx', { walletTxid, inspected, receivedSat });
  }

  function walletTxIsRecentEnough(walletTx: ReturnType<typeof wallet.transactions>[number]): boolean {
    if (!options.minCreatedAt) return true;
    const timestamp = walletTx.timestamp();
    return timestamp === undefined || timestamp * 1000 >= options.minCreatedAt - LIQUID_BLOCK_TIME_GRACE_MS;
  }

  for (const tx of transactions) {
    if (!txIsRecentEnough(tx, options.minCreatedAt)) {
      debugLiquidVerification('skipped old tx', { txid: tx.txid });
      continue;
    }
    debugLiquidVerification('checking candidate tx', {
      txid: tx.txid,
      confirmed: Boolean(tx.status?.confirmed),
      blockTime: tx.status?.block_time,
      vinCount: tx.vin?.length ?? 0,
      voutCount: tx.vout.length
    });
    const prevoutTxids = new Set(
      (tx.vin ?? [])
        .filter((input) => input.txid && input.prevout?.scriptpubkey_address === targetUnconfidential)
        .map((input) => input.txid as string)
    );
    debugLiquidVerification('matching prevout txids', {
      txid: tx.txid,
      targetUnconfidential,
      prevouts: (tx.vin ?? []).map((input) => ({
        txid: input.txid,
        vout: input.vout,
        address: input.prevout?.scriptpubkey_address,
        matches: input.prevout?.scriptpubkey_address === targetUnconfidential
      })),
      matching: Array.from(prevoutTxids)
    });

    for (const prevoutTxid of prevoutTxids) {
      if (!(await applyTx(prevoutTxid))) continue;
      const prevoutWalletTx = wallet.transactions().find((candidate) => candidate.txid().toString() === prevoutTxid);
      if (prevoutWalletTx) {
        countWalletTx(prevoutWalletTx, Boolean(tx.status?.confirmed));
      } else {
        debugLiquidVerification('prevout tx applied but not in wallet transactions', { txid: prevoutTxid });
      }
    }

    if (!(await applyTx(tx.txid))) continue;
    const walletTx = wallet.transactions().find((candidate) => candidate.txid().toString() === tx.txid);
    if (!walletTx) {
      debugLiquidVerification('candidate tx applied but not in wallet transactions', { txid: tx.txid });
      continue;
    }
    countWalletTx(walletTx, Boolean(tx.status?.confirmed));
  }

  if (receivedSat < expectedSat && options.addressIndex !== undefined) {
    try {
      const scanKey = `${options.apiBase.replace(/\/$/, '')}:${targetUnconfidential}:${options.addressIndex}`;
      let scan = liquidScanInFlight.get(scanKey);
      if (!scan) {
        debugLiquidVerification('running esplora scan fallback', {
          apiBase: options.apiBase,
          addressIndex: options.addressIndex
        });
        scan = (async () => {
          const client = new EsploraClient(network, options.apiBase.replace(/\/$/, ''), false, 4, false);
          return client.fullScanToIndex(wallet, options.addressIndex!);
        })().finally(() => {
          liquidScanInFlight.delete(scanKey);
        });
        liquidScanInFlight.set(scanKey, scan);
      } else {
        debugLiquidVerification('awaiting existing esplora scan fallback', {
          apiBase: options.apiBase,
          addressIndex: options.addressIndex
        });
      }
      const update = await scan;
      if (update) {
        wallet.applyUpdate(update as Parameters<typeof wallet.applyUpdate>[0]);
        debugLiquidVerification('applied esplora scan update', {
          addressIndex: options.addressIndex,
          walletTxCount: wallet.transactions().length
        });
      } else {
        debugLiquidVerification('esplora scan fallback returned no update', {
          addressIndex: options.addressIndex
        });
      }
      debugLiquidVerification('counting wallet txs after scan fallback', {
        apiBase: options.apiBase,
        addressIndex: options.addressIndex,
        walletTxCount: wallet.transactions().length
      });
      for (const walletTx of wallet.transactions()) {
        if (!walletTxIsRecentEnough(walletTx)) {
          debugLiquidVerification('skipped old wallet tx from scan', {
            txid: walletTx.txid().toString(),
            timestamp: walletTx.timestamp()
          });
          continue;
        }
        countWalletTx(walletTx, walletTx.height() !== undefined);
      }
    } catch (err) {
      debugLiquidVerification('esplora scan fallback failed', {
        reason: err instanceof Error ? err.message : String(err)
      });
    }
  }

  debugLiquidVerification('finished', {
    detected: receivedSat >= expectedSat,
    expectedSat,
    receivedSat,
    txid
  });

  return {
    detected: receivedSat >= expectedSat,
    confirmed: receivedSat >= expectedSat && confirmed,
    receivedSat,
    txid
  };
}
