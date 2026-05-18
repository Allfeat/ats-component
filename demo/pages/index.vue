<script setup lang="ts">
// --------------- Config state ---------------
const config = reactive({
  organizationsUrl: "http://localhost:13008",
  siteKey:
    "cpk_cf90a2dfd5a810e4f1450c19a75b4c54e231dcc3c182f5e6765ae5cc175bd390",
  secretKey:
    "csk_0000000000000000000000000000000000000000000000000000000000000000",
  atsUrl: "http://localhost:13002",
  network: "testnet",
  allowedAtsId: "",
  mode: "register" as "register" | "update" | "download",
  externalUserId: "",
  primaryColor: "#4DB8A8",
  radius: "8px",
  font: "",
});

// --------------- Status bar ---------------
const statusType = ref<"idle" | "ok" | "warn" | "err">("idle");
const statusText = ref('Not initialized — click "Initialize" to start');

function setStatus(type: typeof statusType.value, text: string) {
  statusType.value = type;
  statusText.value = text;
}

// --------------- Event log ---------------
interface EventEntry {
  id: number;
  name: string;
  sourceClass: string;
  time: string;
  data: unknown;
}

const events = ref<EventEntry[]>([]);
let eventCounter = 0;

function logEvent(name: string, data: unknown) {
  const time = new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
  let sourceClass = "";
  if (name.startsWith("ats:")) sourceClass = "source-ats";
  else if (name.startsWith("allfeat:")) sourceClass = "source-allfeat";

  events.value.unshift({ id: ++eventCounter, name, sourceClass, time, data });
}

function clearEvents() {
  events.value = [];
  eventCounter = 0;
}

