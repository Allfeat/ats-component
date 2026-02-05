# Web Component Security Architecture Proposal

**Date**: February 4, 2026
**Status**: Draft for Team Review

---

## Executive Summary

The `allfeat-ats-component` web component needs architectural changes to:
1. Support the new `web2-platform` API (replacing `tx-api-ats`)
2. Ensure organization credentials are never exposed in browser code

This document proposes a **proxy pattern** where organizations deploy a lightweight backend to hold their secrets.

---

## Table of Contents

1. [Current State](#current-state)
2. [Problem Statement](#problem-statement)
3. [Proposed Architecture](#proposed-architecture)
4. [Implementation Plan](#implementation-plan)
5. [Security Considerations](#security-considerations)
6. [Migration Path](#migration-path)
7. [Open Questions](#open-questions)

---

## Current State

### Web Component Usage

```html
<allfeat-ats-register
  api-key="aft_abc123..."
  api-endpoint="https://api.allfeat.io"
></allfeat-ats-register>
```

### Current API Call

```
POST /v1/ats/submit
Header: X-API-Key: aft_...
Body: { "hash_commitment": "0x..." }
```

### Problem

The API key is visible in:
- HTML source code
- Browser DevTools (Elements tab)
- Network requests

For B2B usage where **organizations** embed this component, their credentials would be exposed to all their end-users.

---

## Problem Statement

### Use Case

Organizations (e.g., music platforms, content registries) want to embed our component so their users can register works on the Allfeat blockchain.

```
┌─────────────────────────────────────────────────────────────────┐
│  Organization's Application (e.g., SoundCloud-like platform)   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  <allfeat-ats-register>                                   │ │
│  │                                                           │ │
│  │  End-user (artist) uploads their work                     │ │
│  │  Component registers it on Allfeat blockchain             │ │
│  │  Using ORGANIZATION's credentials                         │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### The Security Issue

| Secret | What It Protects | Risk if Exposed |
|--------|-----------------|-----------------|
| **API Key** | Authenticates the organization | Anyone can make API calls on org's behalf |
| **Passphrase** | Decrypts org's wallet private key | Transaction signing compromised |

**Core Problem**: A web component runs entirely in the browser. Any secrets passed to it (HTML attributes, JavaScript) are visible to anyone who opens DevTools.

---

## Proposed Architecture

### Solution: Proxy Pattern

Organizations deploy a lightweight backend that holds their secrets. The web component calls this proxy instead of the Allfeat API directly.

```
┌──────────────────┐     ┌─────────────────────────┐     ┌─────────────────┐
│     Browser      │     │   Organization's        │     │   Allfeat API   │
│   (Component)    │     │   Backend Proxy         │     │  web2-platform  │
│                  │     │                         │     │                 │
│  No secrets      │ ──► │  Stores:                │ ──► │  Receives:      │
│  exposed         │     │  - API key              │     │  - API key      │
│                  │     │  - Passphrase           │     │  - Passphrase   │
│  Sends only:     │     │                         │     │  - Commitment   │
│  - hash_commit   │     │  Adds credentials &     │     │                 │
│                  │     │  forwards request       │     │                 │
└──────────────────┘     └─────────────────────────┘     └─────────────────┘
```

### New Component Usage

```html
<allfeat-ats-register
  proxy-endpoint="https://mycompany.com/api/allfeat-proxy"
></allfeat-ats-register>
```

### Data Flow

1. **End-user** interacts with the component (uploads file, etc.)
2. **Component** computes hash commitment client-side
3. **Component** sends `{ hash_commitment }` to organization's proxy
4. **Proxy** adds `api_key` and `passphrase` from secure storage
5. **Proxy** calls Allfeat API: `POST /v1/works`
6. **Response** flows back through proxy to component

---

## Implementation Plan

### Phase 1: Component Changes

#### Files to Modify

| File | Changes |
|------|---------|
| `src/api/client.ts` | Add `submitViaProxy()` function |
| `src/api/types.ts` | Add proxy request/response types |
| `src/allfeat-ats-register.ts` | Add `proxy-endpoint` attribute, routing logic |

#### New Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `proxy-endpoint` | Yes* | URL of organization's proxy |
| `api-endpoint` | No | Direct API URL (legacy/deprecated) |
| `api-key` | No | Direct API key (legacy/deprecated) |

*Required for secure B2B usage

### Phase 2: API Contract

#### Component → Proxy Request

```http
POST {proxy-endpoint}
Content-Type: application/json

{
  "hash_commitment": "0x1234abcd..."
}
```

#### Proxy → Allfeat API Request

```http
POST https://api.allfeat.io/v1/works
Content-Type: application/json
x-api-key: aft_organization_key_here

{
  "hash_commitment": "0x1234abcd...",
  "passphrase": "organization_passphrase_here"
}
```

#### Response (passed through)

```json
{
  "status": "success",
  "ats_id": 12345,
  "tx_hash": "0xabcdef...",
  "block_number": 67890,
  "message": "Work registered successfully"
}
```

### Phase 3: Documentation for Organizations

Provide organizations with:
1. Proxy API contract specification
2. Example implementations (Cloudflare Worker, AWS Lambda, Node.js)
3. Security best practices

#### Example: Cloudflare Worker

```javascript
export default {
  async fetch(request, env) {
    // Validate origin (CORS)
    const origin = request.headers.get('Origin');
    if (!isAllowedOrigin(origin, env.ALLOWED_ORIGINS)) {
      return new Response('Forbidden', { status: 403 });
    }

    // Parse request
    const { hash_commitment } = await request.json();

    // Validate hash format
    if (!isValidHashCommitment(hash_commitment)) {
      return new Response(JSON.stringify({
        error: 'Invalid hash commitment format'
      }), { status: 400 });
    }

    // Forward to Allfeat API with credentials
    const response = await fetch('https://api.allfeat.io/v1/works', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ALLFEAT_API_KEY
      },
      body: JSON.stringify({
        hash_commitment,
        passphrase: env.ALLFEAT_PASSPHRASE
      })
    });

    // Return response with CORS headers
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin
      }
    });
  }
};
```

#### Cloudflare Worker Secrets Setup

```bash
# Set secrets (never in code)
wrangler secret put ALLFEAT_API_KEY
wrangler secret put ALLFEAT_PASSPHRASE
wrangler secret put ALLOWED_ORIGINS
```

---

## Security Considerations

### What This Architecture Protects

| Threat | Mitigation |
|--------|------------|
| Credential exposure in browser | Secrets only exist server-side in proxy |
| Credential theft via XSS | No credentials in browser to steal |
| Man-in-the-middle | HTTPS for all communications |
| Unauthorized proxy access | CORS + origin validation |

### Organization Responsibilities

1. **Secure secret storage** - Use platform secrets (Cloudflare Workers Secrets, AWS Secrets Manager, etc.)
2. **CORS configuration** - Only allow their own domains
3. **Rate limiting** - Prevent abuse of their proxy
4. **Monitoring** - Log requests (but NOT passphrases)

### What This Does NOT Protect

- **Compromised organization backend** - If their proxy is breached, credentials are exposed
- **Malicious organization employees** - Insider threats still apply
- **End-user abuse** - Rate limiting must be implemented by organization

---

## Migration Path

### Timeline

| Phase | Description | Breaking Change |
|-------|-------------|-----------------|
| **v2.0** | Add proxy mode alongside direct mode | No |
| **v2.1** | Deprecation warnings for direct mode | No |
| **v3.0** | Remove direct mode | Yes |

### Backward Compatibility

During transition, both modes will work:

```html
<!-- New (recommended) -->
<allfeat-ats-register proxy-endpoint="https://proxy.example.com"></allfeat-ats-register>

<!-- Legacy (deprecated, will show console warning) -->
<allfeat-ats-register api-key="aft_..." api-endpoint="https://api.allfeat.io"></allfeat-ats-register>
```

---

## API Changes: tx-api-ats → web2-platform

### Endpoint Changes

| Old API | New API |
|---------|---------|
| `POST /v1/ats/submit` | `POST /v1/works` |
| Header: `X-API-Key` | Header: `x-api-key` |
| Body: `{ hash_commitment }` | Body: `{ hash_commitment, passphrase }` |

### Response Changes

Both return similar structure:
```json
{
  "status": "success",
  "ats_id": 12345,
  "tx_hash": "0x...",
  "block_number": 67890
}
```

---

## Open Questions

1. **Should we provide a hosted proxy option?**
   Allfeat could offer a managed proxy service so organizations don't need to deploy their own.

2. **Rate limiting strategy?**
   Should the component include client-side rate limiting, or rely entirely on proxy?

3. **Error message granularity?**
   How much detail should the proxy expose in error messages?

4. **Audit logging?**
   Should we require organizations to implement logging? Provide guidelines?

---

## Next Steps

1. [ ] Team review of this proposal
2. [ ] Finalize API contract with backend team
3. [ ] Implement proxy mode in component
4. [ ] Create documentation and examples for organizations
5. [ ] Update README with new usage patterns

---

## Appendix: Alternative Approaches Considered

### A. Keep Direct Mode Only

**Rejected because**: Credentials would be exposed in browser, unacceptable for B2B.

### B. Encrypted Credentials in HTML

**Rejected because**: Encryption key would also need to be in browser, no real security gain.

### C. Server-Side Rendering Only

**Rejected because**: Defeats the purpose of a web component; organizations want easy embedding.

### D. OAuth Flow per End-User

**Rejected because**: Adds complexity; each artist would need an Allfeat account. Current model is organization-centric.
