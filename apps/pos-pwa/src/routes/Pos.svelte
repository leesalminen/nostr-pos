<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-svelte';
  import Button from '../lib/ui/Button.svelte';
  import QrCard from '../lib/ui/QrCard.svelte';
  import TransactionSheet from '../lib/ui/TransactionSheet.svelte';
  import { terminal, loadTerminal } from '../lib/stores/terminal';
  import { transactions, refreshTransactions } from '../lib/stores/ledger';
  import { createSale, markReady, simulateSettlement } from '../lib/pos/payment-state';
  import type { PaymentAttempt, PaymentMethod, Sale } from '../lib/pos/types';
  import { formatFiat, methodLabel, statusLabel } from '../lib/util/formatting';

  let { params = {} }: { params?: { link?: string } } = $props();

  let sale = $state<Sale | undefined>();
  let attempt = $state<PaymentAttempt | undefined>();
  let error = $state('');
  let settling = $state(false);

  const decoded = $derived(decodeURIComponent(params.link ?? 'liquid:0:'));
  const parts = $derived(decoded.split(':'));
  const rawMethod = $derived(parts[0]);
  const rawAmount = $derived(parts[1]);
  const rawNote = $derived(parts[2]);
  const method = $derived<PaymentMethod>(rawMethod === 'card' ? 'bolt_card' : rawMethod === 'lightning' ? 'lightning_swap' : 'liquid');
  const amount = $derived(String(Number(rawAmount || '0') / 100));

  onMount(async () => {
    try {
      const config = await loadTerminal();
      await refreshTransactions();
      const created = await createSale(config, amount, method, rawNote || undefined);
      sale = created.sale;
      attempt = created.attempt;
      await markReady(created.sale, created.attempt);
      sale = { ...created.sale, status: 'payment_ready' };
      attempt = { ...created.attempt, status: 'waiting' };
      await refreshTransactions();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not prepare payment. Try again.';
    }
  });

  async function settle() {
    if (!sale || !attempt) return;
    settling = true;
    const receipt = await simulateSettlement(sale, attempt);
    sale = { ...sale, status: 'receipt_ready', updatedAt: Date.now() };
    attempt = { ...attempt, status: 'settled', updatedAt: Date.now() };
    await refreshTransactions();
    settling = false;
    location.hash = `#/receipt/${receipt.saleId}`;
  }
</script>

<main class="min-h-screen bg-[#f5f0e8] text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <div class="mx-auto grid min-h-screen max-w-6xl grid-rows-[1fr_auto] lg:grid-cols-[minmax(0,1fr)_390px] lg:grid-rows-1">
    <section class="px-5 py-5 sm:px-8">
      <header class="mb-8 flex items-center justify-between">
        <a class="inline-flex min-h-12 items-center gap-2 rounded-md px-2 font-bold" href="#/">
          <ArrowLeft size={21} />
          New sale
        </a>
        <div class="text-right">
          <p class="font-black">{$terminal?.merchantName ?? 'Seguras Butcher'}</p>
          <p class="text-sm text-[#776b5a] dark:text-[#b9aa91]">{methodLabel(method)}</p>
        </div>
      </header>

      {#if error}
        <div class="mx-auto max-w-lg rounded-md bg-[#ffe0d9] p-5 text-[#8c2d28]">
          <h1 class="text-xl font-black">Could not prepare payment.</h1>
          <p class="mt-2">{error}</p>
          <div class="mt-4"><Button href="#/">Try Again</Button></div>
        </div>
      {:else if sale && attempt}
        <div class="mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
          <p class="text-6xl font-black tabular-nums">{formatFiat(sale.amountFiat, sale.fiatCurrency)}</p>
          <p class="rounded-full bg-[#e2edf5] px-4 py-2 text-sm font-bold text-[#1e4e73]">{statusLabel(sale.status)}</p>

          {#if attempt.paymentData}
            <QrCard value={attempt.paymentData} label={`${methodLabel(method)} payment code`} />
          {/if}

          {#if method === 'bolt_card'}
            <p class="text-sm text-[#776b5a] dark:text-[#b9aa91]">Hold the card near the back of this device, or use the code above.</p>
          {:else}
            <p class="text-sm text-[#776b5a] dark:text-[#b9aa91]">Waiting for customer payment.</p>
          {/if}

          <Button onclick={settle} disabled={settling}>
            {#if settling}
              <Loader2 class="animate-spin" size={19} />
              Finishing payment...
            {:else}
              <CheckCircle2 size={19} />
              Simulate Paid
            {/if}
          </Button>
        </div>
      {:else}
        <div class="grid min-h-[60vh] place-items-center">
          <Loader2 class="animate-spin" size={36} />
        </div>
      {/if}
    </section>

    <aside class="lg:flex lg:min-h-screen lg:items-end">
      <TransactionSheet rows={$transactions} />
    </aside>
  </div>
</main>
