<script lang="ts">
  let { size = 48, label }: { size?: number; label?: string } = $props();
</script>

<div class="inline-flex flex-col items-center gap-3">
  <object
    type="image/svg+xml"
    data="/bb-logo.svg"
    aria-label="Loading"
    style={`width:${size}px;height:${size}px`}
    class="pointer-events-none select-none dark:invert"
  ></object>
  {#if label}
    <p class="font-display text-sm uppercase tracking-[0.12em] text-[#776b5a] dark:text-[#b9aa91]">{label}</p>
  {/if}
</div>
