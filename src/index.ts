/**
 * Allfeat ATS Web Component
 *
 * A framework-agnostic custom element for registering works on the Allfeat blockchain.
 *
 * Usage:
 * ```html
 * <script src="allfeat-ats-register.iife.js"></script>
 * <allfeat-ats-register
 *   api-key="aft_your_api_key_here"
 *   api-endpoint="https://api.allfeat.io"
 *   theme="light"
 * ></allfeat-ats-register>
 * ```
 */

// Main component
export { AllfeatAtsRegister } from './allfeat-ats-register';

// API client for external use
export {
  submitAts,
  checkApiHealth,
  isValidApiKeyFormat,
  isValidHashCommitment,
  DEFAULT_API_ENDPOINT,
} from './api/client';

export type {
  AtsSubmitRequest,
  AtsSubmitResponse,
} from './api/types';

export {
  AtsApiException,
  ApiErrorCode,
} from './api/types';

// Form types
export type {
  FormState,
  CreatorFormData,
  WorkFormData,
  FormErrors,
  WorkType,
  ParsedAtsData,
} from './form/types';

export {
  CREATOR_ROLES,
  createEmptyCreator,
  createDefaultFormState,
} from './form/types';

// Validation
export {
  validateForm,
  validateCreator,
  isValidAtsFile,
  parseAtsFile,
  creatorSchema,
  workFormSchema,
} from './form/schema';

// Event types
export type {
  ZkpComputingDetail,
  BlockchainSubmittingDetail,
  BlockchainSuccessDetail,
  ZipReadyDetail,
  AtsRegisterErrorDetail,
  StepChangeDetail,
} from './utils/events';

export {
  EVENT_NAMES,
} from './utils/events';

// Certificate types
export type {
  CertificateData,
  CertificateCreator,
} from './certificate/pdf-generator';

export type {
  CertificatePackageData,
  CertificatePackageResult,
} from './certificate/zip-packager';

// WASM types
export type {
  ZkpBundle,
  ZkpCreator,
  BundleResult,
  ProofResult,
  AtsCertificateData,
} from './wasm/types';

// Re-export WASM functions for advanced use
export {
  initWasm,
  isWasmInitialized,
  setWasmBaseUrl,
  buildBundle,
  prove,
  verify,
  calculateCommitment,
  generateCertificateJson,
  parseCertificate,
} from './wasm/loader';

// Certificate generation for standalone use
export { generateCertificatePDF } from './certificate/pdf-generator';
export { generateJsonCertificate, generateTimestamp } from './certificate/json-generator';
export {
  generateCertificatePackage,
  generateAndDownloadCertificate,
  downloadBlob,
  generateAtsFileName,
  generateZipFileName,
} from './certificate/zip-packager';
