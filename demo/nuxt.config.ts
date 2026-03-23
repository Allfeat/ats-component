import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineNuxtConfig({
  devtools: { enabled: false },

  devServer: {
    port: 3000,
  },

  vue: {
    compilerOptions: {
      isCustomElement: (tag) => tag === 'ats-widget',
    },
  },

  app: {
    head: {
      script: [
        { src: '/component/ats-widget.iife.js', defer: true },
      ],
    },
  },

  // Serve the built component from ../dist/ at /component/
  nitro: {
    publicAssets: [
      {
        dir: resolve(__dirname, '../dist'),
        baseURL: '/component',
        maxAge: 0,
      },
    ],
  },

  compatibilityDate: '2025-01-01',
});
