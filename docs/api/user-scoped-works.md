# User-Scoped Works API — Widget Contract

This document specifies the new HTTP endpoints required by the `<ats-widget>` to support the **external-user-id-driven update flow** and the **download mode**. The widget ships with mock implementations gated by `USE_MOCK_USER_WORKS` in [`src/constants.ts`](../../src/constants.ts); flip that flag to `false` once the real endpoints are live.

## Relationship to existing dashboard endpoints

These endpoints are deliberately modelled on the existing dashboard endpoints in `services/ats/src/routes/works/` so backend implementation can mostly reuse existing handlers, swapping the ownership check from "authenticated user" to "external user id within the JWT's site/organization".

The wire format of `WorkSummary`, `WorkVersion`, `CreatorResponse`, and `DownloadUrlResponse` is **identical** to the dashboard versions (`services/ats/src/routes/works/types.rs`). The only deviation is:

- `WorkSummary` is extended with one additive field, **`updated_at`** (ISO timestamp of the latest version's registration), so the widget can surface recently-updated works at the top of the list. The dashboard currently orders by `created_at`; the widget needs `updated_at` for its "most-recent-activity-first" UX. Backend implementors: this can be populated as `MAX(versions.registered_at)` per work.

Field names, optionality, and JSON encoding (snake_case) match the dashboard exactly.

## Scope and authorization

All endpoints described here are scoped to an **external user id** (a partner-supplied identifier — UUID, email-hash, or any opaque string). The widget's existing JWT is **site-scoped** (it identifies the partner's site, not a specific user); the external user id picks the user within that site.

Every endpoint **must** verify that the organization derived from the JWT's claims matches the organization that owns the `(site, externalUserId)` mapping. A cross-tenant bug here would be catastrophic.

### Suggested JWT claim model

Introduce a new `action_type = "user_scoped"` JWT that:

- Lists allowed actions (`list`, `download_asset`, `download_certificate`, `update_version`).
- Includes the `external_user_id` it is bound to (claim name suggestion: `eui`).
- Has the usual site/organization claims.

Write endpoints (`init`, `prepare`, `confirm`) reject the request if the JWT's `eui` doesn't match the `{externalUserId}` path parameter.

### Common headers

| Header              | Required | Notes                                      |
|---------------------|----------|--------------------------------------------|
| `Authorization`     | yes      | `Bearer <jwt>` — the user-scoped JWT.      |
| `X-Site-Key`        | yes      | `cpk_…` — partner site key.                |
| `Content-Type`      | POST     | `application/json` for write endpoints.    |

### Common error envelope

All non-2xx responses use the existing unified error envelope:

```json
{
  "error": {
    "code": "work.not_owned_by_user",
    "message": "User is not the owner of this work.",
    "details": { "work_id": "..." },
    "request_id": "req_xxx"
  }
}
```

---

## 1. List user works

**`GET /v1/users/{externalUserId}/works`**

Returns a paginated list of works that belong to the external user, scoped to the given network.

### Path parameters
- `externalUserId` *(string, required)* — partner-supplied user id.

### Query parameters
| Name      | Type        | Required | Default | Notes                                                  |
|-----------|-------------|----------|---------|--------------------------------------------------------|
| `network` | `"testnet" \| "mainnet"` | yes | —       | Filter by network.                                     |
| `first`   | integer     | no       | 50      | Page size; max 200.                                    |
| `after`   | string      | no       | —       | Opaque cursor from a previous `page_info.end_cursor`.  |
| `search`  | string      | no       | —       | Case-insensitive substring match on `title`.           |

### Response `200`

```json
{
  "works": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "ats_id": 42,
      "owner": "0xab...",
      "latest_version": 3,
      "latest_commitment": "0x9c...",
      "created_at": "2024-11-12T14:23:01Z",
      "updated_at": "2025-03-04T09:12:51Z",
      "title": "My Song",
      "asset_filename": "song.mp3",
      "has_files": true
    }
  ],
  "page_info": {
    "has_next_page": true,
    "has_previous_page": false,
    "start_cursor": "...",
    "end_cursor": "..."
  },
  "total_count": 17
}
```

