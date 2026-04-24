import { Buffer } from 'buffer';
import type { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import { browserFetch, type Fetcher } from '../net/fetch';

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
  fetcher?: Fetcher;
};

const LIQUID_DEBUG_STORAGE_KEY = 'nostr-pos:debug:liquid';
const LIQUID_BLOCK_TIME_GRACE_MS = 10 * 60_000;

type LiquidDirectContext = {
  liquid: typeof import('liquidjs-lib');
  slip77: import('slip77').SLIP77API;
  zkp: Secp256k1ZKP;
};

type BufferGlobal = typeof globalThis & { Buffer?: typeof Buffer };

let liquidDirectContextPromise: Promise<LiquidDirectContext> | undefined;

function ensureBufferGlobal() {
  (globalThis as BufferGlobal).Buffer ??= Buffer;
}

export async function fetchAddressTransactions(apiBase: string, address: string, fetcher: Fetcher = browserFetch): Promise<EsploraTx[]> {
  const response = await fetcher(`${apiBase.replace(/\/$/, '')}/address/${address}/txs`);
  if (!response.ok) throw new Error("Can't verify Liquid payments right now.");
  return (await response.json()) as EsploraTx[];
}

export async function fetchTransactionHex(apiBase: string, txid: string, fetcher: Fetcher = browserFetch): Promise<string> {
  const response = await fetcher(`${apiBase.replace(/\/$/, '')}/tx/${encodeURIComponent(txid)}/hex`);
  if (!response.ok) throw new Error("Can't fetch the Liquid transaction right now.");
  const txHex = (await response.text()).trim();
  if (!/^[0-9a-fA-F]+$/.test(txHex)) throw new Error('Liquid backend returned invalid transaction hex.');
  return txHex;
}

export async function fetchTransactionStatus(apiBase: string, txid: string, fetcher: Fetcher = browserFetch): Promise<EsploraTransactionStatus> {
  const response = await fetcher(`${apiBase.replace(/\/$/, '')}/tx/${encodeURIComponent(txid)}`);
  if (!response.ok) throw new Error("Can't fetch the Liquid transaction right now.");
  const json = (await response.json()) as { txid?: string; status?: { confirmed?: boolean; block_height?: number } };
  return {
    txid: json.txid ?? txid,
    confirmed: Boolean(json.status?.confirmed),
    blockHeight: json.status?.block_height
  };
}

