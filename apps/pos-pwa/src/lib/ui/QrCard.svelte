<script lang="ts">
  import QRCode from 'qrcode';
  import { Copy, CreditCard } from 'lucide-svelte';
  import Button from './Button.svelte';

  let {
    value,
    label = 'Payment code',
    showBoltCard = false,
    onBoltCard
  }: {
    value: string;
    label?: string;
    showBoltCard?: boolean;
    onBoltCard?: () => void;
  } = $props();
  let dataUrl = $state('');

  $effect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 300, color: { dark: '#211f1a', light: '#fffaf0' } }).then(
      (next) => (dataUrl = next)
    );
  });
</script>

<div class="mx-auto w-full max-w-sm rounded-lg border border-[#d7c8b4] bg-[#fffaf0] p-4 text-center shadow-sm dark:border-[#3a342a] dark:bg-[#211f1a]">
  {#if dataUrl}
    <img class="mx-auto aspect-square w-full max-w-[300px]" src={dataUrl} alt={label} />
  {/if}
  <div class="mt-3 flex flex-wrap items-center justify-center gap-2">
    <Button variant="secondary" onclick={() => navigator.clipboard.writeText(value)}>
      <Copy size={18} />
      Copy
    </Button>
    {#if showBoltCard}
      <Button variant="secondary" onclick={onBoltCard}>
        <CreditCard size={18} />
        Bolt Card
      </Button>
    {/if}
  </div>
</div>
