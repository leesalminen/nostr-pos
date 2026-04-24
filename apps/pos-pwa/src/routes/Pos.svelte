<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, CreditCard, History, Settings } from 'lucide-svelte';
  import Button from '../lib/ui/Button.svelte';
  import BullFooter from '../lib/ui/BullFooter.svelte';
  import BullSpinner from '../lib/ui/BullSpinner.svelte';
  import QrCard from '../lib/ui/QrCard.svelte';
  import { terminal, loadTerminal, loadPosProfileReference } from '../lib/stores/terminal';
  import { refreshTransactions } from '../lib/stores/ledger';
  import { paymentPayload } from '../lib/pos/payment-payload';
  import { normalizeBolt11Invoice } from '../lib/lightning/bolt11';
  import { claimLiquidReverseSwap, reconcileClaimBroadcasts, resumePreparedClaims } from '../lib/pos/claim-engine';
  import { applySwapStatusUpdate, reconcileOpenPayments, resumeAttempt, resumeSale } from '../lib/pos/reconciler';
  import type { PaymentAttempt, PaymentMethod, Sale } from '../lib/pos/types';
  import { syncQueuedRecords } from '../lib/pos/sync';
  import { decodeIndexPrice } from '../lib/fx/bull-bitcoin';
  import { putAttempt } from '../lib/db/repositories/ledger';
  import { formatExchangeRate, formatFiat, formatSats, statusLabel } from '../lib/util/formatting';
  import { payWithWebNfc } from '../lib/nfc/web-nfc';
  import { isPosProfileReference } from '../lib/pos/profile-loader';
  import { boltzWebSocketUrl, subscribeBoltzSwapUpdates, type SwapUpdateSubscription } from '../lib/swaps/boltz-ws';
  import { mergePaymentHistory } from '../lib/pos/payment-history';
  import { syncTerminalRecoveryBackups } from '../lib/pos/recovery-sync';
  import { createTerminalTabLock, type TerminalTabLock } from '../lib/security/tab-lock';

  let { params = {} }: { params?: { saleId?: string } } = $props();

  let sale = $state<Sale | undefined>();
  let attempt = $state<PaymentAttempt | undefined>();
  let selectedMethod = $state<PaymentMethod>('lightning_swap');
  let boltCardPending = $state(false);
  let boltCardMessage = $state('');
  let error = $state('');
  let settling = $state(false);
  let tabReadOnly = $state(false);
  const showDevSettle = import.meta.env.DEV;

  const lightningPaymentData = $derived(
    attempt
      ? (normalizeBolt11Invoice(attempt.lightningInvoice) ??
          normalizeBolt11Invoice(attempt.method === 'lightning_swap' || attempt.method === 'bolt_card' ? attempt.paymentData : undefined) ??
          '')
      : ''
  );

  const activePaymentData = $derived(
    sale && attempt
      ? selectedMethod === 'liquid'
        ? (attempt.liquidPaymentData ?? paymentPayload('liquid', sale.amountSat, sale.id, attempt.liquidAddress))
        : lightningPaymentData
      : ''
  );

  const statusTone = $derived(
    !sale
      ? 'text-[#776b5a] dark:text-[#b9aa91]'
      : sale.status === 'receipt_ready' || sale.status === 'settled'
        ? 'text-[#14522d] dark:text-[#8bc8a4]'
        : sale.status === 'failed' || sale.status === 'needs_recovery' || sale.status === 'expired'
          ? 'text-[#8c2d28] dark:text-[#e8a49e]'
          : 'text-[#1e4e73] dark:text-[#9fc6e3]'
  );

  onMount(() => {
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let swapSubscription: SwapUpdateSubscription | undefined;
    let tabLock: TerminalTabLock | undefined;
    let stopped = false;
    let refreshInFlight = false;

    async function refreshPaymentState() {
      if (!attempt || stopped || tabReadOnly || refreshInFlight) return;
      refreshInFlight = true;
      try {
        const now = Date.now();
        await loadTerminal().then(syncTerminalRecoveryBackups);
        await reconcileOpenPayments({ now });
        await loadTerminal().then((config) => resumePreparedClaims(config, { now }));
        await loadTerminal().then((config) => reconcileClaimBroadcasts(config, { now }));
        await loadTerminal().then(mergePaymentHistory);
        const resumed = await resumeAttempt(attempt.id);
        if (!resumed || stopped) return;
        sale = resumed.sale;
        attempt = resumed.attempt;
        await refreshTransactions();
        void loadTerminal().then(syncQueuedRecords);
        if (resumed.sale.status === 'receipt_ready' || resumed.sale.status === 'settled') {
          location.replace(`#/receipt/${resumed.sale.id}`);
        }
      } finally {
        refreshInFlight = false;
      }
    }

    async function prepare() {
      try {
        const target = params.saleId ? decodeURIComponent(params.saleId) : undefined;
        if (target && isPosProfileReference(target)) {
          const updated = await loadPosProfileReference(target);
          location.replace(updated.activatedAt ? '#/' : '#/activate');
          return;
        }

        const terminalConfig = await loadTerminal();
        tabLock = createTerminalTabLock(terminalConfig.terminalPubkey, (state) => {
          tabReadOnly = state.readonly;
        });
        await refreshTransactions();
        const resumed = target ? await resumeSale(target) : undefined;
        if (!resumed) {
          error = 'Payment not found.';
          return;
        }
        sale = resumed.sale;
        attempt = resumed.attempt;
        selectedMethod =
          resumed.attempt.method === 'liquid' ||
          !(
            normalizeBolt11Invoice(resumed.attempt.lightningInvoice) ??
            normalizeBolt11Invoice(resumed.attempt.method === 'lightning_swap' || resumed.attempt.method === 'bolt_card' ? resumed.attempt.paymentData : undefined)
          )
            ? 'liquid'
            : 'lightning_swap';
        await refreshTransactions();
        const config = await loadTerminal();
        const wsUrl = boltzWebSocketUrl(config.authorization?.swap_providers?.find((provider) => provider.type === 'boltz'));
        if (wsUrl && resumed.attempt.swapId) {
          swapSubscription = subscribeBoltzSwapUpdates({
            wsUrl,
            swapIds: [resumed.attempt.swapId],
            async onUpdate(update) {
              if (stopped || update.id !== resumed.attempt.swapId || !sale || !attempt) return;
              if (tabReadOnly) return;
              const applied =
                update.status === 'transaction.mempool' || update.status === 'transaction.confirmed'
                  ? await claimLiquidReverseSwap(config, {
                      swapId: resumed.attempt.swapId,
                      lockupTxHex: update.transactionHex,
                      lockupTxid: update.txid
                    }).then((result) =>
                      result.status === 'broadcast' && result.txid
                        ? applySwapStatusUpdate(sale as Sale, attempt as PaymentAttempt, 'transaction.claimed', {
                            now: Date.now(),
                            txid: result.txid
                          })
                        : applySwapStatusUpdate(sale as Sale, attempt as PaymentAttempt, update.status, { now: Date.now(), txid: update.txid })
                    )
                  : await applySwapStatusUpdate(sale, attempt, update.status, { now: Date.now(), txid: update.txid });
              if (!applied.changed || stopped) return;
              const latest = await resumeAttempt(attempt.id);
              if (latest) {
                sale = latest.sale;
                attempt = latest.attempt;
              }
              await refreshTransactions();
              void loadTerminal().then(syncQueuedRecords);
              if (sale?.status === 'receipt_ready' || sale?.status === 'settled') {
                location.replace(`#/receipt/${sale.id}`);
              }
            }
          });
        }
        pollTimer = setInterval(() => {
          void refreshPaymentState();
        }, 5000);
      } catch (err) {
        error = err instanceof Error ? err.message : 'Could not prepare payment. Try again.';
      }
    }

    void prepare();
    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      swapSubscription?.close();
      tabLock?.close();
    };
  });

  async function settle() {
    if (!sale || !attempt || tabReadOnly) return;
    settling = true;
    const receiptMethod: PaymentMethod = boltCardPending ? 'bolt_card' : selectedMethod;
    const selectedAttempt = { ...attempt, method: receiptMethod, paymentData: activePaymentData };
    const { simulateSettlement } = await import('../lib/pos/payment-state');
    await putAttempt(selectedAttempt);
    const receipt = await simulateSettlement(sale, selectedAttempt);
    sale = { ...sale, status: 'receipt_ready', updatedAt: Date.now() };
    attempt = { ...selectedAttempt, status: 'settled', updatedAt: Date.now() };
    await refreshTransactions();
    void loadTerminal().then(syncQueuedRecords);
    settling = false;
    location.replace(`#/receipt/${receipt.saleId}`);
  }

  async function selectMethod(method: PaymentMethod) {
    if (tabReadOnly) return;
    if (method === 'lightning_swap' && !lightningPaymentData) return;
    selectedMethod = method;
    boltCardPending = false;
    boltCardMessage = '';
    if (!attempt || !sale) return;
    const paymentData =
      method === 'liquid'
        ? (attempt.liquidPaymentData ?? paymentPayload('liquid', sale.amountSat, sale.id, attempt.liquidAddress))
        : lightningPaymentData;
    if (!paymentData) return;
    const nextAttempt: PaymentAttempt = { ...attempt, method, paymentData, updatedAt: Date.now() };
    await putAttempt(nextAttempt);
    attempt = nextAttempt;
    await refreshTransactions();
    await reconcileOpenPayments({ now: Date.now() });
  }

  async function startBoltCard() {
    if (!attempt || !sale || tabReadOnly) return;
    const invoice =
      normalizeBolt11Invoice(attempt.lightningInvoice) ??
      normalizeBolt11Invoice(attempt.method === 'lightning_swap' || attempt.method === 'bolt_card' ? attempt.paymentData : undefined);
    if (!invoice) {
      boltCardPending = true;
      boltCardMessage = 'Lightning is not available for this sale. Use Liquid.';
      return;
    }
    boltCardPending = true;
    boltCardMessage = 'Hold the card near the back of this device.';
    const nextAttempt: PaymentAttempt = {
      ...attempt,
      method: 'bolt_card',
      paymentData: invoice,
      updatedAt: Date.now()
    };
    await putAttempt(nextAttempt);
    attempt = nextAttempt;
    await refreshTransactions();
    try {
      const result = await payWithWebNfc(invoice);
      if (result === 'unsupported') {
        boltCardMessage = 'NFC is not available here. Use the QR code instead.';
      } else {
        boltCardMessage = 'Card payment sent. Waiting for settlement.';
      }
    } catch (err) {
      boltCardMessage = err instanceof Error ? err.message : 'Card not recognized. Try again or use QR.';
    }
  }

  const tabs = $derived<Array<{ method: PaymentMethod; label: string; disabled?: boolean }>>([
    { method: 'lightning_swap', label: 'Lightning', disabled: Boolean(attempt) && !lightningPaymentData },
    { method: 'liquid', label: 'Liquid' }
  ]);
