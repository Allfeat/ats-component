# Unified Error System Migration — Design Spec

**Date:** 2026-04-12
**Approach:** Full replacement in one pass (Approach B)
**Scope:** Widget error types, HTTP client, global interceptor, error catalog, renderers, WebSocket, events, documentation

---

## 1. Context

The backend replaced all ad-hoc error handling with a unified system. Every error now returns a structured envelope:

```json
{
  "error": {
    "code": "session.origin_not_allowed",
    "message": "origin is not in the allowed list",
    "details": { "origin": "https://evil.example.com" },
    "request_id": "req_01HXYZ8G7K3M9Q2F4N5P6R7S8T"
  }
}
```

The widget currently uses a coarse `ApiErrorCode` enum (11 values), `AtsApiException` class, HTTP-status-based error mapping, and flat string error messages. All of this is replaced.

## 2. Decisions

| Question | Decision |
|----------|----------|
| i18n / locales | English only. Simple `Record<string, string>` catalog, no i18n framework. |
| Event payloads (`allfeat:failed`, `allfeat:error`) | Breaking change. New structured payload with `code`, `message`, `requestId`, `details`. Old `error: string` field replaced. |
| Configuration error display | Dedicated DISABLED screen (no retry button), distinct from FAILED. |
| `common.validation_failed` handling | Generic error message. No form re-navigation — client-side Zod is the primary gate. |
| `request_id` visibility | Terminal screens only (FAILED, DISABLED). Not shown on inline form errors. |

## 3. New Error Types

**File:** `src/api/types.ts`

Delete `ApiErrorCode` enum and `AtsApiException` class. Replace with:

```typescript
/** Structured error body from the unified backend envelope */
interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

/** Discriminated union for all widget errors */
type WidgetError =
  | { kind: "api"; error: ApiErrorBody; httpStatus: number }
  | { kind: "network"; message: string }
  | { kind: "upload"; message: string; httpStatus?: number }
  | { kind: "malformed"; status: number; body: string };
```

The `upload` kind covers S3 failures (S3 does not return the unified envelope).

## 4. HTTP Client (`apiFetch`)

**File:** `src/api/client.ts`

Replace `authenticatedFetch` + `parseErrorBody` + `mapHttpError` with a single `apiFetch<T>` function.

```typescript
function isApiErrorResponse(body: unknown): body is { error: ApiErrorBody } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as any).error?.code === "string" &&
    typeof (body as any).error?.request_id === "string"
  );
}

async function apiFetch<T>(
  url: string,
  token: string,
  siteKey: string,
  options: RequestInit = {},
): Promise<T> {
  // Headers: Content-Type, Authorization, X-Site-Key
  // 429 retry loop preserved (up to AUTH_FETCH_MAX_RETRIES, with Retry-After support)
  // On success (2xx/202): return response.json()
  // On error: parse body as JSON, check isApiErrorResponse
  //   - If valid envelope: throw { kind: "api", error: body.error, httpStatus }
  //   - If not parseable: throw { kind: "malformed", status, body: text }
  // On fetch() failure: throw { kind: "network", message }
}
```

Error response parsing is extracted into a shared `parseErrorResponse(response: Response): Promise<never>` helper. Both `apiFetch` (authenticated) and `fetchStats` (unauthenticated, plain `fetch`) call this helper on non-2xx responses. This avoids duplicating envelope parsing logic.

Key changes:
- `onTokenExpired` callback parameter removed from all API functions
- Token handling moves to the component-level global interceptor
- All API functions become thin wrappers over `apiFetch<T>`
- `fetchStats` (unauthenticated) uses `parseErrorResponse` for consistent error parsing without auth headers

## 5. Global Error Interceptor

**File:** `src/allfeat-register.ts`

A single `handleError(error: WidgetError, stage: string)` method replaces all scattered catch-block logic:

1. **Always log** API errors to console: `[Allfeat Widget] ${code} (${request_id}): ${message}`
2. **Auth/session codes** (`session.invalid_token`, `common.auth.missing_token`, `common.auth.expired`, `common.auth.invalid_token`): trigger token refresh flow
3. **Configuration codes** (`session.key_inactive`, `session.widget_not_enabled`, `session.origin_not_allowed`, `organization.not_found`, `organization.inactive`, `organization.no_integration`, `common.auth.invalid_api_key`): transition to DISABLED screen
4. **Service unavailable codes** (`common.service_unavailable`, `common.auth.jwks_unavailable`, `common.auth.backend_unavailable`, `transaction.store_unavailable`): FAILED screen with retry
5. **Rate limited** (`common.rate_limited`, `session.rate_limited`): FAILED screen with message
6. **Everything else**: localize via error catalog, FAILED screen
7. **Non-API errors** (network, upload, malformed): FAILED screen with appropriate message, no request ID

Token handling simplifies: `handleTokenExpired` stores the `stage` string and re-invokes `handleSubmit()` when a new token arrives. No more `retryFn` callback threading.

Each API call site becomes:
```typescript
try {
  const result = await initWork(this.atsUrl, this.token, this.siteKey, data);
} catch (error) {
  this.handleError(error as WidgetError, "init");
  return;
}
```

## 6. Error Message Catalog

**File:** `src/errors/messages.ts` (new)

A `Record<string, string>` mapping dotted error codes to English user-facing messages, plus a `getErrorMessage(code, details?)` function with `{placeholder}` template interpolation.

