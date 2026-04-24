<script lang="ts">
  import type { PaymentAttempt, Sale } from '../pos/types';
  import { formatFiat, formatSats, methodLabel, shortId, statusLabel } from '../util/formatting';

  let { sale, attempt, merchantName, posName }: { sale: Sale; attempt?: PaymentAttempt; merchantName: string; posName: string } = $props();
</script>

<article class="receipt-paper mx-auto max-w-sm rounded-md border border-[#d7c8b4] bg-[#fffaf0] p-6 text-[#211f1a] shadow-sm">
  <header class="border-b border-dashed border-[#9f8d73] pb-4 text-center">
    <h1 class="text-2xl font-black">{merchantName}</h1>
    <p class="text-sm">{posName}</p>
    <p class="mt-2 text-xs">Receipt {sale.receiptNumber}</p>
  </header>

  <dl class="my-5 space-y-3 text-sm">
    <div class="flex justify-between gap-4">
      <dt>Date</dt>
      <dd>{new Date(sale.createdAt).toLocaleString()}</dd>
    </div>
    <div class="flex justify-between gap-4">
      <dt>Terminal</dt>
      <dd>{sale.terminalId.slice(-4)}</dd>
    </div>
    <div class="flex justify-between gap-4">
      <dt>Method</dt>
      <dd>{methodLabel(attempt?.method)}</dd>
    </div>
    <div class="flex justify-between gap-4">
      <dt>Status</dt>
      <dd>{statusLabel(sale.status)}</dd>
    </div>
    <div class="flex justify-between gap-4">
      <dt>Amount</dt>
      <dd>{formatSats(sale.amountSat)}</dd>
    </div>
    {#if sale.note}
      <div class="border-t border-dashed border-[#9f8d73] pt-3">
        <dt>Note</dt>
        <dd>{sale.note}</dd>
      </div>
    {/if}
  </dl>

  <div class="border-y border-dashed border-[#9f8d73] py-4">
    <div class="flex justify-between text-lg font-black">
      <span>Total</span>
      <span>{formatFiat(sale.amountFiat, sale.fiatCurrency)}</span>
    </div>
  </div>

  <footer class="pt-4 text-center text-xs">
    <p>Sale {shortId(sale.id)}</p>
    {#if attempt?.settlementTxid}
      <p>Settlement {shortId(attempt.settlementTxid)}</p>
    {/if}
  </footer>
</article>
