<script setup lang="ts">
// Public config from runtimeConfig — secrets stay server-side in the BFF
const { atsUrl, siteKey, network } = useRuntimeConfig().public;

// Hard-coded for the demo. In production, partners derive the user id from their
// authenticated session (e.g. the user's UUID).
const DEMO_EXTERNAL_USER_ID = "usr_demo_abbey_road_001";

type WidgetMode = "register" | "update" | "download";

const activeMode = ref<WidgetMode>("register");
const loading = ref(true);
const widgetRef = ref<HTMLElement | null>(null);
const mobileNavOpen = ref(false);

async function requestToken(mode: WidgetMode) {
  // The mock layer handles the download flow without a real backend token, so we
  // short-circuit here while the BFF doesn't know about `'download'` yet.
  if (mode === "download") {
    return {
      token: "mock-download-token",
      expires_in: 3600,
      network,
      max_file_size_bytes: null as number | null,
    };
  }
  const actionType = mode === "update" ? "update_version" : "register";

  const res = await $fetch<{
    token: string;
    expires_in: number;
    network?: string;
    max_file_size_bytes?: number;
  }>("/api/abbey-road/token", {
    method: "POST",
    body: {
      action_type: actionType,
      allowed_network: network,
    },
  });

  return res;
}

async function configureWidget(mode: WidgetMode) {
  const widget = widgetRef.value as any;
  if (!widget) return;

  loading.value = true;

  try {
    const {
      token,
      network: tokenNetwork,
      max_file_size_bytes,
    } = await requestToken(mode);

    widget.setAttribute("ats-url", atsUrl);
    widget.setAttribute("site-key", siteKey);
    widget.setAttribute("external-user-id", DEMO_EXTERNAL_USER_ID);
    if (tokenNetwork) widget.setAttribute("network", tokenNetwork);

    if (max_file_size_bytes != null) {
      widget.setAttribute("max-file-size", String(max_file_size_bytes));
    } else {
      widget.removeAttribute("max-file-size");
    }

    // Set token BEFORE the mode attribute so any mode-triggered side effects
    // (e.g. listUserWorks for update/download) have an authenticated client.
    widget.setToken(token);
    widget.setAttribute("mode", mode);

    console.log(`[Abbey Road] Widget initialized in ${mode} mode`);
  } catch (err: any) {
    const msg =
      err?.data?.message ||
      err?.data?.statusMessage ||
      err?.message ||
      String(err);
    console.error("[Abbey Road] Failed to get token:", msg);
  } finally {
    loading.value = false;
  }
}

function switchMode(mode: WidgetMode) {
  if (mode === activeMode.value && !loading.value) return;
  activeMode.value = mode;
  configureWidget(mode);
}

onMounted(() => {
  const widget = widgetRef.value;
  if (!widget) return;

  // Token expired -> auto-refresh silently for the currently active mode.
  widget.addEventListener("allfeat:token-expired", async () => {
    console.log("[Abbey Road] Token expired, refreshing...");
    try {
      const { token, max_file_size_bytes } = await requestToken(
        activeMode.value,
      );
      if (max_file_size_bytes != null) {
        widget.setAttribute("max-file-size", String(max_file_size_bytes));
      }
      (widget as any).setToken(token);
      console.log("[Abbey Road] Token refreshed");
    } catch (err: any) {
      console.error("[Abbey Road] Token refresh failed:", err);
    }
  });

  widget.addEventListener("allfeat:complete", (e: Event) => {
    console.log("[Abbey Road] Work registered!", (e as CustomEvent).detail);
  });

  widget.addEventListener("allfeat:download-complete", (e: Event) => {
    console.log("[Abbey Road] Download started:", (e as CustomEvent).detail);
  });
  widget.addEventListener("allfeat:download-failed", (e: Event) => {
    console.error("[Abbey Road] Download failed:", (e as CustomEvent).detail);
  });

  widget.addEventListener("allfeat:failed", (e: Event) => {
    console.error("[Abbey Road] Failed:", (e as CustomEvent).detail);
  });

  // Initialize with the default mode.
  configureWidget(activeMode.value);
});

