import type { TerminalConfig } from '../pos/types';

export type DerivedLiquidAddress = {
  address: string;
  addressIndex: number;
  terminalBranch: number;
};

export function authorizationDescriptor(config: TerminalConfig): string | undefined {
  const descriptor =
    config.authorization?.settlement?.ct_descriptor ??
    config.authorization?.ct_descriptor;
  return typeof descriptor === 'string' && descriptor.trim() ? descriptor.trim() : undefined;
}

function terminalBranch(config: TerminalConfig): number {
  const branch = config.authorization && typeof config.authorization === 'object' && 'settlement' in config.authorization
    ? Number((config.authorization as { settlement?: { terminal_branch?: number } }).settlement?.terminal_branch ?? 17)
    : 17;
  return Number.isFinite(branch) ? branch : 17;
}

function fallbackAddress(config: TerminalConfig, addressIndex: number): DerivedLiquidAddress {
  const branch = terminalBranch(config);
  const suffix = `${config.terminalPubkey.slice(0, 10)}${branch.toString(16)}${addressIndex.toString(16)}`.toLowerCase();
  return {
    address: `tex1q${suffix.padEnd(38, '0').slice(0, 38)}`,
    addressIndex,
    terminalBranch: branch
  };
}

export async function deriveLiquidAddress(config: TerminalConfig, addressIndex: number): Promise<DerivedLiquidAddress> {
  const descriptorString = authorizationDescriptor(config);
  if (descriptorString) {
    try {
      const { Network, Wollet, WolletDescriptor } = await import('lwk_wasm');
      const descriptor = new WolletDescriptor(descriptorString);
      const network = descriptor.isMainnet() ? Network.mainnet() : Network.testnet();
      const wallet = new Wollet(network, descriptor);
      const result = wallet.address(addressIndex);
      return {
        address: result.address().toString(),
        addressIndex: result.index(),
        terminalBranch: terminalBranch(config)
      };
    } catch {
      if (import.meta.env.PROD) {
        throw new Error('Could not derive a Liquid address from the terminal descriptor.');
      }
    }
  }

  if (import.meta.env.PROD) {
    throw new Error('Liquid descriptor is required before taking payments.');
  }
  return fallbackAddress(config, addressIndex);
}

export function liquidBip21(address: string, amountSat: number): string {
  return `liquid:${address}?amount=${(amountSat / 100_000_000).toFixed(8)}`;
}
