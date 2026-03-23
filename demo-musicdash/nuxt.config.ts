import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineNuxtConfig({
  devtools: { enabled: false },

  devServer: {
    port: 3001,
  },

  runtimeConfig: {
    // Server-only (private) — overridden by NUXT_ORGANIZATIONS_URL, NUXT_SECRET_KEY
    organizationsUrl: "http://localhost:13008",
    secretKey:
      "csk_0000000000000000000000000000000000000000000000000000000000000000",

    // Public (exposed to client) — overridden by NUXT_PUBLIC_ATS_URL, etc.
    public: {
      atsUrl: "http://localhost:13002",
      siteKey:
        "cpk_0000000000000000000000000000000000000000000000000000000000000000",
      network: "mainnet",
    },
  },

  vue: {
    compilerOptions: {
      isCustomElement: (tag) => tag === "ats-widget",
    },
  },

  app: {
    head: {
      script: [{ src: "/component/ats-widget.iife.js", defer: true }],
    },
  },

  // Serve the built component from ../dist/ at /component/
  nitro: {
    publicAssets: [
      {
        dir: resolve(__dirname, "../dist"),
        baseURL: "/component",
        maxAge: 0,
      },
    ],
  },

  compatibilityDate: "2025-01-01",
});
