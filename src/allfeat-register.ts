import {
  fetchStats,
  fetchAccessWork,
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
import {
  ApiErrorCode,
  AtsApiException,
  CreatorRequest,
  AccessWorkResponse,
  WsStepDetails,
  TRACKING_PROGRESS,
} from './api/types';
import type { Mode, Network, Screen } from './api/types';
import {
  ComponentState,
  FormSubStep,
  AccessData,
  createDefaultComponentState,
  createEmptyCreator,
} from './form/types';
import { creatorSchema } from './form/schema';
import {
  renderStepIndicator,
  renderFileStep,
  renderTitleStep,
  renderCreatorsStep,
  renderReviewStep,
  renderUploadScreen,
  renderConfirmingScreen,
  renderTrackingScreen,
  renderCompleteScreen,
  renderFailedScreen,
  renderTokenExpiredOverlay,
  renderAccessCodeStep,
  getFormSteps,
} from './form/renderer';
import { formatFileSize } from './utils/helpers';
import {
  dispatchReady,
  dispatchUploadStart,
  dispatchUploadProgress,
  dispatchUploadComplete,
  dispatchConfirmed,
  dispatchStep,
  dispatchComplete,
  dispatchFailed,
  dispatchTokenExpired,
  dispatchError,
} from './utils/events';
import { darkenColor, lightenColor } from './utils/colors';
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  TOKEN_EXPIRY_TIMEOUT_MS,
  UPLOAD_MAX_RETRIES,
  POLLING_INTERVAL_MS,
  POLLING_TIMEOUT_MS,
  MAX_CREATORS,
  MAX_TITLE_LENGTH,
  ACCESS_CODE_REGEX,
  ACCESS_CODE_POLL_MAX_ATTEMPTS,
  ACCESS_CODE_POLL_INTERVAL_MS,
} from './constants';

import styles from './styles/component.css';

// ============================================
// Component
// ============================================

export class AllfeatRegister extends HTMLElement {
  static observedAttributes = ['site-key', 'token', 'ats-url', 'network', 'mode', 'max-file-size'];

