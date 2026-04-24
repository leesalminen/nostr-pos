import type { TerminalConfig } from '../../pos/types';
import { getDb } from '../schema';

const terminalKey = 'active';

export async function getTerminalConfig(): Promise<TerminalConfig | undefined> {
  return (await getDb()).get('terminal_config', terminalKey);
}

export async function saveTerminalConfig(config: TerminalConfig): Promise<void> {
  await (await getDb()).put('terminal_config', config, terminalKey);
}

export function defaultTerminalConfig(): TerminalConfig {
  return {
    merchantName: 'Seguras Butcher',
    posName: 'Counter 1',
    currency: 'CRC',
    terminalId: crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
    pairingCode: '4F7G-YJDP',
    maxInvoiceSat: 100000,
    syncServers: ['wss://no.str.cr', 'wss://relay.primal.net', 'wss://nos.lol']
  };
}
