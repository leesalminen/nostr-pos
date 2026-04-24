import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  build: {
    target: 'esnext'
  },
  plugins: [
    wasm(),
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024
      },
      manifest: {
        name: 'Retail POS',
        short_name: 'POS',
        description: 'Backendless retail terminal for Liquid and Lightning payments.',
        theme_color: '#f5f0e8',
        background_color: '#f5f0e8',
        display: 'standalone',
        start_url: '/#/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
