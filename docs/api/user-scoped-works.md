# User-Scoped Works — Widget Integration

This document specifies how the `<ats-widget>` **download mode** and the
**external-user register / update flows** talk to the backend.

These flows list, download and register/re-version works that belong to one of
a partner's end-users. On the Allfeat platform that data lives behind the ATS
**B2B API** (`services/ats`), under:

```
/v1/organizations/{organization_id}/external-users/{external_user_ref}/works…
/v1/organizations/{organization_id}/works/{init,prepare,confirm}
/v1/organizations/{organization_id}/works/{ats_id}/versions/…
```

## One token type, two modes

There is a **single** auth credential between the widget and the ATS: the
widget session JWT minted by the organizations service at
`POST /v1/sessions`. The mint request's `action_type` field selects the
surface the resulting token authorizes:

| `action_type`                    | Authorizes                                                                                  | Pinning claims                                  |
|----------------------------------|---------------------------------------------------------------------------------------------|-------------------------------------------------|
| `register` / `update_version` / `access` | User-scoped routes: `/v1/works/*`, `/v1/access/{code}/*`                                    | `allowed_network`, optional `allowed_ats_id`    |
| `external_user`                  | Org-scoped B2B routes: `/v1/organizations/{org}/external-users/{ref}/…` (reads), `/v1/organizations/{org}/works/…` (writes) | `external_user_ref` (required), `allowed_network` |

The two surfaces share the same JWT shape, signing key, gRPC verify path,
and the `X-Site-Key` cross-check on each request. Setting
`external-user-id` on the widget switches the host into the second mode;
clearing it falls back to the first.

## Why the host still has a server-side role

The widget `secret_key` is the long-lived secret that mints session
tokens. It must stay on the host's backend. The widget cannot mint its own
tokens, so the host exposes one tiny endpoint that exchanges the
`secret_key` for a JWT and returns just the JWT to the browser:

