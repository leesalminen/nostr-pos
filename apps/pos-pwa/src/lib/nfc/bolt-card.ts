import { requestLnurlWithdraw } from './lnurl';

export type NdefLikeRecord = {
  recordType?: string;
  data?: DataView | ArrayBuffer | Uint8Array;
};

export type NdefLikeMessage = {
  records: NdefLikeRecord[];
};

export function webNfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

export function extractUrlFromNdefMessage(message: NdefLikeMessage): string | undefined {
  const decoder = new TextDecoder();
  for (const record of message.records) {
    if (record.recordType && !['url', 'text', 'mime'].includes(record.recordType)) continue;
    if (!record.data) continue;
    const bytes =
      record.data instanceof DataView
        ? new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength)
        : record.data instanceof ArrayBuffer
          ? new Uint8Array(record.data)
          : record.data;
    const text = decoder.decode(bytes).replace(/^\u0000+/, '').trim();
    const url = text.match(/(lightning:)?https?:\/\/\S+/i)?.[0];
    if (url) return url;
  }
  return undefined;
}

export async function payBoltCardFromMessage(message: NdefLikeMessage, invoice: string): Promise<void> {
  const url = extractUrlFromNdefMessage(message);
  if (!url) throw new Error('Card not recognized. Try again or use QR.');
  await requestLnurlWithdraw(url, invoice);
}
