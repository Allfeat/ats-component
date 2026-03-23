# Deployment Guide: Allfeat ATS Web Component

This guide explains how to deploy the Allfeat ATS Web Component with a proxy backend architecture for domain allowlist access control.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Step 1: OVH Object Storage Setup](#step-1-ovh-object-storage-setup)
- [Step 2: Proxy Backend Setup](#step-2-proxy-backend-setup)
- [Step 3: Deploying Updates](#step-3-deploying-updates)
- [Integration Guide](#integration-guide)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

---

## Architecture Overview

The Allfeat ATS Web Component uses a proxy backend architecture where the backend serves as the single point of contact for the browser, handling both static asset serving and API routing.

### Component Serving Flow

```
┌─────────────┐    ┌───────────────────────────────┐    ┌─────────────┐
│   Browser   │───►│       Proxy Backend           │───►│  OVH S3     │
│             │    │   (allowlist in database)     │    │  (private)  │
└─────────────┘    └───────────────────────────────┘    └─────────────┘
```

### API Request Flow

```
┌─────────────┐    ┌──────────────────────────────┐    ┌─────────────────────┐
│   Browser   │───►│       Proxy Backend          │───►│  web2-platform API  │
│  (component)│    │  - Validates allowlist       │    │  (internal)         │
│             │    │  - Adds API key + passphrase │    │                     │
│             │    │  - Routes by action type     │    │                     │
└─────────────┘    └──────────────────────────────┘    └─────────────────────┘
```

**Why this architecture?**

- **Object Storage**: Cost-effective, scalable file hosting with high availability
- **Proxy Backend**: Validates request origins, manages secrets, routes API calls
- **Domain Allowlist**: Database-managed, no server configuration needed to add domains
- **Centralized Secrets**: API keys and passphrases never exposed to the browser

### Proxy Backend Responsibilities

The proxy backend handles multiple actions from the web component:

```
Web Component sends request to proxy-endpoint
  │
  ├── Static Assets (JS, WASM)
  │     → Validate Origin against allowlist
  │     → Fetch from OVH S3 → Return to browser
  │
  ├── Action: "register-work"
  │     → Validate Origin against allowlist
  │     → Add API key + passphrase
  │     → Route to web2-platform /works endpoint
  │
  └── Action: "parse-cert"
        → Validate Origin against allowlist
        → Add API key + passphrase
        → Route to web2-platform certificate parsing endpoint
```

### WASM Module Distribution

| Module | Location | Purpose |
|--------|----------|---------|
| `allfeat_ats_zkp_wasm` | Client (served via proxy backend) | ZK proofs, hashing, commitment - must run in browser |
| `ats_cert_parser` | Server (web2-platform) | Certificate JSON generation - server-side API endpoint |

---

## Prerequisites

Before starting, ensure you have:

- An OVH account with access to Public Cloud
- AWS CLI installed locally (`brew install awscli` or `apt install awscli`)
- A proxy backend application (web2-platform or compatible implementation)
- Access to manage the proxy backend's domain allowlist

---

## Step 1: OVH Object Storage Setup

### 1.1 Create Object Storage Container

1. Log into [OVH Control Panel](https://www.ovh.com/manager/)
2. Navigate to **Public Cloud** → **Object Storage**
3. Click **Create a container**
4. Configure:
   - **Name**: `allfeat-ats-component`
   - **Region**: `GRA` (Gravelines) or your preferred region
   - **Visibility**: **Private** (proxy backend will serve files)
5. Click **Create**

### 1.2 Generate S3 Credentials

1. Go to **Public Cloud** → **Users & Roles**
2. Create a new user or use an existing one
3. Generate **S3 credentials** for the user
4. Save:
   - **Access Key** (OS_ACCESS_KEY)
   - **Secret Key** (OS_SECRET_KEY)
   - **Endpoint URL**: `https://s3.<region>.cloud.ovh.net` (e.g., `https://s3.gra.cloud.ovh.net`)

### 1.3 Configure AWS CLI

```bash
# Configure the OVH profile
aws configure --profile ovh

# When prompted, enter:
# AWS Access Key ID: <your OS_ACCESS_KEY>
# AWS Secret Access Key: <your OS_SECRET_KEY>
# Default region name: gra
# Default output format: json
```

### 1.4 Initial Upload

Build and upload the component:

```bash
# Build the component
npm run build

# Deploy to OVH
npm run deploy:ovh
```

---

## Step 2: Proxy Backend Setup

The proxy backend handles all browser requests, serving static assets from S3 and routing API calls to web2-platform.

### 2.1 Serving Component Files from S3

The proxy backend must implement an endpoint pattern to serve component files:

```
GET /component/{filename}
  → Validate Origin header against allowlist
  → If not allowed: Return 403
  → Fetch file from OVH S3: s3://allfeat-ats-component/{filename}
  → Return file with appropriate Content-Type and CORS headers
```

**Required CORS headers for allowed origins:**

```
Access-Control-Allow-Origin: {requesting-origin}
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Origin, Content-Type, Accept
```

**Content-Type mapping:**

| Extension | Content-Type |
|-----------|--------------|
| `.js` | `application/javascript` |
| `.wasm` | `application/wasm` |
| `.css` | `text/css` |

### 2.2 Domain Allowlist Management

The proxy backend manages allowed domains in a database instead of configuration files.

**Adding domains:**
- Use the proxy backend's admin API or dashboard
- No server access or restarts required

**Allowlist validation:**
- Check the `Origin` header on every request
- Return 403 Forbidden if origin is not in the allowlist
- Allow requests without Origin header (direct navigation) based on your security policy

**Example allowlist entries:**

| Domain Pattern | Description |
|----------------|-------------|
| `localhost` | Development |
| `127.0.0.1` | Development |
| `*.customer.com` | Customer with all subdomains |
| `app.customer.io` | Specific subdomain only |
| `*.allfeat.org` | Allfeat domains |

### 2.3 Routing to web2-platform Endpoints

The proxy backend routes API actions to web2-platform, adding authentication:

**Work Registration:**

```
POST /api/ats (from browser)
  Request body: { action: "register-work", ... }

Proxy transforms to:
POST {WEB2_PLATFORM_URL}/works
  Headers:
    X-API-Key: {API_KEY}
    X-Passphrase: {PASSPHRASE}
  Body: { ...work data }
```

**Certificate Parsing:**

```
POST /api/ats (from browser)
  Request body: { action: "parse-cert", certificate: "..." }

Proxy transforms to:
POST {WEB2_PLATFORM_URL}/certificates/parse
  Headers:
    X-API-Key: {API_KEY}
    X-Passphrase: {PASSPHRASE}
  Body: { certificate: "..." }
```

### 2.4 Environment Configuration

The proxy backend requires these environment variables:

| Variable | Description |
|----------|-------------|
| `OVH_S3_ENDPOINT` | OVH S3 endpoint (e.g., `https://s3.gra.cloud.ovh.net`) |
| `OVH_S3_BUCKET` | Bucket name (e.g., `allfeat-ats-component`) |
| `OVH_S3_ACCESS_KEY` | S3 access key |
| `OVH_S3_SECRET_KEY` | S3 secret key |
| `WEB2_PLATFORM_URL` | Internal web2-platform API URL |
| `WEB2_PLATFORM_API_KEY` | API key for web2-platform |
| `WEB2_PLATFORM_PASSPHRASE` | Passphrase for web2-platform |

---

## Step 3: Deploying Updates

After making changes to the component:

```bash
# Build and deploy in one command
npm run deploy:ovh

# Or manually:
npm run build
bash scripts/deploy-ovh.sh
```

**Cache Considerations:**

For updates to take effect immediately, consider:

1. **Version in filename**: Rename bundles with version (e.g., `allfeat-ats-register.1.2.0.iife.js`)
2. **Query string**: Have customers use `?v=1.2.0` query parameter
3. **Cache headers**: Configure appropriate cache headers in the proxy backend

---

## Integration Guide

### For Authorized Customers

Once a customer's domain is added to the allowlist, they can integrate the component:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATS Work Registration</title>

  <!-- Load the web component from proxy backend -->
  <script src="https://{PROXY_BACKEND_URL}/component/allfeat-ats-register.iife.js"></script>

  <script>
    // Configure WASM location (same proxy backend)
    AllfeatAtsComponent.setWasmBaseUrl('https://{PROXY_BACKEND_URL}/component/wasm/');
  </script>
</head>
<body>

  <!-- Use the component -->
  <allfeat-ats-register
    proxy-endpoint="https://{PROXY_BACKEND_URL}/api/ats"
    theme="light"
  ></allfeat-ats-register>

</body>
</html>
```

### Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `proxy-endpoint` | Yes | URL of the proxy backend API endpoint |
| `theme` | No | `"light"` or `"dark"` (default: light) |

### Events

```javascript
const component = document.querySelector('allfeat-ats-register');

component.addEventListener('registration-complete', (event) => {
  console.log('Work registered:', event.detail);
});

component.addEventListener('registration-error', (event) => {
  console.error('Registration failed:', event.detail);
});
```

### Important URLs

| Purpose | URL Pattern |
|---------|-------------|
| JavaScript bundle | `https://{PROXY_BACKEND_URL}/component/allfeat-ats-register.iife.js` |
| WASM modules | `https://{PROXY_BACKEND_URL}/component/wasm/` |
| API endpoint | `https://{PROXY_BACKEND_URL}/api/ats` |

---

## Troubleshooting

### 403 Forbidden Response

**Cause**: The requesting domain is not in the allowlist.

**Solution**: Add the domain to the proxy backend's allowlist via the admin API or dashboard.

### CORS Errors in Browser

**Symptoms**: Console shows "Access-Control-Allow-Origin" errors.

**Check**:
1. Verify the domain is in the allowlist
2. Ensure the proxy backend is returning correct CORS headers
3. Check that the Origin header is being sent (not `null`)

### WASM Loading Fails

**Symptoms**: "Failed to fetch" or "CompileError" for WASM files.

**Check**:
1. Verify WASM files were uploaded to S3:
   ```bash
   aws s3 ls s3://allfeat-ats-component/wasm/ --profile ovh --endpoint-url https://s3.gra.cloud.ovh.net
   ```
2. Ensure `Content-Type: application/wasm` header is returned by proxy
3. Verify `setWasmBaseUrl()` points to correct proxy backend location

### API Calls Failing

**Symptoms**: Work registration or certificate parsing returns errors.

**Check**:
1. Verify the `proxy-endpoint` attribute is set correctly
2. Check proxy backend logs for routing errors
3. Verify web2-platform is accessible from the proxy backend
4. Check API key and passphrase configuration

### Object Storage Access

Verify files are uploaded:

```bash
aws s3 ls s3://allfeat-ats-component/ \
  --profile ovh \
  --endpoint-url https://s3.gra.cloud.ovh.net \
  --recursive
```

---

## Security Considerations

1. **Origin Validation**: The proxy backend only serves files to requests with allowed Origin headers. This prevents unauthorized sites from embedding the component.

2. **Server-Side Secrets**: API keys and passphrases are stored on the proxy backend and never exposed to the browser.

3. **Private Storage**: Object Storage is private; files are only accessible through the proxy backend.

4. **HTTPS Required**: All communication should be over HTTPS.

5. **Certificate Parsing Server-Side**: Sensitive certificate parsing is performed server-side, not in the browser.

6. **Rate Limiting**: Consider implementing rate limiting on the proxy backend to prevent abuse.

7. **Audit Logging**: Log all allowlist changes and API calls for security auditing.

---

## Cost Estimation

| Resource | Approximate Monthly Cost |
|----------|-------------------------|
| OVH Object Storage (10GB) | ~€0.10/month |
| Proxy backend hosting | Varies by provider |

**Note**: The proxy backend cost depends on your hosting choice and traffic volume. Object Storage costs are minimal for typical component file sizes.
