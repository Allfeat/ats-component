import type { Mode } from '../api/types';

// ============================================
// Event Names
// ============================================

/** Constant map of custom event names dispatched by the component. Listen for these on the `<ats-widget>` element. */
export const EVENT_NAMES = {
  READY: 'allfeat:ready',
  UPLOAD_START: 'allfeat:upload-start',
  UPLOAD_PROGRESS: 'allfeat:upload-progress',
  UPLOAD_COMPLETE: 'allfeat:upload-complete',
  CONFIRMED: 'allfeat:confirmed',
  STEP: 'allfeat:step',
  COMPLETE: 'allfeat:complete',
  FAILED: 'allfeat:failed',
  TOKEN_EXPIRED: 'allfeat:token-expired',
  ERROR: 'allfeat:error',
  MODE_CHANGED: 'allfeat:mode-changed',
  WORK_SELECTED: 'allfeat:work-selected',
  DOWNLOAD_STARTED: 'allfeat:download-started',
  DOWNLOAD_COMPLETE: 'allfeat:download-complete',
  DOWNLOAD_FAILED: 'allfeat:download-failed',
} as const;

// ============================================
// Event Detail Interfaces
// ============================================

/** Detail for the `allfeat:ready` event, emitted when the component initializes. */
export interface ReadyDetail {
  mode: Mode;
}

/** Detail for the `allfeat:upload-start` event. */
export interface UploadStartDetail {
  filename: string;
  /** File size in bytes. */
  size: number;
}

/** Detail for the `allfeat:upload-progress` event, emitted periodically during upload. */
export interface UploadProgressDetail {
  /** Upload progress percentage (0–100). */
  progress: number;
  /** Bytes uploaded so far. */
  loaded: number;
  /** Total file size in bytes. */
  total: number;
}

/** Detail for the `allfeat:upload-complete` event. */
export interface UploadCompleteDetail {
  filename: string;
}

/** Detail for the `allfeat:confirmed` event, emitted when the transaction is submitted. */
export interface ConfirmedDetail {
  transactionId: string;
}

/** Detail for the `allfeat:step` event, emitted as the transaction progresses through steps. */
export interface StepDetail {
  /** Current step identifier (e.g. `"signing"`, `"submitting"`). */
  step: string;
  /** Overall progress percentage (0–100). */
  progress: number;
  description?: string;
}

/** Detail for the `allfeat:complete` event, emitted on successful registration/update. */
export interface CompleteDetail {
  /** Numeric ATS identifier, `null` if not yet assigned. */
  atsId: number | null;
  txHash: string;
  blockNumber: number;
  explorerUrl: string;
  /** Access code for the work (present on new registrations). */
  accessCode?: string;
}

/** Detail for the `allfeat:failed` event (structured error payload). */
export interface FailedDetail {
  code: string;
  message: string;
  requestId: string | null;
  details?: Record<string, unknown>;
}

/** Detail for the `allfeat:token-expired` event. The consumer should provide a fresh token. */
export interface TokenExpiredDetail {
  /** Description of the action that was interrupted. */
  pendingAction: string;
}

/** Detail for the `allfeat:error` event, emitted on recoverable or informational errors. */
export interface ErrorDetail {
  code: string;
  message: string;
  requestId: string | null;
  stage: string;
  details?: Record<string, unknown>;
}

/** Detail for the `allfeat:mode-changed` event, emitted whenever the `mode` attribute changes. */
export interface ModeChangedDetail {
  mode: Mode;
}

/** What kind of file a download action is targeting. */
export type DownloadKind = 'asset' | 'certificate';

/** Detail for the `allfeat:work-selected` event, emitted when a user picks a work from the work selector. */
export interface WorkSelectedDetail {
  workId: string;
  atsId: number | null;
}

/** Detail for the `allfeat:download-started` event. */
export interface DownloadStartedDetail {
  workId: string;
  kind: DownloadKind;
}

/** Detail for the `allfeat:download-complete` event. */
export interface DownloadCompleteDetail {
  workId: string;
  kind: DownloadKind;
}

/** Detail for the `allfeat:download-failed` event. */
export interface DownloadFailedDetail {
  workId: string;
  kind: DownloadKind;
  message: string;
}

// ============================================
// Helpers
// ============================================

function createCustomEvent<T>(
  eventName: string,
  detail: T,
): CustomEvent<T> {
  return new CustomEvent(eventName, {
    detail,
    bubbles: true,
    composed: true,
  });
}

export function dispatchReady(el: HTMLElement, detail: ReadyDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.READY, detail));
}

export function dispatchUploadStart(el: HTMLElement, detail: UploadStartDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.UPLOAD_START, detail));
}

export function dispatchUploadProgress(el: HTMLElement, detail: UploadProgressDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.UPLOAD_PROGRESS, detail));
}

export function dispatchUploadComplete(el: HTMLElement, detail: UploadCompleteDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.UPLOAD_COMPLETE, detail));
}

export function dispatchConfirmed(el: HTMLElement, detail: ConfirmedDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.CONFIRMED, detail));
}

export function dispatchStep(el: HTMLElement, detail: StepDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.STEP, detail));
}

export function dispatchComplete(el: HTMLElement, detail: CompleteDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.COMPLETE, detail));
}

export function dispatchFailed(el: HTMLElement, detail: FailedDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.FAILED, detail));
}

export function dispatchTokenExpired(el: HTMLElement, detail: TokenExpiredDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.TOKEN_EXPIRED, detail));
}

export function dispatchError(el: HTMLElement, detail: ErrorDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.ERROR, detail));
}

export function dispatchModeChanged(el: HTMLElement, detail: ModeChangedDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.MODE_CHANGED, detail));
}

export function dispatchWorkSelected(el: HTMLElement, detail: WorkSelectedDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.WORK_SELECTED, detail));
}

export function dispatchDownloadStarted(el: HTMLElement, detail: DownloadStartedDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.DOWNLOAD_STARTED, detail));
}

export function dispatchDownloadComplete(el: HTMLElement, detail: DownloadCompleteDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.DOWNLOAD_COMPLETE, detail));
}

export function dispatchDownloadFailed(el: HTMLElement, detail: DownloadFailedDetail): void {
  el.dispatchEvent(createCustomEvent(EVENT_NAMES.DOWNLOAD_FAILED, detail));
}
