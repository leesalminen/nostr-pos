<script lang="ts">
  import { ChevronRight } from 'lucide-svelte';
  import type { SaleStatus, TransactionRow } from '../pos/types';
  import { formatFiat, methodLabel, statusLabel } from '../util/formatting';

  let { rows }: { rows: TransactionRow[] } = $props();

  function borderTone(status: SaleStatus): string {
    if (status === 'receipt_ready' || status === 'settled') return 'border-l-[#1f513a]';
    if (status === 'failed' || status === 'needs_recovery' || status === 'cancelled') return 'border-l-[#a9362f]';
    if (status === 'expired') return 'border-l-[#b1a287]';
    return 'border-l-[#7aa0bd]';
  }

  function isTerminal(status: SaleStatus): boolean {
    return status === 'receipt_ready' || status === 'settled';
  }
</script>

<section>
  {#if rows.length === 0}
    <p class="rounded-lg border border-[#d7c8b4] bg-[#fffaf0] py-12 text-center text-sm text-[#776b5a] dark:border-[#3a342a] dark:bg-[#211f1a] dark:text-[#b9aa91]">
      Completed sales will appear here.
    </p>
  {:else}
    <div class="space-y-1.5">
      {#each rows as row}
        <a
          class={`grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border-l-4 bg-[#fbf4e8] px-4 py-3 transition hover:bg-[#f3e7d6] dark:bg-[#26231d] ${borderTone(row.sale.status)}`}
          href={`#/receipt/${row.sale.id}`}
        >
          <div class="min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="font-black tabular-nums">{formatFiat(row.sale.amountFiat, row.sale.fiatCurrency)}</span>
              {#if !isTerminal(row.sale.status)}
                <span class="text-xs font-semibold text-[#776b5a] dark:text-[#b9aa91]">{statusLabel(row.sale.status)}</span>
              {/if}
            </div>
            <div class="mt-0.5 text-xs text-[#776b5a] dark:text-[#b9aa91]">
              {new Date(row.sale.createdAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
              &middot; {methodLabel(row.attempt?.method)}
            </div>
          </div>
          <ChevronRight size={18} class="text-[#b1a287] dark:text-[#6d634f]" />
        </a>
      {/each}
    </div>
  {/if}
</section>