```
                                                                ┌──────────────────────────────────┐
                                                                │  Organizations service           │
                                                                │  POST /v1/sessions               │
                                                                │  { secret_key,                   │
                                                                │    action_type,                  │
                                                                │    allowed_network,              │
                                                                │    external_user_ref? }          │
                                                                └──────────────────────────────────┘
                                                                          ▲     │ { token,
                                                                          │     │   expires_in }
                                                                          │     ▼
┌────────────┐  POST /api/token             ┌──────────────┐              ┌──────────────┐
│ <ats-widget>│──────────────────────────────▶│   Host BFF   │──────────────▶  │              │
│  (browser) │ ◀──────────────────────────────│ (mint only)  │ ◀────────── │              │
└────────────┘                                └──────────────┘              └──────────────┘
       │
       │  every ATS call goes direct, carrying the minted JWT
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ATS API   Authorization: Bearer <session JWT>   X-Site-Key: <site_key>     │
│  /v1/works/*                       (action_type ∈ register/update_version)  │
│  /v1/access/{code}/*               (action_type = access)                   │
│  /v1/organizations/{org}/…         (action_type = external_user)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

The host's BFF is **mint-only**: it never proxies request bodies, never
sees ATS responses, and never sits in the upload / download path. After
mint, the widget→ATS hop is direct on every call. A reference mint
endpoint ships in the demo at
[`demo/server/api/token.post.ts`](../../demo/server/api/token.post.ts).

## Widget configuration

| Attribute          | Required for                          | Notes                                                            |
|--------------------|---------------------------------------|------------------------------------------------------------------|
| `ats-url`          | all modes                             | ATS API base — every ATS call goes here directly.                |
| `token`            | all modes                             | The widget session JWT. Same attribute regardless of mode.       |
| `site-key`         | all modes                             | The widget's public site key; ATS hashes it and matches it against the JWT's `site_key_hash` claim. |
| `external-user-id` | external-user register / update / download | The partner's opaque end-user reference. When set, switches the widget onto the B2B routes. |
| `organization-id`  | external-user flows                   | Organization integration id (UUID). The widget composes `/v1/organizations/{org}/...` URLs from this. |
| `network`          | all modes                             | `testnet` or `mainnet`.                                          |

Without `external-user-id`, `update` uses the access-code flow against
`ats-url` (a co-equal supported path, not a fallback). `register` runs
against the user-scoped `/v1/works/*` routes. The external-user flow runs
against the B2B `/v1/organizations/{org}/...` routes — same `token`
attribute, different `action_type` and claim set inside the token.

## Tagging registrations (`register` mode)

A work only appears in a user's download / update lists if it was **tagged**
with that user's `external_user_ref` when it was registered.

- When `external-user-id` is **set**, the widget calls the B2B register
  routes. The token's `external_user_ref` claim is the authoritative tag —
  the ATS overrides any body-supplied value with the claim.
- When `external-user-id` is **not set**, the widget registers via the
  user-scoped routes (`/v1/works/init`) with the regular `register` token,
  and includes `external_user_ref` in the body as before. Hosts that want
  untagged registrations omit the attribute entirely.

## Widget → ATS contract

All calls go to `ats-url`. `{org}` is the `organization-id` attribute,
URL-encoded. `{ref}` is the URL-encoded `external-user-id`. `{workId}` is
a work UUID; `{atsId}` is a numeric on-chain ATS id; `{version}` is a
1-based integer.

External-user **reads** (token's `action_type` must be `external_user`,
claim's `external_user_ref` must match the URL):

| Method | Path                                                                                              |
|--------|---------------------------------------------------------------------------------------------------|
| GET    | `/v1/organizations/{org}/external-users/{ref}/works?network=&first=&after=&search=`               |
| GET    | `/v1/organizations/{org}/external-users/{ref}/works/{workId}/download/certificate`                |
| GET    | `/v1/organizations/{org}/external-users/{ref}/works/{workId}/versions/{version}/download/audio`   |
| GET    | `/v1/organizations/{org}/external-users/{ref}/works/{workId}/versions/{version}/download/certificate` |

External-user **writes** (same token):

| Method | Path                                                                | Body                                                |
|--------|---------------------------------------------------------------------|-----------------------------------------------------|
| POST   | `/v1/organizations/{org}/works/init`                                | `{ title, creators, filename, network, external_user_ref }` |
| POST   | `/v1/organizations/{org}/works/prepare`                             | `{ job_id }`                                        |
| POST   | `/v1/organizations/{org}/works/confirm`                             | `{ job_id }`                                        |
| POST   | `/v1/organizations/{org}/works/{atsId}/versions/init`               | `{ network, creators }`                             |
| POST   | `/v1/organizations/{org}/works/{atsId}/versions/init-upload`        | `{ network, creators, filename }`                   |
| POST   | `/v1/organizations/{org}/works/{atsId}/versions/prepare`            | `{ job_id }`                                        |
| POST   | `/v1/organizations/{org}/works/{atsId}/versions/confirm`            | `{ job_id }`                                        |

These are consumed by `src/api/client.ts`: `listUserWorks`,
`downloadUserWorkVersionAsset`, `downloadUserWorkCertificate`,
`downloadUserWorkVersionCertificate`, `initUserWork`, `prepareUserWork`,
`confirmUserWork`, `initUserWorkVersion`, `initUserWorkVersionUpload`,
`prepareUserWorkVersion`, `confirmUserWorkVersion`.

`creators` uses the widget's `CreatorRequest` shape
(`{ full_name, email, roles: { author, composer, arranger, adapter }, ipi?, isni? }`).

## What the host BFF must do

Just **one** endpoint, on whichever path the host prefers. Reference:
[`demo/server/api/token.post.ts`](../../demo/server/api/token.post.ts).

1. **Authenticate the caller** however the host normally does (its own
   session cookie, JWT, …) and decide which `external_user_ref` (if any)
   the caller is allowed to operate as. The partner backend is solely
   responsible for this binding.
2. Call `POST {organizationsUrl}/v1/sessions` with the `Origin` header
   forwarded, the org's `secret_key` in the body, and an `action_type`
   matching the widget flow:
   - `register` / `update_version` / `access` — narrow per-action token,
     same as today.
   - `external_user` (with an `external_user_ref` in the body) — token
     pinned to that user, authorizing the org-scoped routes.
3. Return the response body verbatim to the browser — `{ token,
   expires_in, network? }`. (The demo also echoes `organization_id` back
   when `external_user_ref` was set, so the page can set the widget's
   `organization-id` attribute without keeping a public copy.)

That's the entire server-side responsibility. The widget hits ATS
directly for every subsequent call.

### Token shape and lifetime

```
POST {organizationsUrl}/v1/sessions
Origin: https://your-host.example
Content-Type: application/json

{
  "secret_key": "csk_…",                ← server-side only
  "action_type": "external_user",        ← or register/update_version/access
  "allowed_network": "testnet",
  "external_user_ref": "u-42"            ← required iff action_type=external_user
}
```

Response:

```jsonc
{
  "token":      "eyJ…",      // HS256 JWT, ship in Authorization: Bearer …
  "expires_in": 300          // seconds; ~5 min default for the widget
                             // session. Refresh on `allfeat:token-expired`.
}
```

When `action_type == "external_user"`, the JWT carries an
`external_user_ref` claim pinned to the URL of every B2B call — the ATS
rejects any path where `{external_user_ref}` doesn't match. The widget
session is short-lived; the widget emits `allfeat:token-expired` when a
401 surfaces, the host's handler re-mints with the same body, and the
widget resumes whichever step it paused on.

### The `search` parameter

The ATS B2B listing has **no `search` parameter**. The widget still
filters its work-list UI client-side. No host-side action needed.

## Response shapes

ATS responses come straight to the browser — same shapes as the previous
auth model, modelled in `src/api/types.ts`.

### List works — `GET /v1/organizations/{org}/external-users/{ref}/works`

```jsonc
{
  "works": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "ats_id": 1024,
      "network": "testnet",
      "title": "My Song",
      "latest_version": 3,
      "created_at": "2024-11-12T14:23:01Z",
      "external_user_ref": "u-42",
      "versions": [
        {
          "version": 1,
          "commitment": "0x9c…",
          "registered_at_block": 7925,
          "registered_at": "2024-11-12T14:23:01Z",
          "asset_filename": "my-song.wav",
          "block_hash": "0x…",
          "tx_hash": "0x…",
          "fee_credits": 1460,
          "storage_fee_credits": 0
        }
      ]
    }
  ],
  "page_info": { "has_next_page": false, "has_previous_page": false, "start_cursor": "…", "end_cursor": "…" },
  "total_count": 1
}
```

### Downloads — `GET …/download/audio` · `…/download/certificate`

```json
{ "url": "https://s3.amazonaws.com/…presigned…", "expires_at": "2026-05-13T12:00:00Z" }
```

### Register & version update — `init` · `prepare` · `confirm`

```jsonc
// init                → { "job_id": "…", "upload_url": "https://s3…", "upload_expires_at": "…" }
// init-upload         → same shape as init
// prepare             → { "job_id": "…", "commitment": "0x…", "version_deposit_credits": 20,
//                         "network_fee_credits": 12, "service_fee_credits": 5,
//                         "storage_fee_credits": 8, "total_price_credits": 45,
//                         "is_valid": true, "expires_at": "…" }
// confirm (202)       → { "transaction_id": "…", "ws_url": "/v1/ws/transactions/…",
//                         "status_url": "/v1/transactions/…" }
```

After `confirm`, the widget tracks the transaction by hitting `ws_url` /
`status_url` on **`ats-url`** directly — those ATS transaction endpoints
are public (the transaction id is the capability), so no auth is involved.

## Errors

The widget expects the ATS unified error envelope on any non-2xx response:

```json
{ "error": { "code": "work.not_found", "message": "…", "request_id": "req_…" } }
```

## The creators gap

The widget's "Show creators" panels and the update-flow creator prefill
need per-version creator data. The ATS B2B listing **deliberately omits
creators**, and there is no B2B creators endpoint yet.

Until one exists, that single lookup is served by a local mock,
`src/api/mock.ts`, gated by `USE_MOCK_WORK_CREATORS` in
`src/constants.ts`. Everything else is wired to the real API directly.

## Reference

- **ATS B2B endpoints** — `services/ats/src/routes/organizations/` in
  `web2-platform`.
- **Session mint endpoint** —
  `services/organizations/src/routes/sessions.rs` in `web2-platform`.
- **Reference mint BFF** —
  [`demo/server/api/token.post.ts`](../../demo/server/api/token.post.ts).
- **Widget consumer** — [`src/api/client.ts`](../../src/api/client.ts),
  [`src/api/types.ts`](../../src/api/types.ts).
