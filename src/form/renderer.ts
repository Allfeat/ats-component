import type { CreatorFormData, FormState, FormSubStep } from './types';
import { CREATOR_ROLES } from './types';
import { getTrackingSteps } from '../api/types';
import type { Mode } from '../api/types';
import { MAX_CREATORS, MAX_TITLE_LENGTH, ACCESS_CODE_LENGTH } from '../constants';
import { formatFileSize, escapeHtml } from '../utils/helpers';

// ============================================
// Lucide SVG Icons (inline, zero deps)
// ============================================

const ICONS = {
  upload: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
  fileText: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  clipboardList: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
  arrowLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  checkLg: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  externalLink: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  alertCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  search: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  alertTriangle: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
} as const;

// ============================================
// Step definitions
// ============================================

interface StepDef {
  id: FormSubStep;
  label: string;
}

const ACCESS_CODE_STEP: StepDef = { id: 'access_code', label: 'Access Code' };

const FORM_STEPS: StepDef[] = [
  { id: 'file', label: 'File Selection' },
  { id: 'title', label: 'Title' },
  { id: 'creators', label: 'Creators' },
  { id: 'review', label: 'Summary' },
];

const UPDATE_FORM_STEPS: StepDef[] = [
  ACCESS_CODE_STEP,
  { id: 'file', label: 'File Selection' },
  { id: 'creators', label: 'Creators' },
  { id: 'review', label: 'Summary' },
];

export function getFormSteps(mode: Mode): StepDef[] {
  if (mode === 'update') return UPDATE_FORM_STEPS;
  return FORM_STEPS;
}

function getStepIndex(subStep: FormSubStep, mode: Mode): number {
  return getFormSteps(mode).findIndex(s => s.id === subStep);
}

// ============================================
// Helpers
// ============================================

export { formatFileSize } from '../utils/helpers';

function getStepIcon(stepId: string): string {
  switch (stepId) {
    case 'file': return ICONS.upload;
    case 'title': return ICONS.fileText;
    case 'creators': return ICONS.users;
    case 'review': return ICONS.clipboardList;
    case 'access_code': return ICONS.search;
    default: return '';
  }
}

// ============================================
// Step Indicator
// ============================================

