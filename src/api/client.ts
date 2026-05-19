import type {
  ApiErrorBody,
  WidgetError,
  ConfirmWorkResponse,
  ConfirmVersionResponse,
  ConfirmWorkVersionResponse,
  CreatorRequest,
  DownloadAssetResponse,
  DownloadCertificateResponse,
  InitWorkResponse,
  InitVersionUploadResponse,
  InitVersionResponse,
  InitWorkVersionResponse,
  InitWorkVersionUploadResponse,
  ListUserWorksResponse,
  PrepareWorkResponse,
  PrepareVersionResponse,
  PrepareWorkVersionResponse,
  StatsResponse,
  TransactionStatusResponse,
  WsMessage,
  WsStepDetails,
  AccessWorkResponse,
} from './types';
import { AUTH_FETCH_MAX_RETRIES } from '../constants';

// ============================================
// Helpers
// ============================================

function buildUrl(atsUrl: string, path: string): string {
  return atsUrl.replace(/\/+$/, '') + path;
}

function isApiErrorResponse(body: unknown): body is { error: ApiErrorBody } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as Record<string, unknown>).error === 'object' &&
    (body as Record<string, unknown>).error !== null &&
    typeof ((body as Record<string, Record<string, unknown>>).error).code === 'string' &&
    typeof ((body as Record<string, Record<string, unknown>>).error).message === 'string' &&
    typeof ((body as Record<string, Record<string, unknown>>).error).request_id === 'string'
  );
}

/**
 * Parses a non-2xx response into a WidgetError and throws it.
 * Shared by `apiFetch` (authenticated) and `fetchStats` (unauthenticated).
 */
async function parseErrorResponse(response: Response): Promise<never> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw { kind: 'malformed', status: response.status, body: '' } satisfies WidgetError;
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw { kind: 'malformed', status: response.status, body: text } satisfies WidgetError;
  }

  if (isApiErrorResponse(body)) {
    throw { kind: 'api', error: body.error, httpStatus: response.status } satisfies WidgetError;
  }

  throw { kind: 'malformed', status: response.status, body: text } satisfies WidgetError;
}

// ============================================
// Authenticated Fetch
// ============================================

/**
 * Performs an authenticated fetch with automatic retry on 429 and unified error handling.
 * @throws WidgetError on any non-success response or network failure.
 */
async function apiFetch<T>(
  url: string,
  token: string,
  siteKey: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Site-Key': siteKey,
    ...(options.headers as Record<string, string> || {}),
  };

  for (let attempt = 0; attempt <= AUTH_FETCH_MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch {
      throw { kind: 'network', message: 'Network error: Unable to connect to server' } satisfies WidgetError;
    }

    if (response.ok || response.status === 202) {
      return (await response.json()) as T;
    }

    // Retry on 429
    if (response.status === 429 && attempt < AUTH_FETCH_MAX_RETRIES) {
      const retryAfter = response.headers.get('Retry-After');
      const delayMs = retryAfter
        ? parseFloat(retryAfter) * 1000
        : (attempt + 1) * 1000;
      await new Promise(r => setTimeout(r, delayMs));
      continue;
    }

    await parseErrorResponse(response);
  }

  // Should not reach here, but satisfy TypeScript
  throw { kind: 'network', message: 'Unexpected error' } satisfies WidgetError;
}

// ============================================
// Stats (public, no auth)
// ============================================

/**
 * Fetches platform-wide statistics (no authentication required).
 * @throws WidgetError on HTTP or network errors.
 */
export async function fetchStats(atsUrl: string, network: string): Promise<StatsResponse> {
  const url = buildUrl(atsUrl, `/v1/stats?network=${encodeURIComponent(network)}`);
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw { kind: 'network', message: 'Network error: Unable to fetch stats' } satisfies WidgetError;
  }

  if (!response.ok) {
    await parseErrorResponse(response);
  }

  return (await response.json()) as StatsResponse;
}

// ============================================
// Register Mode — Init / Prepare / Confirm
// ============================================

export async function initWork(
  atsUrl: string,
  token: string,
  siteKey: string,
  data: {
    title: string;
    creators: CreatorRequest[];
    filename: string;
    network: string;
    /**
     * Optional partner-supplied end-user reference. When present it is
     * persisted on the work, which is what makes the work discoverable later
     * through the user-scoped listing (download mode) and the external-user
     * update flow. Omitted from the request body when the host did not
     * configure an `external-user-id`.
     */
    external_user_ref?: string;
  },
): Promise<InitWorkResponse> {
  const url = buildUrl(atsUrl, '/v1/works/init');
  return apiFetch<InitWorkResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function prepareWork(
  atsUrl: string,
  token: string,
  siteKey: string,
  data: { job_id: string },
): Promise<PrepareWorkResponse> {
  const url = buildUrl(atsUrl, '/v1/works/prepare');
  return apiFetch<PrepareWorkResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify({ ...data, passphrase: null }),
  });
}

