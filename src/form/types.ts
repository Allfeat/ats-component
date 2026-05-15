import type { Screen } from '../api/types';

// ============================================
// Creator
// ============================================

/** UI-side creator model using camelCase field names. */
export interface CreatorFormData {
  fullName: string;
  email: string;
  /** Selected role names (e.g. `["Author", "Composer"]`). */
  roles: string[];
  /** IPI code (empty string when not provided). */
  ipi: string;
  /** ISNI code (empty string when not provided). */
  isni: string;
}

/** The four valid creator role strings. */
export const CREATOR_ROLES = [
  'Author',
  'Composer',
  'Arranger',
  'Adapter',
] as const;

/**
 * Creates a blank creator with empty fields and no roles selected.
 * @returns A fresh `CreatorFormData` instance.
 */
export function createEmptyCreator(): CreatorFormData {
  return {
    fullName: '',
    email: '',
    roles: [],
    ipi: '',
    isni: '',
  };
}

// ============================================
// Form State (wizard data only)
// ============================================

/** Wizard form data payload shared across registration and update flows. */
export interface FormState {
  /** The selected audio file, or `null` if none chosen yet. */
  file: File | null;
  /** Work title. */
  title: string;
  /** List of creators attached to the work. */
  creators: CreatorFormData[];
  /** Access code for update mode. */
  accessCode: string;
}

/** Per-field validation errors for the form. Absent keys indicate no error. */
export interface FormErrors {
  file?: string;
  title?: string;
  /** Keyed by creator index, each containing per-field error messages. */
  creators?: {
    [index: number]: {
      fullName?: string;
      email?: string;
      roles?: string;
      ipi?: string;
      isni?: string;
    };
  };
  accessCode?: string;
  /** A general error not tied to a specific field. */
  general?: string;
}

/**
 * Creates a fresh form state with one empty creator and no file selected.
 * @returns A default `FormState` instance.
 */
export function createDefaultFormState(): FormState {
  return {
    file: null,
    title: '',
    creators: [createEmptyCreator()],
    accessCode: '',
  };
}

// ============================================
// Component State (full state machine)
// ============================================

/** Wizard sub-step within the FORM screen. */
export type FormSubStep = 'file' | 'title' | 'creators' | 'review' | 'access_code' | 'work_select';

/** Data available after a successful on-chain registration or update. */
export interface CompletionData {
  /** Numeric ATS identifier, `null` if not yet assigned. */
  atsId: number | null;
  /** On-chain transaction hash. */
  txHash: string;
  /** Block number where the transaction was included. */
  blockNumber: number;
  /** URL to view the transaction on a block explorer. */
  explorerUrl: string;
  /** Access code for the work (present on new registrations). */
  accessCode?: string;
}

/** CamelCase representation of the access endpoint response. */
export interface AccessData {
  atsId: number | null;
  title: string;
  network: string;
  ownerAddress: string;
  latestVersion: number;
  latestCommitment: string | null;
  createdAt: string | null;
  assetFilename: string | null;
}

/**
 * CamelCase representation of a work returned by the user-scoped list endpoint.
 * Field names mirror the dashboard `WorkSummary` shape (with camelCase conversion).
 */
export interface SelectedWork {
  id: string;
  /** `-1` if not yet assigned on-chain, matching the dashboard sentinel. */
  atsId: number;
  owner: string;
  latestVersion: number;
  latestCommitment: string | null;
  /** ISO timestamp of first registration. */
  createdAt: string | null;
  /** ISO timestamp of most recent version registration — used to order the list. Widget-specific. */
  updatedAt: string | null;
  title: string;
  assetFilename: string | null;
  hasFiles: boolean;
}

/** Camel-case view of a single on-chain version of a work. */
export interface WorkVersion {
  version: number;
  commitment: string;
  /** Original filename of this version's asset; `null` when the version has no file. */
  assetFilename: string | null;
  registeredAt: string | null;
  registeredAtBlock: number | null;
  mediaHash: string | null;
  merkleRoot: string | null;
  blockHash: string | null;
  txHash: string | null;
  feeCredits: number | null;
  storageFeeCredits: number | null;
}

/** Camel-case view of a creator returned by the version-creators endpoint. */
export interface WorkCreator {
  fullName: string;
  email: string | null;
  roles: string[];
  ipi: string | null;
  isni: string | null;
}

/** Lazy-loaded creators for a single version, mirroring the dashboard's lazy-fetch pattern. */
export interface VersionCreatorsEntry {
  status: WorkListStatus;
  creators: WorkCreator[];
  error: string | null;
}

