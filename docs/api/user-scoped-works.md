# User-Scoped Works — Widget Integration

How the `<ats-widget>` reads, updates and downloads works that belong to
one of a partner's end-users.

> **Backend reference.** The end-to-end model — JWT claims, server-side
> scoping, route matrix — lives in the platform monorepo at
> `services/organizations/docs/external-user-ref-guide.md`. This document
> only covers the widget side.

## One token type, one surface

There is a single auth credential between the widget and the ATS: the
widget session JWT minted by the organizations service at
`POST /v1/sessions`. The widget always hits the same routes — the
`/v1/works/...` surface for the user-scoped flows, the
`/v1/access/{code}/...` surface for the refless access-code flow.

Two JWT claims drive what the widget can do with its token:

| Claim                | Values                                       | Effect                                                                            |
|----------------------|----------------------------------------------|-----------------------------------------------------------------------------------|
| `action_type`        | `register` / `update_version` / `access`     | Narrows the action: register a new work, push a new version, or read-only access. |
| `external_user_ref`  | _optional_, arbitrary string ≤ 255 bytes     | Scopes every `/v1/works/...` call to the org's works tagged with this ref.        |

`external_user_ref` is orthogonal to `action_type` — a session may carry
any combination. Setting `external-user-id` on the widget triggers the
host to mint tokens that carry the ref; clearing it falls back to the
access-code flow on update/download.

## Why the host still has a server-side role

The widget `secret_key` is the long-lived secret that mints session
tokens. It must stay on the host's backend. The widget cannot mint its
own tokens, so the host exposes one tiny endpoint that exchanges the
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
                                          ▲     │
                                          │     ▼ { token, expires_in }
┌─────────────┐    POST /api/token   ┌──────────┐
│   Browser   │ ────────────────────▶│ Host BFF │
│  <ats-widget>│ ◀──────────────────  │          │
└─────────────┘     { token }        └──────────┘
       │
       │  Bearer <token> + X-Site-Key
       ▼
┌─────────────────────────────────────────┐
│  ATS service                            │
│   GET    /v1/works                      │
│   GET    /v1/works/{ats_id}/...         │
│   GET    /v1/works/{work_uuid}/download │
│   POST   /v1/works/{init,prepare,…}     │
│   POST   /v1/works/{ats_id}/versions/…  │
│   GET/POST /v1/access/{code}/...        │
└─────────────────────────────────────────┘
```

Once the JWT is on the widget's `token` attribute, every call goes
directly from the browser to the ATS. The server reads the JWT claims
and scopes the response accordingly — there is no second host hop.

## What the widget needs

| Attribute            | Required for                          | Notes                                                                          |
|----------------------|---------------------------------------|--------------------------------------------------------------------------------|
| `ats-url`            | every flow                            | ATS service base URL.                                                          |
| `site-key`           | every flow                            | Public site key (`cpk_...`). Sent on `X-Site-Key`.                             |
| `token`              | every flow                            | The freshly-minted JWT.                                                        |
| `network`            | every flow                            | `testnet` or `mainnet`. Must match the JWT's `allowed_network`.                |
| `mode`               | every flow                            | `register`, `update`, or `download`.                                           |
| `external-user-id`   | the ref-scoped variants of update / download | Mirrors the JWT's `external_user_ref` claim — used to decide which UI sub-flow to render. |

There is **no** `organization-id` attribute anymore — the org is
resolved server-side from the JWT.

## Picking the right `action_type`

The host BFF maps the widget mode to the JWT claim:

| Widget mode | `action_type`     | What it authorizes                                              |
|-------------|-------------------|-----------------------------------------------------------------|
| `register`  | `register`        | `POST /v1/works/init|prepare|confirm`                            |
| `update`    | `update_version`  | `POST /v1/works/{id}/versions/...` and the access-code variants  |
| `download`  | `access`          | `GET /v1/works/...` reads, downloads, and access-code lookups    |

The token is single-purpose and short-lived (≈5 min). Each mode switch
should mint a fresh token.

## Listing — `GET /v1/works`

The widget calls the same listing for every caller; the server narrows
the result based on the JWT:

- Direct user → user's personal works (`organization_id IS NULL`).
- Widget session with `external_user_ref` → org's works tagged with
  that ref. Refless widget sessions are rejected with `common.forbidden`
  on this endpoint (they must use `/v1/access/{code}/work`).
- B2B API key → all the org's works, optionally narrowed by
  `?external_user_ref=`.

```http
GET /v1/works?network=testnet&first=50&after=<cursor>&search=<text>
Authorization: Bearer <token>
X-Site-Key: <site_key>
```

Response (`ListWorksResponse`):

```jsonc
{
  "works": [
    {
      "id": "<uuid>",               // path param for the download routes
      "ats_id": 1024,
      "owner": "<ss58>",
      "latest_version": 2,
      "latest_commitment": "0x...",
      "created_at": "2026-05-01T08:12:00Z",
      "latest_version_at": "2026-05-15T14:33:00Z",
      "title": "My Track",
      "asset_filename": "track.wav",
      "has_files": true
    }
  ],
  "page_info": {
    "has_next_page": true,
    "has_previous_page": false,
    "start_cursor": "2026-05-15T14:33:00+00:00",
    "end_cursor": "2026-05-01T08:12:00+00:00"
  },
  "total_count": 17
}
```

The list does **not** embed per-work version history any longer — that
moved to `GET /v1/works/{ats_id}/versions`. The widget fetches it on
demand when the user drills into a row.

## Update path

Refless widget sessions cannot reach `/v1/works/{ats_id}/versions/...`.
They must use `/v1/access/{code}/versions/...` with an access code the
end-user has on hand. Widget sessions carrying `external_user_ref`
identify the work by its numeric ATS id picked from the listing.

```http
POST /v1/works/{ats_id}/versions/init-upload
Authorization: Bearer <token>
X-Site-Key: <site_key>
Content-Type: application/json

{ "network": "testnet", "creators": [...], "filename": "song-v2.wav" }
```

Then the standard prepare → confirm sequence on the same `{ats_id}`.
The server cross-checks `work.external_user_ref` against the JWT and
returns `403` on mismatch (so a session pinned to user A cannot mutate
user B's work in the same org).

## Downloads

Both the latest-version certificate and the per-version assets resolve
by the work's UUID returned in the listing.

```
GET /v1/works/{work_uuid}/download/certificate
GET /v1/works/{work_uuid}/download/asset
GET /v1/works/{work_uuid}/versions/{v}/download/audio
GET /v1/works/{work_uuid}/versions/{v}/download/certificate
```

All four respect the JWT's ownership scope — a download for a work
outside the caller's scope returns `404`, not `403`.

## Token refresh

The widget emits `allfeat:token-expired` when its JWT is rejected. The
host's `mintExternalUserSession(mode)` should be called for the active
mode and the result placed back on the `token` attribute. The widget
resumes the paused step automatically.
