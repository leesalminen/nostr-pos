<script lang="ts">
  import { ChevronDown, ChevronUp, ReceiptText } from 'lucide-svelte';
  import type { TransactionRow } from '../pos/types';
  import { formatFiat, methodLabel } from '../util/formatting';
  import StatusPill from './StatusPill.svelte';

  let { rows }: { rows: TransactionRow[] } = $props();
  let open = $state(false);
</script>

<div class="no-print">
  <button
    type="button"
    class="fixed inset-x-4 bottom-4 z-30 mx-auto flex min-h-14 max-w-md items-center justify-between gap-3 rounded-md border border-[#d7c8b4] bg-[#fffaf0] px-4 font-black text-[#211f1a] shadow-[0_12px_38px_rgba(54,42,24,0.22)] transition active:translate-y-px dark:border-[#3a342a] dark:bg-[#211f1a] dark:text-[#fff6e8]"
    onclick={() => (open = true)}
  >
    <span class="flex items-center gap-2">
      <ChevronUp size={18} />
      Recent Transactions
    </span>
    <span class="rounded-full bg-[#eadfce] px-3 py-1 text-xs dark:bg-[#2c2922]">{rows.length}</span>
  </button>

  {#if open}
    <button
      type="button"
      aria-label="Close recent transactions"
      class="fixed inset-0 z-40 bg-black/35"
      onclick={() => (open = false)}
    ></button>

    <section class="fixed inset-x-0 bottom-0 z-50 max-h-[78vh] rounded-t-xl border-t border-[#d7c8b4] bg-[#fffaf0] p-4 shadow-[0_-18px_48px_rgba(54,42,24,0.24)] dark:border-[#3a342a] dark:bg-[#211f1a]">
      <div class="mx-auto max-w-2xl">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2 font-black">
            <ChevronDown size={18} />
            Recent Transactions
          </div>
          <div class="flex items-center gap-3">
            <a class="text-sm font-semibold text-[#1f513a] dark:text-[#8bc8a4]" href="#/settings">Settings</a>
            <button
              class="min-h-10 rounded-md px-3 text-sm font-bold hover:bg-[#eadfce] dark:hover:bg-[#2c2922]"
              type="button"
              onclick={() => (open = false)}
            >
              Close
            </button>
          </div>
        </div>

        {#if rows.length === 0}
          <p class="py-10 text-center text-sm text-[#776b5a] dark:text-[#b9aa91]">Completed sales will appear here.</p>
        {:else}
          <div class="max-h-[58vh] space-y-2 overflow-auto pr-1">
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
      </div>
    </section>
  {/if}
</div>
