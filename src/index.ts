/**
 * Allfeat ATS Web Component
 *
 * A framework-agnostic custom element for registering works on the Allfeat blockchain.
 *
 * Usage:
 * ```html
 * <script src="allfeat-ats-register.iife.js"></script>
 * <allfeat-ats-register
 *   site-key="cpk_..."
 *   proxy-endpoint="https://your-org.workers.dev/ats-proxy"
 *   service-url="https://component-service.example.com"
 *   primary-color="#4DB8A8"
 * ></allfeat-ats-register>
 * ```
 */

// Main component
export { AllfeatAtsRegister } from './allfeat-ats-register';

// API client for external use
export {
  // Session management
  createSession,
  // Two-phase registration
  prepareRegistration,
  confirmRegistration,
  // Utilities
  subscribeToTransaction,
  pollTransactionStatus,
  downloadCertificateViaProxy,
  fileToBase64,
  parseCertificateViaProxy,
  checkApiHealth,
  // Constants
  COMPONENT_SERVICE_URL,
  DEFAULT_NETWORK,
} from './api/client';

export type {
  // Session types
  SessionResponse,
  // Prepare/Confirm types
  PrepareRegistrationRequest,
  PrepareRegistrationResponse,
  ConfirmRegistrationResponse,
  // Work types
  WorkRegistrationAsyncResponse,
  WsMessage,
  WsMessageType,
  WsStepDetails,
  TransactionStatusResponse,
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
