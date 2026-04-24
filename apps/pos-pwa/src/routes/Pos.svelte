<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, CheckCircle2, Loader2, Smartphone, Zap } from 'lucide-svelte';
  import Button from '../lib/ui/Button.svelte';
  import QrCard from '../lib/ui/QrCard.svelte';
  import TransactionSheet from '../lib/ui/TransactionSheet.svelte';
  import { terminal, loadTerminal } from '../lib/stores/terminal';
  import { transactions, refreshTransactions } from '../lib/stores/ledger';
  import { createSale, markReady, paymentPayload, simulateSettlement } from '../lib/pos/payment-state';
  import type { PaymentAttempt, PaymentMethod, Sale } from '../lib/pos/types';
  import type { FxRate } from '../lib/fx/bull-bitcoin';
  import { decodeIndexPrice } from '../lib/fx/bull-bitcoin';
  import { putAttempt } from '../lib/db/repositories/ledger';
  import { formatBtcFromSats, formatExchangeRate, formatFiat, formatSats, methodLabel, statusLabel } from '../lib/util/formatting';

  let { params = {} }: { params?: { link?: string } } = $props();

  let sale = $state<Sale | undefined>();
  let attempt = $state<PaymentAttempt | undefined>();
  let rate = $state<FxRate | undefined>();
  let selectedMethod = $state<PaymentMethod>('lightning_swap');
  let error = $state('');
  let settling = $state(false);

  const decoded = $derived(decodeURIComponent(params.link ?? 'liquid:0:'));
  const parts = $derived(decoded.split(':'));
  const rawAmount = $derived(parts[1]);
  const rawNote = $derived(parts[2]);
  const amount = $derived(String(Number(rawAmount || '0')));
  const activePaymentData = $derived(sale ? paymentPayload(selectedMethod, sale.amountSat, sale.id) : '');

  onMount(async () => {
    try {
      const config = await loadTerminal();
      await refreshTransactions();
      const created = await createSale(config, amount, 'lightning_swap', rawNote || undefined);
      sale = created.sale;
      attempt = created.attempt;
      rate = created.rate;
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
    const selectedAttempt = { ...attempt, method: selectedMethod, paymentData: activePaymentData };
    await putAttempt(selectedAttempt);
    const receipt = await simulateSettlement(sale, selectedAttempt);
    sale = { ...sale, status: 'receipt_ready', updatedAt: Date.now() };
    attempt = { ...selectedAttempt, status: 'settled', updatedAt: Date.now() };
    await refreshTransactions();
    settling = false;
    location.hash = `#/receipt/${receipt.saleId}`;
  }

  async function selectMethod(method: PaymentMethod) {
    selectedMethod = method;
    if (!attempt || !sale) return;
    attempt = { ...attempt, method, paymentData: paymentPayload(method, sale.amountSat, sale.id), updatedAt: Date.now() };
    await putAttempt(attempt);
    await refreshTransactions();
  }

  const tabs: Array<{ method: PaymentMethod; label: string }> = [
    { method: 'lightning_swap', label: 'Lightning' },
    { method: 'liquid', label: 'Liquid' },
    { method: 'bolt_card', label: 'Bolt Card' }
  ];
</script>

<main class="min-h-screen bg-[#f5f0e8] text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <div class="mx-auto grid min-h-screen max-w-4xl grid-rows-1 pb-24">
    <section class="px-5 py-5 sm:px-8">
      <header class="mb-8 flex items-center justify-between">
        <a class="inline-flex min-h-12 items-center gap-2 rounded-md px-2 font-bold" href="#/">
          <ArrowLeft size={21} />
          New sale
        </a>
        <div class="text-right">
          <p class="font-black">{$terminal?.merchantName ?? 'Seguras Butcher'}</p>
          <p class="text-sm text-[#776b5a] dark:text-[#b9aa91]">Payment options</p>
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

          <div class="grid w-full grid-cols-3 gap-2 rounded-md bg-[#eadfce] p-1 dark:bg-[#2c2922]">
            {#each tabs as tab}
              <button
                type="button"
                class={`min-h-12 rounded-md px-2 text-sm font-black transition ${
                  selectedMethod === tab.method
                    ? 'bg-[#fffaf0] text-[#1f513a] shadow-sm dark:bg-[#161512] dark:text-[#8bc8a4]'
                    : 'text-[#5f5547] hover:bg-[#f5ead9] dark:text-[#c9bca7] dark:hover:bg-[#363126]'
                }`}
                onclick={() => selectMethod(tab.method)}
              >
                {tab.label}
              </button>
            {/each}
          </div>

          {#if activePaymentData}
            <QrCard value={activePaymentData} label={`${methodLabel(selectedMethod)} payment code`} />
          {/if}

          <div class="grid w-full gap-2 rounded-md border border-[#d7c8b4] bg-[#fffaf0] p-4 text-left text-sm dark:border-[#3a342a] dark:bg-[#211f1a]">
            <div class="flex justify-between gap-4">
              <span class="text-[#776b5a] dark:text-[#b9aa91]">Fiat amount</span>
              <strong>{formatFiat(sale.amountFiat, sale.fiatCurrency)}</strong>
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-[#776b5a] dark:text-[#b9aa91]">BTC amount</span>
              <strong>{formatBtcFromSats(sale.amountSat)}</strong>
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-[#776b5a] dark:text-[#b9aa91]">Sats</span>
              <strong>{formatSats(sale.amountSat)}</strong>
            </div>
            {#if rate}
              <div class="flex justify-between gap-4">
                <span class="text-[#776b5a] dark:text-[#b9aa91]">Exchange rate</span>
                <strong>{formatExchangeRate(decodeIndexPrice(rate), sale.fiatCurrency)}</strong>
              </div>
            {/if}
          </div>

          {#if selectedMethod === 'bolt_card'}
            <p class="text-sm text-[#776b5a] dark:text-[#b9aa91]">Hold the card near the back of this device, or use the code above.</p>
          {:else if selectedMethod === 'lightning_swap'}
            <p class="inline-flex items-center gap-2 text-sm text-[#776b5a] dark:text-[#b9aa91]"><Zap size={16} /> Lightning is ready to scan.</p>
          {:else}
            <p class="inline-flex items-center gap-2 text-sm text-[#776b5a] dark:text-[#b9aa91]"><Smartphone size={16} /> Liquid is ready to scan.</p>
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
  </div>
  <TransactionSheet rows={$transactions} />
</main>