function syntaxHighlightJSON(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  if (!json || json === "{}") return '<span class="json-null">{ }</span>';
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "json-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/true|false/.test(match)) {
        cls = "json-bool";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

// --------------- Token management ---------------
// `register` and the legacy access-code `update` path use a widget session
// token. `download` (and `update` with an external user id) instead reach the
// ATS through the BFF proxy, so they need no token — see `initializeFlow`.
async function requestToken() {
  const actionType = config.mode === "update" ? "update_version" : "register";

  if (!config.organizationsUrl || !config.secretKey) {
    throw new Error("Organizations URL and Secret Key are required");
  }

  const body: Record<string, unknown> = {
    organizations_url: config.organizationsUrl,
    secret_key: config.secretKey,
    action_type: actionType,
    allowed_network: config.mode === "register" ? config.network : null,
  };

  if (config.mode !== "register" && config.allowedAtsId) {
    body.allowed_ats_id = Number(config.allowedAtsId);
  }

  const res = await $fetch<{
    token: string;
    expires_in: number;
    network?: string;
  }>("/api/token", {
    method: "POST",
    body,
  });

  return res;
}

// --------------- Widget ref & actions ---------------
const widgetRef = ref<HTMLElement | null>(null);

async function initializeFlow() {
  const widget = widgetRef.value as any;
  if (!widget) return;

  try {
    widget.setAttribute("ats-url", config.atsUrl);
    widget.setAttribute("site-key", config.siteKey);
    widget.setAttribute("network", config.network);
    // `proxy-url` routes the user-scoped flows (download, and update with an
    // external user id) through the BFF proxy that holds the organization API key.
    widget.setAttribute("proxy-url", "/api/ats-proxy");

    // External user id is shared by update + download flows; remove when empty so the
    // widget falls back to the legacy access-code path for `update`.
    if (config.externalUserId) {
      widget.setAttribute("external-user-id", config.externalUserId);
    } else {
      widget.removeAttribute("external-user-id");
    }

    // Download mode is fully proxy-backed — it carries no widget session token.
    if (config.mode === "download") {
      widget.setAttribute("mode", config.mode);
      setStatus("ok", "Download mode ready — works load via the BFF proxy");
      logEvent("ats:widget-configured", {
        atsUrl: config.atsUrl,
        mode: config.mode,
        ...(config.externalUserId
          ? { externalUserId: config.externalUserId }
          : {}),
      });
      return;
    }

    setStatus("warn", "Requesting token from BFF...");
    logEvent("ats:token-request", { endpoint: "/api/token" });
    const { token, expires_in, network } = await requestToken();
    logEvent("ats:token-received", {
      expires_in,
      network,
      tokenPreview: token.substring(0, 30) + "...",
    });

    if (network) {
      widget.setAttribute("network", network);
    }

    // Set token BEFORE mode so any mode-triggered side effects (listUserWorks) have auth.
    widget.setToken(token);
    widget.setAttribute("mode", config.mode);

    setStatus(
      "ok",
      `Token set (${expires_in}s TTL)${network ? ` — network: ${network}` : ""} — widget ready`,
    );
    const configLog: Record<string, string> = {
      atsUrl: config.atsUrl,
      mode: config.mode,
    };
    if (network) {
      configLog.network = network;
    }
    if (config.externalUserId) {
      configLog.externalUserId = config.externalUserId;
    }
    logEvent("ats:widget-configured", configLog);
  } catch (err: any) {
    const msg =
      err?.data?.message ||
      err?.data?.statusMessage ||
      err?.message ||
      String(err);
    setStatus("err", "Failed to initialize: " + msg);
    logEvent("ats:token-error", { error: msg });
  }
}

async function refreshToken() {
  if (config.mode === "download") {
    setStatus(
      "ok",
      "Download mode is proxy-backed — no session token to refresh",
    );
    return;
  }
  setStatus("warn", "Manual token refresh...");
  logEvent("ats:manual-refresh", {});

  try {
    const { token, expires_in } = await requestToken();
    (widgetRef.value as any)?.setToken(token);
    setStatus("ok", `Token refreshed (${expires_in}s TTL)`);
    logEvent("ats:token-refreshed", { expires_in });
  } catch (err: any) {
    const msg =
      err?.data?.message ||
      err?.data?.statusMessage ||
      err?.message ||
      String(err);
    setStatus("err", "Refresh failed: " + msg);
  }
}

function resetWidget() {
  (widgetRef.value as any)?.reset();
  setStatus("idle", 'Widget reset — click "Initialize" to start again');
  logEvent("ats:widget-reset", {});
}

// --------------- Customization ---------------
function applyCustomization() {
  const widget = widgetRef.value;
  if (!widget) return;

  widget.style.setProperty("--ats-primary", config.primaryColor);
  widget.style.setProperty("--ats-radius", config.radius);
  widget.style.setProperty(
    "--ats-radius-lg",
    `${parseInt(config.radius) + 4}px`,
  );
  if (config.font) {
    widget.style.setProperty("--ats-font-family", config.font);
  } else {
    widget.style.removeProperty("--ats-font-family");
  }
}

function syncColorFromHex(value: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    config.primaryColor = value;
    applyCustomization();
  }
}

watch(() => config.primaryColor, applyCustomization);
watch(() => config.radius, applyCustomization);
watch(() => config.font, applyCustomization);

