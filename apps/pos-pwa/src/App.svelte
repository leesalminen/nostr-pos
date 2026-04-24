<script lang="ts">
  import Router from 'svelte-spa-router';
  import KeypadRoute from './routes/Keypad.svelte';
  import PosRoute from './routes/Pos.svelte';
  import ActivateRoute from './routes/Activate.svelte';
  import ReceiptRoute from './routes/Receipt.svelte';
  import SettingsRoute from './routes/Settings.svelte';
  import TransactionsRoute from './routes/Transactions.svelte';
  import AdvancedRoute from './routes/settings/advanced/SettingsAdvanced.svelte';

  const routes = {
    '/': KeypadRoute,
    '/pos/:link': PosRoute,
    '/activate': ActivateRoute,
    '/receipt/:saleId': ReceiptRoute,
    '/transactions': TransactionsRoute,
    '/settings': SettingsRoute,
    '/settings/advanced': AdvancedRoute
  };
</script>

<Router {routes} />