Categories covered:
- Session & Auth (`session.*`, `common.auth.*`)
- Organization (`organization.*`)
- Registration (`registration.*`)
- Works & Transactions (`work.*`, `access_code.*`, `transaction.*`)
- Common (`common.*`)

Programming errors (e.g. `session.invalid_action_type`, `session.invalid_network`) have no user-facing message and fall through to the fallback: "An unexpected error occurred. Please try again."

Special interpolation: `registration.audio_too_large` receives `size_bytes`/`max_bytes` from the backend. The function converts bytes to MB and maps to `{size_mb}`/`{max_mb}` template keys.

## 7. New Screens & Renderers

**File:** `src/form/renderer.ts`

### 7a. DISABLED Screen (new)

New `Screen` value: `'DISABLED'`. Rendered by `renderDisabledScreen(message, requestId)`.

Layout:
- Warning icon
- "Widget Unavailable" title
- Localized error message
- Request ID with copy button
- "Contact your administrator for assistance."
- No retry button (configuration errors are not retryable)

### 7b. Updated FAILED Screen

`renderFailedScreen` gains an optional `requestId` parameter. When present, shows "Error ID: req_..." with a copy button below the error message. When `null`, the line is omitted.

### 7c. Component State Change

`ComponentState.error` changes from `string | null` to:

```typescript
error: {
  message: string;
  requestId: string | null;
  code: string | null;
} | null;
```

## 8. WebSocket Updates

**File:** `src/api/client.ts` (subscribeToTransaction)

- Remove handling for old `type: 'not_found'` messages
- Update `type: 'error'` handling: parse `msg.error` as `ApiErrorBody` (with `code`, `message`, `details`, `request_id`)
- `WsMessageType` changes from `'connected' | 'update' | 'error' | 'not_found'` to `'connected' | 'update' | 'error'`
- `WsMessage` interface updated: `error` field replaces flat `message` field for error-type messages
- Add an `onError(error: WidgetError)` callback parameter to `subscribeToTransaction` (currently missing — only has `onProgress`, `onComplete`, `onDisconnect`)
- On WS error message, construct `WidgetError` with `kind: "api"` and call `onError`
- The component passes `(error) => this.handleError(error, "tracking")` as `onError`

## 9. Event Payloads (Breaking Change)

**File:** `src/utils/events.ts`

### `FailedDetail` (new shape)

```typescript
interface FailedDetail {
  code: string;
  message: string;
  requestId: string | null;
  details?: Record<string, unknown>;
}
```

### `ErrorDetail` (new shape)

```typescript
interface ErrorDetail {
  code: string;
  message: string;
  requestId: string | null;
  stage: string;
  details?: Record<string, unknown>;
}
```

For non-API errors, `code` uses synthetic widget-internal values:
- `"widget.network_error"`
- `"widget.upload_error"`
- `"widget.malformed_response"`

These are prefixed with `widget.` to avoid collision with backend codes.

## 10. Documentation Updates

**Files in `docs/src/content/docs/`:**

### `guides/error-handling.mdx`

- Replace old error codes table with new error category summary
- Update `allfeat:failed` and `allfeat:error` examples with new payload shape
- Replace `AtsApiException` section with `WidgetError` type reference
- Add request ID section (what it is, how to use for support)
- Update retry behavior table with new error codes

### `reference/error-codes.mdx`

Full rewrite. Replace 11-row `ApiErrorCode` table with full dotted-code catalog organized by category:
- Session & Auth, Configuration, Registration, Works & Access, Transaction, Common, Widget-internal
- Each code: code string, user-facing message, recommended integrator action

### `reference/events.mdx`

- Update `FailedDetail` and `ErrorDetail` interfaces
- Update event map table
- Update code examples to use dotted `code` strings

## 11. Deleted Code

- `ApiErrorCode` enum (entire enum)
- `AtsApiException` class (entire class)
- `mapHttpError()` function
- `parseErrorBody()` function
- `authenticatedFetch()` function (replaced by `apiFetch`)
- `WsMessageType` value `'not_found'`
- Old `WsMessage.message` field for error messages

## 12. Files Changed

| File | Action |
|------|--------|
| `src/api/types.ts` | Delete `ApiErrorCode`, `AtsApiException`. Add `ApiErrorBody`, `WidgetError`. Update `WsMessageType`, `WsMessage`. |
| `src/api/client.ts` | Replace `authenticatedFetch`/`parseErrorBody`/`mapHttpError` with `apiFetch`. Update `subscribeToTransaction` for new WS format. Simplify all API function signatures (drop `onTokenExpired`). |
| `src/errors/messages.ts` | New file. Error message catalog + `getErrorMessage()`. |
| `src/form/types.ts` | Update `ComponentState.error` type. Add `'DISABLED'` to `Screen`. |
| `src/form/renderer.ts` | Add `renderDisabledScreen()`. Update `renderFailedScreen()` signature. |
| `src/allfeat-register.ts` | Add `handleError()` global interceptor. Simplify all API call sites. Add DISABLED screen rendering. Update token refresh flow. |
| `src/utils/events.ts` | Update `FailedDetail`, `ErrorDetail` interfaces. |
| `docs/src/content/docs/guides/error-handling.mdx` | Rewrite with new error system. |
| `docs/src/content/docs/reference/error-codes.mdx` | Full rewrite with dotted codes. |
| `docs/src/content/docs/reference/events.mdx` | Update event payloads. |
