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
  listUserWorks,
  listUserWorkVersions,
  listUserWorkVersionCreators,
  downloadUserWorkVersionAsset,
  downloadUserWorkVersionCertificate,
  initUserWorkVersionUpload,
  initUserWorkVersion,
  prepareUserWorkVersion,
  confirmUserWorkVersion,
} from './api/client';
import type {
  WidgetError,
  CreatorRequest,
  AccessWorkResponse,
  UserWork,
  WorkCreatorResponse,
  WorkVersionApi,
  WsStepDetails,
} from './api/types';
import type { Mode, Network, Screen } from './api/types';
import { TRACKING_PROGRESS } from './api/types';
import {
  ComponentState,
  FormSubStep,
  AccessData,
  SelectedWork,
  WorkCreator,
  WorkVersion,
  createDefaultComponentState,
  createDefaultVersionListState,
  createDefaultWorkListState,
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
  renderDisabledScreen,
  renderTokenExpiredOverlay,
  renderAccessCodeStep,
  renderWorkSelectorStep,
  renderDownloadListScreen,
  renderDownloadDetailScreen,
  getFormSteps,
} from './form/renderer';
import { formatFileSize, openPresignedDownload } from './utils/helpers';
import type { ErrorDetail } from './utils/events';
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
  dispatchModeChanged,
  dispatchWorkSelected,
  dispatchDownloadStarted,
  dispatchDownloadComplete,
  dispatchDownloadFailed,
} from './utils/events';
import { getErrorMessage } from './errors/messages';
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
  static observedAttributes = ['site-key', 'token', 'ats-url', 'network', 'mode', 'max-file-size', 'external-user-id'];

  private shadow: ShadowRoot;
  private state: ComponentState;
  private wsCleanup: WebSocket | null = null;
  private pollingCleanup: (() => void) | null = null;
  private tokenExpiryTimeout: ReturnType<typeof setTimeout> | null = null;
  private searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingStage: string | null = null;
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
    const attr = this.getAttribute('mode');
    if (attr === 'register' || attr === 'update' || attr === 'download') return attr;
    return 'register';
  }

  /** Optional external user id used by the user-scoped works flows (update + download). */
  get externalUserId(): string | null {
    const v = this.getAttribute('external-user-id');
    return v && v.length > 0 ? v : null;
  }

  /** Whether an external user id is present — gates the new flows. */
  get hasExternalUser(): boolean {
    return this.externalUserId !== null;
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

    // Apply the mode-specific initial screen/sub-step.
    this.applyModeRouting();
    this.render();

    // Fetch max file size from API — only for register (other flows defer).
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
    if (this.searchDebounceTimeout) {
      clearTimeout(this.searchDebounceTimeout);
      this.searchDebounceTimeout = null;
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;

    switch (name) {
      case 'token':
        if (newValue && this.state.tokenExpiredPending) {
          this.state.tokenExpiredPending = false;
          const stage = this.pendingStage;
          this.pendingStage = null;
          if (this.tokenExpiryTimeout) {
            clearTimeout(this.tokenExpiryTimeout);
            this.tokenExpiryTimeout = null;
          }
          if (stage === 'download') {
            this.handleDownload();
          } else if (stage === 'access_code') {
            this.handleNext();
          } else if (stage === 'work_select' || stage === 'download_list') {
            this.loadUserWorks();
          } else {
            this.handleSubmit();
          }
        } else {
          // After receiving a fresh token, lazy-load the user-works list if we're on
          // a screen that needs it and haven't loaded yet (covers the case where the
          // host sets `mode` before `token`).
          const needsLoad = newValue
            && this.hasExternalUser
            && this.state.workList.status === 'idle'
            && (this.state.screen === 'DOWNLOADS'
                || (this.state.screen === 'FORM' && this.state.formSubStep === 'work_select'));
          if (needsLoad) this.loadUserWorks();
          // Same lazy-load for the per-work versions list when entering DOWNLOAD_DETAIL.
          const needsVersionLoad = newValue
            && this.hasExternalUser
            && this.state.screen === 'DOWNLOAD_DETAIL'
            && this.state.versionList.work
            && this.state.versionList.status === 'idle';
          if (needsVersionLoad && this.state.versionList.work) {
            this.loadWorkVersions(this.state.versionList.work.id);
          }
          this.render();
        }
        break;

      case 'mode':
        // Reset form when mode changes, then route to the new mode's initial screen.
        this.state = createDefaultComponentState();
        this.applyModeRouting();
        dispatchModeChanged(this, { mode: this.mode });
        this.render();
        break;

      case 'external-user-id':
        // Reset list state and re-route within update/download flows if currently active.
        this.state.workList = createDefaultWorkListState();
        this.state.versionList = createDefaultVersionListState();
        this.state.selectedWork = null;
        // If we were drilled into a work-detail, drop back to the list — the previous
        // detail belonged to a different user.
        if (this.state.screen === 'DOWNLOAD_DETAIL') {
          this.state.screen = 'DOWNLOADS';
        }
        if (this.mode === 'update' && this.state.screen === 'FORM') {
          this.state.formSubStep = this.hasExternalUser ? 'work_select' : 'access_code';
          if (this.hasExternalUser) this.loadUserWorks();
        } else if (this.mode === 'download') {
          if (this.hasExternalUser) {
            this.loadUserWorks();
          } else {
            this.state.workList.status = 'error';
            this.state.workList.error = 'Download mode requires an external-user-id attribute.';
          }
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
  // Flow Routing
  // ============================================

  /** Route to the appropriate initial screen/sub-step for the current `mode` attribute. */
  private applyModeRouting(): void {
    const mode = this.mode;
    if (mode === 'download') {
      this.state.screen = 'DOWNLOADS';
      if (this.hasExternalUser) {
        this.loadUserWorks();
      } else {
        this.state.workList.status = 'error';
        this.state.workList.error = 'Download mode requires an external-user-id attribute.';
      }
      return;
    }
    this.state.screen = 'FORM';
    if (mode === 'update') {
      this.state.formSubStep = this.hasExternalUser ? 'work_select' : 'access_code';
      if (this.hasExternalUser) this.loadUserWorks();
    } else {
      this.state.formSubStep = 'file';
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
    this.applyModeRouting();
    this.render();
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

  private handleTokenExpired(stage: string): void {
    this.state.tokenExpiredPending = true;
    this.pendingStage = stage;
    this.render();

    dispatchTokenExpired(this, { pendingAction: this.pendingStage });

    this.tokenExpiryTimeout = setTimeout(() => {
      if (this.state.tokenExpiredPending) {
        this.state.tokenExpiredPending = false;
        this.pendingStage = null;
        this.transitionToFailed('Session expired. Please try again.', null, null);
      }
    }, TOKEN_EXPIRY_TIMEOUT_MS);
  }

  // ============================================
  // Global Error Interceptor
  // ============================================

  private handleError(error: WidgetError, stage: string): void {
    // 1. Always log API errors
    if (error.kind === 'api') {
      console.error(
        `[Allfeat Widget] ${error.error.code} (${error.error.request_id}): ${error.error.message}`,
      );
    }

    // 2. Emit allfeat:error for observability
    const errorDetail = this.buildErrorDetail(error, stage);
    dispatchError(this, errorDetail);

    // 3. Route by error kind and code
    if (error.kind === 'api') {
      const code = error.error.code;

      // Auth/session codes → token refresh
      const authCodes = [
        'session.invalid_token',
        'common.auth.missing_token',
        'common.auth.expired',
        'common.auth.invalid_token',
      ];
      if (authCodes.includes(code)) {
        this.handleTokenExpired(stage);
        return;
      }

      // Configuration codes → DISABLED screen (no retry)
      const configCodes = [
        'session.key_inactive',
        'session.widget_not_enabled',
        'session.origin_not_allowed',
        'organization.not_found',
        'organization.inactive',
        'organization.no_integration',
        'common.auth.invalid_api_key',
      ];
      if (configCodes.includes(code)) {
        const message = getErrorMessage(code, error.error.details);
        this.transitionToDisabled(message, error.error.request_id, code);
        return;
      }

      // Service unavailable → FAILED with retry
      const unavailableCodes = [
        'common.service_unavailable',
        'common.auth.jwks_unavailable',
        'common.auth.backend_unavailable',
        'transaction.store_unavailable',
      ];
      if (unavailableCodes.includes(code)) {
        const message = getErrorMessage(code, error.error.details);
        this.transitionToFailed(message, error.error.request_id, code);
        return;
      }

      // Rate limited
      const rateLimitCodes = ['common.rate_limited', 'session.rate_limited'];
      if (rateLimitCodes.includes(code)) {
        const message = getErrorMessage(code, error.error.details);
        this.transitionToFailed(message, error.error.request_id, code);
        return;
      }

      // Everything else: localize via catalog
      const message = getErrorMessage(code, error.error.details);
      this.transitionToFailed(message, error.error.request_id, code);
      return;
    }

    // Non-API errors
    switch (error.kind) {
      case 'network':
        this.transitionToFailed(error.message, null, 'widget.network_error');
        break;
      case 'upload':
        this.transitionToFailed(error.message, null, 'widget.upload_error');
        break;
      case 'malformed':
        this.transitionToFailed(
          'The server returned an unexpected response. Please try again.',
          null,
          'widget.malformed_response',
        );
        break;
    }
  }

  private buildErrorDetail(error: WidgetError, stage: string): ErrorDetail {
    if (error.kind === 'api') {
      return {
        code: error.error.code,
        message: error.error.message,
        requestId: error.error.request_id,
        stage,
        details: error.error.details,
      };
    }

    const syntheticCodeMap: Record<string, string> = {
      network: 'widget.network_error',
      upload: 'widget.upload_error',
      malformed: 'widget.malformed_response',
    };

    return {
      code: syntheticCodeMap[error.kind],
      message: error.kind === 'malformed'
        ? `Unexpected response: HTTP ${error.status}`
        : error.message,
      requestId: null,
      stage,
    };
  }

  // ============================================
  // State Transitions
  // ============================================

  private transitionToScreen(screen: Screen): void {
    this.state.screen = screen;
    this.render();
  }

  private transitionToFailed(message: string, requestId: string | null = null, code: string | null = null): void {
    this.state.screen = 'FAILED';
    this.state.error = { message, requestId, code };
    this.render();

    dispatchFailed(this, {
      code: code || 'widget.unknown_error',
      message,
      requestId,
    });
  }

  private transitionToDisabled(message: string, requestId: string | null = null, code: string | null = null): void {
    this.state.screen = 'DISABLED';
    this.state.error = { message, requestId, code };
    this.render();

    dispatchFailed(this, {
      code: code || 'widget.configuration_error',
      message,
      requestId,
    });
  }

  // ============================================
  // Rendering
  // ============================================

  /**
   * Class names of internal scrollable regions whose `scrollTop` should survive a re-render.
   * Without this, every state change (expand a row, toggle Show creators) would jump the user
   * back to the top of the list because `container.innerHTML = ...` creates fresh elements.
   */
  private static readonly SCROLLABLE_CLASSES = ['ats-work-list', 'ats-version-list'] as const;

  private render(): void {
    const container = this.shadow.querySelector('.ats-container');
    if (!container) return;

    // Capture scroll positions before the rebuild so they can be restored against the new DOM.
    const scrollState: Record<string, number> = {};
    for (const cls of AllfeatRegister.SCROLLABLE_CLASSES) {
      const el = container.querySelector(`.${cls}`) as HTMLElement | null;
      if (el) scrollState[cls] = el.scrollTop;
    }

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
        content = renderFailedScreen(
          this.state.error?.message || 'An unknown error occurred',
          this.state.error?.requestId,
        );
        break;
      case 'DISABLED':
        content = renderDisabledScreen(
          this.state.error?.message || 'Widget unavailable',
          this.state.error?.requestId,
        );
        break;
      case 'DOWNLOADS':
        content = renderDownloadListScreen(this.state.workList);
        break;
      case 'DOWNLOAD_DETAIL':
        content = renderDownloadDetailScreen(this.state.versionList);
        break;
    }

    // Overlay for token expired
    if (this.state.tokenExpiredPending) {
      content += renderTokenExpiredOverlay();
    }

    container.innerHTML = content;

    // Restore scroll positions on any scrollable region that still exists after the rebuild.
    // The class-keyed map naturally skips regions that disappeared (e.g. on screen transitions)
    // without trying to forcibly carry scroll across unrelated lists.
    for (const cls of AllfeatRegister.SCROLLABLE_CLASSES) {
      const top = scrollState[cls];
      if (top == null) continue;
      const el = container.querySelector(`.${cls}`) as HTMLElement | null;
      if (el) el.scrollTop = top;
    }
  }

  private renderFormScreen(): string {
    const { formSubStep, formState, formErrors } = this.state;

    let content = renderStepIndicator(formSubStep, this.mode, this.hasExternalUser);

    // The existing-filename hint for FILE / REVIEW steps comes from either the
    // selected user-scoped work (new flow) OR the access-code-fetched work (legacy).
    const existingFilename = this.state.selectedWork?.assetFilename ?? this.state.accessData?.assetFilename ?? null;
    const accessDataForReview: AccessData | null = this.state.accessData ?? this.selectedWorkAsAccessData();

    switch (formSubStep) {
      case 'access_code':
        content += renderAccessCodeStep(formState.accessCode, { accessCode: formErrors.accessCode }, this.state.submitting);
        break;
      case 'work_select':
        content += renderWorkSelectorStep(this.state.workList, {
          generalError: formErrors.general ?? null,
        });
        break;
      case 'file':
        content += renderFileStep(formState, this.mode, this.maxFileSize, { file: formErrors.file }, existingFilename);
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
        content += renderReviewStep(formState, this.mode, this.state.submitting, accessDataForReview);
        break;
    }

    return content;
  }

  /** Adapts the selected user-scoped work into the shape `renderReviewStep` expects. */
  private selectedWorkAsAccessData(): AccessData | null {
    const w = this.state.selectedWork;
    if (!w) return null;
    return {
      atsId: w.atsId,
      title: w.title,
      network: this.network,
      ownerAddress: w.owner,
      latestVersion: w.latestVersion,
      latestCommitment: w.latestCommitment,
      createdAt: w.createdAt,
      assetFilename: w.assetFilename,
    };
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
          case 'copy-request-id': {
            const reqId = this.state.error?.requestId;
            if (reqId) {
              navigator.clipboard.writeText(reqId).then(() => {
                const btn = this.shadow.querySelector('[data-action="copy-request-id"]');
                if (btn) {
                  btn.textContent = 'Copied!';
                  setTimeout(() => this.render(), 1500);
                }
              }).catch(() => {});
            }
            return;
          }
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
          case 'toggle-work': {
            const id = actionEl.dataset.workId;
            if (!id) return;
            this.state.workList.expandedId = this.state.workList.expandedId === id ? null : id;
            this.render();
            return;
          }
          case 'select-work': {
            const id = actionEl.dataset.workId;
            if (id) this.handleSelectWork(id);
            return;
          }
          case 'load-more-works':
            this.loadUserWorks({ append: true });
            return;
          case 'reload-works':
            this.loadUserWorks();
            return;
          case 'open-work-detail': {
            const id = actionEl.dataset.workId;
            if (!id) return;
            this.openWorkDetail(id);
            return;
          }
          case 'back-to-list':
            this.backToDownloadList();
            return;
          case 'reload-versions':
            if (this.state.versionList.work) {
              this.loadWorkVersions(this.state.versionList.work.id);
            }
            return;
          case 'download-version-asset': {
            const v = parseInt(actionEl.dataset.version || '');
            if (Number.isFinite(v)) this.handleDownloadVersionAsset(v);
            return;
          }
          case 'download-version-cert': {
            const v = parseInt(actionEl.dataset.version || '');
            if (Number.isFinite(v)) this.handleDownloadVersionCert(v);
            return;
          }
          case 'toggle-version-creators': {
            const v = parseInt(actionEl.dataset.version || '');
            if (Number.isFinite(v)) this.toggleVersionCreators(v);
            return;
          }
          case 'toggle-work-creators': {
            const id = actionEl.dataset.workId;
            if (id) this.toggleWorkCreators(id);
            return;
          }
          case 'copy-hash': {
            const value = actionEl.dataset.value;
            if (!value) return;
            // No re-render — we only flip a class on the live button so the rest of the
            // DOM (including scroll position) stays untouched.
            navigator.clipboard.writeText(value).then(() => {
              actionEl.classList.add('copied');
              setTimeout(() => actionEl.classList.remove('copied'), 1200);
            }).catch(() => {});
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

      if (target.id === 'work-search') {
        this.state.workList.search = target.value;
        // The renderer client-side filters loaded rows for instant feedback while
        // the user types. After 300 ms idle, refire the listing server-side so we
        // also surface works on pages we haven't loaded yet. `quiet: true` keeps the
        // current rows visible during the fetch instead of flashing a spinner.
        this.render();
        if (this.searchDebounceTimeout) clearTimeout(this.searchDebounceTimeout);
        this.searchDebounceTimeout = setTimeout(() => {
          this.searchDebounceTimeout = null;
          this.loadUserWorks({ quiet: true });
        }, 300);
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

    // From work_select, advance to file step (no API call yet — the version endpoints
    // are called on Submit from the review step).
    if (this.state.formSubStep === 'work_select') {
      this.state.formSubStep = 'file';
      this.state.formErrors = {};
      // Apply max-file-size for the current network now that we've chosen a work.
      if (this.atsUrl && this.state.selectedWork) {
        this.fetchAndApplyStats(this.atsUrl, this.network);
      }
      this.render();
      return;
    }

    if (this.state.formSubStep === 'access_code' && this.mode === 'update') {
      const accessCode = this.state.formState.accessCode.trim();

      this.state.submitting = true;
      this.render();

      try {
        const result = await fetchAccessWork(this.atsUrl, this.token, this.siteKey, accessCode);

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

        this.fetchAndApplyStats(this.atsUrl, result.network);

        this.state.submitting = false;
      } catch (error) {
        this.state.submitting = false;

        // For access code verification, show inline errors for not-found-type errors,
        // but route config/auth errors through the global interceptor
        const widgetError = error as WidgetError;
        if (widgetError.kind === 'api') {
          const notFoundCodes = ['access_code.not_found', 'work.not_found', 'common.not_found'];
          if (notFoundCodes.includes(widgetError.error.code)) {
            this.state.formErrors = { accessCode: getErrorMessage(widgetError.error.code) };
            this.render();
            this.scrollToFirstError();
            return;
          }
        }

        this.handleError(widgetError, 'access_code');
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
    return getFormSteps(this.mode, this.hasExternalUser).map(s => s.id);
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

      case 'work_select': {
        if (!this.state.selectedWork) {
          this.state.formErrors = { general: 'Please select a work to update.' };
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
      if (this.hasExternalUser) {
        this.state.formSubStep = 'work_select';
        this.state.selectedWork = null;
        // Reload the works list if we don't have it cached.
        if (this.state.workList.works.length === 0) {
          this.loadUserWorks();
        }
      } else {
        this.state.formSubStep = 'access_code';
        this.state.accessData = null;
      }
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
      this.transitionToFailed('No authentication token provided. Please set the token attribute.', null, null);
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
      this.handleError(error as WidgetError, 'submit');
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
      this.transitionToFailed('No file selected', null, null);
      return;
    }

    const creators = this.mapCreators(formState);

    // Step 1: Init
    const initResponse = await initWork(
      this.atsUrl, this.token, this.siteKey,
      { title: formState.title, creators, filename: file.name, network: this.network },
    );

    this.state.jobId = initResponse.job_id;
    this.state.uploadUrl = initResponse.upload_url;

    // Step 2: Upload
    await this.performUpload(initResponse.upload_url, file);

    // Step 3: Prepare
    this.state.screen = 'CONFIRMING';
    this.render();

    const prepareResponse = await prepareWork(
      this.atsUrl, this.token, this.siteKey,
      { job_id: initResponse.job_id },
    );

    this.state.workId = prepareResponse.work_id || null;

    // Step 4: Confirm
    const confirmResponse = await confirmWork(
      this.atsUrl, this.token, this.siteKey,
      { job_id: initResponse.job_id },
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
    if (this.hasExternalUser) {
      await this.executeUpdateFlowByWorkId(formState);
    } else {
      await this.executeUpdateFlowByAccessCode(formState);
    }
  }

  /** Legacy update path: uses access code as authorization for each version endpoint. */
  private async executeUpdateFlowByAccessCode(formState: typeof this.state.formState): Promise<void> {
    const creators = this.mapCreators(formState);
    const file = formState.file;
    const accessCode = formState.accessCode.trim();

    let jobId: string;

    if (file) {
      const initResponse = await initVersionUpload(
        this.atsUrl, this.token, this.siteKey, accessCode,
        { creators, filename: file.name },
      );

      jobId = initResponse.job_id;
      this.state.jobId = jobId;
      this.state.uploadUrl = initResponse.upload_url;

      await this.performUpload(initResponse.upload_url, file);
    } else {
      const initResponse = await initVersion(
        this.atsUrl, this.token, this.siteKey, accessCode,
        { creators },
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
    );

    // Confirm
    const confirmResponse = await confirmVersion(
      this.atsUrl, this.token, this.siteKey, accessCode,
      { job_id: jobId },
    );

    this.state.transactionId = confirmResponse.transaction_id;
    dispatchConfirmed(this, { transactionId: confirmResponse.transaction_id });

    // Track
    this.transitionToScreen('TRACKING');
    await this.waitForTransaction(confirmResponse.ws_url, confirmResponse.status_url);
  }

  /** New update path: uses (externalUserId, workId) to authorize each version endpoint. */
  private async executeUpdateFlowByWorkId(formState: typeof this.state.formState): Promise<void> {
    const work = this.state.selectedWork;
    if (!work) {
      this.transitionToFailed('No work selected for update.', null, 'widget.no_work_selected');
      return;
    }
    const userId = this.externalUserId;
    if (!userId) {
      this.transitionToFailed('No external user id provided.', null, 'widget.missing_external_user_id');
      return;
    }

    const creators = this.mapCreators(formState);
    const file = formState.file;
    let jobId: string;

    if (file) {
      const initResponse = await initUserWorkVersionUpload(
        this.atsUrl, this.token, this.siteKey, userId, work.id,
        { creators, filename: file.name },
      );
      jobId = initResponse.job_id;
      this.state.jobId = jobId;
      this.state.uploadUrl = initResponse.upload_url;
      await this.performUpload(initResponse.upload_url, file);
    } else {
      const initResponse = await initUserWorkVersion(
        this.atsUrl, this.token, this.siteKey, userId, work.id,
        { creators },
      );
      jobId = initResponse.job_id;
      this.state.jobId = jobId;
    }

    this.state.screen = 'CONFIRMING';
    this.render();

    await prepareUserWorkVersion(
      this.atsUrl, this.token, this.siteKey, userId, work.id,
      { job_id: jobId },
    );

    const confirmResponse = await confirmUserWorkVersion(
      this.atsUrl, this.token, this.siteKey, userId, work.id,
      { job_id: jobId },
    );

    this.state.transactionId = confirmResponse.transaction_id;
    this.state.workId = work.id;
    dispatchConfirmed(this, { transactionId: confirmResponse.transaction_id });

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

  /** Convert the wire-format `UserWork` to the camelCase `SelectedWork` used in state. */
  private mapUserWork(api: UserWork): SelectedWork {
    return {
      id: api.id,
      atsId: api.ats_id,
      owner: api.owner,
      latestVersion: api.latest_version,
      latestCommitment: api.latest_commitment,
      createdAt: api.created_at,
      updatedAt: api.updated_at ?? api.created_at,
      title: api.title ?? '',
      assetFilename: api.asset_filename,
      hasFiles: api.has_files,
    };
  }

  /** Convert the wire-format `WorkVersionApi` to the camelCase `WorkVersion` used in state. */
  private mapWorkVersion(api: WorkVersionApi): WorkVersion {
    return {
      version: api.version,
      commitment: api.commitment,
      assetFilename: api.asset_filename ?? null,
      registeredAt: api.registered_at ?? null,
      registeredAtBlock: api.registered_at_block ?? null,
      mediaHash: api.media_hash ?? null,
      merkleRoot: api.merkle_root ?? null,
      blockHash: api.block_hash ?? null,
      txHash: api.tx_hash ?? null,
      feeCredits: api.fee_credits ?? null,
      storageFeeCredits: api.storage_fee_credits ?? null,
    };
  }

  /** Convert the wire-format `WorkCreatorResponse` to camelCase. */
  private mapWorkCreator(api: WorkCreatorResponse): WorkCreator {
    return {
      fullName: api.full_name,
      email: api.email ?? null,
      roles: api.roles ?? [],
      ipi: api.ipi ?? null,
      isni: api.isni ?? null,
    };
  }

  /** Defense-in-depth: sort by `updatedAt` desc so newest works surface first, regardless of backend ordering. */
  private sortByUpdatedAtDesc(works: SelectedWork[]): SelectedWork[] {
    return [...works].sort((a, b) => {
      if (a.updatedAt === b.updatedAt) return 0;
      if (a.updatedAt == null) return 1;
      if (b.updatedAt == null) return -1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
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
  // User-Scoped Works (external-user-id)
  // ============================================

  /**
   * Fetch (or page through) the external user's works into `state.workList`.
   * @param opts.append - Append to the existing list instead of replacing (used by "Load more").
   * @param opts.quiet - Don't flash a loading spinner when we already have a list (used by search debounce).
   */
  private async loadUserWorks(opts: { append?: boolean; quiet?: boolean } = {}): Promise<void> {
    if (!this.externalUserId) return;
    if (!this.atsUrl || !this.token || !this.siteKey) return;

    const hasExistingWorks = this.state.workList.works.length > 0;
    if (!opts.quiet || !hasExistingWorks) {
      this.state.workList.status = 'loading';
    }
    this.state.workList.error = null;
    if (!opts.append && !opts.quiet) {
      this.state.workList.works = [];
      this.state.workList.endCursor = null;
      this.state.workList.hasNextPage = false;
    }
    this.render();

    try {
      const search = this.state.workList.search.trim() || null;
      const response = await listUserWorks(
        this.atsUrl,
        this.token,
        this.siteKey,
        this.externalUserId,
        {
          network: this.network,
          first: 50,
          after: opts.append ? this.state.workList.endCursor : null,
          search,
        },
      );
      const mapped = response.works.map(w => this.mapUserWork(w));
      const merged = opts.append ? [...this.state.workList.works, ...mapped] : mapped;
      this.state.workList.works = this.sortByUpdatedAtDesc(merged);
      this.state.workList.endCursor = response.page_info.end_cursor;
      this.state.workList.hasNextPage = response.page_info.has_next_page;
      this.state.workList.status = 'loaded';
      this.render();
    } catch (error) {
      const e = error as WidgetError;
      this.state.workList.status = 'error';
      this.state.workList.error = e.kind === 'api'
        ? getErrorMessage(e.error.code, e.error.details)
        : 'Failed to load works. Please try again.';
      this.render();
      // For auth/config-level errors, also route through the global handler.
      if (e.kind === 'api') {
        const code = e.error.code;
        const authCodes = ['session.invalid_token', 'common.auth.missing_token', 'common.auth.expired', 'common.auth.invalid_token'];
        if (authCodes.includes(code)) {
          this.handleError(e, this.mode === 'download' ? 'download_list' : 'work_select');
        }
      }
    }
  }

  /**
   * Navigate from the DOWNLOADS list to the DOWNLOAD_DETAIL screen for a single work and
   * kick off the versions load. Reuses any cached `SelectedWork` from the list so the
   * header renders instantly while the versions fetch is in flight.
   */
  private openWorkDetail(workId: string): void {
    const work = this.state.workList.works.find(w => w.id === workId) ?? null;
    this.state.versionList = createDefaultVersionListState();
    this.state.versionList.work = work;
    this.state.screen = 'DOWNLOAD_DETAIL';
    this.render();
    if (work) this.loadWorkVersions(workId);
  }

  /** Navigate back to the DOWNLOADS list, preserving the cached list state. */
  private backToDownloadList(): void {
    this.state.versionList = createDefaultVersionListState();
    this.state.screen = 'DOWNLOADS';
    this.render();
  }

  /** Fetch the full version history of a single work. */
  private async loadWorkVersions(workId: string): Promise<void> {
    if (!this.externalUserId) return;
    if (!this.atsUrl || !this.token || !this.siteKey) return;

    this.state.versionList.status = 'loading';
    this.state.versionList.error = null;
    this.render();

    try {
      const response = await listUserWorkVersions(
        this.atsUrl, this.token, this.siteKey, this.externalUserId, workId, this.network,
      );
      this.state.versionList.versions = response.versions.map(v => this.mapWorkVersion(v));
      this.state.versionList.status = 'loaded';
      this.render();
    } catch (error) {
      const e = error as WidgetError;
      this.state.versionList.status = 'error';
      this.state.versionList.error = e.kind === 'api'
        ? getErrorMessage(e.error.code, e.error.details)
        : 'Failed to load versions. Please try again.';
      this.render();
      if (e.kind === 'api') {
        const code = e.error.code;
        const authCodes = ['session.invalid_token', 'common.auth.missing_token', 'common.auth.expired', 'common.auth.invalid_token'];
        if (authCodes.includes(code)) {
          this.handleError(e, 'version_list');
        }
      }
    }
  }

  private async handleDownloadVersionAsset(version: number): Promise<void> {
    const work = this.state.versionList.work;
    if (!work || !this.externalUserId) return;
    if (this.state.versionList.downloading[version]) return;
    this.state.versionList.downloading = { ...this.state.versionList.downloading, [version]: 'asset' };
    this.render();
    dispatchDownloadStarted(this, { workId: work.id, kind: 'asset' });
    try {
      const { url } = await downloadUserWorkVersionAsset(
        this.atsUrl, this.token, this.siteKey, this.externalUserId, work.id, version,
      );
      openPresignedDownload(url);
      dispatchDownloadComplete(this, { workId: work.id, kind: 'asset' });
    } catch (error) {
      const e = error as WidgetError;
      const message = e.kind === 'api'
        ? getErrorMessage(e.error.code, e.error.details)
        : 'Download failed.';
      dispatchDownloadFailed(this, { workId: work.id, kind: 'asset', message });
      if (e.kind === 'api') {
        const code = e.error.code;
        const authCodes = ['session.invalid_token', 'common.auth.missing_token', 'common.auth.expired', 'common.auth.invalid_token'];
        if (authCodes.includes(code)) {
          this.handleError(e, 'download_version_asset');
        }
      }
    } finally {
      this.state.versionList.downloading = { ...this.state.versionList.downloading, [version]: null };
      this.render();
    }
  }

  /** Normalize an API role string to the widget's capitalized role names (e.g. `"author"` → `"Author"`). */
  private normalizeRoleName(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  }

  /**
   * Fetch the latest version's creators for prefill. Reuses the work-selector cache
   * (populated by "Show creators") when available so we don't double-fetch.
   */
  private async fetchWorkCreatorsForPrefill(work: SelectedWork): Promise<WorkCreator[]> {
    const cached = this.state.workList.creatorsByWork[work.id];
    if (cached && cached.status === 'loaded') return cached.creators;
    if (!this.externalUserId || !this.atsUrl || !this.token || !this.siteKey) return [];

    const response = await listUserWorkVersionCreators(
      this.atsUrl, this.token, this.siteKey, this.externalUserId, work.id, work.latestVersion, this.network,
    );
    const mapped = response.creators.map(c => this.mapWorkCreator(c));
    // Seed the cache so a later "Show creators" toggle is instant.
    this.state.workList.creatorsByWork = {
      ...this.state.workList.creatorsByWork,
      [work.id]: { status: 'loaded', creators: mapped, error: null },
    };
    return mapped;
  }

  /**
   * Select a work in the update flow: record it, prefill the form (title + creators from the
   * latest version), then advance to the file step. The file step already shows the work's
   * existing filename and lets the user skip to reuse it — that is the "file prefill".
   *
   * Creators are fetched before advancing (with a brief loading state on the button) so the
   * creators step is always populated by the time the user reaches it.
   */
  private async handleSelectWork(workId: string): Promise<void> {
    const work = this.state.workList.works.find(w => w.id === workId);
    if (!work) return;

    this.state.workList.selectedId = workId;
    this.state.selectedWork = work;
    if (work.title) this.state.formState.title = work.title;
    this.state.formErrors = { ...this.state.formErrors, general: undefined };
    dispatchWorkSelected(this, { workId: work.id, atsId: work.atsId });

    this.state.workList.selecting = true;
    this.render();

    try {
      const creators = await this.fetchWorkCreatorsForPrefill(work);
      if (creators.length > 0) {
        this.state.formState.creators = creators.map(c => ({
          fullName: c.fullName,
          email: c.email ?? '',
          roles: c.roles.map(r => this.normalizeRoleName(r)),
          ipi: c.ipi ?? '',
          isni: c.isni ?? '',
        }));
      }
    } catch {
      // Non-fatal: a failed creators fetch just leaves the creators step blank for manual entry.
    }

    this.state.workList.selecting = false;
    // Advance to the file step.
    this.handleNext();
  }

  /**
   * Toggle the per-work creators dropdown in the work-selector (update flow). Lazy-fetches
   * the latest version's creators on first expand; caches the result keyed by work id so
   * subsequent collapse/expand cycles don't refetch.
   */
  private toggleWorkCreators(workId: string): void {
    const current = this.state.workList.creatorsExpanded[workId] === true;
    this.state.workList.creatorsExpanded = {
      ...this.state.workList.creatorsExpanded,
      [workId]: !current,
    };
    this.render();
    if (!current && !this.state.workList.creatorsByWork[workId]) {
      this.loadWorkLatestCreators(workId);
    }
  }

  /** Fetch the latest version's creators for a single work in the work-selector list. */
  private async loadWorkLatestCreators(workId: string): Promise<void> {
    if (!this.externalUserId) return;
    if (!this.atsUrl || !this.token || !this.siteKey) return;
    const work = this.state.workList.works.find(w => w.id === workId);
    if (!work) return;

    this.state.workList.creatorsByWork = {
      ...this.state.workList.creatorsByWork,
      [workId]: { status: 'loading', creators: [], error: null },
    };
    this.render();

    try {
      const response = await listUserWorkVersionCreators(
        this.atsUrl, this.token, this.siteKey, this.externalUserId, workId, work.latestVersion, this.network,
      );
      this.state.workList.creatorsByWork = {
        ...this.state.workList.creatorsByWork,
        [workId]: {
          status: 'loaded',
          creators: response.creators.map(c => this.mapWorkCreator(c)),
          error: null,
        },
      };
      this.render();
    } catch (error) {
      const e = error as WidgetError;
      const message = e.kind === 'api'
        ? getErrorMessage(e.error.code, e.error.details)
        : 'Failed to load creators. Please try again.';
      this.state.workList.creatorsByWork = {
        ...this.state.workList.creatorsByWork,
        [workId]: { status: 'error', creators: [], error: message },
      };
      this.render();
      if (e.kind === 'api') {
        const code = e.error.code;
        const authCodes = ['session.invalid_token', 'common.auth.missing_token', 'common.auth.expired', 'common.auth.invalid_token'];
        if (authCodes.includes(code)) {
          this.handleError(e, 'work_creators');
        }
      }
    }
  }

  /**
   * Toggle the per-version creators dropdown. Lazy-fetches the creator list on the first
   * expand (the entry is cached afterwards so subsequent collapse/expand cycles don't refetch
   * — mirroring the dashboard's `has_been_expanded` pattern).
   */
  private toggleVersionCreators(version: number): void {
    const current = this.state.versionList.creatorsExpanded[version] === true;
    this.state.versionList.creatorsExpanded = {
      ...this.state.versionList.creatorsExpanded,
      [version]: !current,
    };
    this.render();
    if (!current && !this.state.versionList.creatorsByVersion[version]) {
      this.loadVersionCreators(version);
    }
  }

  /** Fetch creators for a specific version of the currently-detailed work. */
  private async loadVersionCreators(version: number): Promise<void> {
    const work = this.state.versionList.work;
    if (!work || !this.externalUserId) return;
    if (!this.atsUrl || !this.token || !this.siteKey) return;

    this.state.versionList.creatorsByVersion = {
      ...this.state.versionList.creatorsByVersion,
      [version]: { status: 'loading', creators: [], error: null },
    };
    this.render();

    try {
      const response = await listUserWorkVersionCreators(
        this.atsUrl, this.token, this.siteKey, this.externalUserId, work.id, version, this.network,
      );
      this.state.versionList.creatorsByVersion = {
        ...this.state.versionList.creatorsByVersion,
        [version]: {
          status: 'loaded',
          creators: response.creators.map(c => this.mapWorkCreator(c)),
          error: null,
        },
      };
      this.render();
    } catch (error) {
      const e = error as WidgetError;
      const message = e.kind === 'api'
        ? getErrorMessage(e.error.code, e.error.details)
        : 'Failed to load creators. Please try again.';
      this.state.versionList.creatorsByVersion = {
        ...this.state.versionList.creatorsByVersion,
        [version]: { status: 'error', creators: [], error: message },
      };
      this.render();
      if (e.kind === 'api') {
        const code = e.error.code;
        const authCodes = ['session.invalid_token', 'common.auth.missing_token', 'common.auth.expired', 'common.auth.invalid_token'];
        if (authCodes.includes(code)) {
          this.handleError(e, 'version_creators');
        }
      }
    }
  }

  private async handleDownloadVersionCert(version: number): Promise<void> {
    const work = this.state.versionList.work;
    if (!work || !this.externalUserId) return;
    if (this.state.versionList.downloading[version]) return;
    this.state.versionList.downloading = { ...this.state.versionList.downloading, [version]: 'certificate' };
    this.render();
    dispatchDownloadStarted(this, { workId: work.id, kind: 'certificate' });
    try {
      const { url } = await downloadUserWorkVersionCertificate(
        this.atsUrl, this.token, this.siteKey, this.externalUserId, work.id, version,
      );
      openPresignedDownload(url);
      dispatchDownloadComplete(this, { workId: work.id, kind: 'certificate' });
    } catch (error) {
      const e = error as WidgetError;
      const message = e.kind === 'api'
        ? getErrorMessage(e.error.code, e.error.details)
        : 'Download failed.';
      dispatchDownloadFailed(this, { workId: work.id, kind: 'certificate', message });
      if (e.kind === 'api') {
        const code = e.error.code;
        const authCodes = ['session.invalid_token', 'common.auth.missing_token', 'common.auth.expired', 'common.auth.invalid_token'];
        if (authCodes.includes(code)) {
          this.handleError(e, 'download_version_certificate');
        }
      }
    } finally {
      this.state.versionList.downloading = { ...this.state.versionList.downloading, [version]: null };
      this.render();
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
          this.transitionToFailed('Incomplete transaction data received', null, null);
          reject(new Error('Incomplete transaction data'));
          return;
        }

        if (details.work_id) {
          this.state.workId = details.work_id;
        }

        const immediateAccessCode = details.access_code || pendingAccessCode;

        this.state.completionData = {
          atsId: atsId ?? null,
          txHash: details.tx_hash,
          blockNumber: details.block_number,
          explorerUrl: details.explorer_url || '',
          accessCode: immediateAccessCode,
        };

        this.transitionToScreen('COMPLETE');

        if (immediateAccessCode) {
          dispatchComplete(this, {
            atsId,
            txHash: details.tx_hash,
            blockNumber: details.block_number,
            explorerUrl: details.explorer_url || '',
            accessCode: immediateAccessCode,
          });
          resolve();
        } else if (this.mode === 'register' && statusUrl) {
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

      const handlePollingError = (error: WidgetError) => {
        if (resolved) return;
        resolved = true;
        this.cleanupTracking();
        this.handleError(error, 'tracking');
        reject(new Error('Polling error'));
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
          (error: WidgetError) => {
            if (resolved) return;
            resolved = true;
            this.cleanupTracking();
            this.handleError(error, 'tracking');
            reject(new Error('WebSocket error'));
          },
          () => {
            this.wsCleanup = null;
            this.pollingCleanup = pollTransactionStatus(
              statusUrl,
              baseHttpUrl,
              handleProgress,
              handleComplete,
              handlePollingError,
              POLLING_INTERVAL_MS,
              POLLING_TIMEOUT_MS,
            );
          },
        );
      } catch {
        this.pollingCleanup = pollTransactionStatus(
          statusUrl,
          baseHttpUrl,
          handleProgress,
          handleComplete,
          handlePollingError,
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
        this.atsUrl, this.token, this.siteKey, this.state.workId,
      );
      openPresignedDownload(url);
    } catch (error) {
      this.handleError(error as WidgetError, 'download');
    }
  }
}

// Register custom element
customElements.define('ats-widget', AllfeatRegister);