export async function confirmWork(
  atsUrl: string,
  token: string,
  siteKey: string,
  data: { job_id: string },
): Promise<ConfirmWorkResponse> {
  const url = buildUrl(atsUrl, '/v1/works/confirm');
  return apiFetch<ConfirmWorkResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================
// Update Mode — Version endpoints
// ============================================

export async function initVersionUpload(
  atsUrl: string,
  token: string,
  siteKey: string,
  accessCode: string,
  data: { creators: CreatorRequest[]; filename: string },
): Promise<InitVersionUploadResponse> {
  const url = buildUrl(atsUrl, `/v1/access/${accessCode}/versions/init-upload`);
  return apiFetch<InitVersionUploadResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function initVersion(
  atsUrl: string,
  token: string,
  siteKey: string,
  accessCode: string,
  data: { creators: CreatorRequest[] },
): Promise<InitVersionResponse> {
  const url = buildUrl(atsUrl, `/v1/access/${accessCode}/versions/init`);
  return apiFetch<InitVersionResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function prepareVersion(
  atsUrl: string,
  token: string,
  siteKey: string,
  accessCode: string,
  data: { job_id: string },
): Promise<PrepareVersionResponse> {
  const url = buildUrl(atsUrl, `/v1/access/${accessCode}/versions/prepare`);
  return apiFetch<PrepareVersionResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify({ ...data, passphrase: null }),
  });
}

export async function confirmVersion(
  atsUrl: string,
  token: string,
  siteKey: string,
  accessCode: string,
  data: { job_id: string },
): Promise<ConfirmVersionResponse> {
  const url = buildUrl(atsUrl, `/v1/access/${accessCode}/versions/confirm`);
  return apiFetch<ConfirmVersionResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================
// Access Mode — Fetch Work by Access Code
// ============================================

export async function fetchAccessWork(
  atsUrl: string,
  token: string,
  siteKey: string,
  accessCode: string,
): Promise<AccessWorkResponse> {
  const url = buildUrl(atsUrl, `/v1/access/${encodeURIComponent(accessCode)}/work`);
  return apiFetch<AccessWorkResponse>(url, token, siteKey, { method: 'GET' });
}

// ============================================
// S3 Upload with Progress
// ============================================

export function uploadFileToS3WithProgress(
  url: string,
  file: File,
  onProgress?: (progress: number, loaded: number, total: number) => void,
  maxRetries: number = 3,
): Promise<void> {
  let attempt = 0;

  const doUpload = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress, event.loaded, event.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          const error: WidgetError = {
            kind: 'upload',
            message: `Upload failed: HTTP ${xhr.status}`,
            httpStatus: xhr.status,
          };
          reject(error);
        }
      };

      xhr.onerror = () => {
        const error: WidgetError = { kind: 'network', message: 'Network error during upload' };
        reject(error);
      };

      xhr.ontimeout = () => {
        const error: WidgetError = { kind: 'network', message: 'Upload timed out' };
        reject(error);
      };

      xhr.open('PUT', url);
      xhr.send(file);
    });
  };

  const attemptWithRetry = async (): Promise<void> => {
    attempt++;
    try {
      await doUpload();
    } catch (error) {
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(r => setTimeout(r, delay));
        return attemptWithRetry();
      }
      throw error;
    }
  };

  return attemptWithRetry();
}

// ============================================
// Certificate Download
// ============================================

export async function downloadCertificate(
  atsUrl: string,
  token: string,
  siteKey: string,
  workId: string,
): Promise<DownloadCertificateResponse> {
  const url = buildUrl(atsUrl, `/v1/works/${workId}/download/certificate`);
  return apiFetch<DownloadCertificateResponse>(url, token, siteKey, { method: 'GET' });
}

// ============================================
// User-Scoped Works (external-user-id) — via host BFF proxy
// ============================================
//
// The ATS exposes these as B2B endpoints under
// `/v1/organizations/{org}/external-users/{ref}/…` (reads) and
// `/v1/organizations/{org}/works/…` (writes). They use two different
// credentials upstream — the read routes require a short-lived partner-session
// JWT pinned to `(organization_id, external_user_ref)`; the write routes use
// the long-lived organization API key directly. Neither belongs in the
// browser, so the widget calls a host-provided BFF proxy (the `proxy-url`
// attribute) which picks the right credential per request. See
// `docs/api/user-scoped-works.md` and the reference proxy at
// `demo/server/api/ats-proxy/[...].ts`.
//
// `proxyUrl` below is therefore the host proxy base, not the ATS URL. The
// widget still passes its session token + site key so the host can
// authenticate the widget→BFF hop if it wishes; the demo proxy ignores them.

