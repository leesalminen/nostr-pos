import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{svelte,ts}'],
  theme: {
    extend: {
      borderRadius: {
        md: '8px'
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      letterSpacing: {
        display: '0.03em'
      }
    }
  },
  plugins: []
} satisfies Config;
