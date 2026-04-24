<script lang="ts">
  let { width = 140 }: { width?: number } = $props();
</script>

<div class="flex justify-center py-4 opacity-70">
  <picture>
    <source srcset="/bb-logo.webp" type="image/webp" />
    <img
      src="/bull-bitcoin-banner-logo.png"
      alt="Bull Bitcoin"
      class="bb-banner"
      {width}
      height={Math.round(width / 4)}
    />
  </picture>
</div>

<style>
  @media (prefers-color-scheme: dark) {
    .bb-banner {
      filter: invert(1) hue-rotate(180deg);
    }
  }
</style>
