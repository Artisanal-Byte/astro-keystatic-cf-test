import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import vue from '@astrojs/vue';
import keystatic from '@keystatic/astro';

export default defineConfig({
  output: 'static',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [vue(), keystatic()],
  vite: {
    // Keystatic + Cloudflare benefit from nodejs_compat-style polyfills.
    // The adapter sets this in wrangler.jsonc; here we only ensure ESM externals.
    optimizeDeps: { exclude: ['@keystatic/core'] },
  },
});
