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
  /** Access code for update/access modes. */
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
export type FormSubStep = 'file' | 'title' | 'creators' | 'review' | 'access_code';

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
  /** Current error message, `null` when no error. */
  error: string | null;
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
    jobId: null,
    workId: null,
    transactionId: null,
    uploadUrl: null,
    tokenExpiredPending: false,
    submitting: false,
    error: null,
  };
}
