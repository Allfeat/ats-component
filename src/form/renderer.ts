import type { AccessData, CreatorFormData, FormState, FormSubStep, SelectedWork, VersionCreatorsEntry, VersionListState, WorkCreator, WorkListState, WorkVersion } from './types';
import { CREATOR_ROLES } from './types';
import { getTrackingSteps } from '../api/types';
import type { Mode } from '../api/types';
import { MAX_CREATORS, MAX_TITLE_LENGTH, ACCESS_CODE_LENGTH } from '../constants';
import { formatFileSize, escapeHtml, formatShortDate, truncateHash } from '../utils/helpers';

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
  download: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
} as const;

// ============================================
// Step definitions
// ============================================

interface StepDef {
  id: FormSubStep;
  label: string;
}

const ACCESS_CODE_STEP: StepDef = { id: 'access_code', label: 'Access Code' };
const WORK_SELECT_STEP: StepDef = { id: 'work_select', label: 'Select Work' };

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

const UPDATE_FORM_STEPS_USER_SCOPED: StepDef[] = [
  WORK_SELECT_STEP,
  { id: 'file', label: 'File Selection' },
  { id: 'creators', label: 'Creators' },
  { id: 'review', label: 'Summary' },
];

export function getFormSteps(mode: Mode, externalUserMode = false): StepDef[] {
  if (mode === 'update') {
    return externalUserMode ? UPDATE_FORM_STEPS_USER_SCOPED : UPDATE_FORM_STEPS;
  }
  return FORM_STEPS;
}

function getStepIndex(subStep: FormSubStep, mode: Mode, externalUserMode = false): number {
  return getFormSteps(mode, externalUserMode).findIndex(s => s.id === subStep);
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
    case 'work_select': return ICONS.search;
    default: return '';
  }
}

// ============================================
// Step Indicator
// ============================================

export function renderStepIndicator(currentSubStep: FormSubStep, mode: Mode, externalUserMode = false): string {
  const steps = getFormSteps(mode, externalUserMode);
  const currentIndex = getStepIndex(currentSubStep, mode, externalUserMode);

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
  existingFilename?: string | null,
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
        <em>File is optional for updates — skip to reuse existing file${existingFilename ? ` <strong>${escapeHtml(existingFilename)}</strong>` : ''}.</em>
      </div>
    ` : ''}
    <div class="ats-btn-group ${isUpdate ? 'ats-btn-group-between' : 'ats-btn-group-right'}">
      ${isUpdate ? `<button type="button" class="ats-btn ats-btn-secondary" id="back-btn" data-action="back">Back</button>` : ''}
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" data-action="next" ${!hasFile && mode === 'register' ? 'disabled' : ''}>
        ${isUpdate && !hasFile ? 'Skip' : 'Next'}
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
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" data-action="next">Next</button>
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
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" data-action="next">Next</button>
    </div>
  `;
}

// ============================================
// Review Step
// ============================================

export function renderReviewStep(state: FormState, mode: Mode, submitting = false, accessData: AccessData | null = null): string {
  const isUpdate = mode === 'update';
  const fileName = state.file?.name || accessData?.assetFilename || 'No file selected';
  return `
    <div class="ats-section-title ats-section-title-centered">Review Your Submission</div>
    <div class="ats-summary">
      <div class="ats-summary-section">
        <div class="ats-summary-label">File</div>
        <div class="ats-summary-value">${!state.file && accessData?.assetFilename ? `<strong>${escapeHtml(fileName)}</strong> <em>(current version)</em>` : escapeHtml(fileName)}</div>
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
      <div class="ats-success-title">${isUpdate ? 'New version of your work protected!' : 'Work Protected!'}</div>
      <div class="ats-success-message">
        ${isUpdate
          ? 'The new version of your work has been successfully submitted and permanently protected on the blockchain.'
          : 'Your work has been successfully submitted and permanently protected on the blockchain.'}
        The information is now immutable and cannot be changed.
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

      <div class="ats-explorer-container ats-mt-sm">
        <a href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener noreferrer"
           class="ats-explorer-link">
          View on explorer ${ICONS.externalLink}
        </a>
      </div>

      <div class="ats-mt-lg">
        <button type="button" class="ats-btn ats-btn-secondary" id="reset-btn" data-action="reset">
          ${isUpdate ? 'Protect another version of a work' : 'Protect another work'}
        </button>
      </div>
    </div>
  `;
}

// ============================================
// Failed Screen
// ============================================