// --------------- Widget event listeners ---------------
onMounted(() => {
  const widget = widgetRef.value;
  if (!widget) return;

  // Token expired or reset → auto-refresh via BFF
  widget.addEventListener("allfeat:token-expired", async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    logEvent("allfeat:token-expired", detail);
    if (config.mode === "download") {
      // Download mode is proxy-backed and carries no session token.
      return;
    }
    const isReset = detail?.pendingAction === "reset";
    setStatus(
      "warn",
      isReset
        ? "New session — fetching token..."
        : "Token expired — refreshing...",
    );

    try {
      const { token, expires_in } = await requestToken();
      logEvent("ats:token-refreshed", { expires_in });
      (widget as any).setToken(token);
      setStatus(
        "ok",
        isReset
          ? `Token ready (${expires_in}s TTL) — widget reset`
          : `Token refreshed (${expires_in}s TTL) — retry in progress`,
      );
    } catch (err: any) {
      const msg =
        err?.data?.message ||
        err?.data?.statusMessage ||
        err?.message ||
        String(err);
      setStatus("err", "Token refresh failed: " + msg);
      logEvent("ats:refresh-error", { error: msg });
    }
  });

  // Listen to all widget events
  const widgetEvents = [
    "allfeat:ready",
    "allfeat:upload-start",
    "allfeat:upload-progress",
    "allfeat:upload-complete",
    "allfeat:confirmed",
    "allfeat:step",
    "allfeat:complete",
    "allfeat:failed",
    "allfeat:error",
    "allfeat:mode-changed",
    "allfeat:work-selected",
    "allfeat:download-started",
    "allfeat:download-complete",
    "allfeat:download-failed",
  ];

  widgetEvents.forEach((name) => {
    widget.addEventListener(name, (e: Event) => {
      const detail = (e as CustomEvent).detail;
      logEvent(name, detail);

      if (name === "allfeat:complete") {
        const parts = [`ATS ID: ${detail.atsId}`];
        if (detail.accessCode)
          parts.push(`Access Code: ${detail.accessCode.substring(0, 20)}...`);
        setStatus("ok", `Complete! ${parts.join(" | ")}`);
      }
      if (name === "allfeat:failed") {
        setStatus("err", `Failed: ${detail.error}`);
      }
    });
  });
});

// --------------- Tabs ---------------
const activeTab = ref<"client" | "backend" | "custom">("client");
</script>

