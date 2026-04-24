<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Settings } from 'lucide-svelte';
  import BullFooter from '../lib/ui/BullFooter.svelte';
  import TransactionSheet from '../lib/ui/TransactionSheet.svelte';
  import { loadTerminal, terminal } from '../lib/stores/terminal';
  import { transactions, refreshTransactions } from '../lib/stores/ledger';
  import { reconcileOpenPayments } from '../lib/pos/reconciler';

  onMount(async () => {
    await loadTerminal();
    await reconcileOpenPayments();
    await refreshTransactions();
  });
</script>

<main class="min-h-screen bg-[#f5f0e8] px-5 py-5 text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <div class="mx-auto max-w-3xl">
    <header class="mb-8 flex items-center justify-between gap-4">
      <a class="inline-flex min-h-12 items-center gap-2 rounded-md px-2 text-sm font-semibold" href="#/">
        <ArrowLeft size={21} />
        Back
      </a>
      <a
        class="grid min-h-12 min-w-12 place-items-center rounded-md bg-[#eadfce] text-[#211f1a] dark:bg-[#2c2922] dark:text-[#fff6e8]"
        href="#/settings"
        aria-label="Settings"
      >
        <Settings size={22} />
      </a>
    </header>

    <div class="mb-5">
      <h1 class="font-display text-4xl uppercase tracking-display leading-none">Recent transactions</h1>
      <p class="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-[#776b5a] dark:text-[#b9aa91]">
        {$terminal?.posName ?? 'Counter 1'}
      </p>
    </div>

    <TransactionSheet rows={$transactions} />
    <BullFooter />
  </div>
</main>
