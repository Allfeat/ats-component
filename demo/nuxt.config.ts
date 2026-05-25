import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineNuxtConfig({
  devtools: { enabled: false },

  devServer: {
    port: 3000,
  },

  runtimeConfig: {
    // Server-only (private) — overridden by NUXT_ORGANIZATIONS_URL, NUXT_SECRET_KEY
    // Defaults target the docker-compose dev stack (host ports 13xxx).
    // For native cargo builds of the platform, override via NUXT_ORGANIZATIONS_URL=http://localhost:3008
    organizationsUrl: "http://localhost:13008",
    secretKey:
      "csk_0000000000000000000000000000000000000000000000000000000000000000",

    // Organization integration id — kept around purely for debug logs in
    // the dev console. The widget no longer needs it (every `/v1/works/...`
    // call resolves the org server-side from the JWT). Override via
    // NUXT_ORGANIZATION_ID.
    organizationId: "00000000-0000-0000-0000-000000000000",

    // Public (exposed to client) — overridden by NUXT_PUBLIC_ATS_URL, etc.
    public: {
      atsUrl: "http://localhost:13002",
      siteKey:
        "cpk_cf90a2dfd5a810e4f1450c19a75b4c54e231dcc3c182f5e6765ae5cc175bd390",
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