useHead({
  title: "Manage Your Works — Abbey Road Studios",
  link: [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=Roboto:wght@400;500;700&display=swap",
    },
  ],
});
</script>

<template>
  <div class="abbey-road">
    <!-- ===== Header — clone of abbeyroad.com ===== -->
    <header class="ar-header">
      <div class="ar-header-inner">
        <a
          href="https://www.abbeyroad.com/"
          target="_blank"
          rel="noopener noreferrer"
          class="ar-logo"
          aria-label="Abbey Road Studios — visit abbeyroad.com"
        >
          <img src="/brand/abbey-road-logo.png" alt="Abbey Road Studios" />
        </a>

        <!-- Decorative navigation — links are intentionally inert (@click.prevent
             on the <nav> neutralises every anchor inside). -->
        <nav class="ar-nav" aria-label="Primary" @click.prevent>
          <ul>
            <li class="ar-nav-item">
              <a href="#">Studio Services</a>
              <div class="ar-submenu ar-submenu--mega">
                <ul class="ar-submenu-cols">
                  <li>
                    <ul>
                      <li class="ar-submenu-head"><span>RECORDING &amp; MIXING</span></li>
                      <li><a href="#">The Studios</a></li>
                      <li><a href="#">Studio One</a></li>
                      <li><a href="#">Studio Two</a></li>
                      <li><a href="#">Studio Three</a></li>
                      <li><a href="#">The Penthouse</a></li>
                      <li><a href="#">The Gatehouse</a></li>
                      <li><a href="#">The Front Room</a></li>
                      <li><a href="#">Angel Studios</a></li>
                      <li><a href="#">The Mix Stage</a></li>
                      <li><a href="#">Abbey Road Gear</a></li>
                      <li><a href="#">Technical Services</a></li>
                      <li><a href="#">Filming &amp; Live Streaming</a></li>
                    </ul>
                  </li>
                  <li>
                    <ul>
                      <li class="ar-submenu-head"><span>MASTERING</span></li>
                      <li><a href="#">Remote Mastering</a></li>
                      <li><a href="#">Mastering</a></li>
                      <li><a href="#">Stem Mastering</a></li>
                      <li><a href="#">Dolby Atmos Mastering</a></li>
                      <li><a href="#">Transfer &amp; Archive</a></li>
                    </ul>
                  </li>
                </ul>
              </div>
            </li>
            <li class="ar-nav-item">
              <a href="#">Remote Studio</a>
              <div class="ar-submenu">
                <ul>
                  <li><a href="#">Remote Mastering</a></li>
                  <li><a href="#">Remote Mixing</a></li>
                  <li><a href="#">Plugins, Samples And Hardware</a></li>
                  <li><a href="#">Audiomovers</a></li>
                  <li><a href="#">Production Hub</a></li>
                </ul>
              </div>
            </li>
            <li class="ar-nav-item">
              <a href="#">REDD</a>
              <div class="ar-submenu">
                <ul>
                  <li><a href="#">REDD</a></li>
                  <li><a href="#">The Incubator</a></li>
                  <li><a href="#">Spatial Audio</a></li>
                </ul>
              </div>
            </li>
            <li class="ar-nav-item"><a href="#">Institute</a></li>
            <li class="ar-nav-item"><a href="#">Shop</a></li>
            <li class="ar-nav-item">
              <a href="#">About</a>
              <div class="ar-submenu">
                <ul>
                  <li><a href="#">Our Story</a></li>
                  <li><a href="#">Visit</a></li>
                  <li><a href="#">News</a></li>
                  <li><a href="#">Giles Martin</a></li>
                  <li><a href="#">The Team</a></li>
                  <li><a href="#">Kid Harpoon</a></li>
                  <li><a href="#">Jordan Rakei</a></li>
                  <li><a href="#">Music Photography Awards</a></li>
                </ul>
              </div>
            </li>
            <li class="ar-nav-search">
              <form @submit.prevent>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input type="search" placeholder="Search" aria-label="Search" />
              </form>
            </li>
          </ul>
        </nav>

        <button
          type="button"
          class="ar-burger"
          :aria-expanded="mobileNavOpen"
          aria-label="Menu"
          @click="mobileNavOpen = !mobileNavOpen"
        >
          <span /><span /><span />
        </button>
      </div>

      <!-- Mobile menu -->
      <nav
        v-show="mobileNavOpen"
        class="ar-mobile-nav"
        aria-label="Primary"
        @click.prevent
      >
        <a href="#">Studio Services</a>
        <a href="#">Remote Studio</a>
        <a href="#">REDD</a>
        <a href="#">Institute</a>
        <a href="#">Shop</a>
        <a href="#">About</a>
      </nav>
    </header>

    <!-- ===== Main ===== -->
    <main class="main-content">
      <div class="page-container">
        <div class="page-header">
          <h1 class="page-title">Manage Your Works</h1>
          <p class="page-subtitle">
            Protect new works, update existing ones, or download your assets
            and certificates
          </p>

          <!-- Mode switcher -->
          <div class="mode-switcher">
            <button
              :class="['mode-btn', { active: activeMode === 'register' }]"
              @click="switchMode('register')"
            >
              Protect
            </button>
            <button
              :class="['mode-btn', { active: activeMode === 'update' }]"
              @click="switchMode('update')"
            >
              Update
            </button>
            <button
              :class="['mode-btn', { active: activeMode === 'download' }]"
              @click="switchMode('download')"
            >
              My Works
            </button>
          </div>
        </div>

        <div class="component-card">
          <!-- Loading spinner while fetching a mode-specific token -->
          <div v-if="loading" class="widget-loading">
            <div class="spinner" />
            <p>Initializing widget...</p>
          </div>

          <!-- Toggle the wrapper, not the widget: <ats-widget> mutates its own
               inline style (--ats-* vars) on connect, which trips Vue hydration. -->
          <div v-show="!loading" class="widget-host">
            <ats-widget ref="widgetRef" :ats-url.attr="atsUrl" />
          </div>
        </div>

        <p class="powered-by">
          Secured by
          <a
            href="https://allfeat.com"
            target="_blank"
            rel="noopener noreferrer"
            >Allfeat</a
          >
          — an open music blockchain.
        </p>
      </div>
    </main>

    <!-- ===== Footer — clone of abbeyroad.com ===== -->
    <footer class="ar-footer">
      <div class="ar-footer-inner">
        <div class="ar-footer-row">
          <div class="ar-footer-left">
            <a
              href="https://www.abbeyroad.com/"
              target="_blank"
              rel="noopener noreferrer"
              class="ar-footer-logo"
              aria-label="Abbey Road Studios — visit abbeyroad.com"
            >
              <img src="/brand/abbey-road-logo.png" alt="Abbey Road Studios" />
            </a>
            <div class="ar-newsletter" @click.prevent>
              <p>
                Sign up for the latest production advice, insights and 'how to'
                content for artists and producers from Abbey Road Studios.
              </p>
              <a href="#">Sign up now</a>
            </div>
          </div>

          <div class="ar-footer-right" @click.prevent>
            <div class="ar-footer-social">
              <label>Follow us on:</label>
              <ul>
                <li>
                  <a href="#" aria-label="X (Twitter)">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                      />
                    </svg>
                  </a>
                </li>
                <li>
                  <a href="#" aria-label="Facebook">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                      />
                    </svg>
                  </a>
                </li>
                <li>
                  <a href="#" aria-label="Instagram">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
                      />
                    </svg>
                  </a>
                </li>
                <li>
                  <a href="#" aria-label="YouTube">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
                      />
                    </svg>
                  </a>
                </li>
              </ul>
            </div>
            <ul class="ar-footer-menu">
              <li><a href="#">News</a></li>
              <li><a href="#">Our Story</a></li>
              <li><a href="#">Visit</a></li>
              <li><a href="#">Music Photography Awards</a></li>
              <li><a href="#">Event Hire</a></li>
              <li><a href="#">Audiomovers</a></li>
              <li><a href="#">Partners</a></li>
              <li><a href="#">Terms Of Use</a></li>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Press</a></li>
              <li><a href="#">FAQ</a></li>
              <li><a href="#">Site Map</a></li>
              <li><a href="#">For US: Do not sell my personal Info</a></li>
            </ul>
          </div>
        </div>

        <div class="ar-footer-bottom">
          <p class="ar-footer-address">
            Abbey Road Studios | 3 Abbey Road | St. John's Wood London NW8 9AY
            | tel: +44 (0)20 7266 7000<br />
            Abbey Road Studios, a business name of Virgin Records Limited.
            Registered in England no. 01070953.<br />
            Registered office: 4 Pancras Square, Kings Cross, London N1C 4AG
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
/* Abbey Road Studios' own typefaces (mirrors abbeyroad.com/Content/site.min.css):
   TT-Fors for the brand voice, Maison Neue Mono for nav/footer running text. */
