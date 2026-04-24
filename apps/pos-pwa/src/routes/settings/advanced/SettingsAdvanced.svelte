<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Download } from 'lucide-svelte';
  import BullFooter from '../../../lib/ui/BullFooter.svelte';
  import Button from '../../../lib/ui/Button.svelte';
  import ServerList from '../../../lib/ui/advanced/ServerList.svelte';
  import { clearAdminPin, loadTerminal, setAdminPin, terminal } from '../../../lib/stores/terminal';
  import { outboxItems, recentTransactions, recoveryRecords } from '../../../lib/db/repositories/ledger';
  import { recoveryBackupsJson, transactionsCsv } from '../../../lib/pos/export';
  import { publishPendingOutbox } from '../../../lib/nostr/outbox';
  import { clearAdminUnlock, isAdminUnlocked, markAdminUnlocked, verifyAdminPin } from '../../../lib/security/admin-pin';

  let exportCount = $state(0);
  let outboxCount = $state(0);
  let recoveryCount = $state(0);
  let syncMessage = $state('');
  let locked = $state(true);
  let confirmOnly = $state(false);
  let pin = $state('');
  let newPin = $state('');
  let pinMessage = $state('');
  let pinBusy = $state(false);
  onMount(async () => {
    const config = await loadTerminal();
    locked = !isAdminUnlocked();
    confirmOnly = locked && !config.adminPin;
    if (locked) return;
    outboxCount = (await outboxItems()).length;
    recoveryCount = (await recoveryRecords()).length;
  });

  async function loadCounts() {
    outboxCount = (await outboxItems()).length;
    recoveryCount = (await recoveryRecords()).length;
  }

  function downloadFile(filename: string, type: string, content: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportJson() {
    const rows = await recentTransactions(500);
    exportCount = rows.length;
    downloadFile('pos-export.json', 'application/json', JSON.stringify(rows, null, 2));
  }

  async function exportCsv() {
    const rows = await recentTransactions(500);
    exportCount = rows.length;
    downloadFile('pos-export.csv', 'text/csv', transactionsCsv(rows));
  }

  async function exportRecoveryBackups() {
    const records = await recoveryRecords();
    recoveryCount = records.length;
    downloadFile('payment-backups.json', 'application/json', recoveryBackupsJson(records));
  }

  async function syncNow() {
    if (!$terminal) return;
    const reports = await publishPendingOutbox($terminal);
    outboxCount = (await outboxItems()).filter((item) => item.okFrom.length < 2).length;
    const ok = reports.reduce((sum, report) => sum + report.okCount, 0);
    syncMessage = reports.length === 0 ? 'Everything is already synced.' : `${ok} backup server confirmations recorded.`;
  }

  async function unlockWithPin() {
    if (!$terminal?.adminPin || pinBusy) return;
    pinBusy = true;
    pinMessage = '';
    try {
      if (await verifyAdminPin(pin, $terminal.adminPin)) {
        markAdminUnlocked();
        locked = false;
        confirmOnly = false;
        pin = '';
        await loadCounts();
      } else {
        pinMessage = 'That PIN did not work.';
      }
    } catch (err) {
      pinMessage = err instanceof Error ? err.message : 'Could not unlock.';
    } finally {
      pinBusy = false;
    }
  }

  async function continueWithoutPin() {
    markAdminUnlocked();
    locked = false;
    confirmOnly = false;
    await loadCounts();
  }

  async function savePin() {
    pinBusy = true;
    pinMessage = '';
    try {
      await setAdminPin(newPin);
      newPin = '';
      pinMessage = 'PIN saved.';
    } catch (err) {
      pinMessage = err instanceof Error ? err.message : 'Could not save PIN.';
    } finally {
      pinBusy = false;
    }
  }

  async function removePin() {
    pinBusy = true;
    await clearAdminPin();
    clearAdminUnlock();
    locked = true;
    confirmOnly = true;
    pinMessage = '';
    pinBusy = false;
  }
</script>

<main class="min-h-screen bg-[#f5f0e8] px-5 py-5 text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <div class="mx-auto max-w-3xl">
    <a class="inline-flex min-h-12 items-center gap-2 rounded-md font-bold" href="#/settings">
      <ArrowLeft size={21} />
      Back
    </a>
    <h1 class="mt-8 text-3xl font-black">Advanced</h1>
    <p class="mt-2 text-[#776b5a] dark:text-[#b9aa91]">Technical status and recovery tools.</p>

    {#if locked}
      <div class="mt-6 rounded-md border border-[#d7c8b4] bg-[#fffaf0] p-5 dark:border-[#3a342a] dark:bg-[#211f1a]">
        {#if confirmOnly}
          <h2 class="text-lg font-black">Admin access</h2>
          <p class="mt-2 text-sm text-[#776b5a] dark:text-[#b9aa91]">No PIN is set. Continue only if you are allowed to manage this terminal.</p>
          <div class="mt-4">
            <Button onclick={continueWithoutPin}>Continue</Button>
          </div>
        {:else}
          <h2 class="text-lg font-black">Enter PIN</h2>
          <div class="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              class="min-h-12 flex-1 rounded-md border border-[#d7c8b4] bg-[#fffaf0] px-4 text-lg font-bold tracking-[0.2em] outline-none focus:ring-2 focus:ring-[#B7000B] dark:border-[#3a342a] dark:bg-[#161512]"
              bind:value={pin}
              inputmode="numeric"
              maxlength="8"
              type="password"
              autocomplete="current-password"
            />
            <Button disabled={pinBusy || pin.length < 4} onclick={unlockWithPin}>Unlock</Button>
          </div>
          {#if pinMessage}
            <p class="mt-3 text-sm font-semibold text-[#8c2d28] dark:text-[#e8a49e]">{pinMessage}</p>
          {/if}
        {/if}
      </div>
    {:else}
    <div class="mt-6 grid gap-4">
      <div class="rounded-md border border-[#d7c8b4] bg-[#fffaf0] p-4 dark:border-[#3a342a] dark:bg-[#211f1a]">
        <h2 class="text-lg font-black">Admin access</h2>
        <p class="mt-2 text-sm text-[#776b5a] dark:text-[#b9aa91]">Use a 4 to 8 digit PIN to protect recovery tools and exports.</p>
        <div class="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            class="min-h-12 flex-1 rounded-md border border-[#d7c8b4] bg-[#fffaf0] px-4 text-lg font-bold tracking-[0.2em] outline-none focus:ring-2 focus:ring-[#B7000B] dark:border-[#3a342a] dark:bg-[#161512]"
            bind:value={newPin}
            inputmode="numeric"
            maxlength="8"
            type="password"
            autocomplete="new-password"
            placeholder={$terminal?.adminPin ? 'Change PIN' : 'Set PIN'}
          />
          <Button disabled={pinBusy || newPin.length < 4} onclick={savePin}>{$terminal?.adminPin ? 'Update PIN' : 'Set PIN'}</Button>
          {#if $terminal?.adminPin}
            <Button variant="danger" disabled={pinBusy} onclick={removePin}>Remove PIN</Button>
          {/if}
        </div>
        {#if pinMessage}
          <p class="mt-3 text-sm font-semibold text-[#776b5a] dark:text-[#b9aa91]">{pinMessage}</p>
        {/if}
      </div>
      <ServerList servers={$terminal?.syncServers ?? []} />
      <div class="rounded-md border border-[#d7c8b4] bg-[#fffaf0] p-4 dark:border-[#3a342a] dark:bg-[#211f1a]">
        <h2 class="text-lg font-black">Terminal ID</h2>
        <p class="mt-2 break-all font-mono text-sm">{$terminal?.terminalId ?? 'pending'}</p>
      </div>
      <div class="rounded-md border border-[#d7c8b4] bg-[#fffaf0] p-4 dark:border-[#3a342a] dark:bg-[#211f1a]">
        <h2 class="text-lg font-black">Recovery center</h2>
        <dl class="mt-3 grid gap-2 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-[#776b5a] dark:text-[#b9aa91]">Payment backups</dt>
            <dd class="font-bold">{recoveryCount}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-[#776b5a] dark:text-[#b9aa91]">Queued records</dt>
            <dd class="font-bold">{outboxCount}</dd>
          </div>
        </dl>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onclick={syncNow}>Sync now</Button>
          <Button variant="secondary" onclick={exportRecoveryBackups}><Download size={18} />Export backups</Button>
          {#if syncMessage}
            <p class="text-sm text-[#776b5a] dark:text-[#b9aa91]">{syncMessage}</p>
          {/if}
        </div>
      </div>
      <div class="rounded-md border border-[#d7c8b4] bg-[#fffaf0] p-4 dark:border-[#3a342a] dark:bg-[#211f1a]">
        <h2 class="text-lg font-black">Export</h2>
        <p class="mt-2 text-sm text-[#776b5a] dark:text-[#b9aa91]">{exportCount ? `${exportCount} records exported.` : 'Download local sales and receipt data.'}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <Button onclick={exportCsv}><Download size={18} />CSV</Button>
          <Button onclick={exportJson}><Download size={18} />JSON</Button>
        </div>
      </div>
    </div>
    {/if}
    <BullFooter />
  </div>
</main>
