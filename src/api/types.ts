/**
 * Request payload for ATS submission (direct mode)
 */
export interface AtsSubmitRequest {
  hash_commitment: string; // 32-byte hex (with or without 0x prefix)
}

/**
 * Request payload sent from component to organization's proxy for work registration
 * The proxy is responsible for adding credentials before forwarding to Allfeat API
 */
export interface ProxySubmitRequest {
  action: 'register-work';
  hash_commitment: string; // 32-byte hex (with or without 0x prefix)
}

/**
 * Request payload for certificate parsing via proxy
 */
export interface ParseCertificateRequest {
  action: 'parse-cert';
  certificate: string; // Raw JSON string of the ATS certificate
}

/**
 * Creator information from parsed certificate
 */
export interface ParsedCreatorResponse {
  fullname: string; // Note: lowercase 'n' from backend
  email: string;
  roles: string[];
  ipi?: string;
  isni?: string;
}

/**
 * Verification data from blockchain query
 */
export interface CertificateVerification {
  ats_exists: boolean;      // Does the atsId exist on blockchain?
  version_exists: boolean;  // Does this specific version exist on blockchain?
}

/**
 * Response from certificate parsing endpoint
 */
export interface ParseCertificateResponse {
  ats_id: number;
  version_number: number;
  title: string;
  asset_filename: string;
  creators: ParsedCreatorResponse[];
  timestamp?: string;
  // Verification data from blockchain (optional for backward compatibility)
  verification?: CertificateVerification;
}

/**
 * Response from organization's proxy (mirrors Allfeat API response)
 * This is the synchronous response format (used when transaction completes immediately)
 */
export interface ProxySubmitResponse {
  status: string;
  ats_id: number;
  tx_hash: string;
  block_number: number;
  message?: string;
}

/**
 * Async response from backend (202 Accepted)
 * Returned when transaction is queued and will be processed asynchronously
 */
export interface WorkRegistrationAsyncResponse {
  transaction_id: string;
  ws_url: string;
  status_url: string;
}

/**
 * WebSocket message types from backend
 */
export type WsMessageType = 'connected' | 'update' | 'error' | 'not_found';

/**
 * Details included in WebSocket step completion messages
 */
export interface WsStepDetails {
  tx_hash?: string;
  block_number?: number;
  ats_id?: number;
  error?: string;
}

/**
 * WebSocket message structure from transaction tracking
 */
export interface WsMessage {
  type: WsMessageType;
  transaction_id?: string;
  step?: string;
  progress?: number;
  description?: string;
  details?: WsStepDetails;
  timestamp?: string;
  message?: string;
}

/**
 * Status URL response (GET /v1/transactions/{id}) for polling fallback
 */
export interface TransactionStatusResponse {
  id: string;
  current_step: string;
  progress: number;
  is_complete: boolean;
  result?: {
    success: boolean;
    tx_hash?: string;
    block_number?: number;
    ats_id?: number;
    error?: string;
  };
}

/**
 * Union type for proxy response (sync or async)
 */
export type ProxySubmitResult =
  | { isAsync: false; data: ProxySubmitResponse }
  | { isAsync: true; data: WorkRegistrationAsyncResponse };

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
  CERTIFICATE_PARSE_ERROR = 'CERTIFICATE_PARSE_ERROR',
  // Certificate verification errors
  ATS_NOT_FOUND = 'ATS_NOT_FOUND',
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
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
