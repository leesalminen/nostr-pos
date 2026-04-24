<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Download } from 'lucide-svelte';
  import Button from '../../../lib/ui/Button.svelte';
  import ServerList from '../../../lib/ui/advanced/ServerList.svelte';
  import { loadTerminal, terminal } from '../../../lib/stores/terminal';
  import { outboxItems, recentTransactions, recoveryRecords } from '../../../lib/db/repositories/ledger';
  import { transactionsCsv } from '../../../lib/pos/export';

  let exportCount = $state(0);
  let outboxCount = $state(0);
  let recoveryCount = $state(0);
  onMount(async () => {
    await loadTerminal();
    outboxCount = (await outboxItems()).length;
    recoveryCount = (await recoveryRecords()).length;
  });

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
</script>

<main class="min-h-screen bg-[#f5f0e8] px-5 py-5 text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <div class="mx-auto max-w-3xl">
    <a class="inline-flex min-h-12 items-center gap-2 rounded-md font-bold" href="#/settings">
      <ArrowLeft size={21} />
      Back
    </a>
    <h1 class="mt-8 text-3xl font-black">Advanced</h1>
    <p class="mt-2 text-[#776b5a] dark:text-[#b9aa91]">Technical status and recovery tools.</p>

    <div class="mt-6 grid gap-4">
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
  </div>
</main>