</script>

<main class="min-h-screen bg-[#f5f0e8] text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <div class="mx-auto grid min-h-screen max-w-4xl grid-rows-1">
    <section class="px-5 py-5 sm:px-8">
      <header class="mb-6 flex items-center justify-between">
        <a class="inline-flex min-h-12 items-center gap-2 rounded-md px-2 text-sm font-semibold" href="#/">
          <ArrowLeft size={21} />
          Cancel sale
        </a>
        <div class="flex items-center gap-2">
          <a class="grid min-h-12 min-w-12 place-items-center rounded-md bg-[#eadfce] text-[#211f1a] dark:bg-[#2c2922] dark:text-[#fff6e8]" href="#/transactions" aria-label="Recent transactions">
            <History size={22} />
          </a>
          <a class="grid min-h-12 min-w-12 place-items-center rounded-md bg-[#eadfce] text-[#211f1a] dark:bg-[#2c2922] dark:text-[#fff6e8]" href="#/settings" aria-label="Settings">
            <Settings size={22} />
          </a>
        </div>
      </header>

      {#if error}
        <div class="mx-auto max-w-lg rounded-lg bg-[#ffe0d9] p-5 text-[#8c2d28]">
          <h1 class="text-xl font-bold">Could not prepare payment.</h1>
          <p class="mt-2">{error}</p>
          <div class="mt-4"><Button href="#/">Try Again</Button></div>
        </div>
      {:else if sale && attempt}
        <div class="mx-auto flex max-w-md flex-col items-center gap-5">
          {#if tabReadOnly}
            <div class="w-full rounded-md bg-[#ffe0d9] px-4 py-3 text-center text-sm font-semibold text-[#8c2d28]">
              Terminal open in another tab. Close the other tab to finish payments here.
            </div>
          {/if}
          <div class="flex w-full flex-col items-center gap-1">
            <div class="flex items-baseline gap-3">
              <p class="font-display text-7xl tabular-nums tracking-display leading-none">{formatFiat(sale.amountFiat, sale.fiatCurrency)}</p>
            </div>
            <p class={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusTone}`}>
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-current"></span>
              {boltCardPending ? 'Tap card to device' : statusLabel(sale.status)}
            </p>
          </div>

          <div class="inline-flex rounded-md bg-[#eadfce] p-0.5 text-xs dark:bg-[#2c2922]">
            {#each tabs as tab}
              <button
                type="button"
                class={`min-h-9 rounded-md px-4 font-semibold transition ${
                  selectedMethod === tab.method
                    ? 'bg-[#fffaf0] text-[#1f513a] shadow-sm dark:bg-[#161512] dark:text-[#8bc8a4]'
                    : 'text-[#5f5547] dark:text-[#c9bca7]'
                }`}
                onclick={() => selectMethod(tab.method)}
                disabled={tabReadOnly || tab.disabled}
              >
                {tab.label}
              </button>
            {/each}
          </div>

          {#if activePaymentData}
            <QrCard
              value={activePaymentData}
              label={`${tabs.find((t) => t.method === selectedMethod)?.label ?? 'Payment'} payment code`}
              showBoltCard={selectedMethod === 'lightning_swap' && !tabReadOnly}
              onBoltCard={startBoltCard}
            />
          {:else if selectedMethod === 'lightning_swap'}
            <div class="w-full rounded-md bg-[#fff4d6] px-4 py-3 text-center text-sm font-semibold text-[#73510f] dark:bg-[#332a18] dark:text-[#e8c778]">
              Lightning is not available for this sale. Use Liquid.
            </div>
          {/if}

          <p class="text-center text-xs text-[#776b5a] tabular-nums dark:text-[#b9aa91]">
            {formatSats(sale.amountSat)}{#if sale.fxRate} &middot; {formatExchangeRate(decodeIndexPrice(sale.fxRate), sale.fiatCurrency)}{/if}
          </p>

          {#if boltCardPending}
            <p class="inline-flex items-center gap-2 text-xs text-[#776b5a] dark:text-[#b9aa91]">
              <CreditCard size={14} /> {boltCardMessage}
            </p>
          {/if}

          {#if showDevSettle}
            <button
              type="button"
              class="mt-2 text-xs font-semibold text-[#776b5a] underline-offset-4 hover:underline disabled:opacity-50 dark:text-[#b9aa91]"
              onclick={settle}
              disabled={settling || tabReadOnly}
            >
              {#if settling}
                <span class="inline-flex items-center gap-2"><BullSpinner size={16} /> Finishing…</span>
              {:else}
                Dev: simulate paid
              {/if}
            </button>
          {/if}
        </div>
      {:else}
        <div class="grid min-h-[60vh] place-items-center">
          <BullSpinner size={72} label="Preparing" />
        </div>
      {/if}
      <BullFooter />
    </section>
  </div>
</main>
