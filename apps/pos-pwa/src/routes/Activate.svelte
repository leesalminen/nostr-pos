<script lang="ts">
  import { onMount } from 'svelte';
  import { ShieldCheck } from 'lucide-svelte';
  import BullFooter from '../lib/ui/BullFooter.svelte';
  import Button from '../lib/ui/Button.svelte';
  import { activateTerminal, loadTerminal, terminal } from '../lib/stores/terminal';
  import { announcePairingRequest } from '../lib/activation/pairing';
  import { syncTerminalApproval } from '../lib/activation/approval-sync';

  let announced = $state(false);
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
    {#if isDev}
      <div class="flex flex-col gap-3">
        <Button variant="secondary" onclick={async () => { await activateTerminal(); location.hash = '#/'; }}>
          Dev: Mark Approved
        </Button>
      </div>
    {/if}
    <BullFooter />
  </section>
</main>
