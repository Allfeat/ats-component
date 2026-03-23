// ============================================
// Enums & Literal Types
// ============================================

/** UI screen the component is currently displaying. */
export type Screen = 'FORM' | 'UPLOAD' | 'CONFIRMING' | 'TRACKING' | 'COMPLETE' | 'FAILED';

/** Operating mode of the component: register a new work, update an existing one, or view access info. */
export type Mode = 'register' | 'update' | 'access';

/** Target blockchain network. */
export type Network = 'testnet' | 'mainnet';

// ============================================
// Creator (shared between modes)
// ============================================

/** API wire-format for a creator attached to a work. */
export interface CreatorRequest {
  /** Full legal name of the creator. */
  full_name: string;
  /** Contact email address. */
  email: string;
  /** Role flags indicating the creator's contributions. */
  roles: {
    author: boolean;
    composer: boolean;
    arranger: boolean;
    adapter: boolean;
  };
  /** Optional IPI code (1–11 digits). */
  ipi?: string;
  /** Optional ISNI code (16 characters). */
  isni?: string;
}

// ============================================
// Register Mode — Init / Prepare / Confirm
// ============================================

/** Response from `POST /v1/works/init` — starts the registration flow. */
export interface InitWorkResponse {
  /** Server-assigned job identifier for this registration. */
  job_id: string;
  /** Pre-signed S3 URL to upload the audio file. */
  upload_url: string;
  /** ISO timestamp after which the upload URL expires. */
  upload_expires_at: string;
}

/** Response from `POST /v1/works/prepare` — returns pricing and commitment. */
export interface PrepareWorkResponse {
  job_id: string;
  /** Permanent work identifier, assigned once validated. */
  work_id?: string;
  /** Cryptographic commitment hash for the work. */
  commitment?: string;
  /** Network fee in credits. */
  network_fee_credits?: number;
  /** Total deposit required in credits. */
  total_deposit_credits?: number;
  /** Service fee in credits. */
  service_fee_credits?: number;
  /** Storage fee in credits (0 for files ≤ 10 MB). */
  storage_fee_credits?: number;
  /** Total price (network + service + deposit + storage) in credits. */
  total_price_credits?: number;
  /** Whether the submitted data passed server-side validation. */
  is_valid?: boolean;
  /** ISO timestamp after which this preparation expires. */
  expires_at: string;
}

/** Response from `POST /v1/works/confirm` — triggers the on-chain transaction. */
export interface ConfirmWorkResponse {
  /** Identifier used to track the blockchain transaction. */
  transaction_id: string;
  /** Relative WebSocket path for real-time tracking. */
  ws_url: string;
  /** Relative HTTP path for polling-based tracking. */
  status_url: string;
  /** Access code for the newly registered work (may be returned later via tracking). */
  access_code?: string;
}

// ============================================
// Update Mode — Version endpoints
// ============================================

/** Response from `POST /v1/access/{accessCode}/versions/init-upload` — starts a version update with a new file. */
export interface InitVersionUploadResponse {
  job_id: string;
  /** Pre-signed S3 URL to upload the new audio file. */
  upload_url: string;
  /** ISO timestamp after which the upload URL expires. */
  upload_expires_at: string;
}

/** Response from `POST /v1/access/{accessCode}/versions/init` — starts a metadata-only version update. */
export interface InitVersionResponse {
  job_id: string;
}

/** Response from `POST /v1/access/{accessCode}/versions/prepare` — returns pricing for the version update. */
export interface PrepareVersionResponse {
  job_id: string;
  /** Cryptographic commitment hash for the new version. */
  commitment?: string;
  /** Deposit required for this version in credits. */
  version_deposit_credits?: number;
  /** Network fee in credits. */
  network_fee_credits?: number;
  /** Service fee in credits. */
  service_fee_credits?: number;
  /** Storage fee in credits (0 for files ≤ 10 MB). */
  storage_fee_credits?: number;
  /** Total price in credits. */
  total_price_credits?: number;
  /** Whether the submitted data passed server-side validation. */
  is_valid?: boolean;
  /** ISO timestamp after which this preparation expires. */
  expires_at: string;
}

