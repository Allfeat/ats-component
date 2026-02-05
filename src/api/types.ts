/**
 * Request payload for ATS submission (direct mode)
 */
export interface AtsSubmitRequest {
  hash_commitment: string; // 32-byte hex (with or without 0x prefix)
}

/**
 * Request payload sent from component to organization's proxy
 * The proxy is responsible for adding credentials before forwarding to Allfeat API
 */
export interface ProxySubmitRequest {
  hash_commitment: string; // 32-byte hex (with or without 0x prefix)
}

/**
 * Response from organization's proxy (mirrors Allfeat API response)
 */
export interface ProxySubmitResponse {
  status: string;
  ats_id: number;
  tx_hash: string;
  block_number: number;
  message?: string;
}

/**
 * Successful response from ATS submission
 */
export interface AtsSubmitResponse {
  status: string;
  ats_id: number;
  tx_hash: string;
  block_number: number;
  message: string;
}

/**
 * Error response from API
 */
export interface AtsApiError {
  error: string;
  details?: unknown;
}

/**
 * API error codes and their meanings
 */
export enum ApiErrorCode {
  INVALID_API_KEY_FORMAT = 'INVALID_API_KEY_FORMAT',
  INVALID_API_KEY = 'INVALID_API_KEY',
  MISSING_API_KEY = 'MISSING_API_KEY',
  INVALID_HASH_COMMITMENT = 'INVALID_HASH_COMMITMENT',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  WALLET_NOT_CONFIGURED = 'WALLET_NOT_CONFIGURED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROXY_ERROR = 'PROXY_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Structured API error
 */
export class AtsApiException extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus?: number;
  readonly details?: unknown;

  constructor(message: string, code: ApiErrorCode, httpStatus?: number, details?: unknown) {
    super(message);
    this.name = 'AtsApiException';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  /**
   * Check if error is due to invalid/missing API key
   */
  isAuthError(): boolean {
    return [
      ApiErrorCode.INVALID_API_KEY_FORMAT,
      ApiErrorCode.INVALID_API_KEY,
      ApiErrorCode.MISSING_API_KEY,
    ].includes(this.code);
  }

  /**
   * Check if error is due to insufficient funds
   */
  isBalanceError(): boolean {
    return this.code === ApiErrorCode.INSUFFICIENT_BALANCE;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return [
      ApiErrorCode.NETWORK_ERROR,
      ApiErrorCode.TRANSACTION_FAILED,
    ].includes(this.code);
  }
}
