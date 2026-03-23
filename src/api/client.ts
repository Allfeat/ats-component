import {
  ApiErrorCode,
  AtsApiException,
  ConfirmWorkResponse,
  ConfirmVersionResponse,
  CreatorRequest,
  DownloadCertificateResponse,
  InitWorkResponse,
  InitVersionUploadResponse,
  InitVersionResponse,
  PrepareWorkResponse,
  PrepareVersionResponse,
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

function mapHttpError(status: number, message: string): ApiErrorCode {
  switch (status) {
    case 400: return ApiErrorCode.BAD_REQUEST;
    case 401:
      if (message.toLowerCase().includes('site-key') || message.toLowerCase().includes('site_key')) {
        return ApiErrorCode.INVALID_SITE_KEY;
      }
      return ApiErrorCode.TOKEN_EXPIRED;
    case 403: return ApiErrorCode.FORBIDDEN;
    case 404: return ApiErrorCode.NOT_FOUND;
    case 409: return ApiErrorCode.CONFLICT;
    case 413: return ApiErrorCode.BAD_REQUEST;
    case 422: return ApiErrorCode.BAD_REQUEST;
    case 429: return ApiErrorCode.RATE_LIMITED;
    default:
      if (status >= 500) return ApiErrorCode.SERVER_ERROR;
      return ApiErrorCode.UNKNOWN_ERROR;
  }
}

async function parseErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const body = JSON.parse(text);
    return body.error || body.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

// ============================================
// Authenticated Fetch
// ============================================

/**
 * Performs an authenticated fetch with automatic retry on 429 and structured error handling.
 * @param url - Fully-qualified URL to fetch.
 * @param token - JWT bearer token.
 * @param siteKey - Partner site key sent as `X-Site-Key`.
 * @param options - Additional `RequestInit` options merged into the request.
 * @param onTokenExpired - Optional callback invoked when the server reports an expired token.
 * @returns The successful `Response` object.
 * @throws {AtsApiException} On HTTP errors, network failures, or exhausted retries.
 */
export async function authenticatedFetch(
  url: string,
  token: string,
  siteKey: string,
  options: RequestInit = {},
  onTokenExpired?: () => void,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Site-Key': siteKey,
    ...(options.headers as Record<string, string> || {}),
  };

  for (let attempt = 0; attempt <= AUTH_FETCH_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (response.ok || response.status === 202) {
        return response;
      }

      // Handle 429 with retry
      if (response.status === 429 && attempt < AUTH_FETCH_MAX_RETRIES) {
        const retryAfter = response.headers.get('Retry-After');
        const delayMs = retryAfter
          ? parseFloat(retryAfter) * 1000
          : (attempt + 1) * 1000; // 1s, 2s
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }

      const errorMessage = await parseErrorBody(response);
      const code = mapHttpError(response.status, errorMessage);

      if (code === ApiErrorCode.TOKEN_EXPIRED && onTokenExpired) {
        onTokenExpired();
      }

      throw new AtsApiException(errorMessage, code, response.status);
    } catch (error) {
      if (error instanceof AtsApiException) throw error;

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AtsApiException(
          'Network error: Unable to connect to server',
          ApiErrorCode.NETWORK_ERROR,
          undefined,
          error,
        );
      }

      throw new AtsApiException(
        error instanceof Error ? error.message : 'Unknown error',
        ApiErrorCode.UNKNOWN_ERROR,
        undefined,
        error,
      );
    }
  }

  // Should not reach here, but satisfy TypeScript
  throw new AtsApiException('Unexpected error', ApiErrorCode.UNKNOWN_ERROR);
}

// ============================================
// Stats (public, no auth)
// ============================================

/**
 * Fetches platform-wide statistics (no authentication required).
 * @param atsUrl - Base ATS API URL.
 * @param network - Target network (`"testnet"` or `"mainnet"`).
 * @returns Platform statistics including total works and max file size.
 * @throws {AtsApiException} On HTTP or network errors.
 */