@font-face {
  font-family: "TT-Fors";
  src: url("/fonts/TT-Fors-Regular.otf") format("opentype");
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "TT-Fors";
  src: url("/fonts/TT-Fors-DemiBold.otf") format("opentype");
  font-weight: 600;
  font-display: swap;
}
@font-face {
  font-family: "TT-Fors";
  src: url("/fonts/TT-Fors-Bold.otf") format("opentype");
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: "Maison Neue Mono";
  src: url("/fonts/maison-neue-mono.otf") format("opentype");
  font-display: swap;
}

:root {
  --ar-bg: #d3cdc3;
  --ar-surface: #ffffff;
  --ar-ink: #231f20;
  --ar-ink-soft: #5a5854;
  --ar-teal: #4fcdde;
  --ar-teal-deep: #0e6e7d;
  --ar-line: rgba(0, 0, 0, 0.12);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: "TT-Fors", Heebo, sans-serif;
  background: var(--ar-bg);
  color: var(--ar-ink);
  min-height: 100vh;
}

.abbey-road {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--ar-bg);
}

/* ========== Header (abbeyroad.com clone) ========== */
.ar-header {
  background: var(--ar-bg);
}

.ar-header-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.ar-logo {
  display: block;
  flex-shrink: 0;
  line-height: 0;
}