/** State for the version-detail screen (DOWNLOAD_DETAIL). */
export interface VersionListState {
  status: WorkListStatus;
  /** The work whose versions are being displayed; held so the screen can render even before versions load. */
  work: SelectedWork | null;
  /** Versions ordered newest-first for display. */
  versions: WorkVersion[];
  error: string | null;
  /** Per-version in-flight download flag, keyed by version number. */
  downloading: Record<number, 'asset' | 'certificate' | null>;
  /** Per-version expand state for the creators dropdown, keyed by version number. */
  creatorsExpanded: Record<number, boolean>;
  /** Per-version creators cache (lazy-loaded). Keyed by version number. */
  creatorsByVersion: Record<number, VersionCreatorsEntry>;
}

/** Creates a fresh, empty VersionListState. */
export function createDefaultVersionListState(): VersionListState {
  return {
    status: 'idle',
    work: null,
    versions: [],
    error: null,
    downloading: {},
    creatorsExpanded: {},
    creatorsByVersion: {},
  };
}

/** Loading status for the user-works list. */
export type WorkListStatus = 'idle' | 'loading' | 'loaded' | 'error';

/** State for the user-works list shared between work-selector (update) and downloads screens. */
export interface WorkListState {
  status: WorkListStatus;
  works: SelectedWork[];
  /** Current search query (case-insensitive substring on title). */
  search: string;
  /** Currently expanded row id, or `null` when none expanded. */
  expandedId: string | null;
  /** Currently selected row id. Picked up by the auto-advance handler. */
  selectedId: string | null;
  /** Pagination cursor returned by the API; `null` if none / exhausted. */
  endCursor: string | null;
  /** Whether more results exist. */
  hasNextPage: boolean;
  /** Error message to display, if `status === 'error'`. */
  error: string | null;
  /** Per-row in-flight download flag so we can disable buttons independently. */
  downloading: Record<string, 'asset' | 'certificate' | null>;
  /** Per-row expand state for the latest-version creators dropdown, keyed by work id. */
  creatorsExpanded: Record<string, boolean>;
  /** Per-row creators cache (lazy-loaded for the latest version). Keyed by work id. */
  creatorsByWork: Record<string, VersionCreatorsEntry>;
  /** `true` while a chosen work's creators are being fetched for prefill before advancing. */
  selecting: boolean;
}

/** Creates a fresh, empty WorkListState. */
export function createDefaultWorkListState(): WorkListState {
  return {
    status: 'idle',
    works: [],
    search: '',
    expandedId: null,
    selectedId: null,
    endCursor: null,
    hasNextPage: false,
    error: null,
    downloading: {},
    creatorsExpanded: {},
    creatorsByWork: {},
    selecting: false,
  };
}

/** Full internal state machine for the web component. */
export interface ComponentState {
  /** Current UI screen. */
  screen: Screen;
  /** Active sub-step within the form wizard. */
  formSubStep: FormSubStep;
  formState: FormState;
  formErrors: FormErrors;

  // Upload
  /** File upload progress percentage (0–100). */
  uploadProgress: number;
  /** Current upload retry attempt number. */
  uploadAttempt: number;

  // Tracking
  /** Current tracking step identifier. */
  trackingStep: string;
  /** Tracking progress percentage (0–100). */
  trackingProgress: number;

  // Completion
  /** Result data after successful registration/update, `null` until complete. */
  completionData: CompletionData | null;

  // Access mode result
  /** Work details fetched in access mode, `null` until loaded. */
  accessData: AccessData | null;

  // User-scoped works (external-user-id)
  /** Shared list state for the work-selector (update) and downloads screens. */
  workList: WorkListState;
  /** Per-work version-history state for the DOWNLOAD_DETAIL screen. */
  versionList: VersionListState;
  /** The work selected from the work-selector list, `null` when none picked. */
  selectedWork: SelectedWork | null;

  // API state
  jobId: string | null;
  workId: string | null;
  transactionId: string | null;
  uploadUrl: string | null;

  // Token refresh
  /** Whether a token-expired callback is pending resolution. */
  tokenExpiredPending: boolean;

  // Submit guard
  /** Prevents duplicate submissions while a request is in flight. */
  submitting: boolean;

  // Error
  /** Current error, `null` when no error. */
  error: {
    message: string;
    requestId: string | null;
    code: string | null;
  } | null;
}

/**
 * Creates a fully reset component state starting on the form screen.
 * @returns A default `ComponentState` instance.
 */
export function createDefaultComponentState(): ComponentState {
  return {
    screen: 'FORM',
    formSubStep: 'file',
    formState: createDefaultFormState(),
    formErrors: {},
    uploadProgress: 0,
    uploadAttempt: 0,
    trackingStep: '',
    trackingProgress: 0,
    completionData: null,
    accessData: null,
    workList: createDefaultWorkListState(),
    versionList: createDefaultVersionListState(),
    selectedWork: null,
    jobId: null,
    workId: null,
    transactionId: null,
    uploadUrl: null,
    tokenExpiredPending: false,
    submitting: false,
    error: null,
  };
}