export function renderStepIndicator(currentSubStep: FormSubStep, mode: Mode): string {
  const steps = getFormSteps(mode);
  const currentIndex = getStepIndex(currentSubStep, mode);

  return `
    <div class="ats-steps">
      ${steps.map((step, index) => `
        <div class="ats-step ${index < currentIndex ? 'completed' : ''} ${index === currentIndex ? 'active' : ''}">
          <div class="ats-step-number">${index < currentIndex ? '&#10003;' : getStepIcon(step.id)}</div>
          <div class="ats-step-label">${step.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================
// File Step
// ============================================

export function renderFileStep(
  state: FormState,
  mode: Mode,
  maxFileSize: number,
  errors: { file?: string } = {},
): string {
  const hasFile = state.file !== null;
  const isUpdate = mode === 'update';

  return `
    <div class="ats-section-title ats-section-title-centered">File Selection</div>
    <div class="ats-section-title">${isUpdate ? 'Select the new version file' : 'Select the file to protect'}</div>
    <div class="ats-file-drop ${hasFile ? 'has-file' : ''}" id="file-drop-zone">
      <div class="ats-file-drop-icon">${ICONS.upload}</div>
      ${hasFile && state.file ? `
        <div class="ats-file-drop-filename">${state.file.name}</div>
        <div class="ats-file-drop-size">${formatFileSize(state.file.size)}</div>
        <button type="button" class="ats-btn ats-btn-outline-destructive" id="remove-file" data-action="remove-file">Remove File</button>
      ` : `
        <div class="ats-file-drop-text"><strong>Drag & drop or select your file</strong></div>
      `}
      <input type="file" id="file-input" class="ats-hidden" />
    </div>
    ${errors.file ? `<div class="ats-error-message">${errors.file}</div>` : ''}
    <div class="ats-file-help-text">Max size: ${formatFileSize(maxFileSize)}.</div>
    ${isUpdate && !hasFile ? `
      <div class="ats-file-help-text ats-mt-sm">
        <em>File is optional for updates — skip to reuse existing file.</em>
      </div>
    ` : ''}
    <div class="ats-btn-group ${isUpdate ? 'ats-btn-group-between' : 'ats-btn-group-right'}">
      ${isUpdate ? `<button type="button" class="ats-btn ats-btn-secondary" id="back-btn" data-action="back">Back</button>` : ''}
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" data-action="next" ${!hasFile && mode === 'register' ? 'disabled' : ''}>
        ${isUpdate && !hasFile ? 'Skip' : 'Next'}
        ${ICONS.arrowRight}
      </button>
    </div>
  `;
}

// ============================================
// Title Step
// ============================================

export function renderTitleStep(
  state: FormState,
  errors: Record<string, string> = {},
): string {
  return `
    <div class="ats-section-title ats-section-title-centered">Title of the Work</div>
    <div class="ats-form-group">
      <label class="ats-label ats-label-required" for="title">Title</label>
      <input
        type="text"
        id="title"
        class="ats-input ${errors.title ? 'error' : ''}"
        placeholder="Enter the title of your work"
        value="${escapeHtml(state.title)}"
        maxlength="${MAX_TITLE_LENGTH}"
      />
      ${errors.title ? `<div class="ats-error-message">${errors.title}</div>` : ''}
    </div>
    <div class="ats-btn-group ats-btn-group-between">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn" data-action="back">Back</button>
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" data-action="next">Continue</button>
    </div>
  `;
}

// ============================================
// Creator Form
// ============================================

function renderCreatorForm(
  creator: CreatorFormData,
  index: number,
  creatorsCount: number,
  errors: Record<string, string> = {},
): string {
  return `
    <div class="ats-creator-card" data-creator-index="${index}">
      <div class="ats-creator-form-grid">
        <div class="ats-form-group">
          <label class="ats-label ats-label-required">Full name</label>
          <input
            type="text"
            class="ats-input creator-fullname ${errors.fullName ? 'error' : ''}"
            data-index="${index}"
            placeholder="Enter full name"
            value="${escapeHtml(creator.fullName)}"
            maxlength="255"
          />
          ${errors.fullName ? `<div class="ats-error-message">${errors.fullName}</div>` : ''}
        </div>
        <div class="ats-form-group">
          <label class="ats-label ats-label-required">Email</label>
          <input
            type="email"
            class="ats-input creator-email ${errors.email ? 'error' : ''}"
            data-index="${index}"
            placeholder="Enter email address"
            value="${escapeHtml(creator.email)}"
            maxlength="255"
          />
          ${errors.email ? `<div class="ats-error-message">${errors.email}</div>` : ''}
        </div>
      </div>
      <div class="ats-form-group ats-mt-md">
        <label class="ats-label ats-label-required">Roles</label>
        <div class="ats-checkbox-group">
          ${CREATOR_ROLES.map(role => `
            <label class="ats-role-badge ${creator.roles.includes(role) ? 'selected' : ''}">
              <input type="checkbox" class="creator-role" data-index="${index}" value="${role}" ${creator.roles.includes(role) ? 'checked' : ''} />
              ${creator.roles.includes(role) ? `<span class="ats-role-check">${ICONS.check}</span>` : ''}
              ${role}
            </label>
          `).join('')}
        </div>
        ${errors.roles ? `<div class="ats-error-message">${errors.roles}</div>` : ''}
      </div>
      <hr class="ats-creator-divider" />
      <div class="ats-section-subtitle">Optional Information</div>
      <div class="ats-creator-form-grid">
        <div class="ats-form-group">
          <label class="ats-label">IPI (optional)</label>
          <input
            type="text"
            class="ats-input creator-ipi ${errors.ipi ? 'error' : ''}"
            data-index="${index}"
            value="${escapeHtml(creator.ipi)}"
            maxlength="11"
            inputmode="numeric"
            pattern="[0-9]*"
          />
          <div class="ats-help-text">Format: 1-11 digits</div>
          ${errors.ipi ? `<div class="ats-error-message">${errors.ipi}</div>` : ''}
        </div>
        <div class="ats-form-group">
          <label class="ats-label">ISNI (optional)</label>
          <input
            type="text"
            class="ats-input creator-isni ${errors.isni ? 'error' : ''}"
            data-index="${index}"
            value="${escapeHtml(creator.isni)}"
            maxlength="16"
          />
          <div class="ats-help-text">Format: 16 characters: 15 digits and one digit or X</div>
          ${errors.isni ? `<div class="ats-error-message">${errors.isni}</div>` : ''}
        </div>
      </div>
      ${creatorsCount > 1 ? `
        <div class="ats-creator-remove-container">
          <button type="button" class="ats-btn ats-btn-outline-destructive ats-w-full remove-creator" data-action="remove-creator" data-index="${index}">
            Remove
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// ============================================
// Creators Step
// ============================================

export function renderCreatorsStep(
  state: FormState,
  errors: Record<string, Record<string, string>> = {},
): string {
  return `
    <div class="ats-section-title ats-section-title-centered">Creators</div>
    <div class="ats-creators-list">
      ${state.creators.map((creator, index) =>
        renderCreatorForm(creator, index, state.creators.length, errors[index] || {})
      ).join('')}
    </div>
    ${state.creators.length < MAX_CREATORS ? `
      <button type="button" class="ats-btn ats-btn-outline-primary ats-mt-md" id="add-creator" data-action="add-creator">
        Add Creator (${state.creators.length}/${MAX_CREATORS})
      </button>
    ` : ''}
    <div class="ats-btn-group ats-btn-group-between">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn" data-action="back">Back</button>
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" data-action="next">Continue</button>
    </div>
  `;
}

// ============================================
// Review Step
// ============================================

export function renderReviewStep(state: FormState, mode: Mode, submitting = false): string {
  const isUpdate = mode === 'update';
  return `
    <div class="ats-section-title ats-section-title-centered">Review Your Submission</div>
    <div class="ats-summary">
      <div class="ats-summary-section">
        <div class="ats-summary-label">Asset File</div>
        <div class="ats-summary-value">${state.file?.name || 'No file selected (reusing existing)'}</div>
      </div>
      <div class="ats-summary-section">
        <div class="ats-summary-label">Title</div>
        <div class="ats-summary-value">${escapeHtml(state.title)}</div>
      </div>
      <div class="ats-summary-section">
        <div class="ats-summary-label">Creators (${state.creators.length})</div>
        ${state.creators.map((creator, index) => `
          <div class="ats-summary-value ats-creator-summary ${index > 0 ? 'ats-mt-sm' : ''}">
            <strong>${escapeHtml(creator.fullName)}</strong><br />
            ${escapeHtml(creator.email)}<br />
            <em>${creator.roles.join(', ')}</em><br />
            IPI: ${creator.ipi ? escapeHtml(creator.ipi) : 'N/A'}<br />
            ISNI: ${creator.isni ? escapeHtml(creator.isni) : 'N/A'}
          </div>
        `).join('')}
      </div>
    </div>
    <div class="ats-btn-group ats-btn-group-between">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn" data-action="back" ${submitting ? 'disabled' : ''}>Back</button>
      <button type="button" class="ats-btn ats-btn-primary ats-btn-lg" id="submit-btn" data-action="submit" ${submitting ? 'disabled' : ''}>
        ${submitting ? 'Submitting...' : isUpdate ? 'Submit new version' : 'Protect my work'}
      </button>
    </div>
  `;
}

// ============================================
// Upload Screen
// ============================================

export function renderUploadScreen(
  progress: number,
  filename: string,
  attempt: number,
): string {
  return `
    <div class="ats-upload-screen">
      <div class="ats-spinner" style="width: 48px; height: 48px; border-width: 4px; margin: 0 auto 24px;"></div>
      <div class="ats-section-title ats-section-title-centered">Uploading your file</div>
      <div class="ats-upload-filename">${escapeHtml(filename)}</div>
      <div class="ats-progress" style="max-width: 300px; margin: 16px auto;">
        <div class="ats-progress-bar" style="width: ${progress}%;"></div>
      </div>
      <div class="ats-progress-text">${progress}%</div>
      ${attempt > 1 ? `
        <div class="ats-loading-text" style="margin-top: 12px; color: var(--ats-warning);">
          Retry attempt ${attempt}/3
        </div>
      ` : ''}
    </div>
  `;
}

// ============================================
// Confirming Screen (brief transition)
// ============================================

export function renderConfirmingScreen(mode: Mode): string {
  const isUpdate = mode === 'update';

  const title = isUpdate ? 'Confirming version update' : 'Confirming registration';
  const subtitle = 'Preparing blockchain submission...';

  return `
    <div class="ats-upload-screen">
      <div class="ats-spinner" style="width: 48px; height: 48px; border-width: 4px; margin: 0 auto 24px;"></div>
      <div class="ats-section-title ats-section-title-centered">${title}</div>
      <div class="ats-loading-text">${subtitle}</div>
    </div>
  `;
}

// ============================================
// Tracking Screen
// ============================================

export function renderTrackingScreen(
  currentStep: string,
  progress: number,
  mode: Mode,
): string {
  const isUpdate = mode === 'update';
  const steps = getTrackingSteps(mode);
  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return `
    <div class="ats-upload-screen">
      <div class="ats-section-title ats-section-title-centered">${isUpdate ? 'Processing Your Update' : 'Processing Your Work'}</div>
      <div class="ats-progress" style="max-width: 300px; margin: 16px auto 24px;">
        <div class="ats-progress-bar" style="width: ${progress}%;"></div>
      </div>
      <div class="ats-progress-text" style="margin-bottom: 24px;">${progress}%</div>
      <div class="ats-tracking-steps">
        ${steps.map((step, index) => {
          let status: string;
          if (currentStep === 'completed' || index < currentStepIndex) {
            status = 'completed';
          } else if (index === currentStepIndex) {
            status = 'active';
          } else {
            status = 'pending';
          }
          return `
            <div class="ats-tracking-step ${status}">
              <div class="ats-tracking-step-icon">
                ${status === 'completed' ? ICONS.check :
                  status === 'active' ? '<div class="ats-spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>' :
                  '<div class="ats-tracking-step-circle"></div>'}
              </div>
              <div class="ats-tracking-step-label">${step.label}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ============================================
// Complete Screen
// ============================================

export function renderCompleteScreen(
  atsId: number | null,
  txHash: string,
  blockNumber: number,
  explorerUrl: string,
  mode: Mode,
  accessCode?: string,
): string {
  const isUpdate = mode === 'update';
  return `
    <div class="ats-success-container">
      <div class="ats-success-icon-circle">
        ${ICONS.checkLg}
      </div>
      <div class="ats-success-title">${isUpdate ? 'Version Updated!' : 'Work Protected!'}</div>
      <div class="ats-success-message">
        ${isUpdate
          ? 'Your new version has been recorded on the blockchain.'
          : 'Your work has been permanently protected on the blockchain.'}
      </div>

      ${accessCode ? `
      <div class="ats-callout ats-callout-warning">
        <div class="ats-callout-title">${ICONS.alertTriangle} Save your Access Code</div>
        <div class="ats-callout-text">This code is the only way to access or update your work. Store it somewhere safe — it cannot be recovered.</div>
        <div class="ats-access-code-display">
          <code>${escapeHtml(accessCode)}</code>
          <button type="button" class="ats-btn ats-btn-sm ats-btn-outline" id="copy-access-code" data-action="copy-access-code" title="Copy access code">
            ${ICONS.copy}
          </button>
        </div>
      </div>
      ` : ''}

      <div class="ats-callout ats-callout-primary">
        <div class="ats-callout-title">${ICONS.fileText} Download your Certificate</div>
        <div class="ats-callout-text">Your certificate is the official proof of ${isUpdate ? 'this version' : 'registration'}. Download and keep it with your work files.</div>
        <button type="button" class="ats-btn ats-btn-primary ats-mt-sm" id="download-btn" data-action="download">
          Download Certificate
        </button>
      </div>

      <div class="ats-summary ats-summary-compact">
        ${atsId != null ? `
        <div class="ats-summary-section">
          <div class="ats-summary-label">ATS ID</div>
          <div class="ats-summary-value">${atsId}</div>
        </div>
        ` : ''}
        <div class="ats-summary-section">
          <div class="ats-summary-label">Transaction</div>
          <div class="ats-summary-value ats-monospace-sm">${escapeHtml(txHash)}</div>
        </div>
        <div class="ats-summary-section">
          <div class="ats-summary-label">Block</div>
          <div class="ats-summary-value">${blockNumber}</div>
        </div>
      </div>

      <div class="ats-explorer-container ats-mt-sm">
        <a href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener noreferrer"
           class="ats-explorer-link">
          View on explorer ${ICONS.externalLink}
        </a>
      </div>

      <div class="ats-mt-lg">
        <button type="button" class="ats-btn ats-btn-secondary" id="reset-btn" data-action="reset">
          ${isUpdate ? 'Submit another update' : 'Protect another work'}
        </button>
      </div>
    </div>
  `;
}

// ============================================
// Failed Screen
// ============================================

export function renderFailedScreen(error: string): string {
  return `
    <div class="ats-failed-screen">
      <div class="ats-failed-icon-circle">
        ${ICONS.alertCircle}
      </div>
      <div class="ats-section-title ats-section-title-centered ats-text-error">
        Something went wrong
      </div>
      <div class="ats-loading-text ats-mb-lg">
        ${escapeHtml(error)}
      </div>
      <button type="button" class="ats-btn ats-btn-primary" id="retry-btn" data-action="retry">
        Retry
      </button>
    </div>
  `;
}

// ============================================
// Access Code Step
// ============================================

export function renderAccessCodeStep(
  accessCode: string,
  errors: { accessCode?: string } = {},
  loading = false,
): string {
  return `
    <div class="ats-section-title ats-section-title-centered">Enter Access Code</div>
    <div class="ats-section-title">Enter your access code to update the work</div>
    <div class="ats-form-group">
      <label class="ats-label ats-label-required" for="access-code">Access Code</label>
      <input
        type="text"
        id="access-code"
        class="ats-input ${errors.accessCode ? 'error' : ''}"
        placeholder="atc_..."
        value="${escapeHtml(accessCode)}"
        maxlength="${ACCESS_CODE_LENGTH}"
        style="font-family: monospace;"
        ${loading ? 'disabled' : ''}
      />
      <div class="ats-help-text">Format: atc_ followed by 64 hex characters</div>
      ${errors.accessCode ? `<div class="ats-error-message">${errors.accessCode}</div>` : ''}
    </div>
    <div class="ats-btn-group ats-btn-group-right">
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" data-action="next" ${loading ? 'disabled' : ''}>
        ${loading ? 'Verifying...' : `Verify & continue ${ICONS.arrowRight}`}
      </button>
    </div>
  `;
}

export function renderTokenExpiredOverlay(): string {
  return `
    <div class="ats-loading-overlay">
      <div class="ats-spinner" style="width: 32px; height: 32px; border-width: 3px;"></div>
      <div class="ats-loading-text">Session expired — waiting for new token...</div>
    </div>
  `;
}

