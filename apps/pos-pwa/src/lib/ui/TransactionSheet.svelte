<script lang="ts">
  import { ReceiptText } from 'lucide-svelte';
  import type { TransactionRow } from '../pos/types';
  import { formatFiat, methodLabel } from '../util/formatting';
  import StatusPill from './StatusPill.svelte';

  let { rows }: { rows: TransactionRow[] } = $props();
</script>

<section>
  {#if rows.length === 0}
    <p class="rounded-md border border-[#d7c8b4] bg-[#fffaf0] py-12 text-center text-sm text-[#776b5a] dark:border-[#3a342a] dark:bg-[#211f1a] dark:text-[#b9aa91]">
      Completed sales will appear here.
    </p>
  {:else}
    <div class="space-y-2">
      {#each rows as row}
        <a
          class="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-[#eadfce] bg-[#fbf4e8] p-3 transition hover:bg-[#f3e7d6] dark:border-[#3a342a] dark:bg-[#26231d]"
          href={`#/receipt/${row.sale.id}`}
        >
          <ReceiptText size={21} />
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-black tabular-nums">{formatFiat(row.sale.amountFiat, row.sale.fiatCurrency)}</span>
              <StatusPill status={row.sale.status} />
            </div>
            <div class="mt-1 text-sm text-[#776b5a] dark:text-[#b9aa91]">
              {new Date(row.sale.createdAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
              · {methodLabel(row.attempt?.method)}
            </div>
          </div>
          <span class="text-sm font-bold text-[#1f513a] dark:text-[#8bc8a4]">Receipt</span>
        </a>
      {/each}
    </div>
  {/if}
</section>
