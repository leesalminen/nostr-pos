import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{svelte,ts}'],
  theme: {
    extend: {
      borderRadius: {
        md: '8px'
      }
    }
  },
  plugins: []
} satisfies Config;
