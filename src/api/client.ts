import {
  AtsSubmitRequest,
  AtsSubmitResponse,
  AtsApiException,
  ApiErrorCode,
  ProxySubmitRequest,
  ProxySubmitResponse,
  ParseCertificateRequest,
  ParseCertificateResponse,
  WorkRegistrationAsyncResponse,
  WsMessage,
  WsStepDetails,
  TransactionStatusResponse,
  ProxySubmitResult,
} from './types';

/**
 * Default production API endpoint
 */
export const DEFAULT_API_ENDPOINT = 'https://api.web2.dev.allfeat.org';

/**
 * API key format regex: aft_ prefix followed by 64 hex characters
 */
const API_KEY_REGEX = /^aft_[0-9a-fA-F]{64}$/;

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  return API_KEY_REGEX.test(apiKey);
}

/**
 * Validate hash commitment format (32 bytes hex)
 */
export function isValidHashCommitment(hash: string): boolean {
  // Remove 0x prefix if present
  const cleanHash = hash.startsWith('0x') ? hash.slice(2) : hash;
  // Must be exactly 64 hex characters (32 bytes)
  return /^[0-9a-fA-F]{64}$/.test(cleanHash);
}

/**
 * Parse error message to determine error code
 */
function parseErrorCode(message: string, httpStatus?: number): ApiErrorCode {
  const lowerMessage = message.toLowerCase();

  if (httpStatus === 401) {
    if (lowerMessage.includes('missing')) {
      return ApiErrorCode.MISSING_API_KEY;
    }
    if (lowerMessage.includes('format')) {
      return ApiErrorCode.INVALID_API_KEY_FORMAT;
    }
    return ApiErrorCode.INVALID_API_KEY;
  }

  if (httpStatus === 400) {
    if (lowerMessage.includes('hash_commitment')) {
      return ApiErrorCode.INVALID_HASH_COMMITMENT;
    }
    if (lowerMessage.includes('balance') || lowerMessage.includes('insufficient')) {
      return ApiErrorCode.INSUFFICIENT_BALANCE;
    }
    if (lowerMessage.includes('wallet')) {
      return ApiErrorCode.WALLET_NOT_CONFIGURED;
    }
  }

  if (httpStatus === 500) {
    return ApiErrorCode.TRANSACTION_FAILED;
  }

  return ApiErrorCode.UNKNOWN_ERROR;
}

/**
 * Submit ATS registration to the backend API
 *
 * @param apiKey - The user's API key (format: aft_<64-hex-chars>)
 * @param hashCommitment - The ZKP commitment hash (32-byte hex string)
 * @param endpoint - Optional API endpoint (defaults to production)
 * @returns The submission response with ATS ID, transaction hash, and block number
 * @throws AtsApiException on any error
 */
export async function submitAts(
  apiKey: string,
  hashCommitment: string,
  endpoint: string = DEFAULT_API_ENDPOINT
): Promise<AtsSubmitResponse> {
  // Validate API key format before making request
  if (!apiKey) {
    throw new AtsApiException(
      'API key is required',
      ApiErrorCode.MISSING_API_KEY
    );
  }

  if (!isValidApiKeyFormat(apiKey)) {
    throw new AtsApiException(
      'Invalid API key format. Expected format: aft_<64-hex-chars>',
      ApiErrorCode.INVALID_API_KEY_FORMAT
    );
  }

  // Validate hash commitment format
  if (!isValidHashCommitment(hashCommitment)) {
    throw new AtsApiException(
      'Invalid hash commitment format. Expected 32-byte hex string',
      ApiErrorCode.INVALID_HASH_COMMITMENT
    );
  }

  // Normalize endpoint (remove trailing slash)
  const normalizedEndpoint = endpoint.replace(/\/+$/, '');
  const url = `${normalizedEndpoint}/ats`;

  // Prepare request body
  const body: AtsSubmitRequest = {
    hash_commitment: hashCommitment,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    // Handle non-OK responses
    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage = errorBody.error || errorBody.message || 'Unknown error';
      } catch {
        errorMessage = await response.text() || `HTTP ${response.status}`;
      }

      throw new AtsApiException(
        errorMessage,
        parseErrorCode(errorMessage, response.status),
        response.status
      );
    }

    // Parse successful response
    const data = await response.json() as AtsSubmitResponse;
    return data;
  } catch (error) {
    // Re-throw AtsApiException as-is
    if (error instanceof AtsApiException) {
      throw error;
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new AtsApiException(
        'Network error: Unable to connect to API server',
        ApiErrorCode.NETWORK_ERROR,
        undefined,
        error
      );
    }

    // Handle other errors
    throw new AtsApiException(
      error instanceof Error ? error.message : 'Unknown error occurred',
      ApiErrorCode.UNKNOWN_ERROR,
      undefined,
      error
    );
  }
}

