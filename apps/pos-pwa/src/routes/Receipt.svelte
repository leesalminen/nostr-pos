<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Printer, Share2 } from 'lucide-svelte';
  import Button from '../lib/ui/Button.svelte';
  import ReceiptView from '../lib/ui/ReceiptView.svelte';
  import type { PaymentAttempt, Sale } from '../lib/pos/types';
  import { getAttempt, getSale } from '../lib/db/repositories/ledger';
  import { loadTerminal, terminal } from '../lib/stores/terminal';

  let { params = {} }: { params?: { saleId?: string } } = $props();

  let sale = $state<Sale | undefined>();
  let attempt = $state<PaymentAttempt | undefined>();

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
</script>

<main class="min-h-screen bg-[#f5f0e8] px-5 py-5 text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <div class="no-print mx-auto mb-5 flex max-w-xl items-center justify-between">
    <a class="inline-flex min-h-12 items-center gap-2 rounded-md font-bold" href="#/">
      <ArrowLeft size={21} />
      New sale
    </a>
    <div class="flex gap-2">
      <Button variant="secondary" onclick={() => window.print()}><Printer size={18} />Print</Button>
      <Button variant="ghost" onclick={shareReceipt}><Share2 size={18} />Share</Button>
    </div>
  </div>

  {#if sale}
    <ReceiptView sale={sale} attempt={attempt} merchantName={$terminal?.merchantName ?? 'Seguras Butcher'} posName={$terminal?.posName ?? 'Counter 1'} />
    <div class="no-print mx-auto mt-5 max-w-sm text-center">
      <div class="rounded-md bg-[#d9f3df] px-5 py-4 text-[#14522d]">
        <p class="text-3xl font-black">Paid</p>
        <p class="mt-1 text-sm">Receipt ready.</p>
      </div>
    </div>
  {:else}
    <p class="py-20 text-center">Receipt not found.</p>
  {/if}
</main>
