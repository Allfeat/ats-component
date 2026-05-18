/**
 * BFF proxy for the ATS user-scoped (B2B) works endpoints.
 *
 * The widget's `proxy-url` attribute points here. The widget can only call a
 * host-controlled endpoint for these flows because the ATS B2B API
 * (`/v1/organizations/{org}/external-users/{ref}/works…`) authenticates with a
 * secret organization API key (`afo_sk_live_…`) that must never reach the
 * browser.
 *
 * This route holds that key + the organization id server-side and forwards
 * `/api/ats-proxy/<path>` to `<atsUrl>/v1/organizations/<org>/<path>`, swapping
 * in the bearer key. The widget still sends its session token + site key; a
 * real host would use them to authenticate the widget→BFF hop and would derive
 * the external user id from its own session rather than trusting the URL — the
 * demo proxy keeps it simple and just forwards.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  // Server-side ATS base — falls back to the public one for native dev where
  // the server and browser share `localhost`.
  const atsBase = String(config.atsApiUrl || config.public.atsUrl || '').replace(
    /\/+$/,
    '',
  );
  const org = config.organizationId;
  const apiKey = config.atsApiKey;

  if (!atsBase || !org || !apiKey) {
    setResponseStatus(event, 500);
    return {
      error: {
        code: 'proxy.misconfigured',
        message: 'ATS proxy is missing atsUrl, organizationId or atsApiKey.',
        request_id: '',
      },
    };
  }

  const subPath = (event.context.params?._ || '').replace(/^\/+/, '');
  const query = getQuery(event);

  // The B2B works listing has no `search` parameter — strip it before
  // forwarding and filter the response here, so the widget's search box keeps
  // working transparently.
  const isWorksList = /^external-users\/[^/]+\/works$/.test(subPath);
  const searchTerm =
    isWorksList && typeof query.search === 'string'
      ? query.search.toLowerCase().trim()
      : '';

  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === 'search' || value == null) continue;
    forwarded.set(key, String(value));
  }
  const qs = forwarded.toString();
  const target = `${atsBase}/v1/organizations/${org}/${subPath}${qs ? `?${qs}` : ''}`;

  const method = event.method;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify((await readBody(event).catch(() => null)) ?? {});
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { method, headers, body });
  } catch (err) {
    console.error('[ats-proxy] upstream fetch failed:', target, err);
    setResponseStatus(event, 502);
    return {
      error: {
        code: 'common.service_unavailable',
        message: 'ATS service unreachable.',
        request_id: '',
      },
    };
  }

  const text = await upstream.text();
  setResponseStatus(event, upstream.status);
  setResponseHeader(event, 'Content-Type', 'application/json');
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) setResponseHeader(event, 'Retry-After', retryAfter);

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
    typeof payload === 'object' &&
    Array.isArray((payload as { works?: unknown }).works)
  ) {
    const data = payload as { works: Array<{ title?: string }>; total_count?: number };
    data.works = data.works.filter((w) =>
      (w.title || '').toLowerCase().includes(searchTerm),
    );
    data.total_count = data.works.length;
  }

  return payload;
});