export async function broadcastLiquidTransaction(apiBase: string, txHex: string, fetcher: Fetcher = browserFetch): Promise<string> {
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

function zkpInitFunction(module: unknown): () => Promise<Secp256k1ZKP> {
  const first = (module as { default?: unknown }).default;
  const candidate = typeof first === 'function' ? first : (first as { default?: unknown } | undefined)?.default;
  if (typeof candidate !== 'function') throw new Error('Could not initialize Liquid verification engine.');
  return candidate as () => Promise<Secp256k1ZKP>;
}

async function liquidDirectContext(): Promise<LiquidDirectContext> {
  ensureBufferGlobal();
  liquidDirectContextPromise ??= (async () => {
    const [liquid, zkpModule, slip77Module] = await Promise.all([
      import('liquidjs-lib'),
      import('@vulpemventures/secp256k1-zkp'),
      import('slip77')
    ]);
    const zkp = await zkpInitFunction(zkpModule)();
    return {
      liquid,
      slip77: slip77Module.SLIP77Factory(zkp.ecc),
      zkp
    };
  })();
  return liquidDirectContextPromise;
}

function slip77MasterBlindingKey(descriptor: string): string | undefined {
  return descriptor.match(/slip77\(([0-9a-fA-F]{64})\)/)?.[1]?.toLowerCase();
}

function reversedHex(hex: string): string {
  return Buffer.from(hex, 'hex').reverse().toString('hex');
}

function assetMatchesPolicy(assetHex: string, policyAsset: string): boolean {
  const normalizedAsset = assetHex.toLowerCase();
  const normalizedPolicyAsset = policyAsset.toLowerCase();
  return normalizedAsset === normalizedPolicyAsset || reversedHex(normalizedAsset) === normalizedPolicyAsset;
}

async function unblindConfidentialOutput(input: {
  txHex: string;
  vout: number;
  masterBlindingKey: string;
  policyAsset: string;
}): Promise<number | undefined> {
  const { liquid, slip77, zkp } = await liquidDirectContext();
  const tx = liquid.Transaction.fromHex(input.txHex);
  const output = tx.outs[input.vout];
  if (!output) return undefined;
  const blindingPrivateKey = slip77.fromMasterBlindingKey(input.masterBlindingKey).derive(output.script).privateKey;
  if (!blindingPrivateKey) return undefined;
  const confidential = new liquid.confidential.Confidential(zkp as unknown as import('liquidjs-lib').Secp256k1Interface);
  const unblinded = confidential.unblindOutputWithKey(output, Buffer.from(blindingPrivateKey));
  const assetHex = Buffer.from(unblinded.asset).toString('hex');
  if (!assetMatchesPolicy(assetHex, input.policyAsset)) return undefined;
  const value = Number(unblinded.value);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
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

  const { Address, Network, Transaction, Wollet, WolletDescriptor } = await import('lwk_wasm');
  const target = new Address(address);
  const targetUnconfidential = target.toUnconfidential().toString();
  const descriptor = new WolletDescriptor(options.descriptor);
  const network = target.isMainnet() ? Network.mainnet() : Network.testnet();
  const wallet = new Wollet(network, descriptor);
  const policyAsset = network.policyAsset().toString();
  const masterBlindingKey = slip77MasterBlindingKey(options.descriptor);
  debugLiquidVerification('started confidential verification', {
    address,
    targetUnconfidential,
    expectedSat,
    addressIndex: options.addressIndex,
    candidateCount: transactions.length,
    canDirectUnblind: Boolean(masterBlindingKey)
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
  const txHexCache = new Map<string, string>();

  async function fetchTxHexCached(txidToFetch: string): Promise<string> {
    const cached = txHexCache.get(txidToFetch);
    if (cached) return cached;
    const txHex = await fetchTransactionHex(options.apiBase, txidToFetch, options.fetcher);
    txHexCache.set(txidToFetch, txHex);
    return txHex;
  }

  async function applyTx(txidToApply: string): Promise<boolean> {
    if (appliedTxids.has(txidToApply)) return true;
    try {
      const txHex = await fetchTxHexCached(txidToApply);
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

  async function countDirectUnblindedOutput(input: {
    txid: string;
    vout: number;
    fallbackConfirmed: boolean;
    source: 'candidate_vout' | 'candidate_prevout';
  }): Promise<boolean> {
    if (!masterBlindingKey) return false;
    const outpointKey = `${input.txid}:${input.vout}`;
    if (countedOutpoints.has(outpointKey)) return true;
    try {
      const txHex = await fetchTxHexCached(input.txid);
      const value = await unblindConfidentialOutput({
        txHex,
        vout: input.vout,
        masterBlindingKey,
        policyAsset
      });
      if (value === undefined) {
        debugLiquidVerification('direct unblind did not match target policy asset output', {
          outpoint: outpointKey,
          source: input.source
        });
        return false;
      }
      countedOutpoints.add(outpointKey);
      receivedSat += value;
      txid ??= input.txid;
      confirmed ||= input.fallbackConfirmed;
      debugLiquidVerification('counted direct unblinded output', {
        outpoint: outpointKey,
        source: input.source,
        value,
        receivedSat,
        confirmed
      });
      return true;
    } catch (err) {
      debugLiquidVerification('direct unblind failed', {
        outpoint: outpointKey,
        source: input.source,
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
    for (let index = 0; index < tx.vout.length; index += 1) {
      if (tx.vout[index]?.scriptpubkey_address !== targetUnconfidential) continue;
      await countDirectUnblindedOutput({
        txid: tx.txid,
        vout: index,
        fallbackConfirmed: Boolean(tx.status?.confirmed),
        source: 'candidate_vout'
      });
    }
    if (receivedSat >= expectedSat) break;
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

    for (const input of tx.vin ?? []) {
      const prevoutTxid = input.txid;
      if (!prevoutTxid || input.vout === undefined || input.prevout?.scriptpubkey_address !== targetUnconfidential) continue;
      const countedDirectly = await countDirectUnblindedOutput({
        txid: prevoutTxid,
        vout: input.vout,
        fallbackConfirmed: Boolean(tx.status?.confirmed),
        source: 'candidate_prevout'
      });
      if (countedDirectly) continue;
      if (!(await applyTx(prevoutTxid))) continue;
      const prevoutWalletTx = wallet.transactions().find((candidate) => candidate.txid().toString() === prevoutTxid);
      if (prevoutWalletTx) {
        countWalletTx(prevoutWalletTx, Boolean(tx.status?.confirmed));
      } else {
        debugLiquidVerification('prevout tx applied but not in wallet transactions', { txid: prevoutTxid });
      }
    }
    if (receivedSat >= expectedSat) break;

    if (!(await applyTx(tx.txid))) continue;
    const walletTx = wallet.transactions().find((candidate) => candidate.txid().toString() === tx.txid);
    if (!walletTx) {
      debugLiquidVerification('candidate tx applied but not in wallet transactions', { txid: tx.txid });
      continue;
    }
    countWalletTx(walletTx, Boolean(tx.status?.confirmed));
    if (receivedSat >= expectedSat) break;
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
