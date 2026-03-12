import {
  ApiErrorCode,
  AtsApiException,
  ConfirmRegistrationResponse,
  DownloadCertificateRequest,
  DownloadCertificateResponse,
  ParseCertificateRequest,
  ParseCertificateResponse,
  PrepareRegistrationRequest,
  PrepareRegistrationResponse,
  RawCreatorRequest,
  RegisterWorkRawProxyRequest,
  RegisterWorkRawResponse,
  SessionResponse,
  TransactionStatusResponse,
  WsMessage,
  WsStepDetails,
} from "./types";

/**
 * Component Service URL for session management
 * This is hardcoded to ensure secure authentication flow
 */
export const COMPONENT_SERVICE_URL = "http://localhost:13008";

/**
 * Default network for registration
 */
export const DEFAULT_NETWORK = "testnet";

/**
 * Parse error message to determine error code
 */
function parseErrorCode(message: string, httpStatus?: number): ApiErrorCode {
  const lowerMessage = message.toLowerCase();

  if (httpStatus === 401) {
    // Only match SESSION_EXPIRED for explicit expiry messages (token refresh scenarios)
    if (lowerMessage.includes("expired") || lowerMessage.includes("session")) {
      return ApiErrorCode.SESSION_EXPIRED;
    }
    // Default all other 401s to INVALID_SITE_KEY
    // This includes "Invalid token", "Invalid site key", or any auth failure during session creation
    return ApiErrorCode.INVALID_SITE_KEY;
  }

  if (httpStatus === 403) {
    // 403 indicates domain not registered or origin not allowed
    if (lowerMessage.includes("domain") || lowerMessage.includes("origin") ||
        lowerMessage.includes("not registered") || lowerMessage.includes("not allowed")) {
      return ApiErrorCode.DOMAIN_NOT_REGISTERED;
    }
    // Default 403 to domain not registered
    return ApiErrorCode.DOMAIN_NOT_REGISTERED;
  }

  if (httpStatus === 400) {
    if (
      lowerMessage.includes("balance") ||
      lowerMessage.includes("insufficient")
    ) {
      return ApiErrorCode.INSUFFICIENT_BALANCE;
    }
    if (lowerMessage.includes("wallet")) {
      return ApiErrorCode.WALLET_NOT_CONFIGURED;
    }
    if (lowerMessage.includes("job") && lowerMessage.includes("expired")) {
      return ApiErrorCode.JOB_EXPIRED;
    }
  }

  if (httpStatus === 500) {
    return ApiErrorCode.TRANSACTION_FAILED;
  }

  return ApiErrorCode.UNKNOWN_ERROR;
}

// ============================================
// Session Management
// ============================================

/**
 * Create a new session using site key
 *
 * Calls the Component Service to create a session token that can be used
 * for subsequent API calls. The browser automatically sends the Origin header.
 *
 * @param siteKey - Partner site key (cpk_...)
 * @param serviceUrl - Component Service URL (optional, defaults to COMPONENT_SERVICE_URL)
 * @returns Session token and expiration time
 * @throws AtsApiException on any error
 */
export async function createSession(
  siteKey: string,
  serviceUrl: string = COMPONENT_SERVICE_URL
): Promise<SessionResponse> {
  const url = `${serviceUrl}/v1/sessions`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ site_key: siteKey }),
      // Browser automatically sends Origin header for CORS
    });

    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage =
          errorBody.error || errorBody.message || "Session creation failed";
      } catch {
        errorMessage = (await response.text()) || `HTTP ${response.status}`;
      }

      throw new AtsApiException(
        errorMessage,
        parseErrorCode(errorMessage, response.status),
        response.status,
      );
    }

    return (await response.json()) as SessionResponse;
  } catch (error) {
    if (error instanceof AtsApiException) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new AtsApiException(
        "Network error: Unable to connect to authentication service",
        ApiErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }

    throw new AtsApiException(
      error instanceof Error ? error.message : "Unknown error occurred",
      ApiErrorCode.SESSION_ERROR,
      undefined,
      error,
    );
  }
}

// ============================================
// Two-Phase Registration (Prepare → Confirm)
// ============================================

/**
 * Prepare registration (validation phase)
 *
 * Sends work data to the proxy for validation and fee estimation.
 * The proxy injects the passphrase and forwards to the ATS service.
 *
 * @param proxyEndpoint - Proxy server URL
 * @param sessionToken - Session token from createSession()
 * @param data - Work registration data
 * @returns Job ID, fees, and expiration for confirmation
 * @throws AtsApiException on validation or network error
 */