/** Response from `POST /v1/access/{accessCode}/versions/confirm` — triggers the on-chain version transaction. */
export interface ConfirmVersionResponse {
  /** Identifier used to track the blockchain transaction. */
  transaction_id: string;
  /** Relative WebSocket path for real-time tracking. */
  ws_url: string;
  /** Relative HTTP path for polling-based tracking. */
  status_url: string;
}

// ============================================
// Transaction Tracking (WebSocket / Polling)
// ============================================

/** Discriminator for WebSocket message types. */
export type WsMessageType = 'connected' | 'update' | 'error' | 'not_found';

/** Extra details attached to a tracking step, present on completion or failure. */
export interface WsStepDetails {
  /** On-chain transaction hash. */
  tx_hash?: string;
  /** Block number where the transaction was included. */
  block_number?: number;
  /** Numeric ATS identifier for the work. */
  ats_id?: number;
  /** Work identifier. */
  work_id?: string;
  /** URL to view the transaction on a block explorer. */
  explorer_url?: string;
  /** Access code for the work. */
  access_code?: string;
  /** Error message if the step failed. */
  error?: string;
}

/** A single WebSocket message received during transaction tracking. */
export interface WsMessage {
  /** Message type discriminator. */
  type: WsMessageType;
  transaction_id?: string;
  /** Current processing step identifier. */
  step?: string;
  /** Overall progress percentage (0–100). */
  progress?: number;
  /** Human-readable description of the current step. */
  description?: string;
  /** Extra details, present on completion or failure. */
  details?: WsStepDetails;
  /** ISO timestamp of the message. */
  timestamp?: string;
  /** Informational or error message text. */
  message?: string;
}

/** Response from the polling endpoint `GET /v1/transactions/{id}/status`. */
export interface TransactionStatusResponse {
  /** Transaction identifier. */
  id: string;
  /** Current processing step identifier. */
  current_step: string;
  /** Overall progress percentage (0–100). */
  progress: number;
  /** Whether the transaction has reached a terminal state. */
  is_complete: boolean;
  /** Final result details, present only when `is_complete` is true. */
  result?: {
    success: boolean;
    tx_hash?: string;
    block_number?: number;
    ats_id?: number;
    work_id?: string;
    explorer_url?: string;
    access_code?: string;
    error?: string;
  };
}

// ============================================
// Tracking Steps
// ============================================

/** A single step displayed in the tracking progress UI. */
export interface TrackingStep {
  /** Machine-readable step identifier (e.g. `"validating"`). */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
}

const REGISTER_TRACKING_STEPS: TrackingStep[] = [
  { id: 'validating', label: 'Validating work data' },
  { id: 'transferring_tokens', label: 'Transferring tokens' },
  { id: 'preparing_transaction', label: 'Preparing transaction' },
  { id: 'signing', label: 'Signing transaction' },
  { id: 'submitting', label: 'Submitting to blockchain' },
  { id: 'confirming', label: 'Waiting for confirmation' },
];

const UPDATE_TRACKING_STEPS: TrackingStep[] = [
  { id: 'validating', label: 'Validating work data' },
  { id: 'preparing_transaction', label: 'Preparing transaction' },
  { id: 'signing', label: 'Signing transaction' },
  { id: 'submitting', label: 'Submitting to blockchain' },
  { id: 'confirming', label: 'Waiting for confirmation' },
];

/**
 * Returns the ordered list of tracking steps for the given mode.
 * @param mode - `"register"` includes a token-transfer step; `"update"` skips it.
 * @returns Ordered array of tracking steps.
 */
export function getTrackingSteps(mode: Mode): TrackingStep[] {
  return mode === 'update' ? UPDATE_TRACKING_STEPS : REGISTER_TRACKING_STEPS;
}

