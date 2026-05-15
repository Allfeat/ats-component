// ============================================
// Enums & Literal Types
// ============================================

/** UI screen the component is currently displaying. */
export type Screen =
  | 'FORM'
  | 'UPLOAD'
  | 'CONFIRMING'
  | 'TRACKING'
  | 'COMPLETE'
  | 'FAILED'
  | 'DISABLED'
  | 'DOWNLOADS'
  | 'DOWNLOAD_DETAIL';

/** Operating mode of the component: register a new work, update an existing one, or download user works. */
export type Mode = 'register' | 'update' | 'download';

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
export type WsMessageType = 'connected' | 'update' | 'error';

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
  /** Structured error body, present when `type` is `'error'`. */
  error?: ApiErrorBody;
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
  /** Original filename of the uploaded asset. */
  asset_filename: string | null;
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

/** Response from `GET /v1/users/{externalUserId}/works/{workId}/download/asset`. */
export interface DownloadAssetResponse {
  /** Pre-signed URL to download the asset file. */
  url: string;
  /** ISO timestamp after which the download URL expires. */
  expires_at: string;
}

// ============================================
// User-Scoped Works (external-user-id)
// ============================================

/** Relay-style cursor pagination metadata. */
export interface PageInfo {
  has_next_page: boolean;
  has_previous_page: boolean;
  start_cursor: string | null;
  end_cursor: string | null;
}

/**
 * A work as returned by the user-scoped list endpoint.
 *
 * Mirrors the existing dashboard `WorkSummary` shape (see `services/ats/src/routes/works/types.rs`):
 * same field names, same nullability rules. The only deviation is the additive `updated_at` field,
 * which the widget needs to surface recently-updated works at the top of the list (the dashboard
 * orders by `created_at` and doesn't need this).
 */
export interface UserWork {
  /** UUID work identifier — used for download and version-update path params. */
  id: string;
  /** Numeric on-chain ATS id. `-1` if not yet assigned (matches dashboard sentinel). */
  ats_id: number;
  /** Owner blockchain address. */
  owner: string;
  /** Most recent version number. */
  latest_version: number;
  /** Commitment hash of the latest version. */
  latest_commitment: string | null;
  /** ISO timestamp of v1's registration. */
  created_at: string | null;
  /**
   * ISO timestamp of the most recent version's registration.
   *
   * **Widget-specific addition**: not present on the dashboard `WorkSummary` — added so the
   * widget can order works by most-recent activity. Falls back to `created_at` client-side
   * if the backend omits it.
   */
  updated_at: string | null;
  /** User-supplied title. */
  title: string | null;
  /** Original filename of the latest version's asset. */
  asset_filename: string | null;
  /** `true` when an asset file exists and is downloadable for this work. */
  has_files: boolean;
}

/**
 * A single on-chain version of a work.
 *
 * Mirrors the dashboard's `WorkVersion` shape (see `services/ats/src/routes/works/types.rs`)
 * exactly — same field names (`registered_at_block`, `registered_at`), same optionality rules.
 */
export interface WorkVersionApi {
  /** Version number (1-based, monotonically increasing). */
  version: number;
  /** Cryptographic commitment hash for this version, prefixed `0x`. Required. */
  commitment: string;
  /**
   * Original filename of this version's asset. Each version stores its own filename
   * because a re-upload can rename the asset between versions. `null` / omitted when
   * the version has no asset file.
   */
  asset_filename?: string | null;
  /** Block number that registered this version. */
  registered_at_block?: number | null;
  /** ISO timestamp this version was registered on-chain. */
  registered_at?: string | null;
  /** Hash of the media file at the time this version was registered. */
  media_hash?: string;
  /** Merkle root of the version's metadata. */
  merkle_root?: string;
  /** Hash of the block that included the transaction. */
  block_hash?: string;
  /** On-chain transaction hash for the version registration. */
  tx_hash?: string;
  /** Network + service fee in credits paid to register this version. */
  fee_credits?: number;
  /** Storage fee in credits paid to store this version's asset. */
  storage_fee_credits?: number;
}

/** Response from `GET /v1/users/{externalUserId}/works/{workId}/versions`. Mirrors `ListVersionsResponse`. */
export interface ListWorkVersionsResponse {
  /** Numeric on-chain ATS id of the work (echoed from path's `workId` lookup). `-1` if unassigned. */
  ats_id: number;
  /** Versions in chronological order (oldest first). The widget reverses for display. */
  versions: WorkVersionApi[];
}

/**
 * A creator attached to a version.
 *
 * Mirrors the dashboard's `CreatorResponse` shape exactly.
 */
export interface WorkCreatorResponse {
  full_name: string;
  email?: string;
  /** Role names (e.g. `["Author", "Composer"]`). */
  roles: string[];
  ipi?: string;
  isni?: string;
}

/** Response from `GET /v1/users/{externalUserId}/works/{workId}/versions/{version}/creators`. Mirrors `ListCreatorsResponse`. */
export interface ListWorkCreatorsResponse {
  ats_id: number;
  version: number;
  creators: WorkCreatorResponse[];
}

/** Response from `GET /v1/users/{externalUserId}/works`. */
export interface ListUserWorksResponse {
  works: UserWork[];
  page_info: PageInfo;
  total_count: number | null;
}

/**
 * Aliases for the user-scoped version-update endpoints. Bodies are identical to the
 * access-code-based variants; only the URL differs. Kept as aliases so call-sites
 * read naturally and divergence is easy to introduce later.
 */
export type InitWorkVersionUploadResponse = InitVersionUploadResponse;
export type InitWorkVersionResponse = InitVersionResponse;
export type PrepareWorkVersionResponse = PrepareVersionResponse;
export type ConfirmWorkVersionResponse = ConfirmVersionResponse;

// ============================================
// Error Handling
// ============================================

/** Structured error body from the unified backend envelope. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

/** Discriminated union for all widget errors. */
export type WidgetError =
  | { kind: 'api'; error: ApiErrorBody; httpStatus: number }
  | { kind: 'network'; message: string }
  | { kind: 'upload'; message: string; httpStatus?: number }
  | { kind: 'malformed'; status: number; body: string };
