<script lang="ts">
  import { ChevronUp, ReceiptText } from 'lucide-svelte';
  import type { TransactionRow } from '../pos/types';
  import { formatFiat, methodLabel } from '../util/formatting';
  import StatusPill from './StatusPill.svelte';

  let { rows }: { rows: TransactionRow[] } = $props();
</script>

<section class="rounded-t-xl border-t border-[#d7c8b4] bg-[#fffaf0] p-4 shadow-[0_-14px_30px_rgba(54,42,24,0.10)] dark:border-[#3a342a] dark:bg-[#211f1a]">
  <div class="mb-3 flex items-center justify-between">
    <div class="flex items-center gap-2 font-black">
      <ChevronUp size={18} />
      Recent Transactions
    </div>
    <a class="text-sm font-semibold text-[#1f513a] dark:text-[#8bc8a4]" href="#/settings">Settings</a>
  </div>

  {#if rows.length === 0}
    <p class="py-8 text-center text-sm text-[#776b5a] dark:text-[#b9aa91]">Completed sales will appear here.</p>
  {:else}
    <div class="max-h-[42vh] space-y-2 overflow-auto pr-1">
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
              {new Date(row.sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              · {methodLabel(row.attempt?.method)}
            </div>
          </div>
          <span class="text-sm font-bold text-[#1f513a] dark:text-[#8bc8a4]">Receipt</span>
        </a>
      {/each}
    </div>
  {/if}
</section>
