<script lang="ts">
  let { width = 140 }: { width?: number } = $props();
</script>

<div class="flex justify-center py-4 opacity-70 dark:invert">
  <picture>
    <source srcset="/bb-logo.webp" type="image/webp" />
    <img src="/bull-bitcoin-banner-logo.png" alt="Bull Bitcoin" {width} height={Math.round(width / 4)} />
  </picture>
</div>
