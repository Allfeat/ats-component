/**
 * Custom event types for the ATS register component
 */

/**
 * ZKP computation progress event detail
 */
export interface ZkpComputingDetail {
  progress: number;
  stage: 'bundle' | 'proof' | 'verify';
  message?: string;
}

/**
 * Blockchain submission in progress event detail
 */
export interface BlockchainSubmittingDetail {
  commitment: string;
}

/**
 * Blockchain submission success event detail
 */
export interface BlockchainSuccessDetail {
  atsId: number;
  txHash: string;
  blockNumber: number;
  message?: string;
}

/**
 * ZIP ready for download event detail
 */
export interface ZipReadyDetail {
  blob: Blob;
  filename: string;
  pdfGenerated: boolean;
}

/**
 * Error event detail
 */
export interface AtsRegisterErrorDetail {
  stage: 'wasm-init' | 'validation' | 'zkp' | 'api' | 'certificate' | 'unknown';
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Form step change event detail
 */
export interface StepChangeDetail {
  step: number;
  stepName: string;
  totalSteps: number;
}

/**
 * Event names used by the component
 */
export const EVENT_NAMES = {
  ZKP_COMPUTING: 'zkp-computing',
  BLOCKCHAIN_SUBMITTING: 'blockchain-submitting',
  BLOCKCHAIN_SUCCESS: 'blockchain-success',
  ZIP_READY: 'zip-ready',
  ERROR: 'ats-register-error',
  STEP_CHANGE: 'step-change',
  FORM_VALID: 'form-valid',
  FORM_INVALID: 'form-invalid',
} as const;

/**
 * Create a typed custom event
 */
export function createCustomEvent<T>(
  eventName: string,
  detail: T,
  options: { bubbles?: boolean; composed?: boolean } = {}
): CustomEvent<T> {
  return new CustomEvent(eventName, {
    detail,
    bubbles: options.bubbles ?? true,
    composed: options.composed ?? true, // Cross shadow DOM boundary
  });
}

/**
 * Dispatch ZKP computing progress event
 */
export function dispatchZkpComputing(
  element: HTMLElement,
  detail: ZkpComputingDetail
): void {
  element.dispatchEvent(
    createCustomEvent(EVENT_NAMES.ZKP_COMPUTING, detail)
  );
}

/**
 * Dispatch blockchain submitting event
 */
export function dispatchBlockchainSubmitting(
  element: HTMLElement,
  detail: BlockchainSubmittingDetail
): void {
  element.dispatchEvent(
    createCustomEvent(EVENT_NAMES.BLOCKCHAIN_SUBMITTING, detail)
  );
}

/**
 * Dispatch blockchain success event
 */
export function dispatchBlockchainSuccess(
  element: HTMLElement,
  detail: BlockchainSuccessDetail
): void {
  element.dispatchEvent(
    createCustomEvent(EVENT_NAMES.BLOCKCHAIN_SUCCESS, detail)
  );
}

/**
 * Dispatch ZIP ready event
 */
export function dispatchZipReady(
  element: HTMLElement,
  detail: ZipReadyDetail
): void {
  element.dispatchEvent(
    createCustomEvent(EVENT_NAMES.ZIP_READY, detail)
  );
}

/**
 * Dispatch error event
 */
export function dispatchError(
  element: HTMLElement,
  detail: AtsRegisterErrorDetail
): void {
  element.dispatchEvent(
    createCustomEvent(EVENT_NAMES.ERROR, detail)
  );
}

/**
 * Dispatch step change event
 */
export function dispatchStepChange(
  element: HTMLElement,
  detail: StepChangeDetail
): void {
  element.dispatchEvent(
    createCustomEvent(EVENT_NAMES.STEP_CHANGE, detail)
  );
}