/** Path-segment-encode an external user reference for use in a proxy URL. */
function euid(externalUserId: string): string {
  return encodeURIComponent(externalUserId);
}

/**
 * List the works registered for an external user. Proxied to the ATS B2B
 * listing, which embeds each work's full version history inline (there is no
 * separate per-work versions endpoint).
 */
export async function listUserWorks(
  proxyUrl: string,
  token: string,
  siteKey: string,
  externalUserId: string,
  opts: { network: string; first?: number; after?: string | null; search?: string | null },
): Promise<ListUserWorksResponse> {
  const params = new URLSearchParams();
  params.set('network', opts.network);
  if (opts.first != null) params.set('first', String(opts.first));
  if (opts.after) params.set('after', opts.after);
  if (opts.search) params.set('search', opts.search);
  const url = buildUrl(
    proxyUrl,
    `/external-users/${euid(externalUserId)}/works?${params.toString()}`,
  );
  return apiFetch<ListUserWorksResponse>(url, token, siteKey, { method: 'GET' });
}

/** Get a presigned URL to download a specific version's audio asset. */
export async function downloadUserWorkVersionAsset(
  proxyUrl: string,
  token: string,
  siteKey: string,
  externalUserId: string,
  workId: string,
  version: number,
): Promise<DownloadAssetResponse> {
  const url = buildUrl(
    proxyUrl,
    `/external-users/${euid(externalUserId)}/works/${encodeURIComponent(workId)}/versions/${version}/download/audio`,
  );
  return apiFetch<DownloadAssetResponse>(url, token, siteKey, { method: 'GET' });
}

/**
 * Get a presigned URL to download a work's latest-version certificate PDF.
 * Work-level counterpart of `downloadCertificate` for the external-user flow —
 * used by the post-registration success screen, which has no session token.
 */
export async function downloadUserWorkCertificate(
  proxyUrl: string,
  token: string,
  siteKey: string,
  externalUserId: string,
  workId: string,
): Promise<DownloadCertificateResponse> {
  const url = buildUrl(
    proxyUrl,
    `/external-users/${euid(externalUserId)}/works/${encodeURIComponent(workId)}/download/certificate`,
  );
  return apiFetch<DownloadCertificateResponse>(url, token, siteKey, { method: 'GET' });
}

/** Get a presigned URL to download a specific version's certificate PDF. */
export async function downloadUserWorkVersionCertificate(
  proxyUrl: string,
  token: string,
  siteKey: string,
  externalUserId: string,
  workId: string,
  version: number,
): Promise<DownloadCertificateResponse> {
  const url = buildUrl(
    proxyUrl,
    `/external-users/${euid(externalUserId)}/works/${encodeURIComponent(workId)}/versions/${version}/download/certificate`,
  );
  return apiFetch<DownloadCertificateResponse>(url, token, siteKey, { method: 'GET' });
}

// Registration endpoints. The ATS B2B register routes
// (`/v1/organizations/{org}/works/init|prepare|confirm`) are thin wrappers over
// the same handlers as the direct register flow, so they share the response
// shapes. The crucial difference from the direct `/v1/works/*` path: the B2B
// `init` honours `external_user_ref`, tagging the work to the end user so it
// surfaces later in their download / update lists (the direct route ignores it).

export async function initUserWork(
  proxyUrl: string,
  token: string,
  siteKey: string,
  data: {
    title: string;
    creators: CreatorRequest[];
    filename: string;
    network: string;
    external_user_ref: string;
  },
): Promise<InitWorkResponse> {
  const url = buildUrl(proxyUrl, '/works/init');
  return apiFetch<InitWorkResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function prepareUserWork(
  proxyUrl: string,
  token: string,
  siteKey: string,
  data: { job_id: string },
): Promise<PrepareWorkResponse> {
  const url = buildUrl(proxyUrl, '/works/prepare');
  return apiFetch<PrepareWorkResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify({ ...data, passphrase: null }),
  });
}