<template>
  <div class="demo-container">
    <div class="demo-header">
      <h1 class="demo-title">ATS Widget</h1>
      <p class="demo-subtitle">
        Integration demo &mdash; uses the real ATS API
      </p>
    </div>

    <!-- ============ FLOW DIAGRAM ============ -->
    <div class="panel">
      <div class="panel-title">Integration Flow</div>
      <div class="flow-steps">
        <div class="flow-step">
          <div class="flow-step-dot backend">1</div>
          <div class="flow-step-label">Partner backend<br />creates JWT</div>
        </div>
        <div class="flow-arrow">&rarr;</div>
        <div class="flow-step">
          <div class="flow-step-dot client">2</div>
          <div class="flow-step-label">Client page<br />receives token</div>
        </div>
        <div class="flow-arrow">&rarr;</div>
        <div class="flow-step">
          <div class="flow-step-dot client">3</div>
          <div class="flow-step-label">Sets token<br />on widget</div>
        </div>
        <div class="flow-arrow">&rarr;</div>
        <div class="flow-step">
          <div class="flow-step-dot widget">4</div>
          <div class="flow-step-label">Widget calls<br />ATS service</div>
        </div>
        <div class="flow-arrow">&rarr;</div>
        <div class="flow-step">
          <div class="flow-step-dot widget">5</div>
          <div class="flow-step-label">On 401: emits<br />token-expired</div>
        </div>
        <div class="flow-arrow">&rarr;</div>
        <div class="flow-step">
          <div class="flow-step-dot client">6</div>
          <div class="flow-step-label">Client calls<br />setToken()</div>
        </div>
      </div>
    </div>

    <!-- ============ CONFIG ============ -->
    <div class="panel">
      <div class="panel-title">Configuration</div>

      <div class="config-grid">
        <div class="config-section">
          <span class="config-section-label badge badge-backend"
            >Backend (session creation)</span
          >
        </div>
        <div class="config-field full">
          <label>Organizations Service URL</label>
          <input v-model="config.organizationsUrl" type="text" />
        </div>
        <div class="config-field">
          <label>Secret Key</label>
          <input v-model="config.secretKey" type="text" />
        </div>
        <div class="config-field">
          <label>Mode (action_type)</label>
          <select v-model="config.mode">
            <option value="register">register</option>
            <option value="update">update</option>
            <option value="download">download</option>
          </select>
        </div>
        <div v-show="config.mode === 'register'" class="config-field">
          <label>Network (allowed_network)</label>
          <select v-model="config.network">
            <option value="testnet">testnet</option>
            <option value="mainnet">mainnet</option>
          </select>
        </div>
        <div v-show="config.mode === 'update'" class="config-field">
          <label>ATS ID (allowed_ats_id)</label>
          <input
            v-model="config.allowedAtsId"
            type="number"
            placeholder="Optional"
          />
        </div>
        <div class="config-field full">
          <label>External User ID (for update + download)</label>
          <input
            v-model="config.externalUserId"
            type="text"
            placeholder="usr_... (leave empty for legacy access-code update)"
          />
        </div>
        <div class="config-section">
          <span class="config-section-label badge badge-client"
            >Client-side (widget)</span
          >
        </div>
        <div class="config-field full">
          <label>ATS Service URL</label>
          <input v-model="config.atsUrl" type="text" />
        </div>
        <div class="config-field">
          <label>Site Key (x-site-key)</label>
          <input v-model="config.siteKey" type="text" />
        </div>

        <div class="config-section">
          <span class="config-section-label badge badge-widget"
            >Customization</span
          >
        </div>
        <div class="config-field">
          <label>Primary Color</label>
          <div style="display: flex; gap: 8px; align-items: center">
            <input
              v-model="config.primaryColor"
              type="color"
              style="width: 40px; height: 36px; padding: 2px; cursor: pointer"
            />
            <input
              :value="config.primaryColor"
              type="text"
              style="flex: 1"
              @input="
                syncColorFromHex(($event.target as HTMLInputElement).value)
              "
            />
          </div>
        </div>
        <div class="config-field">
          <label>Border Radius</label>
          <select v-model="config.radius">
            <option value="4px">Small (4px)</option>
            <option value="8px">Default (8px)</option>
            <option value="12px">Large (12px)</option>
            <option value="16px">Extra Large (16px)</option>
            <option value="0px">None (0px)</option>
          </select>
        </div>
        <div class="config-field">
          <label>Font Family</label>
          <select v-model="config.font">
            <option value="">System Default</option>
            <option value="'Inter', sans-serif">Inter</option>
            <option value="'Georgia', serif">Georgia (Serif)</option>
            <option value="'Courier New', monospace">
              Courier New (Monospace)
            </option>
          </select>
        </div>
        <div class="config-field full">
          <label>Available CSS Variables</label>
          <div class="css-vars-list">
            <code>--ats-primary</code><br />
            <code>--ats-primary-hover</code><br />
            <code>--ats-primary-light</code><br />
            <code>--ats-text</code><br />
            <code>--ats-text-secondary</code><br />
            <code>--ats-background</code><br />
            <code>--ats-background-secondary</code><br />
            <code>--ats-border</code><br />
            <code>--ats-error</code><br />
            <code>--ats-radius</code><br />
            <code>--ats-radius-lg</code><br />
            <code>--ats-font-family</code><br />
            <code>--ats-shadow</code><br />
            <code>--ats-transition</code><br />
          </div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" @click="initializeFlow">
          1. Initialize (get token + configure widget)
        </button>
        <button class="btn btn-secondary" @click="refreshToken">
          Refresh Token Manually
        </button>
        <button class="btn btn-danger" @click="resetWidget">
          Reset Widget
        </button>
      </div>
    </div>

    <!-- ============ STATUS ============ -->
    <div :class="['status-bar', statusType]">
      <div class="status-dot" />
      <span>{{ statusText }}</span>
    </div>

    <!-- ============ WIDGET ============ -->
    <div class="component-card">
      <ats-widget
        ref="widgetRef"
        :ats-url.attr="config.atsUrl"
        :mode.attr="config.mode"
      />
    </div>

    <!-- ============ EVENT LOG ============ -->
    <div class="panel">
      <div class="panel-title" style="justify-content: space-between">
        <span>
          Event Log
          <span v-if="events.length" class="badge badge-widget">{{
            events.length
          }}</span>
        </span>
        <button class="clear-btn" @click="clearEvents">Clear</button>
      </div>
      <div class="events-log">
        <template v-if="events.length === 0">
          <span style="color: #666">Waiting for events...</span>
        </template>
        <div
          v-for="evt in events"
          :key="evt.id"
          :class="['event-entry', evt.sourceClass]"
        >
          <div class="event-header">
            <span class="event-name">{{ evt.name }}</span>
            <span class="event-time">{{ evt.time }}</span>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="event-data" v-html="syntaxHighlightJSON(evt.data)" />
        </div>
      </div>
    </div>

    <!-- ============ TABS: Code ============ -->
    <div class="panel">
      <div class="tab-bar">
        <button
          :class="{ active: activeTab === 'client' }"
          @click="activeTab = 'client'"
        >
          Client-Side Code
        </button>
        <button
          :class="{ active: activeTab === 'backend' }"
          @click="activeTab = 'backend'"
        >
          Partner Backend Code
        </button>
        <button
          :class="{ active: activeTab === 'custom' }"
          @click="activeTab = 'custom'"
        >
          CSS Customization
        </button>
      </div>

      <!-- Client-side code tab -->
      <div v-show="activeTab === 'client'" class="code-block">
        <pre><span class="comment">// ============================================</span>
