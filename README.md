# Allfeat ATS Web Component

A framework-agnostic web component for registering works on the Allfeat blockchain using API key authentication.

## Features

- **Zero Web3 Knowledge Required**: Uses API key authentication instead of wallet connections
- **Client-Side ZKP**: Zero-knowledge proofs computed entirely in the browser using WASM
- **Complete Certificate Package**: Generates PDF certificate and JSON metadata, packaged in a ZIP
- **Framework Agnostic**: Works with vanilla JS, React, Vue, Angular, and any other framework
- **Fully Typed**: Complete TypeScript definitions included
- **Customizable**: CSS custom properties for styling

## Installation

### Via npm

```bash
npm install allfeat-ats-component
```

### Via CDN

```html
<script src="https://unpkg.com/allfeat-ats-component/dist/allfeat-ats-register.iife.js"></script>
```

## Quick Start

```html
<allfeat-ats-register
  api-key="aft_your_api_key_here"
  api-endpoint="https://api.allfeat.io"
></allfeat-ats-register>
```

## API Key

To use this component, you need an API key from Allfeat. The API key format is:
- Prefix: `aft_`
- Followed by: 64 hexadecimal characters
- Total length: 68 characters

Example: `aft_a1b2c3d4e5f6...` (64 hex chars)

## Attributes

| Attribute | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `api-key` | string | Yes | - | Your Allfeat API key |
| `api-endpoint` | string | No | `https://api.allfeat.io` | Backend API URL |
| `lang` | string | No | `'en'` | UI language |

## Events

The component emits custom events that you can listen to:

### `zkp-computing`

Fired during zero-knowledge proof computation.

```javascript
element.addEventListener('zkp-computing', (e) => {
  console.log(e.detail);
  // { progress: 50, stage: 'proof', message: 'Generating proof...' }
});
```

### `blockchain-submitting`

Fired when submitting to the blockchain.

```javascript
element.addEventListener('blockchain-submitting', (e) => {
  console.log(e.detail);
  // { commitment: '0x...' }
});
```

### `blockchain-success`

Fired on successful blockchain registration.

```javascript
element.addEventListener('blockchain-success', (e) => {
  console.log(e.detail);
  // { atsId: 42, txHash: '0x...', blockNumber: 12345 }
});
```

### `zip-ready`

Fired when the certificate package is ready for download.

```javascript
element.addEventListener('zip-ready', (e) => {
  console.log(e.detail);
  // { blob: Blob, filename: 'CertificatAllfeat_...zip', pdfGenerated: true }
});
```

### `ats-register-error`

Fired on any error during the process.

```javascript
element.addEventListener('ats-register-error', (e) => {
  console.log(e.detail);
  // { stage: 'api', error: 'Invalid API key', code: 'INVALID_API_KEY' }
});
```

### `step-change`

Fired when the form step changes.

```javascript
element.addEventListener('step-change', (e) => {
  console.log(e.detail);
  // { step: 2, stepName: 'creators', totalSteps: 6 }
});
```

## Public Methods

```typescript
interface AllfeatAtsRegister {
  // Programmatically set form data
  setFormData(data: Partial<FormState>): void;

  // Trigger submission programmatically
  submit(): Promise<void>;

  // Reset the component to initial state
  reset(): void;

  // Get current component state
  getState(): ComponentState;
}
```

## Framework Integration

### Vanilla JavaScript

```html
<!DOCTYPE html>
<html>
<head>
  <script src="allfeat-ats-register.iife.js"></script>
</head>
<body>
  <allfeat-ats-register
    id="ats-form"
    api-key="aft_your_key"
  ></allfeat-ats-register>

  <script>
    const form = document.getElementById('ats-form');

    form.addEventListener('blockchain-success', (e) => {
      console.log('Registered!', e.detail);
    });

    form.addEventListener('ats-register-error', (e) => {
      console.error('Error:', e.detail);
    });
  </script>
</body>
</html>
```

### React

```tsx
import { useEffect, useRef } from 'react';
import 'allfeat-ats-component';

// Declare the custom element type
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'allfeat-ats-register': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'api-key'?: string;
          'api-endpoint'?: string;
        },
        HTMLElement
      >;
    }
  }
}

function AtsRegister({ apiKey }: { apiKey: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleSuccess = (e: CustomEvent) => {
      console.log('Success:', e.detail);
    };

    const handleError = (e: CustomEvent) => {
      console.error('Error:', e.detail);
    };

    element.addEventListener('blockchain-success', handleSuccess);
    element.addEventListener('ats-register-error', handleError);

    return () => {
      element.removeEventListener('blockchain-success', handleSuccess);
      element.removeEventListener('ats-register-error', handleError);
    };
  }, []);

  return (
    <allfeat-ats-register
      ref={ref}
      api-key={apiKey}
      api-endpoint="https://api.allfeat.io"
    />
  );
}
```

### Vue 3