export async function prepareRegistration(
  proxyEndpoint: string,
  sessionToken: string,
  data: PrepareRegistrationRequest,
): Promise<PrepareRegistrationResponse> {
  const normalizedEndpoint = proxyEndpoint.replace(/\/+$/, "");

  const body = {
    action: "prepare-raw",
    title: data.title,
    creators: data.creators,
    audio_base64: data.audio_base64,
    filename: data.filename,
    network: data.network || DEFAULT_NETWORK,
  };

  try {
    const response = await fetch(normalizedEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage =
          errorBody.error || errorBody.message || "Prepare registration failed";
      } catch {
        errorMessage = (await response.text()) || `HTTP ${response.status}`;
      }

      throw new AtsApiException(
        errorMessage,
        ApiErrorCode.PREPARE_ERROR,
        response.status,
      );
    }

    return (await response.json()) as PrepareRegistrationResponse;
  } catch (error) {
    if (error instanceof AtsApiException) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new AtsApiException(
        "Network error: Unable to connect to proxy server",
        ApiErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }

    throw new AtsApiException(
      error instanceof Error ? error.message : "Unknown error occurred",
      ApiErrorCode.PREPARE_ERROR,
      undefined,
      error,
    );
  }
}

/**
 * Confirm registration (commit phase)
 *
 * Confirms a prepared registration to start blockchain submission.
 * Must be called before the job expires.
 *
 * @param proxyEndpoint - Proxy server URL
 * @param sessionToken - Session token from createSession()
 * @param jobId - Job ID from prepareRegistration()
 * @returns Transaction tracking URLs
 * @throws AtsApiException on confirmation or network error
 */
