/**
 * BFF proxy for the ATS user-scoped (B2B) works endpoints.
 *
 * The widget's `proxy-url` attribute points here. The widget can only call a
 * host-controlled endpoint for these flows because two different secrets are
 * involved upstream and neither belongs in the browser:
 *
 * - **Write routes** — `POST /v1/organizations/{org}/works/(init|prepare|confirm)`
 *   and the per-work `…/versions/*` endpoints — authenticate with the
 *   organization's long-lived API key (`afo_sk_live_…`).
 * - **Read / download routes** — `GET /v1/organizations/{org}/external-users/
 *   {ref}/works(...)` — authenticate with a **partner-session JWT**, a
 *   short-lived HS256 token minted by the organizations service from the same
 *   API key, pinned to a single `(organization_id, external_user_ref)` pair.
 *   Shipping `afo_sk_*` to the browser would leak full registration scope to
 *   every end-user, so ATS deliberately refuses the API key on these routes.
 *
 * This route holds the API key + organization id server-side, mints (and
 * caches) partner-session JWTs on demand, and dispatches each request to the
 * right credential based on its path. The widget still sends its session token
 * + site key for `register` / `update`; the demo uses them only to authenticate
 * the widget→BFF hop in a real deployment and ignores them here.
 */

interface PartnerSessionResponse {
  token: string;
  expires_at: number;
  ttl_seconds: number;
}

interface CachedToken {
  token: string;
  // Unix ms at which we consider the token no longer reusable. Set to
  // `expires_at - PARTNER_TOKEN_REFRESH_SKEW_MS` so we never hand out a token
  // that's about to expire mid-request upstream.
  refreshAt: number;
}

// Refresh a minute before the upstream expiry to absorb clock skew + flight
// time. The upstream default TTL is 60 minutes so we still get strong caching.
const PARTNER_TOKEN_REFRESH_SKEW_MS = 60_000;

// Process-local cache. A real host would back this with Redis (or similar) so
// horizontally-scaled BFF instances share mints — for the demo, in-memory is
// fine and a Nuxt restart just forces a re-mint on the next request.
const partnerTokenCache = new Map<string, CachedToken>();

/** True when `subPath` targets one of the partner-session-JWT routes. */
function needsPartnerSession(subPath: string): boolean {
  return subPath.startsWith("external-users/");
}

