/**
 * Allfeat Register Web Component
 *
 * Usage:
 * ```html
 * <script src="ats-widget.iife.js"></script>
 * <ats-widget
 *   token="jwt-token-from-partner"
 *   ats-url="https://ats.api.allfeat.org"
 *   mode="register"
 * ></ats-widget>
 * ```
 */

// Main component
export { AllfeatRegister } from './allfeat-register';

// API client
export {
  initWork,
  prepareWork,
  confirmWork,
  initVersionUpload,
  initVersion,
  prepareVersion,
  confirmVersion,
  uploadFileToS3WithProgress,
  downloadCertificate,
  subscribeToTransaction,
  pollTransactionStatus,
} from './api/client';

// API types
export type {
  Screen,
  Mode,
  Network,
  CreatorRequest,
  InitWorkResponse,
  PrepareWorkResponse,
  ConfirmWorkResponse,
  InitVersionUploadResponse,
  InitVersionResponse,
  PrepareVersionResponse,
  ConfirmVersionResponse,
  WsMessage,
  WsMessageType,
  WsStepDetails,
  TransactionStatusResponse,
  TrackingStep,
  DownloadCertificateResponse,
} from './api/types';

export type {
  ApiErrorBody,
  WidgetError,
} from './api/types';

export {
  getTrackingSteps,
  TRACKING_PROGRESS,
} from './api/types';

// Form types
export type {
  FormState,
  CreatorFormData,
  FormErrors,
  FormSubStep,
  ComponentState,
  CompletionData,
  AccessData,
} from './form/types';

export {
  CREATOR_ROLES,
  createEmptyCreator,
  createDefaultFormState,
  createDefaultComponentState,
} from './form/types';

// Validation
export {
  creatorSchema,
  workFormSchema,
} from './form/schema';

// Event types
export type {
  ReadyDetail,
  UploadStartDetail,
  UploadProgressDetail,
  UploadCompleteDetail,
  ConfirmedDetail,
  StepDetail,
  CompleteDetail,
  FailedDetail,
  TokenExpiredDetail,
  ErrorDetail,
} from './utils/events';

export { EVENT_NAMES } from './utils/events';

// Utility helpers
export { formatFileSize, escapeHtml } from './utils/helpers';