export async function confirmRegistration(
  proxyEndpoint: string,
  sessionToken: string,
  jobId: string,
): Promise<ConfirmRegistrationResponse> {
  const normalizedEndpoint = proxyEndpoint.replace(/\/+$/, "");

  const body = {
    action: "confirm",
    job_id: jobId,
  };

  try {
    const response = await fetch(normalizedEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(body),
    });

    // 202 Accepted is success for async operations
    if (!response.ok && response.status !== 202) {
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage =
          errorBody.error || errorBody.message || "Confirm registration failed";
      } catch {
        errorMessage = (await response.text()) || `HTTP ${response.status}`;
      }

      throw new AtsApiException(
        errorMessage,
        ApiErrorCode.CONFIRM_ERROR,
        response.status,
      );
    }

    return (await response.json()) as ConfirmRegistrationResponse;
  } catch (error) {
    if (error instanceof AtsApiException) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new AtsApiException(
        "Network error: Unable to connect to proxy server",
        ApiErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }

    throw new AtsApiException(
      error instanceof Error ? error.message : "Unknown error occurred",
      ApiErrorCode.CONFIRM_ERROR,
      undefined,
      error,
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
  onError: (error: string) => void,
): WebSocket {
  const fullUrl = baseWsUrl + wsUrl;
  const ws = new WebSocket(fullUrl);

  ws.onopen = () => {
    console.log("[WebSocket] Connected to transaction tracker");
  };

  ws.onmessage = (event) => {
    try {
      const msg: WsMessage = JSON.parse(event.data);
      console.log("[WebSocket] Message received:", msg);

      switch (msg.type) {
        case "connected":
          // Initial connection acknowledgment
          console.log("[WebSocket] Connection acknowledged");
          break;

        case "update":
          if (msg.step === "completed" && msg.details) {
            // Transaction completed successfully
            onComplete(msg.details);
            ws.close();
          } else if (msg.step === "failed") {
            // Transaction failed
            onError(
              msg.details?.error || msg.description || "Transaction failed",
            );
            ws.close();
          } else {
            // Progress update
            onProgress(
              msg.step || "processing",
              msg.progress || 0,
              msg.description || "Processing...",
            );
          }
          break;

        case "error":
          onError(msg.message || "WebSocket error occurred");
          ws.close();
          break;

        case "not_found":
          onError("Transaction not found");
          ws.close();
          break;

        default:
          console.warn("[WebSocket] Unknown message type:", msg.type);
      }
    } catch (parseError) {
      console.error("[WebSocket] Failed to parse message:", parseError);
    }
  };

  ws.onerror = (event) => {
    console.error("[WebSocket] Connection error:", event);
    onError("WebSocket connection failed");
  };

  ws.onclose = (event) => {
    console.log("[WebSocket] Connection closed:", event.code, event.reason);
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
  timeoutMs: number = 60000,
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
        method: "GET",
        headers: {
          "Content-Type": "application/json",
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
          onError(data.result?.error || "Transaction failed");
        }
      } else {
        onProgress(
          data.current_step,
          data.progress,
          `Processing: ${data.current_step}`,
        );
      }
    } catch (error) {
      console.error("[Polling] Error:", error);
      // Don't stop polling on transient errors, let timeout handle it
    }
  };

  // Start polling
  intervalId = setInterval(poll, intervalMs);
  poll(); // Initial poll immediately

  // Set timeout
  timeoutId = setTimeout(() => {
    cleanup();
    onError("Transaction timed out");
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
  certificateJson: string,
): Promise<ParseCertificateResponse> {
  // Normalize endpoint (remove trailing slash)
  const normalizedEndpoint = proxyEndpoint.replace(/\/+$/, "");

  // Prepare request body with action routing
  const body: ParseCertificateRequest = {
    action: "parse-cert",
    certificate: certificateJson,
  };

  try {
    const response = await fetch(normalizedEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Handle non-OK responses
    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage =
          errorBody.error || errorBody.message || "Certificate parsing failed";
      } catch {
        errorMessage = (await response.text()) || `HTTP ${response.status}`;
      }

      throw new AtsApiException(
        errorMessage,
        ApiErrorCode.CERTIFICATE_PARSE_ERROR,
        response.status,
      );
    }

    // Parse successful response
    const data = (await response.json()) as ParseCertificateResponse;
    return data;
  } catch (error) {
    // Re-throw AtsApiException as-is
    if (error instanceof AtsApiException) {
      throw error;
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new AtsApiException(
        "Network error: Unable to connect to proxy server",
        ApiErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }

    // Handle other errors
    throw new AtsApiException(
      error instanceof Error ? error.message : "Unknown error occurred",
      ApiErrorCode.CERTIFICATE_PARSE_ERROR,
      undefined,
      error,
    );
  }
}

/**
 * Health check for the Component Service
 * Returns true if the service is reachable
 */
export async function checkApiHealth(
  endpoint: string = COMPONENT_SERVICE_URL,
): Promise<boolean> {
  try {
    const normalizedEndpoint = endpoint.replace(/\/+$/, "");
    const response = await fetch(`${normalizedEndpoint}/health`, {
      method: "GET",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Convert a File to base64 encoded string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/mpeg;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Register work via raw endpoint (server-side ZKP)
 *
 * This sends the raw file and metadata to the server, which handles:
 * - ZKP computation (hashing, proof generation)
 * - Blockchain submission
 * - Certificate generation
 *
 * @param proxyEndpoint - The organization's proxy URL
 * @param data - Work registration data (title, creators, file)
 * @returns Async response with transaction tracking URLs
 * @throws AtsApiException on any error
 */
export async function registerWorkRaw(
  proxyEndpoint: string,
  data: {
    title: string;
    creators: RawCreatorRequest[];
    file: File;
  },
): Promise<RegisterWorkRawResponse> {
  // Convert file to base64
  const audio_base64 = await fileToBase64(data.file);

  // Normalize endpoint
  const normalizedEndpoint = proxyEndpoint.replace(/\/+$/, "");

  // Prepare request body
  const body: RegisterWorkRawProxyRequest = {
    action: "register-raw",
    title: data.title,
    creators: data.creators,
    audio_base64,
    filename: data.file.name,
  };

  try {
    const response = await fetch(normalizedEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Handle non-OK responses (202 is success for async operations)
    if (!response.ok && response.status !== 202) {
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage =
          errorBody.error || errorBody.message || "Raw registration failed";
      } catch {
        errorMessage = (await response.text()) || `HTTP ${response.status}`;
      }

      throw new AtsApiException(
        errorMessage,
        ApiErrorCode.PROXY_ERROR,
        response.status,
      );
    }

    const responseData = (await response.json()) as RegisterWorkRawResponse;
    return responseData;
  } catch (error) {
    if (error instanceof AtsApiException) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new AtsApiException(
        "Network error: Unable to connect to proxy server",
        ApiErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }

    throw new AtsApiException(
      error instanceof Error ? error.message : "Unknown error occurred",
      ApiErrorCode.PROXY_ERROR,
      undefined,
      error,
    );
  }
}

/**
 * Get presigned URL for certificate download
 *
 * @param proxyEndpoint - The organization's proxy URL
 * @param workId - The work UUID (from transaction completion)
 * @returns Presigned URL for certificate ZIP download
 * @throws AtsApiException on any error
 */
export async function downloadCertificateViaProxy(
  proxyEndpoint: string,
  workId: string,
): Promise<DownloadCertificateResponse> {
  const normalizedEndpoint = proxyEndpoint.replace(/\/+$/, "");

  const body: DownloadCertificateRequest = {
    action: "download-certificate",
    work_id: workId,
  };

  try {
    const response = await fetch(normalizedEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage =
          errorBody.error || errorBody.message || "Certificate download failed";
      } catch {
        errorMessage = (await response.text()) || `HTTP ${response.status}`;
      }

      throw new AtsApiException(
        errorMessage,
        ApiErrorCode.PROXY_ERROR,
        response.status,
      );
    }

    return (await response.json()) as DownloadCertificateResponse;
  } catch (error) {
    if (error instanceof AtsApiException) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new AtsApiException(
        "Network error: Unable to connect to proxy server",
        ApiErrorCode.NETWORK_ERROR,
        undefined,
        error,
      );
    }

    throw new AtsApiException(
      error instanceof Error ? error.message : "Unknown error occurred",
      ApiErrorCode.PROXY_ERROR,
      undefined,
      error,
    );
  }
}