export function renderFailedScreen(message: string, requestId?: string | null): string {
  return `
    <div class="ats-failed-screen">
      <div class="ats-failed-icon-circle">
        ${ICONS.alertCircle}
      </div>
      <div class="ats-section-title ats-section-title-centered ats-text-error">
        Something went wrong
      </div>
      <div class="ats-loading-text ats-mb-lg">
        ${escapeHtml(message)}
      </div>
      ${requestId ? `
        <div class="ats-request-id ats-mb-lg">
          <span class="ats-request-id-label">Error ID:</span>
          <code class="ats-request-id-value">${escapeHtml(requestId)}</code>
          <button type="button" class="ats-btn ats-btn-sm ats-btn-outline" data-action="copy-request-id" title="Copy error ID">
            ${ICONS.copy}
          </button>
        </div>
      ` : ''}
      <button type="button" class="ats-btn ats-btn-primary" id="retry-btn" data-action="retry">
        Retry
      </button>
    </div>
  `;
}

// ============================================
// Disabled Screen
// ============================================

export function renderDisabledScreen(message: string, requestId?: string | null): string {
  return `
    <div class="ats-failed-screen">
      <div class="ats-failed-icon-circle" style="border-color: var(--ats-warning, #f59e0b);">
        ${ICONS.alertTriangle}
      </div>
      <div class="ats-section-title ats-section-title-centered">
        Widget Unavailable
      </div>
      <div class="ats-loading-text ats-mb-lg">
        ${escapeHtml(message)}
      </div>
      ${requestId ? `
        <div class="ats-request-id ats-mb-lg">
          <span class="ats-request-id-label">Error ID:</span>
          <code class="ats-request-id-value">${escapeHtml(requestId)}</code>
          <button type="button" class="ats-btn ats-btn-sm ats-btn-outline" data-action="copy-request-id" title="Copy error ID">
            ${ICONS.copy}
          </button>
        </div>
      ` : ''}
      <div class="ats-loading-text">
        Contact your administrator for assistance.
      </div>
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
        ${loading ? 'Verifying...' : 'Next'}
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

// ============================================
// Copyable hash (commitment) display
// ============================================

/**
 * Renders a truncated hash + copy-to-clipboard button matching the dashboard's HashItem
 * pattern (see `feat-ui/work_version_card.rs`). The full hash is exposed via `data-value`
 * on the button so the click handler can copy without consulting state.
 *
 * Returns the row HTML — the caller is responsible for the surrounding label.
 */
function renderCopyableHash(rawHash: string | null | undefined, displayLen = 12): string {
  if (!rawHash) {
    return `<div class="ats-summary-value">—</div>`;
  }
  const display = escapeHtml(truncateHash(rawHash, displayLen));
  const full = escapeHtml(rawHash);
  return `
    <div class="ats-hash-row">
      <div class="ats-summary-value ats-monospace-sm ats-truncate-line ats-hash-value" title="${full}">${display}</div>
      <button type="button"
              class="ats-copy-btn"
              data-action="copy-hash"
              data-value="${full}"
              aria-label="Copy hash"
              title="Copy">
        <span class="ats-copy-btn-icon">${ICONS.copy}</span>
        <span class="ats-copy-btn-toast" aria-hidden="true">Copied!</span>
      </button>
    </div>
  `;
}

// ============================================
// Work-list helpers (shared by work-selector + downloads)
// ============================================

/** Case-insensitive filter on title. Mirrors the feat reference's client-side filter. */
function filterWorks(works: SelectedWork[], search: string): SelectedWork[] {
  const q = search.trim().toLowerCase();
  if (!q) return works;
  return works.filter(w => w.title.toLowerCase().includes(q));
}

type RowIndicator = 'check' | 'chevron' | 'none';

function renderWorkRowHeader(
  w: SelectedWork,
  opts: { action: string; indicator: RowIndicator },
): string {
  const title = w.title ? escapeHtml(w.title) : '<em>(untitled)</em>';
  const atsId = w.atsId < 0 ? '—' : `#${w.atsId}`;
  let indicatorHtml = '';
  if (opts.indicator === 'check') {
    indicatorHtml = `<span class="ats-work-row-check" aria-label="Selected">${ICONS.check}</span>`;
  } else if (opts.indicator === 'chevron') {
    indicatorHtml = `<span class="ats-work-row-chevron" aria-hidden="true">${ICONS.chevronRight}</span>`;
  }
  return `
    <button type="button"
            class="ats-work-row-header"
            data-action="${opts.action}"
            data-work-id="${escapeHtml(w.id)}">
      <div class="ats-work-row-title">${title}</div>
      <div class="ats-work-row-meta">
        <span class="ats-work-row-id">${atsId}</span>
        <span class="ats-work-row-version">v${w.latestVersion}</span>
        ${indicatorHtml}
      </div>
    </button>
  `;
}

