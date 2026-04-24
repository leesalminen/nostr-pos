import { payBoltCardFromMessage, type NdefLikeMessage } from './bolt-card';

type NdefScanEvent = Event & { message: NdefLikeMessage };

type NdefReaderLike = EventTarget & {
  scan: () => Promise<void>;
};

declare global {
  interface Window {
    NDEFReader?: new () => NdefReaderLike;
  }
}

export async function readFirstNdefMessage(reader: NdefReaderLike): Promise<NdefLikeMessage> {
  await reader.scan();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Card read timed out. Try again or use QR.')), 30_000);
    reader.addEventListener(
      'reading',
      (event) => {
        window.clearTimeout(timeout);
        resolve((event as NdefScanEvent).message);
      },
      { once: true }
    );
    reader.addEventListener(
      'readingerror',
      () => {
        window.clearTimeout(timeout);
        reject(new Error('Card not recognized. Try again or use QR.'));
      },
      { once: true }
    );
  });
}

export async function payWithWebNfc(invoice: string): Promise<'unsupported' | 'paid'> {
  if (!window.NDEFReader) return 'unsupported';
  const message = await readFirstNdefMessage(new window.NDEFReader());
  await payBoltCardFromMessage(message, invoice);
  return 'paid';
}