/**
 * Submit ATS registration via organization's proxy endpoint
 *
 * This is the secure mode where the component sends only the hash commitment
 * to the organization's proxy, which then adds credentials and forwards to Allfeat API.
 *
 * Returns either:
 * - Synchronous response with final data (ats_id, tx_hash, block_number)
 * - Async response (202) with transaction_id and ws_url for WebSocket tracking
 *
 * @param proxyEndpoint - The organization's proxy URL
 * @param hashCommitment - The ZKP commitment hash (32-byte hex string)
 * @returns The submission result (sync or async)
 * @throws AtsApiException on any error
 */
export async function submitViaProxy(
  proxyEndpoint: string,
  hashCommitment: string
): Promise<ProxySubmitResult> {
  // Validate hash commitment format
  if (!isValidHashCommitment(hashCommitment)) {
    throw new AtsApiException(
      'Invalid hash commitment format. Expected 32-byte hex string',
      ApiErrorCode.INVALID_HASH_COMMITMENT
    );
  }

  // Normalize endpoint (remove trailing slash)
  const normalizedEndpoint = proxyEndpoint.replace(/\/+$/, '');

  // Prepare request body with action routing
  const body: ProxySubmitRequest = {
    action: 'register-work',
    hash_commitment: hashCommitment,
  };

  try {
    const response = await fetch(normalizedEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Handle non-OK responses (except 202 which is async success)
    if (!response.ok && response.status !== 202) {
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage = errorBody.error || errorBody.message || 'Proxy request failed';
      } catch {
        errorMessage = await response.text() || `HTTP ${response.status}`;
      }

      throw new AtsApiException(
        errorMessage,
        ApiErrorCode.PROXY_ERROR,
        response.status
      );
    }

    const data = await response.json();

    // Check if this is an async response (202 Accepted)
    if (response.status === 202 || data.transaction_id) {
      // Async response - transaction is being processed
      return {
        isAsync: true,
        data: data as WorkRegistrationAsyncResponse,
      };
    }

    // Synchronous response - transaction completed immediately
    return {
      isAsync: false,
      data: data as ProxySubmitResponse,
    };
  } catch (error) {
    // Re-throw AtsApiException as-is
    if (error instanceof AtsApiException) {
      throw error;
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new AtsApiException(
        'Network error: Unable to connect to proxy server',
        ApiErrorCode.NETWORK_ERROR,
        undefined,
        error
      );
    }

    // Handle other errors
    throw new AtsApiException(
      error instanceof Error ? error.message : 'Unknown error occurred',
      ApiErrorCode.PROXY_ERROR,
      undefined,
      error
    );
  }
}

/**
 * Subscribe to transaction updates via WebSocket
 *
 * Connects to the WebSocket endpoint and listens for transaction progress updates.
 * Handles the full lifecycle: connection, progress updates, completion, and errors.
 *
 * @param wsUrl - The WebSocket URL path (e.g., "/v1/ws/transactions/xxx")
 * @param baseWsUrl - The base WebSocket URL (e.g., "ws://localhost:3333")
 * @param onProgress - Callback for progress updates (step, progress %, description)
 * @param onComplete - Callback when transaction completes with final details
 * @param onError - Callback when an error occurs
 * @returns The WebSocket instance (for cleanup)
 */
export function subscribeToTransaction(
  wsUrl: string,
  baseWsUrl: string,
  onProgress: (step: string, progress: number, description: string) => void,
  onComplete: (details: WsStepDetails) => void,
  onError: (error: string) => void
): WebSocket {
  const fullUrl = baseWsUrl + wsUrl;
  const ws = new WebSocket(fullUrl);

  ws.onopen = () => {
    console.log('[WebSocket] Connected to transaction tracker');
  };

  ws.onmessage = (event) => {
    try {
      const msg: WsMessage = JSON.parse(event.data);
      console.log('[WebSocket] Message received:', msg);

      switch (msg.type) {
        case 'connected':
          // Initial connection acknowledgment
          console.log('[WebSocket] Connection acknowledged');
          break;

        case 'update':
          if (msg.step === 'completed' && msg.details) {
            // Transaction completed successfully
            onComplete(msg.details);
            ws.close();
          } else if (msg.step === 'failed') {
            // Transaction failed
            onError(msg.details?.error || msg.description || 'Transaction failed');
            ws.close();
          } else {
            // Progress update
            onProgress(
              msg.step || 'processing',
              msg.progress || 0,
              msg.description || 'Processing...'
            );
          }
          break;

        case 'error':
          onError(msg.message || 'WebSocket error occurred');
          ws.close();
          break;

        case 'not_found':
          onError('Transaction not found');
          ws.close();
          break;

        default:
          console.warn('[WebSocket] Unknown message type:', msg.type);
      }
    } catch (parseError) {
      console.error('[WebSocket] Failed to parse message:', parseError);
    }
  };

  ws.onerror = (event) => {
    console.error('[WebSocket] Connection error:', event);
    onError('WebSocket connection failed');
  };

  ws.onclose = (event) => {
    console.log('[WebSocket] Connection closed:', event.code, event.reason);
  };

  return ws;
}

