import {
  createSession,
  initRegistration,
  uploadFileToS3,
  prepareRegistration,
  confirmRegistration,
  downloadCertificateViaProxy,
  subscribeToTransaction,
  pollTransactionStatus,
  DEFAULT_NETWORK,
} from './api/client';
import {
  ApiErrorCode,
  AtsApiException,
  CreatorRequest,
  WsStepDetails,
  PrepareRegistrationResponse,
} from './api/types';
import { FormState, createDefaultFormState, createEmptyCreator, WorkType } from './form/types';
import { creatorSchema, isValidAtsFile, parseAtsFileViaApi } from './form/schema';
import {
  renderStepIndicator,
  renderProtectionChoiceStep,
  renderFileStep,
  renderTitleStep,
  renderCreatorsStep,
  renderReviewStep,
  renderProcessingStep,
  renderSuccessStep,
  renderErrorState,
  renderFatalAuthError,
  getFormSteps,
  MAX_FILE_SIZE_BYTES,
  formatFileSize,
} from './form/renderer';
import {
  dispatchBlockchainSubmitting,
  dispatchBlockchainSuccess,
  dispatchError,
  dispatchStepChange,
} from './utils/events';

// Import styles
import styles from './styles/component.css';

// ============================================
// Color Utilities
// ============================================

/**
 * Convert hex color to RGB components
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert RGB to hex color
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Darken a hex color by a percentage (0-100)
 */
function darkenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const factor = 1 - percent / 100;
  return rgbToHex(
    rgb.r * factor,
    rgb.g * factor,
    rgb.b * factor
  );
}

/**
 * Create a light/tinted version of a color (for backgrounds)
 * Returns the color mixed with white at the given opacity
 */
function lightenColor(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  // Mix with white based on opacity (opacity 0.1 means 10% color, 90% white)
  const mixFactor = opacity;
  return rgbToHex(
    255 - (255 - rgb.r) * mixFactor,
    255 - (255 - rgb.g) * mixFactor,
    255 - (255 - rgb.b) * mixFactor
  );
}

const DEFAULT_PRIMARY_COLOR = '#4DB8A8';

/**
 * Component state
 */
interface ComponentState {
  currentStep: number;
  formState: FormState;
  formErrors: Record<string, unknown>;
  isLoading: boolean;
  processingStage: string;
  processingProgress: number;
  processingMessage?: string;
  apiResponse: {
    atsId: number;
    txHash: string;
    blockNumber: number;
    blockTimestamp?: string;
    workId?: string;  // UUID for certificate download
  } | null;
  error: string | null;
  errorStage?: string;
  // Session management
  sessionToken: string | null;
  sessionExpiresAt: number;  // Unix timestamp in ms
  // Prepare/Confirm flow
  preparedJob: PrepareRegistrationResponse | null;
  isAtsValid: boolean;
  isPreparing: boolean;
  // Fatal auth error (hides the form)
  fatalAuthError: {
    code: ApiErrorCode;
    message: string;
  } | null;
}

/**
 * Default proxy endpoint for testing
 */
const DEFAULT_PROXY_ENDPOINT = 'https://ats-webcomponent-test.jad-chahed.workers.dev';

/**
 * Default Component Service URL for session management
 */
const DEFAULT_SERVICE_URL = 'http://localhost:13008';

/**
 * Allfeat ATS Register Custom Element
 *
 * Usage:
 * ```html
 * <allfeat-ats-register
 *   site-key="cpk_..."
 *   proxy-endpoint="https://your-org.workers.dev/ats-proxy"
 *   service-url="https://component-service.example.com"
 *   primary-color="#4DB8A8"
 * ></allfeat-ats-register>
 * ```
 *
 * Attributes:
 * - site-key: Partner site key for session authentication (required)
 * - proxy-endpoint: Proxy server URL for passphrase injection (required)
 * - service-url: Component Service URL for session management (optional, default: http://localhost:13008)
 * - primary-color: Theme accent color (optional, default: #4DB8A8)
 *
 * The component uses session-based authentication with two-phase registration:
 * 1. Session created using site-key (via Component Service)
 * 2. Prepare phase validates work and estimates fees
 * 3. Confirm phase commits to blockchain
 */
export class AllfeatAtsRegister extends HTMLElement {
  static observedAttributes = ['site-key', 'proxy-endpoint', 'primary-color', 'service-url'];

