<script lang="ts">
  let { width = 140 }: { width?: number } = $props();
</script>

<div class="flex justify-center py-4">
  <a
    href="https://bullbitcoin.com"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Bull Bitcoin"
    class="inline-block transition hover:opacity-80"
  >
    <img
      src="/bb-logo-light.png"
      alt="Bull Bitcoin"
      class="bb-banner block dark:hidden"
      {width}
    />
    <img
      src="/bb-logo-dark.png"
      alt="Bull Bitcoin"
      class="bb-banner hidden dark:block"
      {width}
    />
  </a>
</div>

<style>
  .bb-banner {
    height: auto;
  }
</style>
