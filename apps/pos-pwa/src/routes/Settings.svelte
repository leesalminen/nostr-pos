<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, LockKeyhole } from 'lucide-svelte';
  import Button from '../lib/ui/Button.svelte';
  import { loadTerminal, terminal } from '../lib/stores/terminal';

  onMount(loadTerminal);
</script>

<main class="min-h-screen bg-[#f5f0e8] px-5 py-5 text-[#211f1a] dark:bg-[#161512] dark:text-[#fff6e8]">
  <div class="mx-auto max-w-2xl">
    <a class="inline-flex min-h-12 items-center gap-2 rounded-md font-bold" href="#/">
      <ArrowLeft size={21} />
      Back
    </a>

    <h1 class="mt-8 text-3xl font-black">Settings</h1>
    <div class="mt-5 rounded-md border border-[#d7c8b4] bg-[#fffaf0] p-5 dark:border-[#3a342a] dark:bg-[#211f1a]">
      <dl class="space-y-3">
        <div class="flex justify-between gap-5">
          <dt class="text-[#776b5a] dark:text-[#b9aa91]">Merchant</dt>
          <dd class="font-bold">{$terminal?.merchantName ?? 'Seguras Butcher'}</dd>
        </div>
        <div class="flex justify-between gap-5">
          <dt class="text-[#776b5a] dark:text-[#b9aa91]">Counter</dt>
          <dd class="font-bold">{$terminal?.posName ?? 'Counter 1'}</dd>
        </div>
        <div class="flex justify-between gap-5">
          <dt class="text-[#776b5a] dark:text-[#b9aa91]">Currency</dt>
          <dd class="font-bold">{$terminal?.currency ?? 'CRC'}</dd>
        </div>
      </dl>
    </div>

    <div class="mt-5">
      <Button href="#/settings/advanced" variant="secondary">
        <LockKeyhole size={18} />
        Advanced
      </Button>
    </div>
  </div>
</main>
