import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OutboxItem, PaymentAttempt, Receipt, Sale, SwapRecoveryRecord, TerminalConfig } from '../pos/types';

interface PosDb extends DBSchema {
  terminal_config: {
    key: string;
    value: TerminalConfig | number;
  };
  sales: {
    key: string;
    value: Sale;
    indexes: { 'by-updated': number };
  };
  payment_attempts: {
    key: string;
    value: PaymentAttempt;
    indexes: { 'by-sale': string; 'by-updated': number };
  };
  receipts: {
    key: string;
    value: Receipt;
    indexes: { 'by-sale': string };
  };
  swap_recovery_records: {
    key: string;
    value: SwapRecoveryRecord;
    indexes: { 'by-sale': string };
  };
  outbox: {
    key: string;
    value: OutboxItem;
  };
}

let dbPromise: Promise<IDBPDatabase<PosDb>> | undefined;

export function getDb() {
  dbPromise ??= openDB<PosDb>('nostr-pos', 1, {
    upgrade(db) {
      db.createObjectStore('terminal_config');

      const sales = db.createObjectStore('sales', { keyPath: 'id' });
      sales.createIndex('by-updated', 'updatedAt');

      const attempts = db.createObjectStore('payment_attempts', { keyPath: 'id' });
      attempts.createIndex('by-sale', 'saleId');
      attempts.createIndex('by-updated', 'updatedAt');

      const receipts = db.createObjectStore('receipts', { keyPath: 'id' });
      receipts.createIndex('by-sale', 'saleId');

      const recovery = db.createObjectStore('swap_recovery_records', { keyPath: 'swapId' });
      recovery.createIndex('by-sale', 'saleId');

      db.createObjectStore('outbox', { keyPath: 'id' });
    }
  });
  return dbPromise;
}
