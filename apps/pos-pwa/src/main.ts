import './app.css';
import App from './App.svelte';
import { registerSW } from 'virtual:pwa-register';
import { mount } from 'svelte';

let updateServiceWorker: ReturnType<typeof registerSW> | undefined;
updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateServiceWorker?.(true);
  }
});

const app = mount(App, {
  target: document.getElementById('app')!
});

export default app;
