/**
 * Allfeat ATS Web Component
 *
 * A framework-agnostic custom element for registering works on the Allfeat blockchain.
 *
 * Usage (Proxy Mode - Recommended):
 * ```html
 * <script src="allfeat-ats-register.iife.js"></script>
 * <allfeat-ats-register
 *   proxy-endpoint="https://your-org.workers.dev/ats-proxy"
 * ></allfeat-ats-register>
 * ```
 */

// Main component
export { AllfeatAtsRegister } from './allfeat-ats-register';

// API client for external use
export {
  checkApiHealth,
  isValidApiKeyFormat,
  subscribeToTransaction,
  pollTransactionStatus,
  registerWorkRaw,
  downloadCertificateViaProxy,
  fileToBase64,
  parseCertificateViaProxy,
  DEFAULT_API_ENDPOINT,
} from './api/client';

export type {
  AtsSubmitRequest,
  AtsSubmitResponse,
  WorkRegistrationAsyncResponse,
  WsMessage,
  WsMessageType,
  WsStepDetails,
  TransactionStatusResponse,
  ProxySubmitResult,
  RawCreatorRequest,
  RegisterWorkRawProxyRequest,
  RegisterWorkRawResponse,
  DownloadCertificateRequest,
  DownloadCertificateResponse,
  ParseCertificateRequest,
  ParseCertificateResponse,
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
  parseAtsFileViaApi,
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
