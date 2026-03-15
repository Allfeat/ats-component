// ============================================
// Session Management Types
// ============================================

/**
 * Response from session creation
 */
export interface SessionResponse {
  token: string;
  expires_in: number; // seconds until expiry
}

// ============================================
// Init / Prepare / Confirm Registration Types
// ============================================

/**
 * Request payload for init (get presigned upload URL)
 */
export interface InitWorkRequest {
  title: string;
  creators: CreatorRequest[];
  filename: string;
  network?: 'testnet' | 'mainnet';
}

/**
 * Response from init (presigned upload URL)
 */
export interface InitWorkResponse {
  job_id: string;
  upload_url: string;
  upload_expires_at: string;
}

/**
 * Request payload for prepare registration (validation phase, after upload)
 */
export interface PrepareRegistrationRequest {
  job_id: string;
}

/**
 * Response from prepare registration
 * Note: network_fee_credits is in credits (smallest unit), not formatted currency
 */
export interface PrepareRegistrationResponse {
  job_id: string;
  work_id?: string;
  commitment?: string;
  network_fee_credits?: number;
  expires_at: string;
}

/**
 * Response from confirm registration
 */
export interface ConfirmRegistrationResponse {
  transaction_id: string;
  ws_url: string;
  status_url: string;
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
  work_id?: string;  // UUID for certificate download
  error?: string;
}

/**
 * Creator format for registration (matches server)
 */
export interface CreatorRequest {
  full_name: string;
  email: string;
  roles: {
    author: boolean;
    composer: boolean;
    arranger: boolean;
    adapter: boolean;
  };
  ipi?: string;
  isni?: string;
}


/**
 * Download certificate request
 */
export interface DownloadCertificateRequest {
  action: 'download-certificate';
  work_id: string;
}

/**
 * Download response (presigned URL)
 */
export interface DownloadCertificateResponse {
  url: string;
  expires_at: string;
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
  // Session errors
  SESSION_ERROR = 'SESSION_ERROR',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_SITE_KEY = 'INVALID_SITE_KEY',
  DOMAIN_NOT_REGISTERED = 'DOMAIN_NOT_REGISTERED',
  // Init/Upload/Prepare/Confirm errors
  INIT_ERROR = 'INIT_ERROR',
  UPLOAD_ERROR = 'UPLOAD_ERROR',
  PREPARE_ERROR = 'PREPARE_ERROR',
  CONFIRM_ERROR = 'CONFIRM_ERROR',
  JOB_EXPIRED = 'JOB_EXPIRED',
  // Transaction errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  WALLET_NOT_CONFIGURED = 'WALLET_NOT_CONFIGURED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  // Network/communication errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROXY_ERROR = 'PROXY_ERROR',
  // Certificate errors
  CERTIFICATE_PARSE_ERROR = 'CERTIFICATE_PARSE_ERROR',
  ATS_NOT_FOUND = 'ATS_NOT_FOUND',
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  // Generic
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
   * Check if error is due to session/authentication issues
   */
  isAuthError(): boolean {
    return [
      ApiErrorCode.SESSION_ERROR,
      ApiErrorCode.SESSION_EXPIRED,
      ApiErrorCode.INVALID_SITE_KEY,
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

  /**
   * Check if error is a fatal authentication error that should hide the component
   * These errors indicate misconfiguration that cannot be fixed at runtime
   */
  isFatalAuthError(): boolean {
    return [
      ApiErrorCode.INVALID_SITE_KEY,
      ApiErrorCode.DOMAIN_NOT_REGISTERED,
    ].includes(this.code);
  }
}
