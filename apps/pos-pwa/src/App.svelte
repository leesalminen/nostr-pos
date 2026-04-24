<script lang="ts">
  import Router from 'svelte-spa-router';
  import { wrap } from 'svelte-spa-router/wrap';

  const routes = {
    '/': wrap({ asyncComponent: () => import('./routes/Keypad.svelte') }),
    '/pos/:saleId': wrap({ asyncComponent: () => import('./routes/Pos.svelte') }),
    '/activate': wrap({ asyncComponent: () => import('./routes/Activate.svelte') }),
    '/receipt/:saleId': wrap({ asyncComponent: () => import('./routes/Receipt.svelte') }),
    '/transactions': wrap({ asyncComponent: () => import('./routes/Transactions.svelte') }),
    '/settings': wrap({ asyncComponent: () => import('./routes/Settings.svelte') }),
    '/settings/advanced': wrap({ asyncComponent: () => import('./routes/settings/advanced/SettingsAdvanced.svelte') })
  };
</script>

<Router {routes} />