<span class="comment">// Partner Client-Side Integration Example</span>
<span class="comment">// ============================================</span>

<span class="comment">// 1. On page load: fetch a JWT from YOUR backend</span>
<span class="comment">// Your backend must include action_type ("register" | "update_version")</span>
<span class="comment">// when calling POST /v1/sessions</span>
<span class="keyword">async function</span> <span class="func">initWidget</span>() {
  <span class="keyword">const</span> res = <span class="keyword">await</span> <span class="func">fetch</span>(<span class="string">'/api/auth/ats-token'</span>, {
    method: <span class="string">'POST'</span>,
    credentials: <span class="string">'include'</span>,  <span class="comment">// send session cookie</span>
  });
  <span class="keyword">const</span> { token, network } = <span class="keyword">await</span> res.<span class="func">json</span>();

  <span class="comment">// 2. Pass the token and network to the widget</span>
  <span class="keyword">const</span> widget = document.<span class="func">querySelector</span>(<span class="string">'ats-widget'</span>);
  <span class="keyword">if</span> (network) widget.<span class="func">setAttribute</span>(<span class="string">'network'</span>, network);
  widget.<span class="func">setToken</span>(token);
}

<span class="comment">// 3. Handle token expiry — widget emits allfeat:token-expired</span>
<span class="keyword">const</span> widget = document.<span class="func">querySelector</span>(<span class="string">'ats-widget'</span>);

widget.<span class="func">addEventListener</span>(<span class="string">'allfeat:token-expired'</span>, <span class="keyword">async</span> (e) => {
  console.<span class="func">log</span>(<span class="string">'Token expired, refreshing...'</span>, e.detail);

  <span class="comment">// Call YOUR backend again to get a fresh JWT</span>
  <span class="keyword">const</span> res = <span class="keyword">await</span> <span class="func">fetch</span>(<span class="string">'/api/auth/ats-token'</span>, {
    method: <span class="string">'POST'</span>,
    credentials: <span class="string">'include'</span>,
  });
  <span class="keyword">const</span> { token } = <span class="keyword">await</span> res.<span class="func">json</span>();

  <span class="comment">// Pass new token — widget auto-retries the failed request</span>
  widget.<span class="func">setToken</span>(token);
});

<span class="comment">// 4. Listen to completion</span>
widget.<span class="func">addEventListener</span>(<span class="string">'allfeat:complete'</span>, (e) => {
  console.<span class="func">log</span>(<span class="string">'Work protected!'</span>, e.detail);
  <span class="comment">// { atsId, txHash, blockNumber, explorerUrl, accessCode? }</span>
});

<span class="comment">// 5. Listen to errors</span>
widget.<span class="func">addEventListener</span>(<span class="string">'allfeat:failed'</span>, (e) => {
  console.<span class="func">error</span>(<span class="string">'Registration failed'</span>, e.detail);
});

