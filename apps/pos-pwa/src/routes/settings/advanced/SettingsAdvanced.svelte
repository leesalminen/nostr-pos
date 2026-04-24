<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Download } from 'lucide-svelte';
  import Button from '../../../lib/ui/Button.svelte';
  import ServerList from '../../../lib/ui/advanced/ServerList.svelte';
  import { loadTerminal, terminal } from '../../../lib/stores/terminal';
  import { recentTransactions } from '../../../lib/db/repositories/ledger';

  let exportCount = $state(0);
  onMount(loadTerminal);

  async function exportJson() {
    const rows = await recentTransactions(500);
    exportCount = rows.length;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pos-export.json';
    a.click();
    URL.revokeObjectURL(url);
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
        <h2 class="text-lg font-black">Export</h2>
        <p class="mt-2 text-sm text-[#776b5a] dark:text-[#b9aa91]">{exportCount ? `${exportCount} records exported.` : 'Download local sales and receipt data.'}</p>
        <div class="mt-4">
          <Button onclick={exportJson}><Download size={18} />JSON</Button>
        </div>
      </div>
    </div>
  </div>
</main>