.ar-logo img {
  height: 40px;
  width: auto;
  display: block;
}

.ar-nav > ul {
  display: flex;
  align-items: center;
  list-style: none;
}

.ar-nav-item {
  position: relative;
  padding: 17px 0 17px 25px;
}

.ar-nav-item > a {
  font-family: "Maison Neue Mono", Heebo, sans-serif;
  font-size: 16px;
  color: #231f20;
  text-decoration: none;
  padding-bottom: 5px;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}

.ar-nav-item:hover > a {
  border-bottom-color: #000;
}

/* Dropdown — beige panel, revealed on hover */
.ar-submenu {
  position: absolute;
  top: 100%;
  left: 10px;
  display: none;
  min-width: 200px;
  background: #d3cdc3;
  box-shadow: 0 9px 68px 0 rgba(0, 0, 0, 0.4);
  padding: 26px 30px;
  z-index: 1000;
  color: #231f20;
  line-height: 1.88;
  white-space: nowrap;
}

.ar-nav-item:hover .ar-submenu {
  display: block;
}

.ar-submenu ul {
  list-style: none;
}

.ar-submenu li {
  padding-right: 20px;
}

.ar-submenu a,
.ar-submenu-head span {
  display: block;
  color: #231f20;
  font-size: 14px;
  text-decoration: none;
}

