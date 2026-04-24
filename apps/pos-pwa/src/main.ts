import './app.css';
import App from './App.svelte';
import { registerSW } from 'virtual:pwa-register';
import { mount } from 'svelte';

registerSW({ immediate: true });

const app = mount(App, {
  target: document.getElementById('app')!
});

export default app;
