import type { SwapStatus } from './provider';

export type BoltzSwapUpdate = {
  id: string;
  status: SwapStatus;
  txid?: string;
  transactionHex?: string;
};

export type SwapUpdateSubscription = {
  close(): void;
};

export type BoltzWebSocketProvider = {
  type?: string;
  api_base?: string;
  ws_url?: string;
};

type WebSocketLike = {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'message' | 'error', listener: (event: Event | MessageEvent) => void): void;
};

type WebSocketCtor = new (url: string) => WebSocketLike;

function normalizeStatus(status: unknown): SwapStatus | undefined {
  if (status === 'invoice.settled') return 'invoice.settled';
  if (status === 'transaction.mempool' || status === 'transaction.server.mempool') return 'transaction.mempool';
  if (status === 'transaction.confirmed' || status === 'transaction.server.confirmed') return 'transaction.confirmed';
  if (status === 'transaction.claimed') return 'transaction.claimed';
  if (status === 'swap.expired' || status === 'invoice.expired') return 'expired';
  if (status === 'swap.failed' || status === 'invoice.failed' || status === 'transaction.failed' || status === 'transaction.refunded') return 'failed';
  if (status === 'swap.created' || status === 'invoice.set') return 'created';
  return undefined;
}

function parseMessage(message: unknown): BoltzSwapUpdate[] {
  const decoded = typeof message === 'string' ? JSON.parse(message) : message;
  if (!decoded || typeof decoded !== 'object') return [];
  const envelope = decoded as { event?: unknown; channel?: unknown; args?: unknown };
  if (envelope.event !== 'update' || envelope.channel !== 'swap.update' || !Array.isArray(envelope.args)) return [];
  return envelope.args.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const update = raw as { id?: unknown; status?: unknown; transaction?: { id?: unknown; hex?: unknown } };
    const status = normalizeStatus(update.status);
    if (!status || typeof update.id !== 'string') return [];
    return [{
      id: update.id,
      status,
      txid: typeof update.transaction?.id === 'string' ? update.transaction.id : undefined,
      transactionHex: typeof update.transaction?.hex === 'string' ? update.transaction.hex : undefined
    }];
  });
}

export function normalizeBoltzWebSocketUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.pathname === '/' || url.pathname === '/ws') url.pathname = '/v2/ws';
  return url.toString();
}

export function boltzWebSocketUrl(provider?: BoltzWebSocketProvider): string | undefined {
  if (!provider || provider.type !== 'boltz') return undefined;
  if (provider.ws_url) return normalizeBoltzWebSocketUrl(provider.ws_url);
  if (provider.api_base) return normalizeBoltzWebSocketUrl(provider.api_base);
  return undefined;
}

export function subscribeBoltzSwapUpdates(input: {
  wsUrl: string;
  swapIds: string[];
  onUpdate: (update: BoltzSwapUpdate) => void | Promise<void>;
  WebSocketImpl?: WebSocketCtor;
}): SwapUpdateSubscription {
  const WebSocketImpl = input.WebSocketImpl ?? WebSocket;
  const socket = new WebSocketImpl(normalizeBoltzWebSocketUrl(input.wsUrl));
  const swapIds = Array.from(new Set(input.swapIds.filter(Boolean)));
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ op: 'subscribe', channel: 'swap.update', args: swapIds }));
  });
  socket.addEventListener('message', (event) => {
    try {
      for (const update of parseMessage((event as MessageEvent).data)) {
        void input.onUpdate(update);
      }
    } catch {
      // Ignore malformed provider messages; polling remains the fallback.
    }
  });
  return {
    close() {
      socket.close();
    }
  };
}