/** Extract the `{external_user_ref}` segment from a partner-session subPath. */
function extractExternalUserRef(subPath: string): string | null {
  // subPath looks like `external-users/<ref>/works[/...]`. We only ever take
  // the segment immediately after `external-users/` — anything deeper is the
  // resource path (works, downloads, versions).
  const match = /^external-users\/([^/]+)(?:\/|$)/.exec(subPath);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Mint (or reuse a cached) partner-session JWT for `(organization_id, ref)`.
 *
 * Throws an `Error` carrying an upstream-shaped error envelope so the caller
 * can forward it verbatim into the widget's unified error handling.
 */
async function getPartnerSessionToken(opts: {
  organizationsUrl: string;
  organizationId: string;
  apiKey: string;
  externalUserRef: string;
}): Promise<string> {
  const cacheKey = `${opts.organizationId}::${opts.externalUserRef}`;
  const cached = partnerTokenCache.get(cacheKey);
  if (cached && cached.refreshAt > Date.now()) {
    return cached.token;
  }

  const url =
    opts.organizationsUrl.replace(/\/+$/, "") +
    `/v1/organizations/${opts.organizationId}/partner-sessions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ external_user_ref: opts.externalUserRef }),
    });
  } catch (err) {
    console.error("[ats-proxy] partner-session mint failed:", url, err);
    throw new ProxyUpstreamError(502, {
      code: "common.service_unavailable",
      message: "Organizations service unreachable.",
      request_id: "",
    });
  }

  if (!response.ok) {
    let upstreamBody: unknown = null;
    try {
      upstreamBody = await response.json();
    } catch {
      // Non-JSON upstream — fall through to generic envelope below.
    }
    const error =
      isApiErrorEnvelope(upstreamBody) && upstreamBody.error
        ? upstreamBody.error
        : {
            code: "partner_session.mint_failed",
            message: `Partner-session mint returned HTTP ${response.status}.`,
            request_id: "",
          };
    throw new ProxyUpstreamError(response.status, error);
  }

  const body = (await response.json()) as PartnerSessionResponse;
  const refreshAt = body.expires_at * 1000 - PARTNER_TOKEN_REFRESH_SKEW_MS;
  partnerTokenCache.set(cacheKey, { token: body.token, refreshAt });
  return body.token;
}

interface ApiErrorEnvelope {
  error: { code: string; message: string; request_id: string };
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const err = (value as Record<string, unknown>).error;
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as Record<string, unknown>).code === "string" &&
    typeof (err as Record<string, unknown>).message === "string"
  );
}

class ProxyUpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: ApiErrorEnvelope["error"],
  ) {
    super(envelope.message);
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  // Server-side ATS base — falls back to the public one for native dev where
  // the server and browser share `localhost`.
  const atsBase = String(config.atsApiUrl || config.public.atsUrl || "").replace(
    /\/+$/,
    "",
  );
  const organizationsUrl = String(config.organizationsUrl || "");
  const org = config.organizationId;
  const apiKey = config.atsApiKey;

  if (!atsBase || !org || !apiKey || !organizationsUrl) {
    setResponseStatus(event, 500);
    return {
      error: {
        code: "proxy.misconfigured",
        message:
          "ATS proxy is missing atsUrl, organizationsUrl, organizationId or atsApiKey.",
        request_id: "",
      },
    };
  }

  const subPath = (event.context.params?._ || "").replace(/^\/+/, "");
  const query = getQuery(event);

  // The B2B works listing has no `search` parameter — strip it before
  // forwarding and filter the response here, so the widget's search box keeps
  // working transparently.
  const isWorksList = /^external-users\/[^/]+\/works$/.test(subPath);
  const searchTerm =
    isWorksList && typeof query.search === "string"
      ? query.search.toLowerCase().trim()
      : "";

  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "search" || value == null) continue;
    forwarded.set(key, String(value));
  }
  const qs = forwarded.toString();
  const target = `${atsBase}/v1/organizations/${org}/${subPath}${qs ? `?${qs}` : ""}`;

  // Pick the right credential for this path. Read/download routes get a
  // partner-session JWT scoped to the URL's `external_user_ref`; write routes
  // keep using the org's API key directly.
  let upstreamAuth: string;
  if (needsPartnerSession(subPath)) {
    const ref = extractExternalUserRef(subPath);
    if (!ref) {
      setResponseStatus(event, 400);
      return {
        error: {
          code: "proxy.invalid_path",
          message: "Missing external_user_ref segment in proxy path.",
          request_id: "",
        },
      };
    }
    try {
      const jwt = await getPartnerSessionToken({
        organizationsUrl,
        organizationId: String(org),
        apiKey: String(apiKey),
        externalUserRef: ref,
      });
      upstreamAuth = `Bearer ${jwt}`;
    } catch (err) {
      if (err instanceof ProxyUpstreamError) {
        setResponseStatus(event, err.status);
        return { error: err.envelope };
      }
      console.error("[ats-proxy] unexpected mint error:", err);
      setResponseStatus(event, 502);
      return {
        error: {
          code: "common.service_unavailable",
          message: "Partner-session mint failed.",
          request_id: "",
        },
      };
    }
  } else {
    upstreamAuth = `Bearer ${apiKey}`;
  }

  const method = event.method;
  const headers: Record<string, string> = { Authorization: upstreamAuth };
  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify((await readBody(event).catch(() => null)) ?? {});
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { method, headers, body });
  } catch (err) {
    console.error("[ats-proxy] upstream fetch failed:", target, err);
    setResponseStatus(event, 502);
    return {
      error: {
        code: "common.service_unavailable",
        message: "ATS service unreachable.",
        request_id: "",
      },
    };
  }

  // If the cached JWT was revoked or rotated upstream we'll get a 401. Drop
  // the cache entry so the next request mints fresh — we don't retry inline
  // here to keep the proxy's behaviour observable from the widget side.
  if (upstream.status === 401 && needsPartnerSession(subPath)) {
    const ref = extractExternalUserRef(subPath);
    if (ref) partnerTokenCache.delete(`${org}::${ref}`);
  }

  const text = await upstream.text();
  setResponseStatus(event, upstream.status);
  setResponseHeader(event, "Content-Type", "application/json");
  const retryAfter = upstream.headers.get("retry-after");
  // `Retry-After` is RFC-7231 either an `HTTP-date` or `delta-seconds`. The
  // h3 typing narrows `setResponseHeader` for this name to `number`, so route
  // through the node response object to forward the raw upstream value
  // verbatim — both forms are valid for the widget to see.
  if (retryAfter) event.node.res.setHeader("Retry-After", retryAfter);

  if (!text) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    // Forward non-JSON bodies verbatim (should not happen for the ATS API).
    return text;
  }

  // Apply the title filter for a searched listing.
  if (
    upstream.ok &&
    searchTerm &&
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { works?: unknown }).works)
  ) {
    const data = payload as { works: Array<{ title?: string }>; total_count?: number };
    data.works = data.works.filter((w) =>
      (w.title || "").toLowerCase().includes(searchTerm),
    );
    data.total_count = data.works.length;
  }

  return payload;
});
