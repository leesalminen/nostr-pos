import { requestLnurlWithdraw } from './lnurl';

export type NdefLikeRecord = {
  recordType?: string;
  data?: DataView | ArrayBuffer | Uint8Array;
};

export type NdefLikeMessage = {
  records: NdefLikeRecord[];
};

const ndefUriPrefixes = [
  '',
  'http://www.',
  'https://www.',
  'http://',
  'https://',
  'tel:',
  'mailto:',
  'ftp://anonymous:anonymous@',
  'ftp://ftp.',
  'ftps://',
  'sftp://',
  'smb://',
  'nfs://',
  'ftp://',
  'dav://',
  'news:',
  'telnet://',
  'imap:',
  'rtsp://',
  'urn:',
  'pop:',
  'sip:',
  'sips:',
  'tftp:',
  'btspp://',
  'btl2cap://',
  'btgoep://',
  'tcpobex://',
  'irdaobex://',
  'file://',
  'urn:epc:id:',
  'urn:epc:tag:',
  'urn:epc:pat:',
  'urn:epc:raw:',
  'urn:epc:',
  'urn:nfc:'
];

export function webNfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

function recordText(record: NdefLikeRecord, bytes: Uint8Array): string {
  const decoder = new TextDecoder();
  if (record.recordType === 'url' && bytes.length > 0 && bytes[0] < ndefUriPrefixes.length) {
    return `${ndefUriPrefixes[bytes[0]]}${decoder.decode(bytes.slice(1))}`.trim();
  }
  return decoder.decode(bytes).replace(/^\u0000+/, '').trim();
}

export function extractUrlFromNdefMessage(message: NdefLikeMessage): string | undefined {
  for (const record of message.records) {
    if (record.recordType && !['url', 'text', 'mime'].includes(record.recordType)) continue;
    if (!record.data) continue;
    const bytes =
      record.data instanceof DataView
        ? new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength)
        : record.data instanceof ArrayBuffer
          ? new Uint8Array(record.data)
          : record.data;
    const text = recordText(record, bytes);
    const url = text.match(/(?:lightning:)?(?:https?:\/\/|lnurl)[^\s"'<>]+/i)?.[0];
    if (url) return url;
  }
  return undefined;
}

export async function payBoltCardFromMessage(message: NdefLikeMessage, invoice: string): Promise<void> {
  const url = extractUrlFromNdefMessage(message);
  if (!url) throw new Error('Card not recognized. Try again or use QR.');
  await requestLnurlWithdraw(url, invoice);
}
