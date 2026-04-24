import { describe, expect, it } from 'vitest';
import { createTerminalTabLock } from './tab-lock';

type Listener = (event: MessageEvent) => void;

class FakeChannel {
  static channels = new Map<string, Set<FakeChannel>>();

  listeners = new Set<Listener>();

  constructor(readonly name: string) {
    const channels = FakeChannel.channels.get(name) ?? new Set<FakeChannel>();
    channels.add(this);
    FakeChannel.channels.set(name, channels);
  }

  postMessage(message: unknown) {
    for (const channel of FakeChannel.channels.get(this.name) ?? []) {
      if (channel === this) continue;
      for (const listener of channel.listeners) listener(new MessageEvent('message', { data: message }));
    }
  }

  addEventListener(_type: 'message', listener: Listener) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: Listener) {
    this.listeners.delete(listener);
  }

  close() {
    FakeChannel.channels.get(this.name)?.delete(this);
  }
}

describe('terminal tab lock', () => {
  it('lets the newest tab become writer and downgrades older tabs', () => {
    FakeChannel.channels.clear();
    const firstStates: boolean[] = [];
    const secondStates: boolean[] = [];
    const factory = (name: string) => new FakeChannel(name);

    const first = createTerminalTabLock('terminal1', (state) => firstStates.push(state.readonly), {
      channelFactory: factory,
      now: () => 100
    });
    const second = createTerminalTabLock('terminal1', (state) => secondStates.push(state.readonly), {
      channelFactory: factory,
      now: () => 200
    });

    expect(firstStates).toEqual([false, true]);
    expect(secondStates).toEqual([false]);

    first.close();
    second.close();
  });

  it('does not cross-lock different terminal keys', () => {
    FakeChannel.channels.clear();
    const firstStates: boolean[] = [];
    const secondStates: boolean[] = [];
    const factory = (name: string) => new FakeChannel(name);

    const first = createTerminalTabLock('terminal1', (state) => firstStates.push(state.readonly), {
      channelFactory: factory,
      now: () => 100
    });
    const second = createTerminalTabLock('terminal2', (state) => secondStates.push(state.readonly), {
      channelFactory: factory,
      now: () => 200
    });

    expect(firstStates).toEqual([false]);
    expect(secondStates).toEqual([false]);

    first.close();
    second.close();
  });
});