export async function fetchStats(atsUrl: string, network: string): Promise<StatsResponse> {
  const url = buildUrl(atsUrl, `/v1/stats?network=${encodeURIComponent(network)}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new AtsApiException(
        `Failed to fetch stats: HTTP ${response.status}`,
        ApiErrorCode.SERVER_ERROR,
        response.status,
      );
    }
    return (await response.json()) as StatsResponse;
  } catch (error) {
    if (error instanceof AtsApiException) throw error;
    throw new AtsApiException(
      'Network error: Unable to fetch stats',
      ApiErrorCode.NETWORK_ERROR,
      undefined,
      error,
    );
  }
}

// ============================================
// Register Mode — Init / Prepare / Confirm
// ============================================

/**
 * Initializes a new work registration (`POST /v1/works/init`).
 * Returns a job ID and a pre-signed upload URL for the audio file.
 * @param atsUrl - Base ATS API URL.
 * @param token - JWT bearer token.
 * @param siteKey - Partner site key.
 * @param data - Work metadata: title, creators, filename, and target network.
 * @param onTokenExpired - Optional callback invoked on token expiry.
 * @throws {AtsApiException} On HTTP or network errors.
 */
export async function initWork(
  atsUrl: string,
  token: string,
  siteKey: string,
  data: { title: string; creators: CreatorRequest[]; filename: string; network: string },
  onTokenExpired?: () => void,
): Promise<InitWorkResponse> {
  const url = buildUrl(atsUrl, '/v1/works/init');
  const response = await authenticatedFetch(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  }, onTokenExpired);
  return (await response.json()) as InitWorkResponse;
}

/**
 * Prepares a work for on-chain registration (`POST /v1/works/prepare`).
 * Returns pricing details and a commitment hash for the work.
 * @param atsUrl - Base ATS API URL.
 * @param token - JWT bearer token.
 * @param siteKey - Partner site key.
 * @param data - Object containing the `job_id` from `initWork`.
 * @param onTokenExpired - Optional callback invoked on token expiry.
 * @throws {AtsApiException} On HTTP or network errors.
 */
export async function prepareWork(
  atsUrl: string,
  token: string,
  siteKey: string,
  data: { job_id: string },
  onTokenExpired?: () => void,
): Promise<PrepareWorkResponse> {
  const url = buildUrl(atsUrl, '/v1/works/prepare');
  const response = await authenticatedFetch(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify({ ...data, passphrase: null }),
  }, onTokenExpired);
  return (await response.json()) as PrepareWorkResponse;
}

/**
 * Confirms a work registration and triggers the blockchain transaction (`POST /v1/works/confirm`).
 * @param atsUrl - Base ATS API URL.
 * @param token - JWT bearer token.
 * @param siteKey - Partner site key.
 * @param data - Object containing the `job_id` from `initWork`.
 * @param onTokenExpired - Optional callback invoked on token expiry.
 * @returns Transaction tracking URLs (WebSocket and polling).
 * @throws {AtsApiException} On HTTP or network errors.
 */
export async function confirmWork(
  atsUrl: string,
  token: string,
  siteKey: string,
  data: { job_id: string },
  onTokenExpired?: () => void,
): Promise<ConfirmWorkResponse> {
  const url = buildUrl(atsUrl, '/v1/works/confirm');
  const response = await authenticatedFetch(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  }, onTokenExpired);
  return (await response.json()) as ConfirmWorkResponse;
}

// ============================================
// Update Mode — Version endpoints
// ============================================

/**
 * Initializes a version update with a new file upload (`POST /v1/access/{accessCode}/versions/init-upload`).
 * @param atsUrl - Base ATS API URL.
 * @param token - JWT bearer token.
 * @param siteKey - Partner site key.
 * @param accessCode - Access code of the work to update.
 * @param data - Updated creators list and new filename.
 * @param onTokenExpired - Optional callback invoked on token expiry.
 * @returns A job ID and pre-signed upload URL.
 * @throws {AtsApiException} On HTTP or network errors.
 */
export async function initVersionUpload(
  atsUrl: string,
  token: string,
  siteKey: string,
  accessCode: string,
  data: { creators: CreatorRequest[]; filename: string },
  onTokenExpired?: () => void,
): Promise<InitVersionUploadResponse> {
  const url = buildUrl(atsUrl, `/v1/access/${accessCode}/versions/init-upload`);
  const response = await authenticatedFetch(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  }, onTokenExpired);
  return (await response.json()) as InitVersionUploadResponse;
}

/**
 * Initializes a metadata-only version update (`POST /v1/access/{accessCode}/versions/init`).
 * @param atsUrl - Base ATS API URL.
 * @param token - JWT bearer token.
 * @param siteKey - Partner site key.
 * @param accessCode - Access code of the work to update.
 * @param data - Updated creators list.
 * @param onTokenExpired - Optional callback invoked on token expiry.
 * @throws {AtsApiException} On HTTP or network errors.
 */
export async function initVersion(
  atsUrl: string,
  token: string,
  siteKey: string,
  accessCode: string,
  data: { creators: CreatorRequest[] },
  onTokenExpired?: () => void,
): Promise<InitVersionResponse> {
  const url = buildUrl(atsUrl, `/v1/access/${accessCode}/versions/init`);
  const response = await authenticatedFetch(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  }, onTokenExpired);
  return (await response.json()) as InitVersionResponse;
}

/**
 * Prepares a version update for on-chain submission (`POST /v1/access/{accessCode}/versions/prepare`).
 * @param atsUrl - Base ATS API URL.
 * @param token - JWT bearer token.
 * @param siteKey - Partner site key.
 * @param accessCode - Access code of the work to update.
 * @param data - Object containing the `job_id` from `initVersionUpload` or `initVersion`.
 * @param onTokenExpired - Optional callback invoked on token expiry.
 * @returns Pricing details and commitment hash.
 * @throws {AtsApiException} On HTTP or network errors.
 */
export async function prepareVersion(
  atsUrl: string,
  token: string,
  siteKey: string,
  accessCode: string,
  data: { job_id: string },
  onTokenExpired?: () => void,
): Promise<PrepareVersionResponse> {
  const url = buildUrl(atsUrl, `/v1/access/${accessCode}/versions/prepare`);
  const response = await authenticatedFetch(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify({ ...data, passphrase: null }),
  }, onTokenExpired);
  return (await response.json()) as PrepareVersionResponse;
}

/**
 * Confirms a version update and triggers the blockchain transaction (`POST /v1/access/{accessCode}/versions/confirm`).
 * @param atsUrl - Base ATS API URL.
 * @param token - JWT bearer token.
 * @param siteKey - Partner site key.
 * @param accessCode - Access code of the work to update.
 * @param data - Object containing the `job_id` from `initVersionUpload` or `initVersion`.
 * @param onTokenExpired - Optional callback invoked on token expiry.
 * @returns Transaction tracking URLs (WebSocket and polling).
 * @throws {AtsApiException} On HTTP or network errors.
 */
export async function confirmVersion(
  atsUrl: string,
  token: string,
  siteKey: string,
  accessCode: string,
  data: { job_id: string },
  onTokenExpired?: () => void,
): Promise<ConfirmVersionResponse> {
  const url = buildUrl(atsUrl, `/v1/access/${accessCode}/versions/confirm`);
  const response = await authenticatedFetch(url, token, siteKey, {
    method: 'POST',
    body: JSON.stringify(data),
  }, onTokenExpired);
  return (await response.json()) as ConfirmVersionResponse;
}

// ============================================
// Access Mode — Fetch Work by Access Code
// ============================================

/**
 * Retrieves full work details by access code (`GET /v1/access/{accessCode}/work`).
 * @param atsUrl - Base ATS API URL.
 * @param token - JWT bearer token.
 * @param siteKey - Partner site key.
 * @param accessCode - The work's access code.
 * @param onTokenExpired - Optional callback invoked on token expiry.
 * @throws {AtsApiException} On HTTP or network errors.
 */
export async function fetchAccessWork(
  atsUrl: string,
  token: string,
  siteKey: string,
  accessCode: string,
  onTokenExpired?: () => void,
): Promise<AccessWorkResponse> {
  const url = buildUrl(atsUrl, `/v1/access/${encodeURIComponent(accessCode)}/work`);
  const response = await authenticatedFetch(url, token, siteKey, {
    method: 'GET',
  }, onTokenExpired);
  return (await response.json()) as AccessWorkResponse;
}

// ============================================
// S3 Upload with Progress
// ============================================

/**
 * Uploads a file to S3 via a pre-signed PUT URL with progress reporting and automatic retries.
 * Uses `XMLHttpRequest` to enable upload progress events.
 * @param url - Pre-signed S3 upload URL.
 * @param file - The `File` object to upload.
 * @param onProgress - Optional callback receiving `(progress%, loadedBytes, totalBytes)`.
 * @param maxRetries - Maximum number of retry attempts (default: 3). Uses exponential backoff.
 * @throws {AtsApiException} With `UPLOAD_ERROR` or `NETWORK_ERROR` code after all retries are exhausted.
 */
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
          reject(new AtsApiException(
            `Upload failed: HTTP ${xhr.status}`,
            ApiErrorCode.UPLOAD_ERROR,
            xhr.status,
          ));
        }
      };

      xhr.onerror = () => {
        reject(new AtsApiException(
          'Network error during upload',
          ApiErrorCode.NETWORK_ERROR,
        ));
      };

      xhr.ontimeout = () => {
        reject(new AtsApiException(
          'Upload timed out',
          ApiErrorCode.NETWORK_ERROR,
        ));
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
        // Exponential backoff: 1s, 2s, 4s
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

/**
 * Fetches a pre-signed download URL for a work's certificate PDF (`GET /v1/works/{workId}/download/certificate`).
 * @param atsUrl - Base ATS API URL.
 * @param token - JWT bearer token.
 * @param siteKey - Partner site key.
 * @param workId - The work's identifier.
 * @param onTokenExpired - Optional callback invoked on token expiry.
 * @throws {AtsApiException} On HTTP or network errors.
 */
export async function downloadCertificate(
  atsUrl: string,
  token: string,
  siteKey: string,
  workId: string,
  onTokenExpired?: () => void,
): Promise<DownloadCertificateResponse> {
  const url = buildUrl(atsUrl, `/v1/works/${workId}/download/certificate`);
  const response = await authenticatedFetch(url, token, siteKey, {
    method: 'GET',
  }, onTokenExpired);
  return (await response.json()) as DownloadCertificateResponse;
}

// ============================================
// Transaction Tracking — WebSocket (PUBLIC)
// ============================================

/**
 * Subscribes to real-time transaction progress via WebSocket.
 * Automatically closes the socket on completion, failure, or error.
 * @param wsUrl - Relative WebSocket path returned by `confirmWork` / `confirmVersion`.
 * @param baseWsUrl - Base WebSocket URL (e.g. `"wss://ats.allfeat.com"`).
 * @param onProgress - Callback for intermediate progress updates.
 * @param onComplete - Callback when the transaction succeeds, receives final step details.
 * @param onDisconnect - Callback when the socket disconnects unexpectedly (triggers polling fallback).
 * @returns The underlying `WebSocket` instance for manual control if needed.
 */
export function subscribeToTransaction(
  wsUrl: string,
  baseWsUrl: string,
  onProgress: (step: string, progress: number, description: string) => void,
  onComplete: (details: WsStepDetails) => void,
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
            // Failed messages are handled via polling fallback
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
          ws.close();
          break;

        case 'not_found':
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
 * @param statusUrl - Relative status path returned by `confirmWork` / `confirmVersion`.
 * @param baseUrl - Base HTTP URL (e.g. `"https://ats.allfeat.com"`).
 * @param onProgress - Callback for intermediate progress updates.
 * @param onComplete - Callback when the transaction succeeds.
 * @param onError - Callback when the transaction fails or times out.
 * @param intervalMs - Polling interval in milliseconds (default: 3000).
 * @param timeoutMs - Maximum time to poll before timing out (default: 120000).
 * @returns A cleanup function that stops polling when called.
 */
export function pollTransactionStatus(
  statusUrl: string,
  baseUrl: string,
  onProgress: (step: string, progress: number, description: string) => void,
  onComplete: (details: WsStepDetails) => void,
  onError: (error: string) => void,
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
          onError(data.result?.error || 'Transaction failed');
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
    onError('Transaction timed out');
  }, timeoutMs);

  return cleanup;
}
