export type TerminalTabLockState = {
  readonly: boolean;
};

export type TerminalTabLock = {
  close(): void;
};

type LockMessage = {
  type: 'claim';
  instanceId: string;
  openedAt: number;
};

type ChannelLike = {
  postMessage(message: LockMessage): void;
  close(): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<LockMessage>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<LockMessage>) => void): void;
};

function instanceId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function shouldYieldTo(remote: LockMessage, local: LockMessage): boolean {
  return remote.openedAt > local.openedAt || (remote.openedAt === local.openedAt && remote.instanceId > local.instanceId);
}

export function createTerminalTabLock(
  terminalPubkey: string,
  onChange: (state: TerminalTabLockState) => void,
  options: { channelFactory?: (name: string) => ChannelLike; now?: () => number } = {}
): TerminalTabLock {
  const BroadcastChannelCtor = globalThis.BroadcastChannel;
  if (!options.channelFactory && !BroadcastChannelCtor) {
    onChange({ readonly: false });
    return { close() {} };
  }

  const channelName = `nostr-pos:${terminalPubkey}`;
  const channel = options.channelFactory ? options.channelFactory(channelName) : new BroadcastChannelCtor(channelName);
  const claim: LockMessage = {
    type: 'claim',
    instanceId: instanceId(),
    openedAt: options.now?.() ?? Date.now()
  };
  let readonly = false;

  function setReadonly(next: boolean) {
    if (readonly === next) return;
    readonly = next;
    onChange({ readonly });
  }

  function onMessage(event: MessageEvent<LockMessage>) {
    const message = event.data;
    if (!message || message.type !== 'claim' || message.instanceId === claim.instanceId) return;
    if (shouldYieldTo(message, claim)) setReadonly(true);
  }

  channel.addEventListener('message', onMessage);
  channel.postMessage(claim);
  onChange({ readonly });

  return {
    close() {
      channel.removeEventListener('message', onMessage);
      channel.close();
    }
  };
}
