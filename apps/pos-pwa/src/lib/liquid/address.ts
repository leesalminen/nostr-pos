import type { TerminalConfig } from '../pos/types';

export type DerivedLiquidAddress = {
  address: string;
  addressIndex: number;
  terminalBranch: number;
};

export function deriveLiquidAddress(config: TerminalConfig, addressIndex: number): DerivedLiquidAddress {
  const branch = config.authorization && typeof config.authorization === 'object' && 'settlement' in config.authorization
    ? Number((config.authorization as { settlement?: { terminal_branch?: number } }).settlement?.terminal_branch ?? 17)
    : 17;
  const suffix = `${config.terminalPubkey.slice(0, 10)}${branch.toString(16)}${addressIndex.toString(16)}`.toLowerCase();
  return {
    address: `tex1q${suffix.padEnd(38, '0').slice(0, 38)}`,
    addressIndex,
    terminalBranch: branch
  };
}

export function liquidBip21(address: string, amountSat: number): string {
  return `liquid:${address}?amount=${(amountSat / 100_000_000).toFixed(8)}`;
}
