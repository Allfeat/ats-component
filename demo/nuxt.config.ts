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

    // B2B organization API key + id — used server-side by the ATS proxy route
    // (/api/ats-proxy) to reach the user-scoped works endpoints. This key is a
    // secret and is never exposed to the browser. Override via
    // NUXT_ATS_API_KEY / NUXT_ORGANIZATION_ID.
    atsApiKey: "afo_sk_live_000000000000000000000000000000000000000000000000",
    organizationId: "00000000-0000-0000-0000-000000000000",
    // ATS base URL for *server-side* calls from the proxy route. Left empty so
    // the proxy falls back to public.atsUrl: a non-empty default here would be
    // truthy and silently disable that `||` fallback. Override via
    // NUXT_ATS_API_URL only when the server must reach the ATS at a different
    // address than the browser (e.g. inside Docker, where the host is
    // host.docker.internal, not localhost).
    atsApiUrl: "",

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
