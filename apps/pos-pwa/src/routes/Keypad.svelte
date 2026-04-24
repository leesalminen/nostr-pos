<script lang="ts">
  import { onMount } from 'svelte';
  import { History, Settings } from 'lucide-svelte';
  import AmountDisplay from '../lib/ui/AmountDisplay.svelte';
  import Button from '../lib/ui/Button.svelte';
  import Keypad from '../lib/ui/Keypad.svelte';
  import { terminal, loadTerminal } from '../lib/stores/terminal';
  import { refreshTransactions } from '../lib/stores/ledger';
  import { reconcileOpenPayments } from '../lib/pos/reconciler';

  let amount = $state('');
  let note = $state('');

  onMount(async () => {
    const config = await loadTerminal();
    if (!config.activatedAt) {
      location.hash = '#/activate';
      return;
    }
    await reconcileOpenPayments();
    await refreshTransactions();
  });

  function applyInput(value: string) {
    if (value === 'back') amount = amount.slice(0, -1);
    else amount = (amount + value).replace(/^0+(?=\d)/, '').slice(0, 9);
  }

  const canCharge = $derived(Number(amount) > 0);
  const displayAmount = $derived(amount || '0');
</script>

<main class="min-h-screen bg-[#f5f0e8] text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <div class="mx-auto grid min-h-screen max-w-4xl grid-rows-1">
    <section class="flex flex-col px-5 py-5 sm:px-8">
      <header class="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold leading-tight">{$terminal?.merchantName ?? 'Seguras Butcher'}</h1>
          <p class="mt-0.5 text-xs font-medium uppercase tracking-[0.12em] text-[#776b5a] dark:text-[#b9aa91]">{$terminal?.posName ?? 'Counter 1'}</p>
        </div>
        <div class="flex items-center gap-2">
          <a class="grid min-h-12 min-w-12 place-items-center rounded-md bg-[#eadfce] text-[#211f1a] dark:bg-[#2c2922] dark:text-[#fff6e8]" href="#/transactions" aria-label="Recent transactions">
            <History size={22} />
          </a>
          <a class="grid min-h-12 min-w-12 place-items-center rounded-md bg-[#eadfce] text-[#211f1a] dark:bg-[#2c2922] dark:text-[#fff6e8]" href="#/settings" aria-label="Settings">
            <Settings size={22} />
          </a>
        </div>
      </header>

      <div class="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6">
        <AmountDisplay amount={displayAmount} currency={$terminal?.currency ?? 'CRC'} />
        <Keypad onInput={applyInput} />
        <textarea
          class="min-h-12 rounded-lg border border-[#d7c8b4] bg-[#fffaf0] px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[#1f513a] dark:border-[#3a342a] dark:bg-[#211f1a]"
          bind:value={note}
          placeholder="Add note"
          rows="2"
        ></textarea>
        <Button disabled={!canCharge} href={`#/pos/${encodeURIComponent(`charge:${displayAmount}:${note}`)}`}>
          Charge
        </Button>
      </div>
    </section>
  </div>
</main>
