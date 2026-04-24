import { writable } from 'svelte/store';
import type { TransactionRow } from '../pos/types';
import { recentTransactions } from '../db/repositories/ledger';

export const transactions = writable<TransactionRow[]>([]);

export async function refreshTransactions(): Promise<void> {
  transactions.set(await recentTransactions());
}
