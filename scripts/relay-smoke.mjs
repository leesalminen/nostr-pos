import process from 'node:process';
import WebSocket from 'ws';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';

useWebSocketImplementation(WebSocket);

const relays = (process.env.NOSTR_POS_RELAYS ?? 'wss://no.str.cr,wss://relay.primal.net,wss://nos.lol')
  .split(',')
  .map((relay) => relay.trim())
  .filter(Boolean);

const timeoutMs = Number(process.env.NOSTR_POS_RELAY_TIMEOUT_MS ?? 8000);
const secretKey = generateSecretKey();
const pubkey = getPublicKey(secretKey);
const now = Math.floor(Date.now() / 1000);
const pairingCode = `SMOK-${Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
const event = finalizeEvent(
  {
    kind: 30383,
    created_at: now,
    tags: [
      ['proto', 'nostr-pos', '0.2'],
      ['d', pairingCode],
      ['pairing', pairingCode],
      ['p', pubkey],
      ['expiration', String(now + 600)]
    ],
    content: JSON.stringify({
      probe: 'relay-smoke',
      pairing_code: pairingCode,
      terminal_pubkey: pubkey,
      created_at: now
    })
  },
  secretKey
);

if (!verifyEvent(event)) {
  console.error('Generated event failed local signature verification.');
  process.exit(1);
}

const pool = new SimplePool();
try {
  const publishSettled = await Promise.allSettled(
    pool.publish(relays, event, { maxWait: timeoutMs }).map(async (promise, index) => {
      const message = await promise;
      return {
        relay: relays[index],
        ok: !/^(connection failure|blocked|invalid|error|restricted|rate-limited|auth-required|pow:|duplicate)/i.test(message),
        message
      };
    })
  );
  const publishResults = publishSettled.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : { relay: relays[index], ok: false, message: String(result.reason) }
  );

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const seenEvents = await pool.querySync(relays, { ids: [event.id], limit: 1 }, { maxWait: timeoutMs });
  const seenOn = Array.from(pool.seenOn.get(event.id) ?? []).map((relay) => relay.url);
  const output = {
    event_id: event.id,
    pubkey,
    pairing_code: pairingCode,
    publish_results: publishResults,
    read_back_count: seenEvents.length,
    seen_on: seenOn
  };
  console.log(JSON.stringify(output, null, 2));

  const okCount = publishResults.filter((result) => result.ok).length;
  if (okCount === 0 || seenEvents.length === 0) {
    process.exit(1);
  }
} finally {
  pool.destroy();
}
