<script setup lang="ts">
// Public config from runtimeConfig — secrets stay server-side in the BFF
const { atsUrl, siteKey, network } = useRuntimeConfig().public;

const activeMode = ref<'register' | 'update' | 'access'>('register');
const loading = ref(true);
const widgetRef = ref<HTMLElement | null>(null);

async function requestToken(mode: 'register' | 'update' | 'access') {
  let actionType: string;
  if (mode === 'update') actionType = 'update_version';
  else if (mode === 'access') actionType = 'access';
  else actionType = 'register';

  const res = await $fetch<{ token: string; expires_in: number; network?: string; max_file_size_bytes?: number }>('/api/token', {
    method: 'POST',
    body: {
      action_type: actionType,
      allowed_network: mode === 'register' ? network : null,
    },
  });

  return res;
}

async function configureWidget(mode: 'register' | 'update' | 'access') {
  const widget = widgetRef.value as any;
  if (!widget) return;

  loading.value = true;

  try {
    const { token, network, max_file_size_bytes } = await requestToken(mode);

    widget.setAttribute('ats-url', atsUrl);
    widget.setAttribute('site-key', siteKey);
    widget.setAttribute('mode', mode);
    if (network) {
      widget.setAttribute('network', network);
    }
    if (max_file_size_bytes != null) {
      widget.setAttribute('max-file-size', String(max_file_size_bytes));
    } else {
      widget.removeAttribute('max-file-size');
    }

    widget.setToken(token);
    console.log(`[MusicDash] Widget initialized in ${mode} mode`);
  } catch (err: any) {
    const msg = err?.data?.message || err?.data?.statusMessage || err?.message || String(err);
    console.error('[MusicDash] Failed to get token:', msg);
  } finally {
    loading.value = false;
  }
}

function switchMode(mode: 'register' | 'update' | 'access') {
  if (mode === activeMode.value && !loading.value) return;
  activeMode.value = mode;
  const widget = widgetRef.value as any;
  if (widget?.reset) widget.reset();
  configureWidget(mode);
}

onMounted(() => {
  const widget = widgetRef.value;
  if (!widget) return;

  // Token expired -> auto-refresh silently
  widget.addEventListener('allfeat:token-expired', async () => {
    console.log('[MusicDash] Token expired, refreshing...');
    try {
      const { token, max_file_size_bytes } = await requestToken(activeMode.value);
      if (max_file_size_bytes != null) {
        (widget as any).setAttribute('max-file-size', String(max_file_size_bytes));
      }
      (widget as any).setToken(token);
      console.log('[MusicDash] Token refreshed');
    } catch (err: any) {
      console.error('[MusicDash] Token refresh failed:', err);
    }
  });

  // Completion
  widget.addEventListener('allfeat:complete', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    console.log('[MusicDash] Work protected!', detail);
  });

  // Errors
  widget.addEventListener('allfeat:failed', (e: Event) => {
    console.error('[MusicDash] Failed:', (e as CustomEvent).detail);
  });

  // Initialize with default mode
  configureWidget(activeMode.value);
});

useHead({
  title: 'Register Your Work - MusicDash',
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
  ],
});
</script>

<template>
  <div class="musicdash">
    <!-- Header -->
    <header class="site-header">
      <div class="header-container">
        <a href="https://www.musicdash.com/" class="logo">
          <img
            src="https://www.musicdash.com/_next/image?url=%2Fassets%2Flogo-black.png&w=1920&q=75"
            alt="MusicDash"
          >
        </a>
        <nav class="header-nav">
          <a href="https://www.musicdash.com/">Home</a>
          <a href="https://www.musicdash.com/about">About</a>
          <a href="https://www.musicdash.com/guides">Guides</a>
        </nav>
        <a href="https://www.musicdash.com/register" class="cta-button">Get Started</a>
      </div>
    </header>

    <!-- Main -->
    <main class="main-content">
      <div class="page-container">
        <div class="page-header">
          <h1 class="page-title">Register Your Work</h1>
          <p class="page-subtitle">
            Protect your creative work on the blockchain with timestamped proof of ownership
          </p>

          <!-- Mode switcher -->
          <div class="mode-switcher">
            <button
              :class="['mode-btn', { active: activeMode === 'register' }]"
              @click="switchMode('register')"
            >
              Register
            </button>
            <button
              :class="['mode-btn', { active: activeMode === 'update' }]"
              @click="switchMode('update')"
            >
              Update
            </button>
            <button
              :class="['mode-btn', { active: activeMode === 'access' }]"
              @click="switchMode('access')"
            >
              Access
            </button>
          </div>
        </div>

        <div class="component-card">
          <!-- Loading spinner -->
          <div v-if="loading" class="widget-loading">
            <div class="spinner" />
            <p>Initializing widget...</p>
          </div>

          <ats-widget
            ref="widgetRef"
            :ats-url.attr="atsUrl"
            :mode.attr="activeMode"
            :style="{ display: loading ? 'none' : undefined }"
          />
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="site-footer">
      <div class="footer-container">
        <div class="footer-top">
          <div class="footer-brand">
            <img
              src="https://www.musicdash.com/_next/image?url=%2Fassets%2Flogo-black.png&w=1920&q=75"
              alt="MusicDash"
            >
            <p>
              Empowering musicians with blockchain technology for transparent rights management
              and fair royalties.
            </p>
          </div>
          <div class="footer-links">
            <a href="https://www.musicdash.com/privacy">Privacy Policy</a>
            <a href="https://www.musicdash.com/terms">Terms of Service</a>
            <a href="https://www.musicdash.com/contact">Contact</a>
          </div>
          <div class="footer-social">
            <a href="https://x.com/musicdash" aria-label="X (Twitter)">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="https://instagram.com/musicdash" aria-label="Instagram">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            <a href="https://facebook.com/musicdash" aria-label="Facebook">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
            <a href="https://youtube.com/musicdash" aria-label="YouTube">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>
          </div>
        </div>
        <div class="footer-bottom">
          <p class="footer-copyright">&copy; MusicDASH&reg; 2024, All rights reserved.</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