function renderWorkDetailPanel(
  w: SelectedWork,
  list: WorkListState,
  opts: { showSelect: boolean; selected: boolean },
): string {
  const filenameRaw = w.assetFilename ?? '';
  const filenameDisplay = filenameRaw ? escapeHtml(filenameRaw) : '—';
  const filenameTitle = filenameRaw ? ` title="${escapeHtml(filenameRaw)}"` : '';
  const creatorsExpanded = list.creatorsExpanded[w.id] === true;
  const creatorsEntry = list.creatorsByWork[w.id];

  let selectLabel = 'Select this work';
  if (opts.selected) selectLabel = list.selecting ? 'Loading…' : 'Selected';

  return `
    <div class="ats-work-detail">
      <div class="ats-work-detail-grid">
        <div>
          <div class="ats-summary-label">Filename</div>
          <div class="ats-summary-value ats-truncate-line"${filenameTitle}>${filenameDisplay}</div>
        </div>
        <div>
          <div class="ats-summary-label">Created</div>
          <div class="ats-summary-value">${formatShortDate(w.createdAt)}</div>
        </div>
      </div>
      <div class="ats-work-detail-commitment">
        <div class="ats-work-detail-commitment-main">
          <div class="ats-summary-label">Commitment</div>
          ${renderCopyableHash(w.latestCommitment, 12)}
        </div>
        <button type="button"
                class="ats-btn ats-btn-sm ats-btn-outline"
                data-action="toggle-work-creators"
                data-work-id="${escapeHtml(w.id)}"
                aria-expanded="${creatorsExpanded}">
          <span class="ats-version-creators-chevron ${creatorsExpanded ? 'open' : ''}" aria-hidden="true">${ICONS.chevronRight}</span>
          <span>${creatorsExpanded ? 'Hide creators' : 'Show creators'}</span>
        </button>
      </div>
      ${creatorsExpanded ? renderVersionCreatorsPanel(creatorsEntry) : ''}
      ${opts.showSelect ? `
        <button type="button"
                class="ats-btn ${opts.selected ? 'ats-btn-primary' : 'ats-btn-outline-primary'} ats-w-full ats-mt-md"
                data-action="select-work"
                data-work-id="${escapeHtml(w.id)}"
                ${list.selecting ? 'disabled' : ''}>
          ${selectLabel}
        </button>
      ` : ''}
    </div>
  `;
}

interface RowBehavior {
  /** `data-action` for the row header button. */
  action: string;
  /** Right-side indicator: `check` for selected, `chevron` for navigation, `none` otherwise. */
  indicator: (w: SelectedWork) => RowIndicator;
  /** Optional inline body renderer. Returning `null` means no body for that row. */
  renderRowBody?: (w: SelectedWork) => string | null;
}

function renderWorkListShell(
  list: WorkListState,
  options: {
    title: string;
    emptyMessage: string;
    row: RowBehavior;
    afterListSlot?: string;
    footerSlot?: string;
  },
): string {
  const filtered = filterWorks(list.works, list.search);

  let listContent = '';
  if (list.status === 'loading') {
    listContent = `
      <div class="ats-work-list-empty">
        <div class="ats-spinner" style="width: 28px; height: 28px; border-width: 3px; margin: 0 auto 12px;"></div>
        <div class="ats-loading-text">Loading your works…</div>
      </div>
    `;
  } else if (list.status === 'error') {
    listContent = `
      <div class="ats-alert ats-alert-error">
        ${escapeHtml(list.error || 'Failed to load works.')}
      </div>
      <div class="ats-btn-group ats-btn-group-right ats-mt-md">
        <button type="button" class="ats-btn ats-btn-secondary" data-action="reload-works">Retry</button>
      </div>
    `;
  } else if (list.status === 'loaded' && filtered.length === 0) {
    listContent = `<div class="ats-work-list-empty">${escapeHtml(options.emptyMessage)}</div>`;
  } else if (list.status === 'loaded') {
    listContent = `
      <div class="ats-work-list">
        ${filtered.map(w => {
          const expanded = list.expandedId === w.id;
          const selected = list.selectedId === w.id;
          const body = options.row.renderRowBody && expanded ? options.row.renderRowBody(w) : null;
          return `
            <div class="ats-work-row ${selected ? 'selected' : ''} ${expanded && body ? 'expanded' : ''}">
              ${renderWorkRowHeader(w, { action: options.row.action, indicator: options.row.indicator(w) })}
              ${body || ''}
            </div>
          `;
        }).join('')}
      </div>
      ${list.hasNextPage ? `
        <div class="ats-btn-group ats-btn-group-center ats-mt-md">
          <button type="button" class="ats-btn ats-btn-outline" data-action="load-more-works">Load more</button>
        </div>
      ` : ''}
    `;
  }

  return `
    <div class="ats-section-title ats-section-title-centered">${escapeHtml(options.title)}</div>
    <div class="ats-search-wrap">
      <span class="ats-search-icon">${ICONS.search}</span>
      <input
        type="text"
        id="work-search"
        class="ats-input ats-search-input"
        placeholder="Search by title…"
        value="${escapeHtml(list.search)}"
        ${list.status === 'loading' ? 'disabled' : ''}
      />
    </div>
    ${listContent}
    ${options.afterListSlot || ''}
    ${options.footerSlot || ''}
  `;
}

