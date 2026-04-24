<script lang="ts">
  let { servers }: { servers: string[] } = $props();
</script>

<div class="rounded-md border border-[#d7c8b4] bg-[#fffaf0] p-4 dark:border-[#3a342a] dark:bg-[#211f1a]">
  <h2 class="text-lg font-black">Sync servers</h2>
  <div class="mt-3 space-y-2">
    {#each servers as server}
      <div class="flex items-center justify-between gap-3 rounded-md bg-[#f4eadc] px-3 py-2 text-sm dark:bg-[#2c2922]">
        <span class="break-all">{server}</span>
        <span class="font-bold text-[#1f513a]">healthy</span>
      </div>
    {/each}
  </div>
</div>
