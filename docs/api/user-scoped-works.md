# User-Scoped Works — Widget Integration

This document specifies how the `<ats-widget>` **download mode** and the
**external-user update flow** talk to the backend.

These two flows list, download and re-version works that belong to one of a
partner's end-users. On the Allfeat platform that data lives behind the ATS
**B2B API** (`services/ats`), under:

```
/v1/organizations/{organization_id}/external-users/{external_user_ref}/works…
/v1/organizations/{organization_id}/works/{ats_id}/versions/…
```

## Why the widget cannot call the ATS directly

Those endpoints authenticate with an **organization API key**
(`afo_sk_live_…`) — a long-lived, organization-wide secret. The full contract
is the *Allfeat Organization API — Integration Guide*
(`services/organizations/docs/api-keys-integration-guide.md` in the
`web2-platform` repo), which is emphatic that the key is server-side only:

> *Treat the bearer token as a production secret. Store it in a secrets
> manager, never in source control or container images.*

The widget runs in the browser. It therefore **cannot** hold that key, and the
ATS B2B extractor explicitly rejects the widget's own site-scoped session JWT.

So the widget never calls the ATS B2B API directly. Instead it calls a
**host-provided BFF proxy**, and the host's backend — which already holds the
key for server-to-server use — injects it and forwards the request.

```
┌────────────┐  proxy-url (browser fetch)  ┌─────────────┐  + afo_sk_ key  ┌──────────┐
│ <ats-widget>│ ───────────────────────────▶│  Host BFF   │ ───────────────▶│  ATS API │
│  (browser) │                              │   proxy     │                 │  (B2B)   │
└────────────┘                              └─────────────┘                 └──────────┘
```

The widget bundles its consumer (`src/api/client.ts`); the BFF proxy is the
**host's** responsibility. A complete reference proxy ships in the demo at
[`demo/server/api/ats-proxy/[...].ts`](../../demo/server/api/ats-proxy/%5B...%5D.ts).

---

## Widget configuration

| Attribute          | Required for          | Notes                                                            |
|--------------------|-----------------------|------------------------------------------------------------------|
| `proxy-url`        | `download`, `update`* | Base URL of the host BFF proxy (absolute, or same-origin path).   |
| `external-user-id` | `download`, `update`* | The partner's opaque end-user reference (`external_user_ref`).    |
| `ats-url`          | all modes             | ATS API base — still used directly for **transaction tracking**. |

\* `update` only needs `proxy-url` / `external-user-id` when the host wants the
external-user update flow. Without `external-user-id`, `update` keeps using the
legacy access-code flow against `ats-url`.

`register` mode still registers against `ats-url` directly with the widget
session token. Its one tie-in with this document: when `external-user-id` is
set, the widget tags the registration with it — see *Tagging registrations*
below.

The widget still sends its `Authorization: Bearer <session token>` and
`X-Site-Key` headers on every proxy call. They are **not** needed to reach the
ATS (the BFF supplies the API key), but the host MAY use them to authenticate
the widget→BFF hop. In `download` mode the widget may have no session token;
the headers are then empty and the host must authenticate the hop another way
(e.g. its own session cookie).

---

## Tagging registrations (`register` mode)

A work only appears in a user's download / update lists if it was **tagged**
with that user's reference when it was registered. So when `external-user-id`
is set, `register` mode includes it as `external_user_ref` in the
`POST /v1/works/init` body — sent to `ats-url` with the widget session token,
no proxy involved:

```jsonc
{
  "network": "testnet",
  "title": "…",
  "filename": "…",
  "creators": [ … ],
  "external_user_ref": "u-42"   // only when external-user-id is set
}
```

The ATS persists `external_user_ref` onto the `ats_works` row when the
registration finalizes on-chain; the B2B reverse-lookup then returns it. A
registration done **without** `external-user-id` simply omits the field and is
not user-discoverable.

> The shared `init_work` handler stores `external_user_ref` for **any** caller,
> so the widget's JWT route (`/v1/works/init`) tags works just as the B2B route
> does. The `InitWorkRequest` doc comment in `services/ats` still says the
> field is "only read on the B2B routes" — that comment is stale relative to
> the code and is worth correcting on the backend.

---

## Widget → BFF proxy contract

All paths below are relative to `proxy-url`. `{ref}` is the URL-encoded
`external-user-id`; `{workId}` is a work UUID; `{atsId}` is a numeric on-chain
ATS id; `{version}` is a 1-based integer.

| Method | Path                                                                   | Body                              |
|--------|------------------------------------------------------------------------|-----------------------------------|
| GET    | `/external-users/{ref}/works?network=&first=&after=&search=`           | —                                 |
| GET    | `/external-users/{ref}/works/{workId}/versions/{version}/download/audio`       | —                          |
| GET    | `/external-users/{ref}/works/{workId}/versions/{version}/download/certificate` | —                          |
| POST   | `/works/{atsId}/versions/init`                                         | `{ network, creators }`           |
| POST   | `/works/{atsId}/versions/init-upload`                                  | `{ network, creators, filename }` |
| POST   | `/works/{atsId}/versions/prepare`                                      | `{ job_id }`                      |
| POST   | `/works/{atsId}/versions/confirm`                                      | `{ job_id }`                      |

These are consumed by `src/api/client.ts`: `listUserWorks`,
`downloadUserWorkVersionAsset`, `downloadUserWorkVersionCertificate`,
`initUserWorkVersion`, `initUserWorkVersionUpload`, `prepareUserWorkVersion`,
`confirmUserWorkVersion`.

`creators` uses the widget's `CreatorRequest` shape
(`{ full_name, email, roles: { author, composer, arranger, adapter }, ipi?, isni? }`).

### What the BFF must do

For every request above, the host BFF must:

1. **Authenticate the caller** however it sees fit (its own session, the
   forwarded widget token, …) — the proxy is a public surface.
2. **Prepend** `/v1/organizations/{organization_id}` to the path, where
   `organization_id` is the org that owns the API key.
3. **Swap the credential**: drop the widget's `Authorization` header and set
   `Authorization: Bearer <afo_sk_… organization key>`.
4. **Forward** the method, query string and JSON body upstream, then return the
   ATS response — status code and body — **verbatim**, so the widget's unified
   error envelope handling keeps working.

So `GET {proxy}/external-users/u-42/works?network=testnet` becomes
`GET {ats}/v1/organizations/{org}/external-users/u-42/works?network=testnet`,
and `POST {proxy}/works/1024/versions/prepare` becomes
`POST {ats}/v1/organizations/{org}/works/1024/versions/prepare`.

The B2B reverse-lookup needs the `works:read` scope on the key; the version
endpoints need `works:update`.

### The `search` parameter

The ATS B2B listing has **no `search` parameter**. The widget still sends one
(its work-list UI has a search box). The BFF should either strip `search`
before forwarding and filter the returned `works` by title itself, or omit the
search box from its integration. The demo proxy does the former.

---

## Response shapes

The BFF forwards these straight from the ATS. They are modelled in
`src/api/types.ts`.

### List works — `GET /external-users/{ref}/works`

```jsonc
{
  "works": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",  // work UUID
      "ats_id": 1024,                                 // number | null (null pre-chain)
      "network": "testnet",
      "title": "My Song",
      "latest_version": 3,
      "created_at": "2024-11-12T14:23:01Z",
      "external_user_ref": "u-42",
      "versions": [                                   // full history, oldest-first
        {
          "version": 1,
          "commitment": "0x9c…",
          "registered_at_block": 7925,
          "registered_at": "2024-11-12T14:23:01Z",
          "asset_filename": "my-song.wav",            // original upload name
          "block_hash": "0x…",                        // optional
          "tx_hash": "0x…",                           // optional
          "fee_credits": 1460,                        // optional
          "storage_fee_credits": 0                    // optional
        }
      ]
    }
  ],
  "page_info": {
    "has_next_page": false,
    "has_previous_page": false,
    "start_cursor": "…",
    "end_cursor": "…"
  },
  "total_count": 1
}
```

The version history is **embedded inline** — there is no separate per-work
versions endpoint. The download-detail screen renders `work.versions` directly.

The B2B listing is intentionally narrow: it does **not** carry a per-work
`owner` or `has_files`. The widget derives what it can from the inline
versions — the latest commitment, the update timestamp, and the work-level
filename all come from the newest version — and degrades gracefully for the
rest: download buttons stay enabled and simply show a 404 error if a file is
absent.

### Downloads — `GET …/download/audio` · `…/download/certificate`

```json
{ "url": "https://s3.amazonaws.com/…presigned…", "expires_at": "2026-05-13T12:00:00Z" }
```

### Version update — `init` · `init-upload` · `prepare` · `confirm`

```jsonc
// init                → { "job_id": "…" }
// init-upload         → { "job_id": "…", "upload_url": "https://s3…", "upload_expires_at": "…" }
// prepare             → { "job_id": "…", "commitment": "0x…", "version_deposit_credits": 20,
//                         "network_fee_credits": 12, "service_fee_credits": 5,
//                         "storage_fee_credits": 8, "total_price_credits": 45,
//                         "is_valid": true, "expires_at": "…" }
// confirm (202)       → { "transaction_id": "…", "ws_url": "/v1/ws/transactions/…",
//                         "status_url": "/v1/transactions/…" }
```

After `confirm`, the widget tracks the transaction by hitting `ws_url` /
`status_url` on **`ats-url`** directly — those ATS transaction endpoints are
public (the transaction id is the capability), so no proxying is needed.

---

## Errors

The widget expects the ATS unified error envelope on any non-2xx response:

```json
{ "error": { "code": "work.not_found", "message": "…", "request_id": "req_…" } }
```

The BFF must forward upstream error bodies and status codes unchanged. If the
proxy itself fails (misconfiguration, ATS unreachable) it should still answer
with that envelope shape so the widget can render a message — see the demo
proxy for `proxy.misconfigured` / `common.service_unavailable` examples.

---

## The creators gap

The widget's "Show creators" panels (download-detail and the update
work-selector) and the update-flow creator prefill need per-version creator
data. The ATS B2B listing **deliberately omits creators** ("partner-facing data
only"), and there is no B2B creators endpoint.

Until one exists, that single lookup is served by a local mock,
`src/api/mock.ts`, gated by `USE_MOCK_WORK_CREATORS` in `src/constants.ts`.
Everything else — listing, downloads, version updates — is wired to the real
API through the proxy.

When a B2B creators endpoint ships:

1. Have the BFF proxy forward
   `/external-users/{ref}/works/{workId}/versions/{version}/creators`
   (the path `listUserWorkVersionCreators` already targets in its non-mock
   branch).
2. Set `USE_MOCK_WORK_CREATORS = false` in `src/constants.ts` — Rollup then
   tree-shakes `src/api/mock.ts` out of the bundle.
3. Delete `src/api/mock.ts` once the flag is permanently off.

---

## Reference

- **ATS B2B endpoints & API-key model** — `services/ats/src/routes/organizations/`
  and `services/organizations/docs/api-keys-integration-guide.md` in the
  `web2-platform` repo.
- **Reference BFF proxy** — [`demo/server/api/ats-proxy/[...].ts`](../../demo/server/api/ats-proxy/%5B...%5D.ts).
- **Widget consumer** — [`src/api/client.ts`](../../src/api/client.ts),
  [`src/api/types.ts`](../../src/api/types.ts).