.ar-submenu a:hover {
  text-decoration: underline;
}

.ar-submenu-head span {
  font-weight: 700;
}

.ar-submenu--mega .ar-submenu-cols {
  display: flex;
  gap: 48px;
}

/* Search field */
.ar-nav-search {
  padding-left: 25px;
}

.ar-nav-search form {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ar-nav-search svg {
  width: 16px;
  height: 16px;
  color: #0b282e;
  flex-shrink: 0;
}

.ar-nav-search input {
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  background: transparent;
  color: #0b282e;
  font-family: "Maison Neue Mono", Heebo, sans-serif;
  font-size: 16px;
  width: 110px;
  padding: 6px 2px;
  outline: none;
  transition: width 0.2s linear;
}

.ar-nav-search input:focus {
  width: 140px;
}

.ar-nav-search input::-webkit-search-cancel-button {
  display: none;
}

/* Mobile hamburger */
.ar-burger {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 42px;
  height: 42px;
  padding: 9px;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.ar-burger span {
  display: block;
  height: 2px;
  background: #231f20;
  border-radius: 2px;
}

.ar-mobile-nav {
  display: none;
  flex-direction: column;
  padding: 4px 32px 20px;
}

.ar-mobile-nav a {
  font-family: "Maison Neue Mono", Heebo, sans-serif;
  font-size: 15px;
  color: #231f20;
  text-decoration: none;
  padding: 13px 0;
  border-bottom: 1px solid var(--ar-line);
}

/* ========== Main ========== */
.main-content {
  flex: 1;
  padding: 56px 24px 64px;
}

.page-container {
  max-width: 720px;
  margin: 0 auto;
}

.page-header {
  text-align: center;
  margin-bottom: 36px;
}

.page-title {
  font-family: "TT-Fors", Heebo, sans-serif;
  font-size: 42px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.5px;
  color: var(--ar-ink);
  margin-bottom: 14px;
}

.page-subtitle {
  font-size: 16px;
  line-height: 1.6;
  color: var(--ar-ink-soft);
  max-width: 520px;
  margin: 0 auto 28px;
}

/* ========== Mode Switcher ========== */
.mode-switcher {
  display: inline-flex;
  gap: 4px;
  background: var(--ar-surface);
  border: 1px solid var(--ar-line);
  border-radius: 30px;
  padding: 5px;
}

.mode-btn {
  font-family: "TT-Fors", Heebo, sans-serif;
  padding: 9px 22px;
  border: none;
  border-radius: 30px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--ar-ink);
  background: transparent;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.mode-btn:hover {
  color: var(--ar-teal-deep);
}

.mode-btn.active,
.mode-btn.active:hover {
  background: var(--ar-ink);
  color: #fff;
}

/* ========== Widget Card ========== */
.component-card {
  background: var(--ar-surface);
  border: 1px solid var(--ar-line);
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

ats-widget {
  display: block;

  /* Brand accent — Abbey Road teal, matching the logo chevron */
  --ats-primary: #4fcdde;
  --ats-primary-hover: #38b9cc;
  --ats-primary-light: #e7f8fb;

  /* Editorial near-black text on warm neutrals */
  --ats-text: #111111;
  --ats-text-secondary: #5a5854;
  --ats-text-muted: #7a786f;
  --ats-background: #ffffff;
  --ats-background-secondary: #f5f4f1;
  --ats-border: #e3e1da;

  --ats-radius: 6px;
  --ats-radius-lg: 10px;
  --ats-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  --ats-shadow-lg: 0 6px 24px rgba(0, 0, 0, 0.1);

  --ats-font-family:
    "Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.widget-loading {
  text-align: center;
  padding: 64px 24px;
  color: var(--ar-ink-soft);
  font-size: 14px;
}

.widget-loading .spinner {
  width: 34px;
  height: 34px;
  border: 3px solid #e3e1da;
  border-top-color: var(--ar-teal-deep);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.powered-by {
  text-align: center;
  margin-top: 20px;
  font-size: 13px;
  color: var(--ar-ink-soft);
}

.powered-by a {
  color: var(--ar-teal-deep);
  font-weight: 600;
  text-decoration: none;
}

.powered-by a:hover {
  text-decoration: underline;
}

/* ========== Footer (abbeyroad.com clone) ========== */
.ar-footer {
  background: var(--ar-bg);
  color: #000;
  font-family: "Maison Neue Mono", Heebo, sans-serif;
  padding: 60px 0 20px;
}

.ar-footer-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 16px;
}

.ar-footer a {
  color: #202020;
  text-decoration: none;
}

.ar-footer a:hover {
  color: #000;
}

.ar-footer-row {
  display: flex;
  gap: 40px;
}

.ar-footer-left {
  flex: 0 0 58%;
}

/* abbeyroad.com floats the link menu and the social block side by side inside
   the right column — menu on the left, icons on the far right. */
.ar-footer-right {
  flex: 1;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 56px;
}

.ar-footer-logo {
  display: inline-block;
  line-height: 0;
  margin-bottom: 40px;
}

.ar-footer-logo img {
  height: 40px;
  width: auto;
  display: block;
}

.ar-newsletter p {
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: 20px;
}

.ar-newsletter a {
  display: inline-block;
  background: #000;
  color: #4fcdde;
  border: 2px solid #000;
  line-height: 40px;
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0 20px;
}

.ar-newsletter a:hover {
  color: #e0e0e0;
}

.ar-footer-social {
  order: 2;
  text-align: right;
}

.ar-footer-social label {
  display: block;
  font-size: 16px;
  margin-bottom: 12px;
}

.ar-footer-social ul {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  list-style: none;
}

.ar-footer-social a {
  display: block;
  color: #000;
}

.ar-footer-social svg {
  width: 22px;
  height: 22px;
}

.ar-footer-menu {
  list-style: none;
  text-align: left;
  line-height: 1.6;
}

.ar-footer-menu li {
  white-space: nowrap;
}

.ar-footer-menu a {
  font-size: 16px;
}

.ar-footer-bottom {
  margin-top: 40px;
  text-align: right;
}

.ar-footer-address {
  font-size: 12px;
  line-height: 1.5;
  color: #000;
}

/* ========== Responsive ========== */
@media (max-width: 1024px) {
  .ar-nav {
    display: none;
  }
  .ar-burger {
    display: flex;
  }
  .ar-mobile-nav {
    display: flex;
  }
}

@media (max-width: 768px) {
  .ar-footer-row {
    flex-direction: column;
    gap: 44px;
  }
  .ar-footer-left,
  .ar-footer-right {
    flex: none;
    width: 100%;
  }
  .ar-footer-right {
    flex-direction: column;
    align-items: flex-start;
    gap: 30px;
  }
  .ar-footer-social {
    order: 0;
  }
  .ar-footer-social,
  .ar-footer-menu,
  .ar-footer-bottom {
    text-align: left;
  }
  .ar-footer-social ul {
    justify-content: flex-start;
  }
}

@media (max-width: 600px) {
  .ar-header-inner {
    padding: 6px 18px;
  }
  .ar-mobile-nav {
    padding: 4px 18px 20px;
  }
  .ar-footer-inner {
    padding: 0 18px;
  }
  .main-content {
    padding: 44px 18px 56px;
  }
  .page-title {
    font-size: 32px;
  }
  .page-subtitle {
    font-size: 15px;
  }
  .mode-switcher {
    display: flex;
    width: 100%;
  }
  .mode-btn {
    flex: 1;
    padding: 9px 6px;
    font-size: 12px;
    white-space: nowrap;
  }
}
</style>