  private shadow: ShadowRoot;
  private state: ComponentState;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();

    // Create shadow DOM
    this.shadow = this.attachShadow({ mode: 'open' });

    // Initialize state
    this.state = {
      currentStep: 0,
      formState: createDefaultFormState(),
      formErrors: {},
      isLoading: false,
      processingStage: '',
      processingProgress: 0,
      apiResponse: null,
      error: null,
      // Session management
      sessionToken: null,
      sessionExpiresAt: 0,
      // Prepare/Confirm flow
      preparedJob: null,
      isAtsValid: false,
      isPreparing: false,
      // Fatal auth error
      fatalAuthError: null,
    };
  }

  // ============================================
  // Lifecycle
  // ============================================

  connectedCallback() {
    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    this.shadow.appendChild(styleEl);

    // Create container
    const container = document.createElement('div');
    container.className = 'ats-container';
    container.setAttribute('part', 'container');
    this.shadow.appendChild(container);

    // Apply custom primary color if set
    if (this.getAttribute('primary-color')) {
      this.updatePrimaryColor(this.primaryColor);
    }

    // Initialize session if configured
    if (this.siteKey && this.proxyEndpoint) {
      this.initSession();
    }

    // Render initial state
    this.render();
  }

  disconnectedCallback() {
    // Cleanup token refresh timer
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;

    switch (name) {
      case 'site-key':
        // Re-initialize session when site-key changes
        if (newValue && this.proxyEndpoint) {
          this.initSession();
        }
        this.render();
        break;
      case 'proxy-endpoint':
        // Re-initialize session when proxy-endpoint changes
        if (newValue && this.siteKey) {
          this.initSession();
        }
        this.render();
        break;
      case 'primary-color':
        // Update CSS custom properties for the new primary color
        this.updatePrimaryColor(newValue || DEFAULT_PRIMARY_COLOR);
        break;
      case 'service-url':
        // Re-initialize session when service-url changes
        if (this.siteKey && this.proxyEndpoint) {
          this.initSession();
        }
        break;
    }
  }

  // ============================================
  // Getters
  // ============================================

  get siteKey(): string {
    return this.getAttribute('site-key') || '';
  }

  get proxyEndpoint(): string {
    return this.getAttribute('proxy-endpoint') || DEFAULT_PROXY_ENDPOINT;
  }

  get primaryColor(): string {
    return this.getAttribute('primary-color') || DEFAULT_PRIMARY_COLOR;
  }

  get serviceUrl(): string {
    return this.getAttribute('service-url') || DEFAULT_SERVICE_URL;
  }

  /**
   * Returns true if the component is properly configured
   */
  get isConfigured(): boolean {
    return !!this.siteKey && !!this.proxyEndpoint;
  }

  /**
   * Returns true if session is active and not expired
   */
  get hasValidSession(): boolean {
    return !!this.state.sessionToken && Date.now() < this.state.sessionExpiresAt;
  }

  // ============================================
  // Public Methods
  // ============================================

  /**
   * Programmatically set form data
   */
  setFormData(data: Partial<FormState>): void {
    this.state.formState = {
      ...this.state.formState,
      ...data,
    };
    this.render();
  }

  /**
   * Reset the component to initial state
   */
  reset(): void {
    // Preserve session state when resetting
    const { sessionToken, sessionExpiresAt, fatalAuthError } = this.state;
    this.state = {
      currentStep: 0,
      formState: createDefaultFormState(),
      formErrors: {},
      isLoading: false,
      processingStage: '',
      processingProgress: 0,
      apiResponse: null,
      error: null,
      // Preserve session
      sessionToken,
      sessionExpiresAt,
      // Reset prepare/confirm state
      preparedJob: null,
      isAtsValid: false,
      isPreparing: false,
      // Preserve fatal auth error (cannot be reset without fixing config)
      fatalAuthError,
    };
    this.render();
  }

  /**
   * Get current component state
   */
  getState(): ComponentState {
    return { ...this.state };
  }

  /**
   * Trigger form submission programmatically
   */
  async submit(): Promise<void> {
    const steps = getFormSteps(this.state.formState.workType);
    const reviewIndex = steps.findIndex(s => s.id === 'review');
    if (this.state.currentStep === reviewIndex) {
      await this.handleSubmit();
    }
  }

  // ============================================
  // Color Management
  // ============================================

  /**
   * Update CSS custom properties for primary color theme
   */
  private updatePrimaryColor(color: string): void {
    const host = this.shadow.host as HTMLElement;

    // Set the main primary color
    host.style.setProperty('--ats-primary', color);

    // Calculate and set hover variant (10% darker)
    host.style.setProperty('--ats-primary-hover', darkenColor(color, 10));

    // Calculate and set light variant (for backgrounds, 10% opacity)
    host.style.setProperty('--ats-primary-light', lightenColor(color, 0.1));
  }

  // ============================================
  // Session Management
  // ============================================

  /**
   * Initialize session with the Component Service
   */
  private async initSession(): Promise<void> {
    if (!this.siteKey) {
      console.warn('Cannot initialize session: missing site-key');
      return;
    }

    try {
      const { token, expires_in } = await createSession(this.siteKey, this.serviceUrl);
      this.state.sessionToken = token;
      this.state.sessionExpiresAt = Date.now() + (expires_in * 1000);

      // Schedule token refresh before expiry (at 90% of lifetime)
      this.scheduleTokenRefresh(expires_in * 0.9);

      console.log('[Session] Initialized, expires in', expires_in, 'seconds');
    } catch (error) {
      console.error('[Session] Failed to initialize:', error);

      // Check for fatal auth errors (should hide the form)
      if (error instanceof AtsApiException && error.isFatalAuthError()) {
        this.state.fatalAuthError = {
          code: error.code,
          message: this.getFatalErrorMessage(error.code),
        };
        this.render();

        // Dispatch error event with auth stage
        dispatchError(this, {
          stage: 'auth',
          error: error.message,
          code: error.code,
          details: error,
        });
        return;
      }

      dispatchError(this, {
        stage: 'api',
        error: error instanceof AtsApiException ? error.message : 'Session initialization failed',
        details: error,
      });
    }
  }

  /**
   * Get user-friendly error message for fatal auth errors
   */
  private getFatalErrorMessage(code: ApiErrorCode): string {
    switch (code) {
      case ApiErrorCode.INVALID_SITE_KEY:
        return 'The site key provided is invalid. Please verify the site-key attribute is correctly configured.';
      case ApiErrorCode.DOMAIN_NOT_REGISTERED:
        return 'This domain is not registered to use the Allfeat ATS component. Please register this domain in your dashboard.';
      default:
        return 'An authentication error occurred. Please check your configuration.';
    }
  }

  /**
   * Schedule token refresh before expiry
   */
  private scheduleTokenRefresh(delaySeconds: number): void {
    // Clear existing timer
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }

    this.tokenRefreshTimer = setTimeout(() => {
      this.refreshSession();
    }, delaySeconds * 1000);
  }

  /**
   * Refresh the session token
   */
  private async refreshSession(): Promise<void> {
    try {
      const { token, expires_in } = await createSession(this.siteKey, this.serviceUrl);
      this.state.sessionToken = token;
      this.state.sessionExpiresAt = Date.now() + (expires_in * 1000);

      // Schedule next refresh
      this.scheduleTokenRefresh(expires_in * 0.9);

      console.log('[Session] Refreshed, expires in', expires_in, 'seconds');
    } catch (error) {
      console.error('[Session] Failed to refresh:', error);
      // Session will expire, but don't interrupt user flow
      // Next API call will fail with SESSION_EXPIRED
    }
  }

  /**
   * Ensure session is valid, refresh if needed
   */
  private async ensureValidSession(): Promise<void> {
    // Refresh if within 60 seconds of expiry
    if (Date.now() >= this.state.sessionExpiresAt - 60000) {
      await this.refreshSession();
    }
  }

  // ============================================
  // Rendering
  // ============================================

  private render(): void {
    const container = this.shadow.querySelector('.ats-container');
    if (!container) return;

    // Check for fatal auth error first (hides the entire form)
    if (this.state.fatalAuthError) {
      container.innerHTML = renderFatalAuthError(
        this.state.fatalAuthError.code,
        this.state.fatalAuthError.message
      );
      return;
    }

    // Check configuration: need both site-key and proxy-endpoint
    if (!this.isConfigured) {
      container.innerHTML = `
        <div class="ats-alert ats-alert-error">
          <strong>Configuration Error:</strong><br />
          Please set both <code>site-key</code> and <code>proxy-endpoint</code> attributes.
        </div>
      `;
      return;
    }

    // Get the appropriate steps for the current work type
    const steps = getFormSteps(this.state.formState.workType);
    const stepId = steps[this.state.currentStep]?.id;

    // Render based on current step
    let content = '';

    // Show step indicator for non-processing/success steps
    const processingIndex = steps.findIndex(s => s.id === 'processing');
    if (this.state.currentStep < processingIndex && !this.state.error) {
      content += renderStepIndicator(this.state.currentStep, this.state.formState.workType);
    }

    // Handle error state
    if (this.state.error) {
      content += renderErrorState(this.state.error, this.state.errorStage);
    } else {
      switch (stepId) {
        case 'choice':
          content += renderProtectionChoiceStep(this.state.formState.workType);
          break;
        case 'file':
          content += renderFileStep(
            this.state.formState,
            {
              file: this.state.formErrors.file as string,
              atsFile: this.state.formErrors.atsFile as string,
            }
          );
          break;
        case 'title':
          content += renderTitleStep(
            this.state.formState,
            this.state.formErrors as Record<string, string>
          );
          break;
        case 'creators':
          content += renderCreatorsStep(
            this.state.formState,
            this.state.formErrors.creators as Record<string, Record<string, string>>
          );
          break;
        case 'review':
          content += renderReviewStep(
            this.state.formState,
            this.state.isPreparing,
            this.state.isAtsValid,
            this.state.preparedJob
          );
          break;
        case 'processing':
          content += renderProcessingStep(
            this.state.processingStage,
            this.state.processingProgress,
            this.state.processingMessage
          );
          break;
        case 'success':
          if (this.state.apiResponse) {
            content += renderSuccessStep(
              this.state.apiResponse.atsId,
              this.state.apiResponse.txHash,
              this.state.apiResponse.blockNumber,
              DEFAULT_NETWORK as 'testnet' | 'mainnet'
            );
          }
          break;
      }
    }

    container.innerHTML = content;

    // Attach event listeners
    this.attachEventListeners();
  }

  // ============================================
  // Event Handling
  // ============================================

  private attachEventListeners(): void {
    const container = this.shadow.querySelector('.ats-container');
    if (!container) return;

    // Navigation buttons
    container.querySelector('#next-btn')?.addEventListener('click', () => this.handleNext());
    container.querySelector('#back-btn')?.addEventListener('click', () => this.handleBack());
    container.querySelector('#submit-btn')?.addEventListener('click', () => this.handleSubmit());
    container.querySelector('#download-btn')?.addEventListener('click', () => this.handleDownload());
    container.querySelector('#reset-btn')?.addEventListener('click', () => this.reset());

    // Protection choice cards
    container.querySelectorAll('.ats-choice-card').forEach((card) => {
      card.addEventListener('click', () => {
        const choice = (card as HTMLElement).dataset.choice as WorkType;
        this.state.formState.workType = choice;
        // Clear any previous data when changing choice
        this.state.formState.atsFile = null;
        this.state.formState.parsedAtsData = null;
        this.render();
      });
    });

    // Asset file upload
    const fileDropZone = container.querySelector('#file-drop-zone');
    const fileInput = container.querySelector('#file-input') as HTMLInputElement;

    if (fileDropZone && fileInput) {
      fileDropZone.addEventListener('click', () => fileInput.click());
      fileDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDropZone.classList.add('dragover');
      });
      fileDropZone.addEventListener('dragleave', () => {
        fileDropZone.classList.remove('dragover');
      });
      fileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDropZone.classList.remove('dragover');
        const files = (e as DragEvent).dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleFileSelect(files[0]);
        }
      });
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
          this.handleFileSelect(fileInput.files[0]);
        }
      });
    }

    container.querySelector('#remove-file')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.state.formState.file = null;
      this.render();
    });

    // ATS certificate file upload (for version flow)
    const atsFileDropZone = container.querySelector('#ats-file-drop-zone');
    const atsFileInput = container.querySelector('#ats-file-input') as HTMLInputElement;

    if (atsFileDropZone && atsFileInput) {
      atsFileDropZone.addEventListener('click', () => atsFileInput.click());
      atsFileDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        atsFileDropZone.classList.add('dragover');
      });
      atsFileDropZone.addEventListener('dragleave', () => {
        atsFileDropZone.classList.remove('dragover');
      });
      atsFileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        atsFileDropZone.classList.remove('dragover');
        const files = (e as DragEvent).dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleAtsFileSelect(files[0]);
        }
      });
      atsFileInput.addEventListener('change', () => {
        if (atsFileInput.files && atsFileInput.files.length > 0) {
          this.handleAtsFileSelect(atsFileInput.files[0]);
        }
      });
    }

    container.querySelector('#remove-ats-file')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.state.formState.atsFile = null;
      this.state.formState.parsedAtsData = null;
      this.render();
    });

    // Text inputs
    container.querySelector('#title')?.addEventListener('input', (e) => {
      this.state.formState.title = (e.target as HTMLInputElement).value;
    });

    // Creator inputs
    container.querySelectorAll('.creator-fullname').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.index || '0');
        this.state.formState.creators[idx].fullName = (e.target as HTMLInputElement).value;
      });
    });

    container.querySelectorAll('.creator-email').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.index || '0');
        this.state.formState.creators[idx].email = (e.target as HTMLInputElement).value;
      });
    });

    // IPI inputs with real-time filtering (digits only, max 11)
    container.querySelectorAll('.creator-ipi').forEach((input) => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const idx = parseInt(target.dataset.index || '0');
        // Filter to digits only, max 11 characters
        const filtered = target.value.replace(/\D/g, '').slice(0, 11);
        target.value = filtered;
        this.state.formState.creators[idx].ipi = filtered;
      });
    });

    // ISNI inputs with real-time filtering (digits and X only, max 16, auto-uppercase)
    container.querySelectorAll('.creator-isni').forEach((input) => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const idx = parseInt(target.dataset.index || '0');
        // Filter to digits and X only, max 16 characters, uppercase
        const filtered = target.value.replace(/[^0-9xX]/g, '').slice(0, 16).toUpperCase();
        target.value = filtered;
        this.state.formState.creators[idx].isni = filtered;
      });
    });

    // Role checkboxes
    container.querySelectorAll('.creator-role').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const idx = parseInt(target.dataset.index || '0');
        const role = target.value;

        if (target.checked) {
          if (!this.state.formState.creators[idx].roles.includes(role)) {
            this.state.formState.creators[idx].roles.push(role);
          }
        } else {
          this.state.formState.creators[idx].roles = this.state.formState.creators[idx].roles.filter(r => r !== role);
        }

        // Update visual state
        const label = target.closest('.ats-role-badge');
        if (label) {
          label.classList.toggle('selected', target.checked);

          // Add or remove check icon dynamically
          const existingCheck = label.querySelector('.ats-role-check');
          if (target.checked && !existingCheck) {
            const checkSpan = document.createElement('span');
            checkSpan.className = 'ats-role-check';
            checkSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
            // Insert after the hidden checkbox input
            const input = label.querySelector('input');
            if (input) {
              input.after(checkSpan);
            }
          } else if (!target.checked && existingCheck) {
            existingCheck.remove();
          }
        }
      });
    });

    // Add/remove creators
    container.querySelector('#add-creator')?.addEventListener('click', () => {
      if (this.state.formState.creators.length < 20) {
        this.state.formState.creators.push(createEmptyCreator());
        this.render();
      }
    });

    container.querySelectorAll('.remove-creator').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.target as HTMLButtonElement).dataset.index || '0');
        if (this.state.formState.creators.length > 1) {
          this.state.formState.creators.splice(idx, 1);
          this.render();
        }
      });
    });
  }

  // ============================================
  // Handlers
  // ============================================

  private handleFileSelect(file: File): void {
    // Validate file size (50MB limit)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.state.formErrors = {
        ...this.state.formErrors,
        file: `File is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`,
      };
      this.render();
      return;
    }

    // Accept any file type (no type validation needed)
    this.state.formState.file = file;
    this.state.formErrors = {};
    this.render();
  }

  private async handleAtsFileSelect(file: File): Promise<void> {
    // Validate it's a JSON file
    if (!isValidAtsFile(file)) {
      this.state.formErrors = { ...this.state.formErrors, atsFile: 'Please select a valid ATS certificate (.json)' };
      this.render();
      return;
    }

    // Parse the ATS certificate via API (always uses server-side parsing)
    // Pass session token for authentication with the proxy server
    const result = await parseAtsFileViaApi(file, this.proxyEndpoint, this.state.sessionToken || undefined);

    if (!result.success) {
      this.state.formErrors = { ...this.state.formErrors, atsFile: result.error };
      this.render();
      return;
    }

    // Store the file and parsed data
    this.state.formState.atsFile = file;
    this.state.formState.parsedAtsData = result.data;

    // Pre-fill title from ATS certificate
    this.state.formState.title = result.data.title;

    // Pre-fill creators from ATS certificate (if any)
    if (result.data.creators.length > 0) {
      this.state.formState.creators = result.data.creators.map(c => ({
        fullName: c.fullName,
        email: c.email,
        roles: c.roles,
        ipi: c.ipi || '',
        isni: c.isni || '',
      }));
    }

    this.state.formErrors = {};
    this.render();
  }

  private handleNext(): void {
    // Validate current step
    if (!this.validateCurrentStep()) {
      return;
    }

    this.state.currentStep++;
    this.state.formErrors = {};

    const steps = getFormSteps(this.state.formState.workType);
    const currentStepId = steps[this.state.currentStep]?.id;

    // Trigger prepare when entering review step
    if (currentStepId === 'review') {
      this.handlePrepare();
    }

    this.render();

    dispatchStepChange(this, {
      step: this.state.currentStep,
      stepName: currentStepId || 'unknown',
      totalSteps: steps.length,
    });
  }

  private handleBack(): void {
    const steps = getFormSteps(this.state.formState.workType);
    const reviewIndex = steps.findIndex(s => s.id === 'review');

    if (this.state.error) {
      this.state.error = null;
      this.state.errorStage = undefined;
      if (this.state.currentStep > reviewIndex) {
        this.state.currentStep = reviewIndex;
      }
    } else if (this.state.currentStep > 0) {
      this.state.currentStep--;
    }
    this.render();
  }

  private validateCurrentStep(): boolean {
    const { formState } = this.state;
    const steps = getFormSteps(formState.workType);
    const currentStepId = steps[this.state.currentStep]?.id;

    switch (currentStepId) {
      case 'choice': // Protection choice step
        if (!formState.workType) {
          this.state.formErrors = { workType: 'Please select a protection type' };
          this.render();
          return false;
        }
        break;

      case 'file': // File step
        if (!formState.file) {
          this.state.formErrors = { file: 'Please select an asset file' };
          this.render();
          return false;
        }
        // For version flow, also require ATS file
        if (formState.workType === 'version') {
          if (!formState.atsFile || !formState.parsedAtsData) {
            this.state.formErrors = { ...this.state.formErrors, atsFile: 'Please upload your existing ATS certificate' };
            this.render();
            return false;
          }
        }
        break;

      case 'title': // Title step
        const errors: Record<string, string> = {};
        if (!formState.title.trim()) {
          errors.title = 'Title is required';
        } else if (formState.title.length > 255) {
          errors.title = 'Title must be 255 characters or less';
        }
        if (Object.keys(errors).length > 0) {
          this.state.formErrors = errors;
          this.render();
          return false;
        }
        break;

      case 'creators': // Creators step
        const creatorErrors: Record<number, Record<string, string>> = {};
        let hasErrors = false;

        formState.creators.forEach((creator, index) => {
          const result = creatorSchema.safeParse(creator);
          if (!result.success) {
            hasErrors = true;
            creatorErrors[index] = {};
            result.error.issues.forEach((issue) => {
              const field = issue.path[0] as string;
              creatorErrors[index][field] = issue.message;
            });
          }
        });

        if (hasErrors) {
          this.state.formErrors = { creators: creatorErrors };
          this.render();
          return false;
        }
        break;
    }

    return true;
  }

  // ============================================
  // Prepare/Confirm Flow
  // ============================================

  /**
   * Prepare registration (validation phase)
   * Called when entering the review step
   *
   * Implements the 3-step flow:
   * 1. Init: Get job_id and presigned upload URL
   * 2. Upload: Upload file directly to S3 (bypasses proxy/backend)
   * 3. Prepare: Call prepare with job_id to get fees/commitment
   */
  private async handlePrepare(): Promise<void> {
    const { formState } = this.state;

    // Reset prepare state
    this.state.isPreparing = true;
    this.state.isAtsValid = false;
    this.state.preparedJob = null;
    this.render();

    try {
      // Convert creators to API format
      const creators: CreatorRequest[] = formState.creators.map((c) => ({
        full_name: c.fullName,
        email: c.email,
        roles: {
          author: c.roles.includes('Author'),
          composer: c.roles.includes('Composer'),
          arranger: c.roles.includes('Arranger'),
          adapter: c.roles.includes('Adapter'),
        },
        ipi: c.ipi || undefined,
        isni: c.isni || undefined,
      }));

      // Step 1: Init - get job_id and upload URL
      console.log('[Prepare] Step 1: Calling init...');
      const initResponse = await initRegistration(
        this.proxyEndpoint,
        this.state.sessionToken!,
        {
          title: formState.title,
          creators: creators,
          filename: formState.file!.name,
          network: DEFAULT_NETWORK as 'testnet' | 'mainnet',
        }
      );

      const { job_id, upload_url } = initResponse;
      console.log('[Prepare] Step 1 complete, job_id:', job_id);

      // Step 2: Upload file directly to S3
      console.log('[Prepare] Step 2: Uploading file to S3...');
      await uploadFileToS3(upload_url, formState.file!);
      console.log('[Prepare] Step 2 complete, file uploaded');

      // Step 3: Call prepare with job_id
      console.log('[Prepare] Step 3: Calling prepare...');
      const prepareResponse = await prepareRegistration(
        this.proxyEndpoint,
        this.state.sessionToken!,
        { job_id }
      );

      this.state.preparedJob = prepareResponse;
      this.state.isAtsValid = true;

      console.log('[Prepare] Success, job_id:', prepareResponse.job_id);
    } catch (error) {
      console.error('[Prepare] Error:', error);

      const errorMessage = error instanceof AtsApiException
        ? error.message
        : 'Failed to validate your ATS';

      this.state.error = errorMessage;
      this.state.errorStage = 'validation';

      dispatchError(this, {
        stage: 'validation',
        error: errorMessage,
        details: error,
      });
    } finally {
      this.state.isPreparing = false;
      this.render();
    }
  }

  /**
   * Confirm registration (commit phase)
   * Called when user clicks "Create my ATS" button
   */
  private async handleSubmit(): Promise<void> {
    // Verify we have a prepared job
    if (!this.state.preparedJob || !this.state.isAtsValid) {
      console.error('[Confirm] No prepared job available');
      return;
    }

    const { formState } = this.state;
    const steps = getFormSteps(formState.workType);

    // Move to processing step
    const processingIndex = steps.findIndex(s => s.id === 'processing');
    this.state.currentStep = processingIndex;
    this.state.processingStage = 'submit';
    this.state.processingProgress = 0;
    this.render();

    try {
      // Ensure valid session
      await this.ensureValidSession();

      if (!this.state.sessionToken) {
        throw new AtsApiException(
          'Session expired. Please refresh the page.',
          'SESSION_EXPIRED' as any
        );
      }

      this.updateProgress('submit', 10, 'Confirming registration...');

      // Dispatch event before submission
      dispatchBlockchainSubmitting(this, { commitment: 'server-side' });

      // Call confirm endpoint
      const response = await confirmRegistration(
        this.proxyEndpoint,
        this.state.sessionToken,
        this.state.preparedJob.job_id
      );

      // Track via WebSocket
      this.updateProgress('blockchain', 30, 'Submitting to blockchain...');

      await this.waitForTransactionCompletion(response.ws_url, response.status_url);
      // Note: waitForTransactionCompletion handles setting apiResponse and moving to success

    } catch (error) {
      console.error('Confirmation error:', error);

      let errorMessage: string;
      let errorStage: string;

      if (error instanceof AtsApiException) {
        errorMessage = error.message;
        errorStage = 'api';
      } else if (error instanceof Error) {
        errorMessage = error.message;
        errorStage = this.state.processingStage || 'unknown';
      } else {
        errorMessage = 'An unexpected error occurred';
        errorStage = 'unknown';
      }

      this.state.error = errorMessage;
      this.state.errorStage = errorStage;

      dispatchError(this, {
        stage: errorStage as 'validation' | 'api' | 'certificate' | 'unknown',
        error: errorMessage,
        details: error,
      });

      this.render();
    }
  }

  private updateProgress(stage: string, progress: number, message?: string): void {
    this.state.processingStage = stage;
    this.state.processingProgress = progress;
    this.state.processingMessage = message;
    this.render();
  }

  /**
   * Wait for async transaction completion via WebSocket (with polling fallback)
   *
   * Connects to WebSocket for real-time updates. If WebSocket fails,
   * falls back to polling the status URL.
   */
  private waitForTransactionCompletion(wsUrl: string, statusUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { formState } = this.state;
      const steps = getFormSteps(formState.workType);
      let wsCleanup: WebSocket | null = null;
      let pollingCleanup: (() => void) | null = null;
      let resolved = false;

      const handleComplete = (details: WsStepDetails) => {
        if (resolved) return;
        resolved = true;

        // Clean up
        if (wsCleanup) {
          wsCleanup.close();
        }
        if (pollingCleanup) {
          pollingCleanup();
        }

        // Validate we have all required data
        if (details.ats_id === undefined || !details.tx_hash || details.block_number === undefined) {
          reject(new Error('Incomplete transaction data received'));
          return;
        }

        this.updateProgress('submit', 95, 'Transaction confirmed');

        // Store API response (including work_id for certificate download)
        this.state.apiResponse = {
          atsId: details.ats_id,
          txHash: details.tx_hash,
          blockNumber: details.block_number,
          blockTimestamp: new Date().toISOString(),
          workId: details.work_id,
        };

        // Dispatch success event
        dispatchBlockchainSuccess(this, {
          atsId: details.ats_id,
          txHash: details.tx_hash,
          blockNumber: details.block_number,
          message: 'Transaction completed',
        });

        // Move to success step
        const successIndex = steps.findIndex(s => s.id === 'success');
        this.state.currentStep = successIndex;
        this.state.processingProgress = 100;
        this.render();

        resolve();
      };

      const handleError = (error: string) => {
        if (resolved) return;
        resolved = true;

        // Clean up
        if (wsCleanup) {
          wsCleanup.close();
        }
        if (pollingCleanup) {
          pollingCleanup();
        }

        reject(new Error(error));
      };

      const handleProgress = (_step: string, progress: number, description: string) => {
        if (resolved) return;
        // Map backend progress (0-100) to our UI range (86-95)
        const uiProgress = 86 + Math.floor((progress / 100) * 9);
        this.updateProgress('blockchain', uiProgress, description);
      };

      // Build WebSocket URL from proxy endpoint
      // Convert http://localhost:3333 -> ws://localhost:3333
      const proxyUrl = new URL(this.proxyEndpoint);
      const wsProtocol = proxyUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const baseWsUrl = `${wsProtocol}//${proxyUrl.host}`;

      // Try WebSocket first
      try {
        wsCleanup = subscribeToTransaction(
          wsUrl,
          baseWsUrl,
          handleProgress,
          handleComplete,
          (wsError) => {
            console.warn('[WS] WebSocket failed, falling back to polling:', wsError);
            wsCleanup = null;

            // Fall back to polling
            const baseHttpUrl = `${proxyUrl.protocol}//${proxyUrl.host}`;
            pollingCleanup = pollTransactionStatus(
              statusUrl,
              baseHttpUrl,
              handleProgress,
              handleComplete,
              handleError,
              2000, // Poll every 2 seconds
              120000 // Timeout after 2 minutes
            );
          }
        );
      } catch (wsInitError) {
        console.warn('[WS] Failed to initialize WebSocket, using polling:', wsInitError);

        // Fall back to polling immediately
        const baseHttpUrl = `${proxyUrl.protocol}//${proxyUrl.host}`;
        pollingCleanup = pollTransactionStatus(
          statusUrl,
          baseHttpUrl,
          handleProgress,
          handleComplete,
          handleError,
          2000,
          120000
        );
      }
    });
  }

  private async handleDownload(): Promise<void> {
    if (!this.state.apiResponse?.workId) {
      console.error('No work_id available for certificate download');
      dispatchError(this, {
        stage: 'certificate',
        error: 'Certificate not available. Work ID missing.',
        details: null,
      });
      return;
    }

    try {
      // Get presigned URL from server
      const { url } = await downloadCertificateViaProxy(
        this.proxyEndpoint,
        this.state.sessionToken!,
        this.state.apiResponse.workId
      );

      // Trigger download via hidden anchor
      const link = document.createElement('a');
      link.href = url;
      link.download = ''; // Let the server set the filename via Content-Disposition
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error('Certificate download error:', error);
      dispatchError(this, {
        stage: 'certificate',
        error: error instanceof Error ? error.message : 'Failed to download certificate',
        details: error,
      });
    }
  }
}

// Register the custom element
customElements.define('allfeat-ats-register', AllfeatAtsRegister);