<span class="comment">// 6. HTML — minimal setup</span>
<span class="comment">//</span>
<span class="comment">// &lt;ats-widget</span>
<span class="comment">//   ats-url="https://ats-api.allfeat.org"</span>
<span class="comment">//   site-key="cpk_..."</span>
<span class="comment">//   mode="register"</span>
<span class="comment">// &gt;&lt;/ats-widget&gt;</span>
<span class="comment">//</span>
<span class="comment">// Token and network are set dynamically via JS</span>
<span class="comment">// (both come from your backend's session response)</span>
<span class="comment">// site-key is the public key — safe to include in HTML</span>

<span class="func">initWidget</span>();</pre>
      </div>

      <!-- Backend code tab -->
      <div v-show="activeTab === 'backend'" class="code-block">
        <pre><span class="comment">// ============================================</span>
<span class="comment">// Partner Backend — Token endpoint example</span>
<span class="comment">// (Node.js / Express)</span>
<span class="comment">// ============================================</span>

<span class="comment">// Your ATS credentials (from Allfeat dashboard)</span>
<span class="keyword">const</span> ATS_SECRET_KEY = process.env.ATS_SECRET_KEY;

<span class="comment">// POST /api/auth/ats-token</span>
<span class="comment">// Called by your frontend to get a JWT for the widget</span>
app.<span class="func">post</span>(<span class="string">'/api/auth/ats-token'</span>, <span class="keyword">async</span> (req, res) => {
  <span class="comment">// 1. Verify the user is authenticated on YOUR platform</span>
  <span class="keyword">const</span> user = req.session?.user;
  <span class="keyword">if</span> (!user) {
    <span class="keyword">return</span> res.<span class="func">status</span>(401).<span class="func">json</span>({ error: <span class="string">'Unauthorized'</span> });
  }

  <span class="comment">// 2. Call the Allfeat Organizations API to create a session</span>
  <span class="comment">// Only secret_key is sent server-side.</span>
  <span class="comment">// The site_key (cpk_...) is sent by the widget via x-site-key header.</span>
  <span class="keyword">const</span> response = <span class="keyword">await</span> <span class="func">fetch</span>(<span class="string">'https://organizations.allfeat.org/v1/sessions'</span>, {
    method: <span class="string">'POST'</span>,
    headers: {
      <span class="string">'Content-Type'</span>: <span class="string">'application/json'</span>,
    },
    body: JSON.<span class="func">stringify</span>({
      secret_key: ATS_SECRET_KEY,
      action_type: <span class="string">'register'</span>,  <span class="comment">// or 'update_version'</span>
      allowed_network: <span class="string">'testnet'</span>, <span class="comment">// required for 'register'</span>
    }),
  });

  <span class="keyword">const</span> { token, expires_in, network } = <span class="keyword">await</span> response.<span class="func">json</span>();

  <span class="comment">// 3. Return the JWT + network to the frontend</span>
  <span class="comment">// The frontend passes token via setToken() and network via attribute</span>
  res.<span class="func">json</span>({ token, expires_in, network });
});

<span class="comment">// ============================================</span>
<span class="comment">// Key points:</span>
<span class="comment">// - The JWT is short-lived (e.g. 15 min)</span>
<span class="comment">// - The widget handles expiry via allfeat:token-expired</span>
<span class="comment">// - Your frontend calls this endpoint again on expiry</span>
<span class="comment">// - NEVER expose ATS_SECRET_KEY to the frontend</span>
<span class="comment">// - The widget sends site_key (cpk_...) via x-site-key header</span>
<span class="comment">//   to prove it possesses the public key</span>
<span class="comment">// ============================================</span></pre>
      </div>

      <!-- CSS Customization tab -->
      <div v-show="activeTab === 'custom'" class="code-block">
        <pre><span class="comment">/* ============================================</span>
<span class="comment">   CSS Customization Guide</span>
<span class="comment">   ============================================</span>
<span class="comment">   The widget exposes CSS custom properties</span>
<span class="comment">   that you can override from your stylesheet.</span>
<span class="comment">   ============================================ */</span>

