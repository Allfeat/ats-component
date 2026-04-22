# Allfeat ATS Web Component

A framework-agnostic web component for registering and updating audio works on the Allfeat blockchain.

## Installation

### Via CDN (recommended)

```html
<!-- Pinned to major version (recommended for production) -->
<script src="https://cdn.allfeat.org/widgets/ats/v2/ats-widget.iife.js"></script>

<!-- Pinned to exact version -->
<script src="https://cdn.allfeat.org/widgets/ats/2.0.0/ats-widget.iife.js"></script>

<!-- Latest (always up-to-date, 5min cache) -->
<script src="https://cdn.allfeat.org/widgets/ats/latest/ats-widget.iife.js"></script>

<!-- Dev channel (develop branch, unstable) -->
<script src="https://cdn.allfeat.org/widgets/ats/dev/ats-widget.iife.js"></script>
```

ESM imports are also available (`ats-widget.esm.js`).

### Via npm (coming soon)

```bash
bun add allfeat-ats-component
```

```typescript
import { AllfeatRegister } from 'allfeat-ats-component';
```

## Quick Start

```html
<!-- 1. Load the widget -->
<script src="https://cdn.allfeat.org/widgets/ats/v2/ats-widget.iife.js"></script>

<!-- 2. Add the widget -->
<ats-widget
  id="ats-widget"
  site-key="cpk_your_public_key"
  ats-url="https://ats.api.allfeat.org"
  network="testnet"
  mode="register"
></ats-widget>

<script>
  const widget = document.getElementById('ats-widget');

  // 3. Inject a JWT token obtained from your backend
  const { token } = await fetch('/api/ats-token', { method: 'POST' }).then(r => r.json());
  widget.setToken(token);

  // 4. Listen to events
  widget.addEventListener('allfeat:complete', (e) => {
    console.log(`Work protected! ATS #${e.detail.atsId}`);
  });

  widget.addEventListener('allfeat:token-expired', async () => {
    const { token } = await fetch('/api/ats-token', { method: 'POST' }).then(r => r.json());
    widget.setToken(token);
  });
</script>
```

> **Important:** The JWT token must be obtained server-side using your `secret_key`. Never expose the secret key in the browser.

## Attributes

| Attribute | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `site-key` | string | Yes | — | Your public site key (`cpk_...`) |
| `ats-url` | string | Yes | — | Allfeat ATS API URL |
| `token` | string | — | — | JWT session token (or use `setToken()`) |
| `network` | string | No | `testnet` | `testnet` or `mainnet` |
| `mode` | string | No | `register` | `register` or `update` |
| `max-file-size` | number | No | — | Max upload size in bytes |

## Events

| Event | Description | Key detail fields |
|-------|-------------|-------------------|
| `allfeat:ready` | Component initialized | `mode` |
| `allfeat:upload-start` | File upload started | `filename`, `size` |
| `allfeat:upload-progress` | Upload progress | `progress`, `loaded`, `total` |
| `allfeat:upload-complete` | Upload finished | `filename` |
| `allfeat:confirmed` | Transaction submitted | `transactionId` |
| `allfeat:step` | Transaction progressing | `step`, `progress`, `description` |
| `allfeat:complete` | Registration/update succeeded | `atsId`, `txHash`, `blockNumber`, `accessCode` |
| `allfeat:failed` | Operation failed | `error`, `code`, `stage` |
| `allfeat:token-expired` | Token expired, provide a new one | `pendingAction` |
| `allfeat:error` | Recoverable error | `stage`, `error`, `code` |

## CDN Versioning

| Channel | URL pattern | Cache | Use case |
|---------|-------------|-------|----------|
| **Pinned** | `cdn.allfeat.org/widgets/ats/{version}/` | Immutable (1 year) | Reproducible builds |
| **Major** | `cdn.allfeat.org/widgets/ats/v{major}/` | 1 hour | Production (auto-patches) |
| **Latest** | `cdn.allfeat.org/widgets/ats/latest/` | 5 minutes | Always latest stable |
| **Dev** | `cdn.allfeat.org/widgets/ats/dev/` | 5 minutes | Testing / development |

## Documentation

Full documentation: https://docs.allfeat.io

## License

MIT License — see LICENSE file for details.