// ============================================
// Work Selector Step (update flow with external-user-id)
// ============================================

export function renderWorkSelectorStep(
  list: WorkListState,
  opts: { generalError?: string | null } = {},
): string {
  const generalError = opts.generalError
    ? `<div class="ats-error-message ats-mt-sm">${escapeHtml(opts.generalError)}</div>`
    : '';

  return renderWorkListShell(list, {
    title: 'Select a work to update',
    emptyMessage: 'No works found for this user.',
    row: {
      action: 'toggle-work',
      indicator: (w) => (list.selectedId === w.id ? 'check' : 'none'),
      renderRowBody: (w) => renderWorkDetailPanel(w, list, {
        showSelect: true,
        selected: list.selectedId === w.id,
      }),
    },
    footerSlot: generalError,
  });
}

// ============================================
// Download List Screen
// ============================================

export function renderDownloadListScreen(list: WorkListState): string {
  return renderWorkListShell(list, {
    title: 'Your protected works',
    emptyMessage: 'No works available to download.',
    row: {
      action: 'open-work-detail',
      indicator: () => 'chevron',
    },
  });
}

// ============================================
// Download Detail Screen — per-work version history
// ============================================

function renderVersionCreatorsPanel(entry: VersionCreatorsEntry | undefined): string {
  if (!entry || entry.status === 'idle') {
    return ''; // First expand renders before the fetch settles — show nothing.
  }
  if (entry.status === 'loading') {
    return `
      <div class="ats-version-creators-panel">
        <div class="ats-loading-text">Loading creators…</div>
      </div>
    `;
  }
  if (entry.status === 'error') {
    return `
      <div class="ats-version-creators-panel">
        <div class="ats-alert ats-alert-error">${escapeHtml(entry.error || 'Failed to load creators.')}</div>
      </div>
    `;
  }
  if (entry.creators.length === 0) {
    return `
      <div class="ats-version-creators-panel">
        <div class="ats-version-creators-empty">No creators recorded for this version.</div>
      </div>
    `;
  }
  return `
    <div class="ats-version-creators-panel">
      <table class="ats-version-creators-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Roles</th>
            <th>IPI</th>
            <th>ISNI</th>
          </tr>
        </thead>
        <tbody>
          ${entry.creators.map((c: WorkCreator) => `
            <tr>
              <td>
                <div class="ats-version-creators-name">${escapeHtml(c.fullName)}</div>
                ${c.email ? `<div class="ats-version-creators-email">${escapeHtml(c.email)}</div>` : ''}
              </td>
              <td>${c.roles.length ? escapeHtml(c.roles.join(', ')) : '—'}</td>
              <td class="ats-monospace-sm">${c.ipi ? escapeHtml(c.ipi) : '—'}</td>
              <td class="ats-monospace-sm">${c.isni ? escapeHtml(c.isni) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderWorkVersionCard(
  work: SelectedWork,
  v: WorkVersion,
  downloading: 'asset' | 'certificate' | null | undefined,
  creatorsExpanded: boolean,
  creatorsEntry: VersionCreatorsEntry | undefined,
): string {
  const inFlightAsset = downloading === 'asset';
  const inFlightCert = downloading === 'certificate';
  const assetDisabled = !work.hasFiles;

  const block = v.registeredAtBlock == null ? '—' : String(v.registeredAtBlock);
  // Match the dashboard's FileDownloadLink: the download control is labelled with the
  // actual filename rather than a generic "Download file".
  const downloadLabel = inFlightAsset
    ? 'Preparing…'
    : (v.assetFilename && v.assetFilename.length > 0 ? v.assetFilename : 'Download file');

  return `
    <div class="ats-version-card ${creatorsExpanded ? 'creators-expanded' : ''}">
      <div class="ats-version-card-head">
        <div class="ats-version-card-head-left">
          <span class="ats-version-badge">v${v.version}</span>
          <span class="ats-version-card-date">${formatShortDate(v.registeredAt)}</span>
        </div>
        <div class="ats-version-card-actions">
          <button type="button"
                  class="ats-btn ats-btn-sm ats-btn-primary ats-download-file-btn"
                  data-action="download-version-asset"
                  data-version="${v.version}"
                  title="${escapeHtml(downloadLabel)}"
                  ${inFlightAsset || assetDisabled ? 'disabled' : ''}
                  ${assetDisabled ? 'title="No asset file available for this work"' : ''}>
            ${ICONS.download}
            <span class="ats-download-file-name">${escapeHtml(downloadLabel)}</span>
          </button>
          <button type="button"
                  class="ats-btn ats-btn-sm ats-btn-outline-primary"
                  data-action="download-version-cert"
                  data-version="${v.version}"
                  ${inFlightCert ? 'disabled' : ''}>
            ${ICONS.fileText}
            <span>${inFlightCert ? 'Preparing…' : 'Download certificate'}</span>
          </button>
        </div>
      </div>
      <div class="ats-version-card-grid">
        <div>
          <div class="ats-summary-label">Commitment</div>
          ${renderCopyableHash(v.commitment, 14)}
        </div>
        <div>
          <div class="ats-summary-label ats-summary-label-nowrap">Registered at block</div>
          <div class="ats-summary-value">${escapeHtml(block)}</div>
        </div>
      </div>
      <button type="button"
              class="ats-btn ats-btn-sm ats-btn-outline ats-w-full ats-version-creators-toggle"
              data-action="toggle-version-creators"
              data-version="${v.version}"
              aria-expanded="${creatorsExpanded}">
        <span class="ats-version-creators-chevron ${creatorsExpanded ? 'open' : ''}" aria-hidden="true">${ICONS.chevronRight}</span>
        <span>${creatorsExpanded ? 'Hide creators' : 'Show creators'}</span>
      </button>
      ${creatorsExpanded ? renderVersionCreatorsPanel(creatorsEntry) : ''}
    </div>
  `;
}

export function renderDownloadDetailScreen(state: VersionListState): string {
  const work = state.work;
  const backBtn = `
    <button type="button" class="ats-btn ats-btn-link ats-back-link" data-action="back-to-list">
      ${ICONS.arrowLeft}
      <span>Back to works</span>
    </button>
  `;

  if (!work) {
    return `
      ${backBtn}
      <div class="ats-work-list-empty">Work not found.</div>
    `;
  }

  const title = work.title ? escapeHtml(work.title) : '<em>(untitled)</em>';
  const atsId = work.atsId == null ? '—' : `#${work.atsId}`;

  let body = '';
  if (state.status === 'loading') {
    body = `
      <div class="ats-work-list-empty">
        <div class="ats-spinner" style="width: 28px; height: 28px; border-width: 3px; margin: 0 auto 12px;"></div>
        <div class="ats-loading-text">Loading versions…</div>
      </div>
    `;
  } else if (state.status === 'error') {
    body = `
      <div class="ats-alert ats-alert-error">${escapeHtml(state.error || 'Failed to load versions.')}</div>
      <div class="ats-btn-group ats-btn-group-right ats-mt-md">
        <button type="button" class="ats-btn ats-btn-secondary" data-action="reload-versions">Retry</button>
      </div>
    `;
  } else if (state.status === 'loaded' && state.versions.length === 0) {
    body = `<div class="ats-work-list-empty">No versions found.</div>`;
  } else if (state.status === 'loaded') {
    // Newest first.
    const sorted = [...state.versions].sort((a, b) => b.version - a.version);
    body = `
      <div class="ats-version-list">
        ${sorted.map(v => renderWorkVersionCard(
          work,
          v,
          state.downloading[v.version],
          state.creatorsExpanded[v.version] === true,
          state.creatorsByVersion[v.version],
        )).join('')}
      </div>
    `;
  }

  return `
    ${backBtn}
    <div class="ats-version-header">
      <div class="ats-version-header-title">${title}</div>
      <div class="ats-version-header-meta">
        <span class="ats-work-row-id">${atsId}</span>
        <span class="ats-work-row-version">${state.versions.length || work.latestVersion} version${(state.versions.length || work.latestVersion) === 1 ? '' : 's'}</span>
      </div>
    </div>
    ${body}
  `;
}