/** Maps each tracking step ID to its cumulative progress percentage (0–100). */
export const TRACKING_PROGRESS: Record<string, number> = {
  validating: 5,
  transferring_tokens: 20,
  preparing_transaction: 40,
  signing: 55,
  submitting: 70,
  confirming: 85,
  completed: 100,
};

// ============================================
// Access Mode
// ============================================

/** A creator as returned by the access endpoint (roles are string arrays). */
export interface AccessWorkCreator {
  full_name: string;
  email: string;
  /** Role names (e.g. `["Author", "Composer"]`). */
  roles: string[];
  ipi?: string;
  isni?: string;
}

/** Response from `GET /v1/access/{accessCode}/work` — full details of a registered work. */
export interface AccessWorkResponse {
  /** Numeric ATS identifier, `null` if not yet assigned. */
  ats_id: number | null;
  title: string;
  /** Network the work was registered on. */
  network: string;
  /** Blockchain address of the work owner. */
  owner_address: string;
  /** Most recent version number. */
  latest_version: number;
  /** Commitment hash of the latest version, `null` if unavailable. */
  latest_commitment: string | null;
  /** ISO creation timestamp, `null` if unavailable. */
  created_at: string | null;
  creators?: AccessWorkCreator[];
}

// ============================================
// Stats (public)
// ============================================

/** Response from `GET /v1/stats` — platform-wide statistics. */
export interface StatsResponse {
  /** Total number of registered works. */
  total_works: number;
  /** Maximum allowed audio file size in bytes. */
  max_audio_size_bytes: number;
}

// ============================================
// Download
// ============================================

/** Response from `GET /v1/works/{workId}/download/certificate`. */
export interface DownloadCertificateResponse {
  /** Pre-signed URL to download the certificate PDF. */
  url: string;
  /** ISO timestamp after which the download URL expires. */
  expires_at: string;
}

// ============================================
// Error Handling
// ============================================

/** Machine-readable error codes returned by the ATS API. */
export enum ApiErrorCode {
  /** The JWT bearer token has expired; the consumer should refresh and retry. */
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  /** The `X-Site-Key` header is missing or invalid. */
  INVALID_SITE_KEY = 'INVALID_SITE_KEY',
  /** The authenticated user is not authorized for this resource. */
  FORBIDDEN = 'FORBIDDEN',
  /** The requested resource does not exist. */
  NOT_FOUND = 'NOT_FOUND',
  /** A conflicting resource already exists (e.g. duplicate registration). */
  CONFLICT = 'CONFLICT',
  /** Too many requests — the client should back off and retry. */
  RATE_LIMITED = 'RATE_LIMITED',
  /** The request payload failed validation (400 / 413 / 422). */
  BAD_REQUEST = 'BAD_REQUEST',
  /** An unexpected server error occurred (5xx). */
  SERVER_ERROR = 'SERVER_ERROR',
  /** A network-level failure prevented the request from completing. */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** The file upload to S3 failed. */
  UPLOAD_ERROR = 'UPLOAD_ERROR',
  /** An error that doesn't map to any known category. */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/** Structured API error with a machine-readable code and optional HTTP status. */
export class AtsApiException extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus?: number;
  readonly details?: unknown;

  /**
   * @param message - Human-readable error description.
   * @param code - Machine-readable error code.
   * @param httpStatus - HTTP status that triggered the error, if applicable.
   * @param details - Arbitrary additional context (e.g. the original error).
   */
  constructor(message: string, code: ApiErrorCode, httpStatus?: number, details?: unknown) {
    super(message);
    this.name = 'AtsApiException';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  /** Returns `true` if the error was caused by an expired JWT token. */
  isTokenExpired(): boolean {
    return this.code === ApiErrorCode.TOKEN_EXPIRED;
  }

  /** Returns `true` if the request can be safely retried (network, server, or rate-limit errors). */
  isRetryable(): boolean {
    return [
      ApiErrorCode.NETWORK_ERROR,
      ApiErrorCode.SERVER_ERROR,
      ApiErrorCode.RATE_LIMITED,
    ].includes(this.code);
  }
}
