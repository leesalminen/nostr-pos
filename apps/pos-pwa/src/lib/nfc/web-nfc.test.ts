import { describe, expect, it, vi } from 'vitest';
import { readFirstNdefMessage } from './web-nfc';

class FakeReader extends EventTarget {
  async scan() {}
}

describe('Web NFC reader wrapper', () => {
  it('resolves the first NDEF message', async () => {
    const reader = new FakeReader();
    const message = { records: [{ recordType: 'url', data: new TextEncoder().encode('https://card.example') }] };
    const spy = vi.spyOn(reader, 'addEventListener');
    const promise = readFirstNdefMessage(reader as unknown as Parameters<typeof readFirstNdefMessage>[0]);
    await Promise.resolve();
    const readingHandler = spy.mock.calls.find((call) => call[0] === 'reading')?.[1] as EventListener;
    readingHandler({ message } as unknown as Event);

    await expect(promise).resolves.toBe(message);
  });
});
