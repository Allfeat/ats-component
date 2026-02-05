import {
  AtsSubmitRequest,
  AtsSubmitResponse,
  AtsApiException,
  ApiErrorCode,
  ProxySubmitRequest,
  ProxySubmitResponse,
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
 * @param proxyEndpoint - The organization's proxy URL
 * @param hashCommitment - The ZKP commitment hash (32-byte hex string)
 * @returns The submission response with ATS ID, transaction hash, and block number
 * @throws AtsApiException on any error
 */
export async function submitViaProxy(
  proxyEndpoint: string,
  hashCommitment: string
): Promise<ProxySubmitResponse> {
  // Validate hash commitment format
  if (!isValidHashCommitment(hashCommitment)) {
    throw new AtsApiException(
      'Invalid hash commitment format. Expected 32-byte hex string',
      ApiErrorCode.INVALID_HASH_COMMITMENT
    );
  }

  // Normalize endpoint (remove trailing slash)
  const normalizedEndpoint = proxyEndpoint.replace(/\/+$/, '');

  // Prepare request body - only hash_commitment, no credentials
  const body: ProxySubmitRequest = {
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

    // Handle non-OK responses
    if (!response.ok) {
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

    // Parse successful response
    const data = await response.json() as ProxySubmitResponse;
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
      ApiErrorCode.PROXY_ERROR,
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