<span class="comment">/* --- Basic: just change the primary color --- */</span>
<span class="tag">ats-widget</span> {
  <span class="func">--ats-primary</span>: <span class="string">#7c3aed</span>;
}

<span class="comment">/* --- Full customization example --- */</span>
<span class="tag">ats-widget</span> {
  <span class="comment">/* Brand colors */</span>
  <span class="func">--ats-primary</span>: <span class="string">#7c3aed</span>;
  <span class="func">--ats-primary-hover</span>: <span class="string">#6d28d9</span>;
  <span class="func">--ats-primary-light</span>: <span class="string">#f5f3ff</span>;

  <span class="comment">/* Typography */</span>
  <span class="func">--ats-text</span>: <span class="string">#111827</span>;
  <span class="func">--ats-text-secondary</span>: <span class="string">#6b7280</span>;
  <span class="func">--ats-font-family</span>: <span class="string">'Inter', sans-serif</span>;

  <span class="comment">/* Backgrounds */</span>
  <span class="func">--ats-background</span>: <span class="string">#ffffff</span>;
  <span class="func">--ats-background-secondary</span>: <span class="string">#f9fafb</span>;

  <span class="comment">/* Borders &amp; shapes */</span>
  <span class="func">--ats-border</span>: <span class="string">#e5e7eb</span>;
  <span class="func">--ats-radius</span>: <span class="string">12px</span>;
  <span class="func">--ats-radius-lg</span>: <span class="string">16px</span>;

  <span class="comment">/* Shadows */</span>
  <span class="func">--ats-shadow</span>: <span class="string">0 1px 3px rgba(0,0,0,0.1)</span>;
  <span class="func">--ats-shadow-lg</span>: <span class="string">0 4px 6px rgba(0,0,0,0.1)</span>;

  <span class="comment">/* Status colors */</span>
  <span class="func">--ats-error</span>: <span class="string">#dc2626</span>;
  <span class="func">--ats-error-light</span>: <span class="string">#fef2f2</span>;
  <span class="func">--ats-success</span>: <span class="string">#16a34a</span>;
  <span class="func">--ats-success-light</span>: <span class="string">#f0fdf4</span>;

  <span class="comment">/* Animation speed */</span>
  <span class="func">--ats-transition</span>: <span class="string">150ms ease</span>;
}

<span class="comment">/* --- Dark mode example --- */</span>
<span class="keyword">@media</span> (prefers-color-scheme: dark) {
  <span class="tag">ats-widget</span> {
    <span class="func">--ats-text</span>: <span class="string">#f9fafb</span>;
    <span class="func">--ats-text-secondary</span>: <span class="string">#9ca3af</span>;
    <span class="func">--ats-background</span>: <span class="string">#1f2937</span>;
    <span class="func">--ats-background-secondary</span>: <span class="string">#111827</span>;
    <span class="func">--ats-border</span>: <span class="string">#374151</span>;
  }
}</pre>
      </div>
    </div>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f5f5f5;
  margin: 0;
  padding: 20px;
  min-height: 100vh;
}

.demo-container {
  max-width: 900px;
  margin: 0 auto;
}

.demo-header {
  text-align: center;
  margin-bottom: 32px;
}

.demo-title {
  font-size: 28px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 8px;
}

.demo-subtitle {
  font-size: 16px;
  color: #666;
  margin: 0;
}

/* ---- Panels ---- */
.panel {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-title .badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-backend {
  background: #dbeafe;
  color: #1d4ed8;
}
.badge-client {
  background: #dcfce7;
  color: #166534;
}
.badge-widget {
  background: #fef3c7;
  color: #92400e;
}

/* ---- Config form ---- */
.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.config-grid .full {
  grid-column: 1 / -1;
}

.config-section {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
}

.config-section:first-child {
  margin-top: 0;
}

.config-section-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.config-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 4px;
}