:root {
  --md-purple: #7c3aed;
  --md-purple-dark: #5b21b6;
  --md-pink: #ec4899;
  --md-text: #1a1a1a;
  --md-text-light: #6b7280;
  --md-bg: #f8f9fa;
  --md-white: #ffffff;
  --md-footer-bg: #1a1a1a;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--md-bg);
  color: var(--md-text);
  min-height: 100vh;
}

.musicdash {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ========== Header ========== */
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--md-white);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo img {
  height: 40px;
  width: auto;
}

.header-nav {
  display: flex;
  gap: 32px;
}

.header-nav a {
  color: var(--md-text);
  text-decoration: none;
  font-weight: 500;
  font-size: 15px;
  transition: color 0.2s ease;
}

.header-nav a:hover {
  color: var(--md-purple);
}

.cta-button {
  display: inline-block;
  padding: 10px 24px;
  background: linear-gradient(135deg, var(--md-purple), var(--md-pink));
  color: var(--md-white);
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  border-radius: 8px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.cta-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
}

/* ========== Main Content ========== */
.main-content {
  flex: 1;
  padding: 48px 24px 64px;
}

.page-container {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  text-align: center;
  margin-bottom: 40px;
}

.page-title {
  font-size: 36px;
  font-weight: 700;
  color: var(--md-text);
  margin-bottom: 12px;
}

.page-subtitle {
  font-size: 18px;
  color: var(--md-text-light);
  max-width: 500px;
  margin: 0 auto 24px;
}

/* ========== Mode Switcher ========== */
.mode-switcher {
  display: inline-flex;
  gap: 0;
  background: #e5e7eb;
  border-radius: 10px;
  padding: 4px;
}

.mode-btn {
  padding: 8px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  color: var(--md-text-light);
  background: transparent;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  color: var(--md-text);
}

.mode-btn.active {
  background: var(--md-white);
  color: var(--md-purple);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  font-weight: 600;
}

/* ========== Widget Card ========== */
.component-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

ats-widget {
  --ats-primary: #7266ff;
}

.widget-loading {
  text-align: center;
  padding: 48px;
  color: var(--md-text-light);
  font-size: 14px;
}

.widget-loading .spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: var(--md-purple);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ========== Footer ========== */
.site-footer {
  background: var(--md-footer-bg);
  color: var(--md-white);
  padding: 48px 24px 24px;
}

.footer-container {
  max-width: 1200px;
  margin: 0 auto;
}

.footer-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 40px;
  padding-bottom: 32px;
  border-bottom: 1px solid #333;
}

.footer-brand img {
  height: 36px;
  width: auto;
  margin-bottom: 16px;
  filter: brightness(0) invert(1);
}

.footer-brand p {
  color: #9ca3af;
  font-size: 14px;
  max-width: 280px;
  line-height: 1.6;
}

.footer-links {
  display: flex;
  gap: 32px;
}

.footer-links a {
  color: #9ca3af;
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s ease;
}

.footer-links a:hover {
  color: var(--md-white);
}

.footer-social {
  display: flex;
  gap: 16px;
}

.footer-social a {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: #333;
  border-radius: 50%;
  color: #9ca3af;
  transition: background 0.2s ease, color 0.2s ease;
}

.footer-social a:hover {
  background: var(--md-purple);
  color: var(--md-white);
}

.footer-social svg {
  width: 20px;
  height: 20px;
}

.footer-bottom {
  padding-top: 24px;
  text-align: center;
}

.footer-copyright {
  color: #6b7280;
  font-size: 13px;
}

@media (max-width: 768px) {
  .header-nav { display: none; }
  .page-title { font-size: 28px; }
  .page-subtitle { font-size: 16px; }
  .footer-top { flex-direction: column; align-items: center; text-align: center; }
  .footer-brand { display: flex; flex-direction: column; align-items: center; }
  .footer-brand p { text-align: center; }
  .footer-links { flex-wrap: wrap; justify-content: center; }
}
</style>
