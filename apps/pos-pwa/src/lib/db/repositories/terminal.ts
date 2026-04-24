import type { TerminalConfig } from '../../pos/types';
import { createTerminalKeypair, pairingCodeFromPubkey } from '../../security/keys';
import { getDb } from '../schema';

const terminalKey = 'active';

export async function getTerminalConfig(): Promise<TerminalConfig | undefined> {
  const value = await (await getDb()).get('terminal_config', terminalKey);
  return typeof value === 'number' ? undefined : value;
}

export async function saveTerminalConfig(config: TerminalConfig): Promise<void> {
  await (await getDb()).put('terminal_config', config, terminalKey);
}

export async function reserveAddressIndex(): Promise<number> {
  const db = await getDb();
  const key = 'next_address_index';
  const current = Number((await db.get('terminal_config', key)) ?? 0);
  await db.put('terminal_config', current + 1, key);
  return current;
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
    authorization: {
      liquid_backends: [{ type: 'esplora', url: 'https://liquid.bullbitcoin.com/api' }]
    },
    maxInvoiceSat: 100000,
    syncServers: ['wss://no.str.cr', 'wss://relay.primal.net', 'wss://nos.lol']
  };
}
