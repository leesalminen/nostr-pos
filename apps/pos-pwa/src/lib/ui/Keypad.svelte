<script lang="ts">
  import { Delete } from 'lucide-svelte';

  let { onInput }: { onInput: (value: string) => void } = $props();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'];
</script>

<div class="grid grid-cols-3 gap-3">
  {#each keys as key}
    <button
      type="button"
      class="grid aspect-[1.55] min-h-16 place-items-center rounded-md border border-[#d7c8b4] bg-[#fffaf0] text-3xl font-semibold tabular-nums text-[#211f1a] shadow-sm transition-transform duration-75 ease-out active:scale-[0.97] active:bg-[#ecdcc1] active:shadow-inner dark:border-[#3a342a] dark:bg-[#211f1a] dark:text-[#fff6e8] dark:active:bg-[#2f2a22]"
      aria-label={key === 'back' ? 'Delete digit' : `Add ${key}`}
      onclick={() => onInput(key)}
    >
      {#if key === 'back'}
        <Delete size={30} />
      {:else}
        {key}
      {/if}
    </button>
  {/each}
</div>