```vue
<template>
  <allfeat-ats-register
    ref="atsForm"
    :api-key="apiKey"
    api-endpoint="https://api.allfeat.io"
    @blockchain-success="onSuccess"
    @ats-register-error="onError"
  />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import 'allfeat-ats-component';

const props = defineProps<{ apiKey: string }>();
const atsForm = ref<HTMLElement | null>(null);

function onSuccess(event: CustomEvent) {
  console.log('Success:', event.detail);
}

function onError(event: CustomEvent) {
  console.error('Error:', event.detail);
}
</script>

<script lang="ts">
// Configure Vue to recognize the custom element
export default {
  compilerOptions: {
    isCustomElement: (tag: string) => tag === 'allfeat-ats-register',
  },
};
</script>
```

### Angular

```typescript
// app.module.ts
import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import 'allfeat-ats-component';

@NgModule({
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  // ...
})
export class AppModule {}

// ats-register.component.ts
import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';

@Component({
  selector: 'app-ats-register',
  template: `
    <allfeat-ats-register
      #atsForm
      [attr.api-key]="apiKey"
      api-endpoint="https://api.allfeat.io"
    ></allfeat-ats-register>
  `,
})
export class AtsRegisterComponent implements AfterViewInit {
  @ViewChild('atsForm') atsForm!: ElementRef;
  apiKey = 'aft_your_key';

  ngAfterViewInit() {
    const el = this.atsForm.nativeElement;

    el.addEventListener('blockchain-success', (e: CustomEvent) => {
      console.log('Success:', e.detail);
    });

    el.addEventListener('ats-register-error', (e: CustomEvent) => {
      console.error('Error:', e.detail);
    });
  }
}
```

## Styling

The component uses Shadow DOM for style encapsulation. You can customize the appearance using CSS custom properties:

```css
allfeat-ats-register {
  --ats-primary: #4DB8A8;
  --ats-primary-hover: #3da89a;
  --ats-text: #1a1a1a;
  --ats-background: #ffffff;
  --ats-border: #e0e0e0;
  --ats-radius: 8px;
  --ats-font-family: 'Your Font', sans-serif;
}
```

## Form Flow

The component guides users through a 6-step process:

1. **File Upload** - Select audio file (MP3, WAV, FLAC, etc.)
2. **Work Details** - Enter title and optional ISWC
3. **Creators** - Add 1-20 creators with roles
4. **Review** - Verify all information before submission
5. **Processing** - ZKP computation and blockchain submission
6. **Success** - Download certificate package

## Certificate Output

On successful registration, the component generates a ZIP file containing:

- **JSON Certificate** (`<title>_YYYYMMDD_HHMMSS.json`)
  - ATS ID
  - Version number
  - Title
  - Asset filename
  - Creators with roles
  - Timestamp

- **PDF Certificate** (`<title>_YYYYMMDD_HHMMSS.pdf`)
  - Visual certificate with all details
  - Hash commitment and secret for verification
  - Block explorer link
  - Reconstruction procedure

## Error Handling

The component handles various error scenarios:

| Error Code | Description |
|------------|-------------|
| `INVALID_API_KEY_FORMAT` | API key format is incorrect |
| `INVALID_API_KEY` | API key is not recognized |
| `INSUFFICIENT_BALANCE` | Account has insufficient AFT balance |
| `INVALID_HASH_COMMITMENT` | Hash format is invalid |
| `NETWORK_ERROR` | Cannot connect to API server |
| `TRANSACTION_FAILED` | Blockchain transaction failed |

## Browser Support

- Chrome 67+
- Firefox 63+
- Safari 14.1+
- Edge 79+

## Security

- All cryptographic operations happen client-side
- Private keys (secrets) never leave the browser
- Only the commitment hash is sent to the server
- API key is transmitted over HTTPS

## Local Development Proxy Server

For local development, a Rust proxy server is included that mirrors the Cloudflare Worker behavior. This allows you to test the component against a local backend API.

### Prerequisites

- [Rust](https://rustup.rs/) (1.75+)

### Building the Proxy

```bash
cd proxy-server
cargo build --release
```

### Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials:
   ```bash
   APP__BACKEND__API_KEY=aft_your_api_key_here
   APP__BACKEND__PASSPHRASE=your_passphrase_here
   APP__BACKEND__API_URL=http://localhost:13002
   APP__BACKEND__NETWORK=testnet
   ```

### Running

```bash
cd proxy-server
cargo run --release
```

The proxy will start on `http://localhost:3333`.

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Action-based routing (register-raw, download-certificate, parse-cert) |
| `/v1/transactions/{id}` | GET | Transaction status polling |
| `/v1/ws/transactions/{id}` | WS | Real-time transaction tracking |
| `/health` | GET | Health check |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP__SERVER__PORT` | Server port | 3333 |
| `APP__SERVER__HOST` | Server host | 0.0.0.0 |
| `APP__BACKEND__API_URL` | Backend API URL | http://localhost:13002 |
| `APP__BACKEND__API_KEY` | Backend API key | (required) |
| `APP__BACKEND__PASSPHRASE` | Wallet passphrase | (required) |
| `APP__BACKEND__NETWORK` | Network (testnet/mainnet) | testnet |
| `RUST_LOG` | Log level | ats_proxy_server=info |

## License

MIT License - see LICENSE file for details.

## Support

- Documentation: https://docs.allfeat.io
- Issues: https://github.com/Allfeat/allfeat-ats-component/issues
- Discord: https://discord.gg/allfeat