#### Field semantics — mirrors `WorkSummary` (dashboard)

| Field                | Type              | Notes                                                                 |
|----------------------|-------------------|-----------------------------------------------------------------------|
| `id`                 | string (UUID)     | Internal work identifier. Used as path param for downloads + version-update endpoints. |
| `ats_id`             | number            | On-chain numeric id. `-1` if not yet assigned (matches existing dashboard sentinel). |
| `owner`              | string            | Blockchain address of the owner. (Same field name as `WorkSummary.owner`.) |
| `latest_version`     | number            | Most recent version number.                                           |
| `latest_commitment`  | string \| null    | Latest commitment hash, prefixed `0x`.                                |
| `created_at`         | string (ISO 8601) | First registration timestamp (v1). May be `null` if unknown.          |
| `updated_at`         | string (ISO 8601) | **Widget-specific addition.** Timestamp of the most recent version's registration. Used for ordering. May be `null`. |
| `title`              | string \| null    | User-supplied title.                                                  |
| `asset_filename`     | string \| null    | Original filename of the latest version's asset.                      |
| `has_files`          | boolean           | `true` when an asset file exists and is downloadable.                 |

The `network` is **not** echoed in the response (it's a query param, matching the dashboard convention).

#### Default ordering

The widget displays works **sorted by `updated_at` descending** (most recently-updated first), falling back to `created_at` when `updated_at` is null. The backend should return results in that order; the widget applies the same sort defensively after mapping the response.

### Errors

| HTTP | Code                              | Meaning                                              |
|------|-----------------------------------|------------------------------------------------------|
| 400  | `common.validation_failed`        | Bad `network` / malformed `after` cursor.            |
| 401  | `common.auth.*`                   | Auth failures.                                       |
| 403  | `session.widget_not_enabled`      | Feature disabled for this organization.              |
| 404  | `external_user.not_found`         | Unknown user id (prefer 200 + empty array).          |
| 429  | `common.rate_limited`             |                                                      |
| 503  | `common.service_unavailable`      |                                                      |

> **Note**: Return `200` with `works: []` when the user exists but has no works. Reserve `404 external_user.not_found` for genuinely unknown ids — it shows a clearer error in the widget.

---

## 2. List a work's version history

**`GET /v1/users/{externalUserId}/works/{workId}/versions?network={network}`**

Returns the on-chain registration history of a single work, ordered chronologically (oldest first — matches the dashboard's `GET /v1/works/{ats_id}/versions`). The widget renders one card per version on the download-detail screen so the end-user can download any past version's asset or certificate.

### Path parameters
- `externalUserId` *(string, required)*
- `workId` *(string UUID, required)* — `id` from the listing endpoint.

### Query parameters
| Name      | Type                       | Required | Notes              |
|-----------|----------------------------|----------|--------------------|
| `network` | `"testnet" \| "mainnet"`   | yes      | Filter by network. |

### Response `200` — mirrors dashboard `ListVersionsResponse`

```json
{
  "ats_id": 42,
  "versions": [
    {
      "version": 1,
      "commitment": "0xfcff3c51...ca053fb573",
      "asset_filename": "my-song-v1.mp3",
      "registered_at_block": 7925,
      "registered_at": "2024-11-12T14:23:01Z",
      "media_hash": "0xab12...",
      "merkle_root": "0xcd34...",
      "block_hash": "0xf7841b6b...5d2aad4744",
      "tx_hash": "0x59b08e4b...f291e76952",
      "fee_credits": 1460,
      "storage_fee_credits": 0
    },
    {
      "version": 2,
      "commitment": "0x96a4b9d1...aba3a12520",
      "asset_filename": "my-song.mp3",
      "registered_at_block": 7945,
      "registered_at": "2025-01-08T12:48:00Z",
      "block_hash": "0xf5c1160e...dea7a3038e",
      "tx_hash": "0xc9ce2ba9...bd1ed2a107",
      "fee_credits": 256,
      "storage_fee_credits": 0
    }
  ]
}
```

#### Field semantics — mirrors `WorkVersion` (dashboard)

| Field                  | Type              | Notes                                                                 |
|------------------------|-------------------|-----------------------------------------------------------------------|
| `version`              | number            | Monotonically increasing version number, 1-based.                     |
| `commitment`           | string            | Commitment hash for this version, prefixed `0x`. **Required.**        |
| `asset_filename`       | string \| null    | **Widget-friendly addition.** Original filename of *this version's* asset (each version stores its own, since a re-upload can rename). The widget labels the download button with it. The backend already keeps this per-version (`ats_works_versions.asset_filename`) — it just needs to be surfaced. `null` when the version has no asset. |
| `registered_at_block`  | number \| null    | Block number that registered this version.                            |
| `registered_at`        | string (ISO 8601) \| null | Registration timestamp.                                       |
| `media_hash`           | string (optional) | Hash of the media file when this version was registered.              |
| `merkle_root`          | string (optional) | Merkle root of the version metadata.                                  |
| `block_hash`           | string (optional) | Hash of the including block.                                          |
| `tx_hash`              | string (optional) | On-chain transaction hash for the registration.                       |
| `fee_credits`          | number (optional) | Network + service fee in credits paid for this version.               |
| `storage_fee_credits`  | number (optional) | Storage fee in credits. `0` when the file fits in the free tier.      |

> The widget displays versions **newest-first** in the UI; ordering the response oldest-first matches block chronology and keeps semantics intuitive for backend consumers. The widget reverses on render.

> Optional fields use `skip_serializing_if = "Option::is_none"` on the dashboard side and may be **omitted entirely** from the JSON when absent (not present as `null`). The widget tolerates both.

### Errors

| HTTP | Code                          | Meaning                                                   |
|------|-------------------------------|-----------------------------------------------------------|
| 400  | `common.validation_failed`    | Malformed `workId` / unknown `network`.                   |
| 401  | `common.auth.*`               |                                                           |
| 403  | `work.not_owned_by_user`      |                                                           |
| 404  | `work.not_found`              |                                                           |

---

## 3. List creators for a specific version

**`GET /v1/users/{externalUserId}/works/{workId}/versions/{version}/creators?network={network}`**

Returns the creators recorded for a specific on-chain version of a work. The widget loads this lazily when the end-user clicks **Show creators** on a version card (cached afterwards — re-collapsing then re-expanding does not refetch).

Mirrors `GET /v1/works/{ats_id}/versions/{version}/creators` on the dashboard.

### Path parameters
- `externalUserId` *(string, required)*
- `workId` *(string UUID, required)*
- `version` *(integer, required)* — version number from §2.

### Query parameters
| Name      | Type                       | Required | Notes              |
|-----------|----------------------------|----------|--------------------|
| `network` | `"testnet" \| "mainnet"`   | yes      | Filter by network. |

### Response `200` — mirrors dashboard `ListCreatorsResponse`

```json
{
  "ats_id": 42,
  "version": 2,
  "creators": [
    {
      "full_name": "Jane Doe",
      "email": "jane@example.com",
      "roles": ["Author", "Composer"],
      "ipi": "12345678901",
      "isni": "0000000121234567"
    },
    {
      "full_name": "John Smith",
      "roles": ["Composer"]
    }
  ]
}
```

#### Field semantics — mirrors `CreatorResponse` (dashboard)

| Field        | Type              | Notes                                                       |
|--------------|-------------------|-------------------------------------------------------------|
| `full_name`  | string            | Required.                                                   |
| `email`      | string (optional) | May be omitted.                                             |
| `roles`      | string[]          | Role names like `"Author"`, `"Composer"`, `"Arranger"`, `"Adapter"`. |
| `ipi`        | string (optional) | 1–11 digits.                                                |
| `isni`       | string (optional) | 16 characters.                                              |

### Errors

| HTTP | Code                          | Meaning                                                   |
|------|-------------------------------|-----------------------------------------------------------|
| 400  | `common.validation_failed`    | Non-positive `version` / unknown `network`.               |
| 401  | `common.auth.*`               |                                                           |
| 403  | `work.not_owned_by_user`      |                                                           |
| 404  | `work.not_found`              |                                                           |
| 404  | `version` (CommonError)       | `version` doesn't exist for this work.                    |

> Caching: the dashboard caches this response for 24 hours (`Cache-Control: public, max-age=86400`) since version creators are immutable. The widget honors that.

---

## 4. Download a specific version's audio asset

**`GET /v1/users/{externalUserId}/works/{workId}/versions/{version}/download/audio`**

Returns a short-lived pre-signed URL for the version's audio file. Path matches the dashboard's `/download/audio` (not `/download/asset`) for version-scoped downloads.

### Path parameters
- `externalUserId` *(string, required)*
- `workId` *(string UUID, required)*
- `version` *(integer, required)*

### Response `200` — mirrors dashboard `DownloadUrlResponse`

```json
{
  "url": "https://s3.amazonaws.com/...presigned...",
  "expires_at": "2026-05-13T12:00:00Z"
}
```

### Errors

| HTTP | Code                          | Meaning                                                   |
|------|-------------------------------|-----------------------------------------------------------|
| 400  | `common.validation_failed`    | Non-positive `version`.                                   |
| 401  | `common.auth.*`               |                                                           |
| 403  | `work.not_owned_by_user`      |                                                           |
| 404  | `work` / `version` / `file`   | Work, version, or asset file missing.                     |

---

## 5. Download a specific version's certificate

**`GET /v1/users/{externalUserId}/works/{workId}/versions/{version}/download/certificate`**

Identical shape to §4, returning the certificate PDF for that specific version.

### Response `200`

```json
{
  "url": "https://s3.amazonaws.com/...presigned...",
  "expires_at": "2026-05-13T12:00:00Z"
}
```

### Errors

Same as §4, plus:

| HTTP | Code                              | Meaning                                  |
|------|-----------------------------------|------------------------------------------|
| 404  | `work.certificate_unavailable`    | Certificate not yet issued for this version. |

---

## 6. Version update — Init upload

**`POST /v1/users/{externalUserId}/works/{workId}/versions/init-upload`**

Starts a new version update **with a new asset file**. Mirrors the existing access-code-based `init-upload` endpoint but scoped by work id.

### Request body

```json
{
  "creators": [
    {
      "full_name": "Jane Doe",
      "email": "jane@example.com",
      "roles": { "author": true, "composer": true, "arranger": false, "adapter": false },
      "ipi": "12345678901",
      "isni": "0000000121234567"
    }
  ],
  "filename": "new-master.wav"
}
```

### Response `200`

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "upload_url": "https://s3-presigned-upload-url...",
  "upload_expires_at": "2026-05-13T12:15:00Z"
}
```

### Errors

| HTTP | Code                          | Meaning                                    |
|------|-------------------------------|--------------------------------------------|
| 400  | `common.validation_failed`    | Invalid creators / filename.               |
| 401  | `common.auth.*`               |                                            |
| 403  | `work.not_owned_by_user`      |                                            |
| 404  | `work.not_found`              |                                            |
| 409  | `version.already_in_progress` | Previous init wasn't confirmed.            |

---

## 7. Version update — Init metadata-only

**`POST /v1/users/{externalUserId}/works/{workId}/versions/init`**

Starts a metadata-only version update (no new asset file).

### Request body

```json
{
  "creators": [ /* same shape as init-upload */ ]
}
```

### Response `200`

```json
{ "job_id": "550e8400-e29b-41d4-a716-446655440000" }
```

### Errors

Same as `init-upload` minus upload-specific codes.

---

## 8. Version update — Prepare

**`POST /v1/users/{externalUserId}/works/{workId}/versions/prepare`**

Returns pricing and commitment for the in-flight version update. Mirrors the existing version `prepare` endpoint.

### Request body

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "passphrase": null
}
```

### Response `200`

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "commitment": "0x...",
  "version_deposit_credits": 100,
  "network_fee_credits": 25,
  "service_fee_credits": 10,
  "storage_fee_credits": 0,
  "total_price_credits": 135,
  "is_valid": true,
  "expires_at": "2026-05-13T12:20:00Z"
}
```

### Errors

| HTTP | Code                          | Meaning                                |
|------|-------------------------------|----------------------------------------|
| 400  | `common.validation_failed`    |                                        |
| 401  | `common.auth.*`               |                                        |
| 403  | `work.not_owned_by_user`      |                                        |
| 404  | `job.not_found`               |                                        |
| 410  | `transaction.expired`         |                                        |

---

## 9. Version update — Confirm

**`POST /v1/users/{externalUserId}/works/{workId}/versions/confirm`**

Triggers on-chain submission for the prepared version. The widget then tracks the transaction via the existing WebSocket/polling endpoints (no new tracking endpoints needed).

### Request body

```json
{ "job_id": "550e8400-e29b-41d4-a716-446655440000" }
```

### Response `200`

```json
{
  "transaction_id": "tx_550e8400...",
  "ws_url": "/v1/transactions/tx_550e8400.../ws",
  "status_url": "/v1/transactions/tx_550e8400.../status"
}
```

### Errors

| HTTP | Code                              | Meaning                                |
|------|-----------------------------------|----------------------------------------|
| 400  | `common.validation_failed`        |                                        |
| 401  | `common.auth.*`                   |                                        |
| 403  | `work.not_owned_by_user`          |                                        |
| 404  | `job.not_found`                   |                                        |
| 409  | `transaction.already_confirmed`   |                                        |
| 410  | `transaction.expired`             |                                        |

---

## Cross-cutting concerns

### Pagination
- Use Relay-style cursor pagination (`first` + `after`) consistent with the existing `/v1/works` endpoint.
- `end_cursor`/`start_cursor` are opaque strings — the widget never inspects them.

### Rate limiting
- Apply the existing site-level rate limit. The widget retries `429` once with the `Retry-After` header honored.

### Idempotency
- Listing and download endpoints are inherently idempotent.
- Version-update endpoints accept retries on the same `job_id`: `prepare` and `confirm` should be safe to call twice in quick succession (return the same result or `409 transaction.already_confirmed` after success).

### Caching
- Listing endpoint: do **not** cache shared (per-user data).
- Download URLs: short-lived presigned URLs (~15 min). The widget does not cache them; it requests a fresh URL on every download click.

### Audit log
- Recommend logging `(site_key, external_user_id, work_id, action)` for every successful asset/certificate download for compliance / abuse investigation.

---

## Widget integration notes

These endpoints are consumed by:

- [`src/api/client.ts`](../../src/api/client.ts) — `listUserWorks`, `listUserWorkVersions`, `listUserWorkVersionCreators`, `downloadUserWorkVersionAsset`, `downloadUserWorkVersionCertificate`, `initUserWorkVersionUpload`, `initUserWorkVersion`, `prepareUserWorkVersion`, `confirmUserWorkVersion`.
- Mock implementations live in [`src/api/mock.ts`](../../src/api/mock.ts) and are gated by `USE_MOCK_USER_WORKS` in [`src/constants.ts`](../../src/constants.ts).

When the backend ships:

1. Set `USE_MOCK_USER_WORKS = false` in `src/constants.ts` (or wire a Rollup `replace`-plugin token).
2. Delete `src/api/mock.ts` and remove the `if (USE_MOCK_USER_WORKS) { ... }` gates in `src/api/client.ts`.
3. Run `bun run typecheck` and `bun run build`.
4. Bump the widget's minor version (new mode + new attribute = `feat:`).

---

## Reference: existing related endpoints (for the backend dev)

These already exist and informed the contract above:

- `GET /v1/works` — list works (organization-scoped, used by the feat app dashboard).
- `GET /v1/access/{accessCode}/work` — fetch a single work via access code (legacy update flow).
- `POST /v1/access/{accessCode}/versions/*` — access-code-based version update (still used when `external-user-id` is absent).
- `GET /v1/works/{workId}/download/certificate` — certificate download for the post-registration success screen.
- WebSocket/polling: `/v1/transactions/{id}/ws` and `/v1/transactions/{id}/status` — reused unchanged for tracking the new version-update flow.
