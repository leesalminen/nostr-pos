<script lang="ts">
  import { onMount } from 'svelte';
  import { ShieldCheck } from 'lucide-svelte';
  import BullFooter from '../lib/ui/BullFooter.svelte';
  import Button from '../lib/ui/Button.svelte';
  import { activateTerminal, applyTerminalApproval, loadTerminal, terminal } from '../lib/stores/terminal';
  import { announcePairingRequest } from '../lib/activation/pairing';
  import { syncTerminalApproval } from '../lib/activation/approval-sync';

  let announced = $state(false);
  let approvalText = $state('');
  let approvalError = $state('');
  let applying = $state(false);
  let requestMessage = $state('Preparing approval request...');
  const isDev = import.meta.env.DEV;

  onMount(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    async function checkApproval() {
      const config = await loadTerminal();
      const approved = await syncTerminalApproval(config);
      if (approved) location.hash = '#/';
    }

    async function start() {
      const config = await loadTerminal();
      const result = await announcePairingRequest(config);
      requestMessage = result.published
        ? 'Ready for owner approval.'
        : 'Approval request saved. Connect to the internet, then try Sync now in Advanced.';
      announced = true;
      await checkApproval();
      timer = setInterval(() => {
        void checkApproval();
      }, 5000);
    }

    void start();
    return () => {
      if (timer) clearInterval(timer);
    };
  });

  async function applyApproval() {
    approvalError = '';
    applying = true;
    try {
      await applyTerminalApproval(approvalText);
      location.hash = '#/';
    } catch (err) {
      approvalError = err instanceof Error ? err.message : 'Could not apply approval.';
    } finally {
      applying = false;
    }
  }
</script>

<main class="grid min-h-screen place-items-center bg-[#f5f0e8] px-5 text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <section class="w-full max-w-md text-center">
    <ShieldCheck class="mx-auto text-[#1f513a]" size={44} />
    <h1 class="mt-5 text-3xl font-black">Activate this terminal</h1>
    <p class="mt-3 text-[#776b5a] dark:text-[#b9aa91]">Open the merchant wallet, choose Connect terminal, and enter this code.</p>
    <div class="my-8 rounded-md border border-[#d7c8b4] bg-[#fffaf0] px-5 py-7 text-5xl font-black tracking-[0.12em] shadow-sm dark:border-[#3a342a] dark:bg-[#211f1a]">
      {$terminal?.pairingCode ?? '4F7G-YJDP'}
    </div>
    <p class="mb-5 text-sm text-[#776b5a] dark:text-[#b9aa91]">
      {announced ? requestMessage : 'Preparing approval request...'}
    </p>
    <div class="mb-5 text-left">
      <label class="text-sm font-bold" for="approval-json">Approval JSON</label>
      <textarea
        id="approval-json"
        class="mt-2 min-h-28 w-full rounded-md border border-[#d7c8b4] bg-[#fffaf0] p-3 font-mono text-xs outline-none focus:border-[#1f513a] dark:border-[#3a342a] dark:bg-[#211f1a]"
        bind:value={approvalText}
        placeholder="Paste approval from the merchant wallet"
      ></textarea>
      {#if approvalError}
        <p class="mt-2 text-sm font-semibold text-[#8c2d28]">{approvalError}</p>
      {/if}
    </div>
    <div class="flex flex-col gap-3">
      <Button disabled={!approvalText.trim() || applying} onclick={applyApproval}>
        {applying ? 'Applying...' : 'Apply approval'}
      </Button>
      {#if isDev}
        <Button variant="secondary" onclick={async () => { await activateTerminal(); location.hash = '#/'; }}>
          Dev: Mark Approved
        </Button>
      {/if}
    </div>
    <BullFooter />
  </section>
</main>