  private shadow: ShadowRoot;
  private state: ComponentState;
  private wsCleanup: WebSocket | null = null;
  private pollingCleanup: (() => void) | null = null;
  private tokenExpiryTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingRetry: (() => Promise<void>) | null = null;
  private _maxFileSize: number = DEFAULT_MAX_FILE_SIZE_BYTES;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.state = createDefaultComponentState();
  }

  // ============================================
  // Attribute Getters
  // ============================================

  get siteKey(): string {
    return this.getAttribute('site-key') || '';
  }

  get token(): string {
    return this.getAttribute('token') || '';
  }

  get atsUrl(): string {
    return this.getAttribute('ats-url') || '';
  }

  get network(): Network {
    return (this.getAttribute('network') as Network) || 'testnet';
  }

  get mode(): Mode {
    return (this.getAttribute('mode') as Mode) || 'register';
  }

  get maxFileSizeAttr(): number | null {
    const val = this.getAttribute('max-file-size');
    if (val == null) return null;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  get maxFileSize(): number {
    const orgLimit = this.maxFileSizeAttr;
    return orgLimit != null ? Math.min(this._maxFileSize, orgLimit) : this._maxFileSize;
  }

  // ============================================
  // Lifecycle
  // ============================================

  connectedCallback() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    this.shadow.appendChild(styleEl);

    const container = document.createElement('div');
    container.className = 'ats-container';
    container.setAttribute('part', 'container');
    this.shadow.appendChild(container);

    // Attach delegated event listeners once
    this.attachDelegatedListeners(container);

    // Apply primary color from CSS variable if host has it
    this.updatePrimaryColor();

    // Set initial sub-step for update mode
    if (this.mode === 'update') {
      this.state.formSubStep = 'access_code';
    }

    this.render();

    // Fetch max file size from API — only for register (update defers until access code is verified)
    if (this.atsUrl && this.mode === 'register') {
      this.fetchAndApplyStats(this.atsUrl, this.network);
    }

    dispatchReady(this, { mode: this.mode });
  }

  disconnectedCallback() {
    this.cleanupTracking();
    if (this.tokenExpiryTimeout) {
      clearTimeout(this.tokenExpiryTimeout);
      this.tokenExpiryTimeout = null;
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;

    switch (name) {
      case 'token':
        if (newValue && this.state.tokenExpiredPending && this.pendingRetry) {
          // Token refreshed — execute pending retry
          this.state.tokenExpiredPending = false;
          const retry = this.pendingRetry;
          this.pendingRetry = null;
          if (this.tokenExpiryTimeout) {
            clearTimeout(this.tokenExpiryTimeout);
            this.tokenExpiryTimeout = null;
          }
          retry();
        } else {
          this.render();
        }
        break;

      case 'mode':
        // Reset form when mode changes
        this.state = createDefaultComponentState();
        if (newValue === 'update') {
          this.state.formSubStep = 'access_code';
        }
        this.render();
        break;

      case 'ats-url':
        if (newValue && this.mode === 'register') {
          this.fetchAndApplyStats(newValue, this.network);
        }
        this.render();
        break;
      case 'network':
        this.render();
        break;
      case 'max-file-size':
        this.render();
        break;
    }
  }

  // ============================================
  // Public Methods
  // ============================================

  setToken(token: string): void {
    this.setAttribute('token', token);
  }

  reset(): void {
    this.cleanupTracking();
    if (this.tokenExpiryTimeout) {
      clearTimeout(this.tokenExpiryTimeout);
      this.tokenExpiryTimeout = null;
    }
    this.state = createDefaultComponentState();
    if (this.mode === 'update') {
      this.state.formSubStep = 'access_code';
    }
    this.render();
    dispatchTokenExpired(this, { pendingAction: 'reset' });
  }

  getState(): { screen: Screen; jobId?: string; transactionId?: string; atsId?: number | null; accessCode?: string } {
    return {
      screen: this.state.screen,
      jobId: this.state.jobId || undefined,
      transactionId: this.state.transactionId || undefined,
      atsId: this.state.completionData?.atsId ?? null,
      accessCode: this.state.completionData?.accessCode,
    };
  }

  // ============================================
  // Color
  // ============================================

  private updatePrimaryColor(): void {
    const host = this.shadow.host as HTMLElement;
    const color = getComputedStyle(host).getPropertyValue('--ats-primary').trim() || DEFAULT_PRIMARY_COLOR;
    host.style.setProperty('--ats-primary', color);
    host.style.setProperty('--ats-primary-hover', darkenColor(color, 10));
    host.style.setProperty('--ats-primary-light', lightenColor(color, 0.1));
  }

  // ============================================
  // Stats
  // ============================================

  private fetchAndApplyStats(atsUrl: string, network: string): void {
    fetchStats(atsUrl, network)
      .then((stats) => {
        this._maxFileSize = stats.max_audio_size_bytes;
        this.render();
      })
      .catch(() => {});
  }

  // ============================================
  // Token Expired Handling
  // ============================================

  private handleTokenExpired(pendingAction: string, retryFn: () => Promise<void>): void {
    this.state.tokenExpiredPending = true;
    this.pendingRetry = retryFn;
    this.render();

    dispatchTokenExpired(this, { pendingAction });

    this.tokenExpiryTimeout = setTimeout(() => {
      if (this.state.tokenExpiredPending) {
        this.state.tokenExpiredPending = false;
        this.pendingRetry = null;
        this.transitionToFailed('Session expired. Please try again.');
      }
    }, TOKEN_EXPIRY_TIMEOUT_MS);
  }

  // ============================================
  // State Transitions
  // ============================================

  private transitionToScreen(screen: Screen): void {
    this.state.screen = screen;
    this.render();
  }

  private transitionToFailed(error: string): void {
    this.state.screen = 'FAILED';
    this.state.error = error;
    this.render();

    dispatchFailed(this, { error, stage: this.state.screen });
  }

  // ============================================
  // Rendering
  // ============================================

  private render(): void {
    const container = this.shadow.querySelector('.ats-container');
    if (!container) return;

    // Config check
    if (!this.atsUrl) {
      container.innerHTML = `
        <div class="ats-alert ats-alert-error">
          <strong>Configuration Error:</strong><br />
          Please set the <code>ats-url</code> attribute.
        </div>
      `;
      return;
    }

    if (!this.token) {
      container.innerHTML = `
        <div class="ats-alert ats-alert-error">
          <strong>Authentication required:</strong><br />
          Please provide a valid token to use this widget.
        </div>
      `;
      return;
    }

    if (!this.siteKey) {
      container.innerHTML = `
        <div class="ats-alert ats-alert-error">
          <strong>Configuration Error:</strong><br />
          Please set the <code>site-key</code> attribute.
        </div>
      `;
      return;
    }

    let content = '';

    switch (this.state.screen) {
      case 'FORM':
        content = this.renderFormScreen();
        break;
      case 'UPLOAD':
        content = renderUploadScreen(
          this.state.uploadProgress,
          this.state.formState.file?.name || '',
          this.state.uploadAttempt,
        );
        break;
      case 'CONFIRMING':
        content = renderConfirmingScreen(this.mode);
        break;
      case 'TRACKING':
        content = renderTrackingScreen(
          this.state.trackingStep,
          this.state.trackingProgress,
          this.mode,
        );
        break;
      case 'COMPLETE':
        if (this.state.completionData) {
          content = renderCompleteScreen(
            this.state.completionData.explorerUrl,
            this.mode,
            this.state.completionData.accessCode,
          );
        }
        break;
      case 'FAILED':
        content = renderFailedScreen(this.state.error || 'An unknown error occurred');
        break;
    }

    // Overlay for token expired
    if (this.state.tokenExpiredPending) {
      content += renderTokenExpiredOverlay();
    }

    container.innerHTML = content;
  }

  private renderFormScreen(): string {
    const { formSubStep, formState, formErrors } = this.state;

    let content = renderStepIndicator(formSubStep, this.mode);

    switch (formSubStep) {
      case 'access_code':
        content += renderAccessCodeStep(formState.accessCode, { accessCode: formErrors.accessCode }, this.state.submitting);
        break;
      case 'file':
        content += renderFileStep(formState, this.mode, this.maxFileSize, { file: formErrors.file }, this.state.accessData?.assetFilename);
        break;
      case 'title':
        content += renderTitleStep(formState, formErrors.title ? { title: formErrors.title } : {});
        break;
      case 'creators':
        content += renderCreatorsStep(
          formState,
          formErrors.creators ?? {},
        );
        break;
      case 'review':
        content += renderReviewStep(formState, this.mode, this.state.submitting, this.state.accessData);
        break;
    }

    return content;
  }

  // ============================================
  // Event Delegation
  // ============================================

  private attachDelegatedListeners(container: Element): void {
    // Click delegation
    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // data-action routing
      const actionEl = target.closest<HTMLElement>('[data-action]');
      if (actionEl) {
        const action = actionEl.dataset.action;
        if (actionEl.hasAttribute('disabled')) return;

        switch (action) {
          case 'next':
            this.handleNext();
            return;
          case 'back':
            this.handleBack();
            return;
          case 'submit':
            this.handleSubmit();
            return;
          case 'download':
            this.handleDownload();
            return;
          case 'reset':
            this.reset();
            return;
          case 'retry':
            this.handleRetry();
            return;
          case 'remove-file':
            e.stopPropagation();
            this.state.formState.file = null;
            this.render();
            return;
          case 'add-creator':
            if (this.state.formState.creators.length < MAX_CREATORS) {
              this.state.formState.creators.push(createEmptyCreator());
              this.render();
            }
            return;
          case 'remove-creator': {
            const idx = parseInt(actionEl.dataset.index || '0');
            if (this.state.formState.creators.length > 1) {
              this.state.formState.creators.splice(idx, 1);
              this.render();
            }
            return;
          }
          case 'copy-access-code': {
            const code = this.state.completionData?.accessCode;
            if (code) {
              navigator.clipboard.writeText(code).then(() => {
                const btn = this.shadow.querySelector('#copy-access-code');
                if (btn) {
                  btn.textContent = 'Copied!';
                  setTimeout(() => this.render(), 1500);
                }
              });
            }
            return;
          }
        }
      }

      // File drop zone click
      const dropZone = target.closest('#file-drop-zone');
      if (dropZone) {
        const fileInput = container.querySelector('#file-input') as HTMLInputElement | null;
        if (fileInput) fileInput.click();
      }
    });

    // Input delegation
    container.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;

      if (target.id === 'access-code') {
        this.state.formState.accessCode = target.value;
        return;
      }

      if (target.id === 'title') {
        this.state.formState.title = target.value;
        return;
      }

      const idx = parseInt(target.dataset.index || '0');

      if (target.classList.contains('creator-fullname')) {
        this.state.formState.creators[idx].fullName = target.value;
      } else if (target.classList.contains('creator-email')) {
        this.state.formState.creators[idx].email = target.value;
      } else if (target.classList.contains('creator-ipi')) {
        const filtered = target.value.replace(/\D/g, '').slice(0, 11);
        target.value = filtered;
        this.state.formState.creators[idx].ipi = filtered;
      } else if (target.classList.contains('creator-isni')) {
        const filtered = target.value.replace(/[^0-9xX]/g, '').slice(0, 16).toUpperCase();
        target.value = filtered;
        this.state.formState.creators[idx].isni = filtered;
      }
    });

    // Change delegation (file input + role checkboxes)
    container.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;

      // File input
      if (target.id === 'file-input') {
        if (target.files && target.files.length > 0) {
          this.handleFileSelect(target.files[0]);
        }
        return;
      }

      if (!target.classList.contains('creator-role')) return;

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
        const existingCheck = label.querySelector('.ats-role-check');
        if (target.checked && !existingCheck) {
          const checkSpan = document.createElement('span');
          checkSpan.className = 'ats-role-check';
          checkSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
          const input = label.querySelector('input');
          if (input) input.after(checkSpan);
        } else if (!target.checked && existingCheck) {
          existingCheck.remove();
        }
      }
    });

    // Drag-and-drop delegation
    container.addEventListener('dragover', (e) => {
      const dropZone = (e.target as HTMLElement).closest('#file-drop-zone');
      if (dropZone) {
        e.preventDefault();
        dropZone.classList.add('dragover');
      }
    });

    container.addEventListener('dragleave', (e) => {
      const dropZone = (e.target as HTMLElement).closest('#file-drop-zone');
      if (dropZone) {
        dropZone.classList.remove('dragover');
      }
    });

    container.addEventListener('drop', (e) => {
      const dropZone = (e.target as HTMLElement).closest('#file-drop-zone');
      if (dropZone) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = (e as DragEvent).dataTransfer?.files;
        if (files && files.length > 0) this.handleFileSelect(files[0]);
      }
    });
  }

  // ============================================
  // Handlers
  // ============================================

  private handleFileSelect(file: File): void {
    if (file.size > this.maxFileSize) {
      this.state.formErrors = {
        ...this.state.formErrors,
        file: `File is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(this.maxFileSize)}.`,
      };
      this.render();
      return;
    }

    this.state.formState.file = file;
    this.state.formErrors = {};
    this.render();
  }

  private async handleNext(): Promise<void> {
    if (!this.validateCurrentStep()) return;

    // Update mode: verify access code against API before advancing
    if (this.state.formSubStep === 'access_code' && this.mode === 'update') {
      const accessCode = this.state.formState.accessCode.trim();
      const onTokenExpired = () => this.handleTokenExpired('update', () => this.handleNext());

      this.state.submitting = true;
      this.render();

      try {
        const result = await fetchAccessWork(this.atsUrl, this.token, this.siteKey, accessCode, onTokenExpired);

        this.state.accessData = this.mapAccessWorkResponse(result);

        if (result.title) {
          this.state.formState.title = result.title;
        }

        if (result.creators?.length) {
          this.state.formState.creators = result.creators.map(c => ({
            fullName: c.full_name,
            email: c.email || '',
            roles: c.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()),
            ipi: c.ipi || '',
            isni: c.isni || '',
          }));
        }

        // Now that we know the network, fetch stats for max file size
        this.fetchAndApplyStats(this.atsUrl, result.network);

        this.state.submitting = false;
      } catch (error) {
        this.state.submitting = false;

        if (error instanceof AtsApiException && error.isTokenExpired()) {
          return;
        }

        const errorMessage = error instanceof Error ? error.message : 'Failed to verify access code';
        this.state.formErrors = { accessCode: errorMessage };
        this.render();
        this.scrollToFirstError();
        return;
      }
    }

    const subSteps = this.getSubSteps();
    const currentIdx = subSteps.indexOf(this.state.formSubStep);

    if (currentIdx < subSteps.length - 1) {
      this.state.formSubStep = subSteps[currentIdx + 1];
      this.state.formErrors = {};
      this.render();
    }
  }

  private handleBack(): void {
    const subSteps = this.getSubSteps();
    const currentIdx = subSteps.indexOf(this.state.formSubStep);

    if (currentIdx > 0) {
      this.state.formSubStep = subSteps[currentIdx - 1];
      this.state.formErrors = {};
      this.render();
    }
  }

  private getSubSteps(): FormSubStep[] {
    return getFormSteps(this.mode).map(s => s.id);
  }

  private validateCurrentStep(): boolean {
    const { formState, formSubStep } = this.state;

    switch (formSubStep) {
      case 'file':
        // In register mode, file is required. In update mode, file is optional.
        if (this.mode === 'register' && !formState.file) {
          this.state.formErrors = { file: 'Please select a file' };
          this.render();
          this.scrollToFirstError();
          return false;
        }
        break;

      case 'title': {
        const errors: Record<string, string> = {};
        if (!formState.title.trim()) {
          errors.title = 'Title is required';
        } else if (formState.title.length > MAX_TITLE_LENGTH) {
          errors.title = `Title must be ${MAX_TITLE_LENGTH} characters or less`;
        }
        if (Object.keys(errors).length > 0) {
          this.state.formErrors = errors;
          this.render();
          this.scrollToFirstError();
          return false;
        }
        break;
      }

      case 'creators': {
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
          this.scrollToFirstError();
          return false;
        }
        break;
      }

      case 'access_code': {
        if (!formState.accessCode.trim()) {
          this.state.formErrors = { accessCode: 'Access code is required' };
          this.render();
          this.scrollToFirstError();
          return false;
        }
        if (!ACCESS_CODE_REGEX.test(formState.accessCode.trim())) {
          this.state.formErrors = { accessCode: 'Invalid format. Must start with atc_ followed by 64 hex characters.' };
          this.render();
          this.scrollToFirstError();
          return false;
        }
        break;
      }
    }

    return true;
  }

  private scrollToFirstError(): void {
    const firstError = this.shadow.querySelector('.ats-error-message');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  private handleRetry(): void {
    this.state.screen = 'FORM';
    this.state.error = null;
    this.state.jobId = null;
    this.state.workId = null;
    this.state.transactionId = null;
    this.state.uploadUrl = null;
    this.state.uploadProgress = 0;
    this.state.uploadAttempt = 0;
    this.state.trackingStep = '';
    this.state.trackingProgress = 0;

    if (this.mode === 'update') {
      this.state.formSubStep = 'access_code';
      this.state.accessData = null;
    } else {
      this.state.formSubStep = 'review';
    }

    this.render();
  }

  // ============================================
  // Submit Flow
  // ============================================

  private async handleSubmit(): Promise<void> {
    if (this.state.submitting) return;

    if (!this.token) {
      this.transitionToFailed('No authentication token provided. Please set the token attribute.');
      return;
    }

    const { formState } = this.state;
    this.state.submitting = true;
    this.render();

    try {
      if (this.mode === 'register') {
        await this.executeRegisterFlow(formState);
      } else {
        await this.executeUpdateFlow(formState);
      }
    } catch (error) {
      if (error instanceof AtsApiException && error.isTokenExpired()) {
        // Already handled by onTokenExpired callback
        return;
      }

      if (error instanceof AtsApiException && error.code === ApiErrorCode.RATE_LIMITED) {
        this.transitionToFailed('Too many requests. Please wait a moment and try again.');
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      this.transitionToFailed(errorMessage);

      dispatchError(this, {
        stage: this.state.screen,
        error: errorMessage,
        code: error instanceof AtsApiException ? error.code : undefined,
        details: error,
      });
    } finally {
      this.state.submitting = false;
    }
  }

  // ============================================
  // Shared Upload
  // ============================================

  private async performUpload(uploadUrl: string, file: File): Promise<void> {
    this.state.screen = 'UPLOAD';
    this.state.uploadProgress = 0;
    this.state.uploadAttempt = 1;
    this.render();

    dispatchUploadStart(this, { filename: file.name, size: file.size });

    await uploadFileToS3WithProgress(
      uploadUrl,
      file,
      (progress, loaded, total) => {
        this.state.uploadProgress = progress;
        this.render();
        dispatchUploadProgress(this, { progress, loaded, total });
      },
      UPLOAD_MAX_RETRIES,
    );

    dispatchUploadComplete(this, { filename: file.name });
  }

  // ============================================
  // Register Flow
  // ============================================

  private async executeRegisterFlow(formState: typeof this.state.formState): Promise<void> {
    const file = formState.file;
    if (!file) {
      this.transitionToFailed('No file selected');
      return;
    }

    const creators = this.mapCreators(formState);
    const onTokenExpired = () => this.handleTokenExpired('register', () => this.handleSubmit());

    // Step 1: Init
    const initResponse = await initWork(
      this.atsUrl,
      this.token,
      this.siteKey,
      { title: formState.title, creators, filename: file.name, network: this.network },
      onTokenExpired,
    );

    this.state.jobId = initResponse.job_id;
    this.state.uploadUrl = initResponse.upload_url;

    // Step 2: Upload
    await this.performUpload(initResponse.upload_url, file);

    // Step 3: Prepare
    this.state.screen = 'CONFIRMING';
    this.render();

    const prepareResponse = await prepareWork(
      this.atsUrl,
      this.token,
      this.siteKey,
      { job_id: initResponse.job_id },
      onTokenExpired,
    );

    this.state.workId = prepareResponse.work_id || null;

    // Step 4: Confirm
    const confirmResponse = await confirmWork(
      this.atsUrl,
      this.token,
      this.siteKey,
      { job_id: initResponse.job_id },
      onTokenExpired,
    );

    this.state.transactionId = confirmResponse.transaction_id;

    dispatchConfirmed(this, { transactionId: confirmResponse.transaction_id });

    // Step 5: Track
    this.transitionToScreen('TRACKING');
    await this.waitForTransaction(confirmResponse.ws_url, confirmResponse.status_url, confirmResponse.access_code);
  }

  // ============================================
  // Update Flow
  // ============================================

  private async executeUpdateFlow(formState: typeof this.state.formState): Promise<void> {
    const creators = this.mapCreators(formState);
    const onTokenExpired = () => this.handleTokenExpired('update', () => this.handleSubmit());
    const file = formState.file;
    const accessCode = formState.accessCode.trim();

    let jobId: string;

    if (file) {
      const initResponse = await initVersionUpload(
        this.atsUrl, this.token, this.siteKey, accessCode,
        { creators, filename: file.name },
        onTokenExpired,
      );

      jobId = initResponse.job_id;
      this.state.jobId = jobId;
      this.state.uploadUrl = initResponse.upload_url;

      await this.performUpload(initResponse.upload_url, file);
    } else {
      const initResponse = await initVersion(
        this.atsUrl, this.token, this.siteKey, accessCode,
        { creators },
        onTokenExpired,
      );

      jobId = initResponse.job_id;
      this.state.jobId = jobId;
    }

    // Prepare
    this.state.screen = 'CONFIRMING';
    this.render();

    await prepareVersion(
      this.atsUrl, this.token, this.siteKey, accessCode,
      { job_id: jobId },
      onTokenExpired,
    );

    // Confirm
    const confirmResponse = await confirmVersion(
      this.atsUrl,
      this.token,
      this.siteKey,
      accessCode,
      { job_id: jobId },
      onTokenExpired,
    );

    this.state.transactionId = confirmResponse.transaction_id;
    dispatchConfirmed(this, { transactionId: confirmResponse.transaction_id });

    // Track
    this.transitionToScreen('TRACKING');
    await this.waitForTransaction(confirmResponse.ws_url, confirmResponse.status_url);
  }

  // ============================================
  // Helpers
  // ============================================

  private mapAccessWorkResponse(result: AccessWorkResponse): AccessData {
    return {
      atsId: result.ats_id,
      title: result.title,
      network: result.network,
      ownerAddress: result.owner_address,
      latestVersion: result.latest_version,
      latestCommitment: result.latest_commitment,
      createdAt: result.created_at,
      assetFilename: result.asset_filename,
    };
  }

  private mapCreators(formState: typeof this.state.formState): CreatorRequest[] {
    return formState.creators.map(c => ({
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
  }

  private cleanupTracking(): void {
    if (this.wsCleanup) {
      this.wsCleanup.close();
      this.wsCleanup = null;
    }
    if (this.pollingCleanup) {
      this.pollingCleanup();
      this.pollingCleanup = null;
    }
  }

  // ============================================
  // Access Code Polling (post-completion)
  // ============================================

  private async pollForAccessCode(
    fullStatusUrl: string,
    details: WsStepDetails,
    atsId: number | null,
  ): Promise<void> {
    const txHash = details.tx_hash;
    const blockNumber = details.block_number;

    if (!txHash || blockNumber === undefined) return;

    for (let attempt = 0; attempt < ACCESS_CODE_POLL_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(fullStatusUrl, { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          const accessCode = data.result?.access_code || data.access_code;

          if (accessCode) {
            if (this.state.completionData) {
              this.state.completionData.accessCode = accessCode;
            }
            this.render();

            dispatchComplete(this, {
              atsId,
              txHash,
              blockNumber,
              explorerUrl: details.explorer_url || '',
              accessCode,
            });
            return;
          }
        }
      } catch {
        // Transient error, keep trying
      }

      // Wait before next attempt
      await new Promise(r => setTimeout(r, ACCESS_CODE_POLL_INTERVAL_MS));
    }

    // Exhausted retries — dispatch completion without access code
    dispatchComplete(this, {
      atsId,
      txHash,
      blockNumber,
      explorerUrl: details.explorer_url || '',
    });
  }

  // ============================================
  // Transaction Tracking
  // ============================================

  private waitForTransaction(wsUrl: string, statusUrl: string, pendingAccessCode?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      // Build URLs from ats-url (needed by handleComplete and WS/polling setup)
      const atsUrlObj = new URL(this.atsUrl);
      const wsProtocol = atsUrlObj.protocol === 'https:' ? 'wss:' : 'ws:';
      const baseWsUrl = `${wsProtocol}//${atsUrlObj.host}`;
      const baseHttpUrl = `${atsUrlObj.protocol}//${atsUrlObj.host}`;

      const handleComplete = (details: WsStepDetails) => {
        if (resolved) return;
        resolved = true;
        this.cleanupTracking();

        const atsId = details.ats_id ?? this.state.accessData?.atsId ?? null;

        if ((this.mode !== 'update' && atsId == null) || !details.tx_hash || details.block_number === undefined) {
          this.transitionToFailed('Incomplete transaction data received');
          reject(new Error('Incomplete transaction data'));
          return;
        }

        if (details.work_id) {
          this.state.workId = details.work_id;
        }

        // access_code may already be in the WS/polling details or confirm response
        const immediateAccessCode = details.access_code || pendingAccessCode;

        this.state.completionData = {
          atsId: atsId ?? null,
          txHash: details.tx_hash,
          blockNumber: details.block_number,
          explorerUrl: details.explorer_url || '',
          accessCode: immediateAccessCode,
        };

        // Show COMPLETE screen immediately
        this.transitionToScreen('COMPLETE');

        if (immediateAccessCode) {
          // Already have the access code — dispatch and resolve
          dispatchComplete(this, {
            atsId,
            txHash: details.tx_hash,
            blockNumber: details.block_number,
            explorerUrl: details.explorer_url || '',
            accessCode: immediateAccessCode,
          });
          resolve();
        } else if (this.mode === 'register' && statusUrl) {
          // access_code is generated asynchronously by tx_consumer after Finalized.
          // Poll the status endpoint until it appears.
          this.pollForAccessCode(baseHttpUrl + statusUrl, details, atsId).then(resolve);
        } else {
          dispatchComplete(this, {
            atsId,
            txHash: details.tx_hash,
            blockNumber: details.block_number,
            explorerUrl: details.explorer_url || '',
          });
          resolve();
        }
      };

      const handleError = (error: string) => {
        if (resolved) return;
        resolved = true;
        this.cleanupTracking();
        this.transitionToFailed(error);
        reject(new Error(error));
      };

      const handleProgress = (step: string, progress: number, description: string) => {
        if (resolved) return;
        this.state.trackingStep = step;
        this.state.trackingProgress = TRACKING_PROGRESS[step] ?? Math.min(progress, 99);
        this.render();

        dispatchStep(this, { step, progress: this.state.trackingProgress, description });
      };

      try {
        this.wsCleanup = subscribeToTransaction(
          wsUrl,
          baseWsUrl,
          handleProgress,
          handleComplete,
          () => {
            this.wsCleanup = null;
            // Fallback to polling
            this.pollingCleanup = pollTransactionStatus(
              statusUrl,
              baseHttpUrl,
              handleProgress,
              handleComplete,
              handleError,
              POLLING_INTERVAL_MS,
              POLLING_TIMEOUT_MS,
            );
          },
        );
      } catch {
        // Fallback to polling immediately
        this.pollingCleanup = pollTransactionStatus(
          statusUrl,
          baseHttpUrl,
          handleProgress,
          handleComplete,
          handleError,
          POLLING_INTERVAL_MS,
          POLLING_TIMEOUT_MS,
        );
      }
    });
  }

  // ============================================
  // Certificate Download
  // ============================================

  private async handleDownload(): Promise<void> {
    if (!this.state.completionData || !this.state.workId) return;

    try {
      const { url } = await downloadCertificate(
        this.atsUrl,
        this.token,
        this.siteKey,
        this.state.workId,
        () => this.handleTokenExpired('download', () => this.handleDownload()),
      );

      const link = document.createElement('a');
      link.href = url;
      link.download = '';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      dispatchError(this, {
        stage: 'download',
        error: error instanceof Error ? error.message : 'Failed to download certificate',
        details: error,
      });
    }
  }
}

// Register custom element
customElements.define('ats-widget', AllfeatRegister);
