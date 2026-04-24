import { Buffer } from 'buffer';
import type { Secp256k1ZKP } from '@vulpemventures/secp256k1-zkp';
import type { ReverseSwapResponse } from './provider';
import { browserFetch, type Fetcher } from '../net/fetch';

export type BoltzLiquidClaimRequest = {
  apiBase: string;
  swap: ReverseSwapResponse;
  lockupTxHex: string;
  destinationAddress: string;
  feeSatPerVbyte?: number;
  fetcher?: Fetcher;
};

type ClaimSignatureResponse = {
  pubNonce: string;
  partialSignature: string;
};

type BufferGlobal = typeof globalThis & { Buffer?: typeof Buffer };

function ensureBufferGlobal() {
  (globalThis as BufferGlobal).Buffer ??= Buffer;
}

function bytesFromHex(hex: string, field: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) throw new Error(`Boltz swap missing ${field}.`);
  return Buffer.from(hex, 'hex');
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Boltz swap missing ${field}.`);
  return value;
}

function asClaimSignature(value: unknown): ClaimSignatureResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Boltz returned an invalid claim signature.');
  const candidate = value as Record<string, unknown>;
  return {
    pubNonce: requiredString(candidate.pubNonce, 'pubNonce'),
    partialSignature: requiredString(candidate.partialSignature, 'partialSignature')
  };
}

function zkpInitFunction(module: unknown): () => Promise<Secp256k1ZKP> {
  const first = (module as { default?: unknown }).default;
  const candidate = typeof first === 'function' ? first : (first as { default?: unknown } | undefined)?.default;
  if (typeof candidate !== 'function') throw new Error('Could not initialize Liquid signing engine.');
  return candidate as () => Promise<Secp256k1ZKP>;
}

async function requestClaimSignature(input: {
  apiBase: string;
  swapId: string;
  txHex: string;
  preimage: string;
  pubNonce: string;
  fetcher: Fetcher;
}): Promise<ClaimSignatureResponse> {
  const response = await input.fetcher(`${input.apiBase.replace(/\/+$/, '')}/v2/swap/reverse/${encodeURIComponent(input.swapId)}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      index: 0,
      transaction: input.txHex,
      preimage: input.preimage,
      pubNonce: input.pubNonce
    })
  });
  if (!response.ok) throw new Error("Boltz couldn't sign the Liquid claim.");
  return asClaimSignature(await response.json());
}

export async function buildBoltzLiquidReverseClaim(input: BoltzLiquidClaimRequest): Promise<string> {
  ensureBufferGlobal();
  const preimage = requiredString(input.swap.preimage, 'preimage');
  const claimPrivateKey = requiredString(input.swap.claimPrivateKey, 'claim private key');
  const response = input.swap.boltzResponse ?? {};
  const refundPublicKey = requiredString(response.refundPublicKey, 'refund public key');
  const blindingKey = requiredString(response.blindingKey, 'blinding key');
  if (!response.swapTree) throw new Error('Boltz swap missing swap tree.');

  const [{ ECPairFactory }, ecc, zkpFactory, boltz, boltzLiquid, liquid] = await Promise.all([
    import('ecpair'),
    import('tiny-secp256k1'),
    import('@vulpemventures/secp256k1-zkp'),
    import('boltz-core'),
    import('boltz-core/liquid'),
    import('liquidjs-lib')
  ]);

  const zkp = await zkpInitFunction(zkpFactory)();
  boltzLiquid.init(zkp);

  const boltzPublicKey = bytesFromHex(refundPublicKey, 'refund public key');
  const blindingPrivateKey = bytesFromHex(blindingKey, 'blinding key');
  const swapTree = boltz.SwapTreeSerializer.deserializeSwapTree(
    response.swapTree as Parameters<typeof boltz.SwapTreeSerializer.deserializeSwapTree>[0]
  );
  const network = liquid.address.getNetwork(input.destinationAddress);
  const claimKeys = ECPairFactory(ecc).fromPrivateKey(bytesFromHex(claimPrivateKey, 'claim private key'));

  const musig = boltzLiquid.TaprootUtils.tweakMusig(
    boltz.Musig.create(claimKeys.privateKey as Buffer, [boltzPublicKey, claimKeys.publicKey]),
    swapTree.tree
  );
  const lockupTx = liquid.Transaction.fromHex(input.lockupTxHex);
  const swapOutput = boltz.detectSwap(musig.aggPubkey, lockupTx);
  if (!swapOutput || swapOutput.type !== boltz.OutputType.Taproot) throw new Error('No Liquid Taproot swap output found in lockup transaction.');

  const claimTx = boltz.targetFee(input.feeSatPerVbyte ?? 0.1, (fee) =>
    boltzLiquid.constructClaimTransaction(
      [
        {
          ...swapOutput,
          transactionId: lockupTx.getId(),
          privateKey: claimKeys.privateKey as Buffer,
          preimage: bytesFromHex(preimage, 'preimage'),
          cooperative: true,
          type: boltz.OutputType.Taproot,
          blindingPrivateKey,
          swapTree
        }
      ],
      liquid.address.toOutputScript(input.destinationAddress, network),
      fee,
      true,
      network,
      liquid.address.isConfidential(input.destinationAddress) ? liquid.address.fromConfidential(input.destinationAddress).blindingKey : undefined
    )
  );

  const signing = musig
    .message(
      claimTx.hashForWitnessV1(
        0,
        [swapOutput.script],
        [{ value: swapOutput.value, asset: swapOutput.asset }],
        liquid.Transaction.SIGHASH_DEFAULT,
        network.genesisBlockHash
      )
    )
    .generateNonce();
  const boltzSignature = await requestClaimSignature({
    apiBase: input.apiBase,
    swapId: input.swap.id,
    txHex: claimTx.toHex(),
    preimage,
    pubNonce: Buffer.from(signing.publicNonce).toString('hex'),
    fetcher: input.fetcher ?? browserFetch
  });
  const signed = signing
    .aggregateNonces([[boltzPublicKey, bytesFromHex(boltzSignature.pubNonce, 'pubNonce')]])
    .initializeSession()
    .addPartial(boltzPublicKey, bytesFromHex(boltzSignature.partialSignature, 'partialSignature'))
    .signPartial();

  claimTx.setWitness(0, [Buffer.from(signed.aggregatePartials())]);
  return claimTx.toHex();
}
