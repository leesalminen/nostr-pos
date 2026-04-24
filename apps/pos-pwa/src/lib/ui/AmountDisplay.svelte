<script lang="ts">
  import { formatFiat } from '../util/formatting';

  let { amount, currency }: { amount: string; currency: string } = $props();
  const display = $derived(formatFiat(Number(amount || '0'), currency));
</script>

<div class="text-right">
  <div class="font-display text-xs uppercase tracking-[0.18em] text-[#776b5a] dark:text-[#b9aa91]">Total</div>
  <div class="mt-1 whitespace-nowrap font-display tabular-nums tracking-display text-[clamp(2.5rem,10vw,7.5rem)] leading-[0.95] text-[#211f1a] dark:text-[#fff6e8]">
    {display}
  </div>
</div>
