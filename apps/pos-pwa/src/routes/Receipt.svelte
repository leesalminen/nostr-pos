<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Printer, Share2 } from 'lucide-svelte';
  import BullFooter from '../lib/ui/BullFooter.svelte';
  import Button from '../lib/ui/Button.svelte';
  import ReceiptView from '../lib/ui/ReceiptView.svelte';
  import type { PaymentAttempt, Sale } from '../lib/pos/types';
  import { getAttempt, getSale } from '../lib/db/repositories/ledger';
  import { loadTerminal, terminal } from '../lib/stores/terminal';
  import { markReceiptPrinted } from '../lib/pos/receipt';
  import { statusLabel } from '../lib/util/formatting';

  let { params = {} }: { params?: { saleId?: string } } = $props();

  let sale = $state<Sale | undefined>();
  let attempt = $state<PaymentAttempt | undefined>();
  const isPaid = $derived(sale?.status === 'receipt_ready' || sale?.status === 'settled');

  onMount(async () => {
    await loadTerminal();
    if (params.saleId) {
      sale = await getSale(params.saleId);
      if (sale?.activePaymentAttemptId) attempt = await getAttempt(sale.activePaymentAttemptId);
    }
  });

  async function shareReceipt() {
    await navigator.share?.({ title: 'Receipt', url: location.href });
  }

  async function printReceipt() {
    if (sale) await markReceiptPrinted(sale.id);
    window.print();
  }

  function goBack() {
    if (history.length > 1) history.back();
    else location.hash = '#/';
  }
</script>

<main class="min-h-screen bg-[#f5f0e8] px-5 py-5 text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <div class="no-print mx-auto mb-5 flex max-w-xl items-center justify-between">
    <button class="inline-flex min-h-12 items-center gap-2 rounded-md font-bold" onclick={goBack}>
      <ArrowLeft size={21} />
      Back
    </button>
    <div class="flex gap-2">
      <Button variant="secondary" disabled={!isPaid} onclick={printReceipt}><Printer size={18} />Print</Button>
      <Button variant="ghost" disabled={!isPaid} onclick={shareReceipt}><Share2 size={18} />Share</Button>
    </div>
  </div>

  {#if sale}
    <ReceiptView sale={sale} attempt={attempt} merchantName={$terminal?.merchantName ?? 'Seguras Butcher'} posName={$terminal?.posName ?? 'Counter 1'} />
    <div class="no-print mx-auto mt-5 max-w-sm text-center">
      <div
        class={`rounded-md px-5 py-4 ${
          isPaid ? 'bg-[#d9f3df] text-[#14522d]' : 'bg-[#fff0c7] text-[#725315] dark:bg-[#3a321f] dark:text-[#f0d38a]'
        }`}
      >
        <p class="font-display text-5xl uppercase tracking-display leading-none">{isPaid ? 'Paid' : statusLabel(sale.status)}</p>
        <p class="mt-1 text-sm">{isPaid ? 'Receipt ready.' : 'Payment is not complete yet.'}</p>
      </div>
    </div>
  {:else}
    <p class="py-20 text-center">Receipt not found.</p>
  {/if}
  <div class="no-print"><BullFooter /></div>
</main>
