<script lang="ts">
  import { formatFiat } from '../util/formatting';

  let { amount, currency }: { amount: string; currency: string } = $props();
  const display = $derived(formatFiat(Number(amount || '0'), currency));
</script>

<div class="min-h-[112px] text-right">
  <div class="text-xs font-medium uppercase tracking-[0.12em] text-[#776b5a] dark:text-[#b9aa91]">Total</div>
  <div class="mt-2 break-words font-black tabular-nums text-[clamp(3rem,12vw,6.8rem)] leading-none text-[#211f1a] dark:text-[#fff6e8]">
    {display}
  </div>
</div>