/**
 * Poll transaction status (fallback when WebSocket fails)
 *
 * @param statusUrl - The status URL path (e.g., "/v1/transactions/xxx")
 * @param baseUrl - The base API URL
 * @param onProgress - Callback for progress updates
 * @param onComplete - Callback when transaction completes
 * @param onError - Callback when an error occurs
 * @param intervalMs - Polling interval in milliseconds (default: 2000)
 * @param timeoutMs - Maximum polling duration (default: 60000)
 * @returns Cleanup function to stop polling
 */
export function pollTransactionStatus(
  statusUrl: string,
  baseUrl: string,
  onProgress: (step: string, progress: number, description: string) => void,
  onComplete: (details: WsStepDetails) => void,
  onError: (error: string) => void,
  intervalMs: number = 2000,
  timeoutMs: number = 60000
): () => void {
  const fullUrl = baseUrl + statusUrl;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const cleanup = () => {
    stopped = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const poll = async () => {
    if (stopped) return;

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: TransactionStatusResponse = await response.json();

      if (data.is_complete) {
        cleanup();
        if (data.result?.success) {
          onComplete({
            tx_hash: data.result.tx_hash,
            block_number: data.result.block_number,
            ats_id: data.result.ats_id,
          });
        } else {
          onError(data.result?.error || 'Transaction failed');
        }
      } else {
        onProgress(
          data.current_step,
          data.progress,
          `Processing: ${data.current_step}`
        );
      }
    } catch (error) {
      console.error('[Polling] Error:', error);
      // Don't stop polling on transient errors, let timeout handle it
    }
  };

  // Start polling
  intervalId = setInterval(poll, intervalMs);
  poll(); // Initial poll immediately

  // Set timeout
  timeoutId = setTimeout(() => {
    cleanup();
    onError('Transaction timed out');
  }, timeoutMs);

  return cleanup;
}

/**
 * Parse ATS certificate via proxy endpoint
 *
 * This sends the certificate JSON to the proxy which forwards to web2-platform
 * for server-side parsing.
 *
 * @param proxyEndpoint - The organization's proxy URL
 * @param certificateJson - The certificate JSON string (file content)
 * @returns Parsed certificate data
 * @throws AtsApiException on any error
 */
export async function parseCertificateViaProxy(
  proxyEndpoint: string,
  certificateJson: string
): Promise<ParseCertificateResponse> {
  // Normalize endpoint (remove trailing slash)
  const normalizedEndpoint = proxyEndpoint.replace(/\/+$/, '');

  // Prepare request body with action routing
  const body: ParseCertificateRequest = {
    action: 'parse-cert',
    certificate: certificateJson,
  };

  try {
    const response = await fetch(normalizedEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Handle non-OK responses
    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage = errorBody.error || errorBody.message || 'Certificate parsing failed';
      } catch {
        errorMessage = await response.text() || `HTTP ${response.status}`;
      }

      throw new AtsApiException(
        errorMessage,
        ApiErrorCode.CERTIFICATE_PARSE_ERROR,
        response.status
      );
    }

    // Parse successful response
    const data = await response.json() as ParseCertificateResponse;
    return data;
  } catch (error) {
    // Re-throw AtsApiException as-is
    if (error instanceof AtsApiException) {
      throw error;
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new AtsApiException(
        'Network error: Unable to connect to proxy server',
        ApiErrorCode.NETWORK_ERROR,
        undefined,
        error
      );
    }

    // Handle other errors
    throw new AtsApiException(
      error instanceof Error ? error.message : 'Unknown error occurred',
      ApiErrorCode.CERTIFICATE_PARSE_ERROR,
      undefined,
      error
    );
  }
}

/**
 * Health check for the API endpoint
 * Returns true if the API is reachable
 */
export async function checkApiHealth(endpoint: string = DEFAULT_API_ENDPOINT): Promise<boolean> {
  try {
    const normalizedEndpoint = endpoint.replace(/\/+$/, '');
    const response = await fetch(`${normalizedEndpoint}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}
