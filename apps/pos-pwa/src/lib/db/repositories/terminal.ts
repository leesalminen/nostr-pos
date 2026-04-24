import type { TerminalConfig } from '../../pos/types';
import { createTerminalKeypair, pairingCodeFromPubkey } from '../../security/keys';
import { getDb } from '../schema';

const terminalKey = 'active';

export async function getTerminalConfig(): Promise<TerminalConfig | undefined> {
  return (await getDb()).get('terminal_config', terminalKey);
}

export async function saveTerminalConfig(config: TerminalConfig): Promise<void> {
  await (await getDb()).put('terminal_config', config, terminalKey);
}

export function defaultTerminalConfig(): TerminalConfig {
  const keys = createTerminalKeypair();
  return {
    merchantName: 'Seguras Butcher',
    posName: 'Counter 1',
    currency: 'CRC',
    terminalId: keys.publicKey.slice(-8).toUpperCase(),
    terminalPubkey: keys.publicKey,
    terminalPrivkeyEnc: keys.privateKey,
    pairingCode: pairingCodeFromPubkey(keys.publicKey),
    maxInvoiceSat: 100000,
    syncServers: ['wss://no.str.cr', 'wss://relay.primal.net', 'wss://nos.lol']
  };
}