.config-field input,
.config-field select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
}

.config-field input[type="text"] {
  font-family: monospace;
}

.css-vars-list {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.8;
  columns: 2;
  column-gap: 16px;
}

.btn-row {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.btn-primary {
  background: #4db8a8;
  color: white;
}
.btn-primary:hover {
  background: #3da89a;
}
.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}
.btn-secondary:hover {
  background: #d1d5db;
}
.btn-danger {
  background: #fee2e2;
  color: #dc2626;
}
.btn-danger:hover {
  background: #fecaca;
}

/* ---- Flow diagram ---- */
.flow-steps {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 16px 0;
  overflow-x: auto;
}

.flow-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 100px;
  text-align: center;
}

.flow-step-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: white;
  margin-bottom: 6px;
}

.flow-step-dot.backend {
  background: #3b82f6;
}
.flow-step-dot.client {
  background: #16a34a;
}
.flow-step-dot.widget {
  background: #d97706;
}

.flow-step-label {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.3;
}

.flow-arrow {
  color: #d1d5db;
  font-size: 18px;
  margin: 0 4px;
  margin-bottom: 20px;
}

/* ---- Status bar ---- */
.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
}

.status-bar.ok {
  background: #dcfce7;
  color: #166534;
}
.status-bar.warn {
  background: #fef3c7;
  color: #92400e;
}
.status-bar.err {
  background: #fee2e2;
  color: #dc2626;
}
.status-bar.idle {
  background: #f3f4f6;
  color: #6b7280;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-bar.ok .status-dot {
  background: #16a34a;
}
.status-bar.warn .status-dot {
  background: #d97706;
}
.status-bar.err .status-dot {
  background: #dc2626;
}
.status-bar.idle .status-dot {
  background: #9ca3af;
}

/* ---- Component card ---- */
.component-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-bottom: 24px;
}

/* ---- Event log ---- */
.events-log {
  background: #1a1a1a;
  color: #4db8a8;
  border-radius: 8px;
  padding: 16px;
  font-family: "SF Mono", "Monaco", "Consolas", monospace;
  font-size: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.event-entry {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 6px;
  background: #222;
  border-left: 3px solid #f59e0b;
}

.event-entry.source-ats {
  border-left-color: #3b82f6;
}
.event-entry.source-allfeat {
  border-left-color: #4db8a8;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-name {
  color: #f59e0b;
  font-weight: 600;
}
.event-entry.source-ats .event-name {
  color: #3b82f6;
}
.event-entry.source-allfeat .event-name {
  color: #4db8a8;
}
.event-time {
  color: #666;
  font-size: 11px;
}
.event-data {
  color: #9ca3af;
  margin-top: 6px;
  padding: 6px 8px;
  background: #1a1a1a;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}
.event-data .json-key {
  color: #67e8f9;
}
.event-data .json-string {
  color: #86efac;
}
.event-data .json-number {
  color: #fbbf24;
}
.event-data .json-bool {
  color: #c084fc;
}
.event-data .json-null {
  color: #6b7280;
}

.clear-btn {
  font-size: 12px;
  padding: 4px 8px;
  background: #333;
  color: #9ca3af;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.clear-btn:hover {
  background: #444;
  color: white;
}

/* ---- Code block ---- */
.code-block {
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  font-family: "SF Mono", "Monaco", "Consolas", monospace;
  font-size: 12px;
  overflow-x: auto;
  line-height: 1.6;
}

.code-block pre {
  margin: 0;
  white-space: pre-wrap;
}

.code-block .comment {
  color: #64748b;
}
.code-block .keyword {
  color: #c084fc;
}
.code-block .string {
  color: #86efac;
}
.code-block .func {
  color: #67e8f9;
}
.code-block .tag {
  color: #f472b6;
}

.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #e5e7eb;
  margin-bottom: 16px;
}

.tab-bar button {
  padding: 8px 16px;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}

.tab-bar button.active {
  color: #4db8a8;
  border-bottom-color: #4db8a8;
}
</style>
