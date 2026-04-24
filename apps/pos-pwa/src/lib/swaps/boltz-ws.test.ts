import { describe, expect, it, vi } from 'vitest';
import { boltzWebSocketUrl, normalizeBoltzWebSocketUrl, subscribeBoltzSwapUpdates } from './boltz-ws';

class FakeSocket {
  static instances: FakeSocket[] = [];

  sent: string[] = [];
  listeners = new Map<string, ((event: Event | MessageEvent) => void)[]>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: 'open' | 'message' | 'error', listener: (event: Event | MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  emit(type: 'open' | 'message', event: Event | MessageEvent = new Event(type)): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe('Boltz websocket updates', () => {
  it('normalizes legacy and API-base websocket URLs to Boltz v2', () => {
    expect(normalizeBoltzWebSocketUrl('wss://api.boltz.exchange/ws')).toBe('wss://api.boltz.exchange/v2/ws');
    expect(normalizeBoltzWebSocketUrl('https://api.boltz.exchange')).toBe('wss://api.boltz.exchange/v2/ws');
    expect(boltzWebSocketUrl({ type: 'boltz', api_base: 'https://api.boltz.exchange' })).toBe('wss://api.boltz.exchange/v2/ws');
    expect(boltzWebSocketUrl({ type: 'boltz', ws_url: 'wss://api.boltz.exchange/ws' })).toBe('wss://api.boltz.exchange/v2/ws');
  });

  it('subscribes to swap.update and normalizes provider updates', () => {
    FakeSocket.instances.length = 0;
    const onUpdate = vi.fn();
    subscribeBoltzSwapUpdates({
      wsUrl: 'wss://api.boltz.exchange/v2/ws',
      swapIds: ['swap1', 'swap1'],
      onUpdate,
      WebSocketImpl: FakeSocket
    });
    const socket = FakeSocket.instances[0];
    expect(socket.url).toBe('wss://api.boltz.exchange/v2/ws');

    socket.emit('open');
    expect(JSON.parse(socket.sent[0])).toEqual({
      op: 'subscribe',
      channel: 'swap.update',
      args: ['swap1']
    });

    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          event: 'update',
          channel: 'swap.update',
          args: [{ id: 'swap1', status: 'transaction.mempool', transaction: { id: 'tx1', hex: '00' } }]
        })
      })
    );

    expect(onUpdate).toHaveBeenCalledWith({
      id: 'swap1',
      status: 'transaction.mempool',
      txid: 'tx1',
      transactionHex: '00'
    });
  });
});