export async function confirmUserWork(
  proxyUrl: string,
  token: string,
  siteKey: string,
  data: { job_id: string },
): Promise<ConfirmWorkResponse> {
  const url = buildUrl(proxyUrl, '/works/confirm');
  return apiFetch<ConfirmWorkResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Version-update endpoints. The ATS B2B version routes are keyed by the work's
// numeric ATS id (not its UUID) and scoped to the organization, so these take
// `atsId`. `network` travels in the init bodies, matching the B2B contract.

export async function initUserWorkVersionUpload(
  proxyUrl: string,
  token: string,
  siteKey: string,
  atsId: number,
  data: { creators: CreatorRequest[]; filename: string; network: string },
): Promise<InitWorkVersionUploadResponse> {
  const url = buildUrl(proxyUrl, `/works/${atsId}/versions/init-upload`);
  return apiFetch<InitWorkVersionUploadResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function initUserWorkVersion(
  proxyUrl: string,
  token: string,
  siteKey: string,
  atsId: number,
  data: { creators: CreatorRequest[]; network: string },
): Promise<InitWorkVersionResponse> {
  const url = buildUrl(proxyUrl, `/works/${atsId}/versions/init`);
  return apiFetch<InitWorkVersionResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function prepareUserWorkVersion(
  proxyUrl: string,
  token: string,
  siteKey: string,
  atsId: number,
  data: { job_id: string },
): Promise<PrepareWorkVersionResponse> {
  const url = buildUrl(proxyUrl, `/works/${atsId}/versions/prepare`);
  return apiFetch<PrepareWorkVersionResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function confirmUserWorkVersion(
  proxyUrl: string,
  token: string,
  siteKey: string,
  atsId: number,
  data: { job_id: string },
): Promise<ConfirmWorkVersionResponse> {
  const url = buildUrl(proxyUrl, `/works/${atsId}/versions/confirm`);
  return apiFetch<ConfirmWorkVersionResponse>(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================
// Transaction Tracking — WebSocket (PUBLIC)
// ============================================

/**
 * Subscribes to real-time transaction progress via WebSocket.
 * @param onError - Callback for WebSocket error messages (structured WidgetError).
 */
export function subscribeToTransaction(
  wsUrl: string,
  baseWsUrl: string,
  onProgress: (step: string, progress: number, description: string) => void,
  onComplete: (details: WsStepDetails) => void,
  onError: (error: WidgetError) => void,
  onDisconnect: () => void,
): WebSocket {
  const fullUrl = baseWsUrl + wsUrl;
  const ws = new WebSocket(fullUrl);

  ws.onmessage = (event) => {
    try {
      const msg: WsMessage = JSON.parse(event.data);

      switch (msg.type) {
        case 'connected':
          break;

        case 'update':
          if (msg.step === 'completed' && msg.details) {
            onComplete(msg.details);
            ws.close();
          } else if (msg.step === 'failed') {
            ws.close();
          } else {
            onProgress(
              msg.step || 'processing',
              msg.progress || 0,
              msg.description || 'Processing...',
            );
          }
          break;

        case 'error':
          if (msg.error) {
            onError({ kind: 'api', error: msg.error, httpStatus: 0 });
          }
          ws.close();
          break;
      }
    } catch {
      // Ignore parse errors
    }
  };

  ws.onerror = () => {
    onDisconnect();
  };

  return ws;
}

// ============================================
// Transaction Tracking — Polling (PUBLIC)
// ============================================

/**
 * Polls the transaction status endpoint as a fallback when WebSocket is unavailable.
 * @param onError - Callback receiving a WidgetError when the transaction fails or times out.
 */
export function pollTransactionStatus(
  statusUrl: string,
  baseUrl: string,
  onProgress: (step: string, progress: number, description: string) => void,
  onComplete: (details: WsStepDetails) => void,
  onError: (error: WidgetError) => void,
  intervalMs: number = 3000,
  timeoutMs: number = 120000,
): () => void {
  const fullUrl = baseUrl + statusUrl;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const cleanup = () => {
    stopped = true;
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  };

  const poll = async () => {
    if (stopped) return;

    try {
      const response = await fetch(fullUrl, { method: 'GET' });
      if (!response.ok) return; // Transient, let timeout handle

      const data: TransactionStatusResponse = await response.json();

      if (data.is_complete) {
        cleanup();
        if (data.result?.success) {
          onComplete({
            tx_hash: data.result.tx_hash,
            block_number: data.result.block_number,
            ats_id: data.result.ats_id,
            work_id: data.result.work_id,
            explorer_url: data.result.explorer_url,
            access_code: data.result.access_code,
          });
        } else {
          onError({
            kind: 'api',
            error: {
              code: 'transaction.failed',
              message: data.result?.error || 'Transaction failed',
              request_id: '',
            },
            httpStatus: 0,
          });
        }
      } else {
        onProgress(data.current_step, data.progress, `Processing: ${data.current_step}`);
      }
    } catch {
      // Transient error, let timeout handle
    }
  };

  intervalId = setInterval(poll, intervalMs);
  poll();

  timeoutId = setTimeout(() => {
    cleanup();
    onError({
      kind: 'network',
      message: 'Transaction timed out',
    });
  }, timeoutMs);

  return cleanup;
}
