<script lang="ts">
  import type { SaleStatus } from '../pos/types';
  import { statusLabel } from '../util/formatting';

  let { status }: { status: SaleStatus } = $props();
  const tone = $derived(
    status === 'receipt_ready' || status === 'settled'
      ? 'bg-[#d9f3df] text-[#14522d]'
      : status === 'needs_recovery' || status === 'failed'
        ? 'bg-[#ffe0d9] text-[#8c2d28]'
        : status === 'expired'
          ? 'bg-[#eee5d8] text-[#6d5f4e]'
          : 'bg-[#e2edf5] text-[#1e4e73]'
  );
</script>

<span class={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-bold ${tone}`}>
  {statusLabel(status)}
</span>
