<script lang="ts">
  import { onMount } from 'svelte';
  import { ShieldCheck } from 'lucide-svelte';
  import Button from '../lib/ui/Button.svelte';
  import { activateTerminal, loadTerminal, terminal } from '../lib/stores/terminal';

  onMount(loadTerminal);
</script>

<main class="grid min-h-screen place-items-center bg-[#f5f0e8] px-5 text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <section class="w-full max-w-md text-center">
    <ShieldCheck class="mx-auto text-[#1f513a]" size={44} />
    <h1 class="mt-5 text-3xl font-black">Activate this terminal</h1>
    <p class="mt-3 text-[#776b5a] dark:text-[#b9aa91]">Open the merchant wallet, choose Connect terminal, and enter this code.</p>
    <div class="my-8 rounded-md border border-[#d7c8b4] bg-[#fffaf0] px-5 py-7 text-5xl font-black tracking-[0.12em] shadow-sm dark:border-[#3a342a] dark:bg-[#211f1a]">
      {$terminal?.pairingCode ?? '4F7G-YJDP'}
    </div>
    <Button onclick={async () => { await activateTerminal(); location.hash = '#/'; }}>
      Mark Approved
    </Button>
  </section>
</main>
