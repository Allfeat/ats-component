import type { FormState, CreatorFormData, WorkType } from './types';
import type { PrepareRegistrationResponse } from '../api/types';
import { ApiErrorCode } from '../api/types';
import { CREATOR_ROLES } from './types';

/**
 * Lucide SVG icons (inline for zero dependencies)
 * Icons from https://lucide.dev - MIT License
 */
const LUCIDE_ICONS = {
  // file-text icon for Protection Choice and Title steps
  fileText: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
  // upload icon for File Selection step and file drop zones
  upload: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
  // users icon for Creators step
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  // clipboard-list icon for Summary step
  clipboardList: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
  // plus icon for "Protect a new work" card
  plus: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  // refresh-cw icon for "Protect a new version" card
  refreshCw: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  // circle icon for unselected indicator
  circle: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`,
  // check-circle icon for selected indicator (filled)
  checkCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
  // arrow-right icon for Continue button
  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
  // arrow-left icon for Back button
  arrowLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
} as const;

/**
 * Get stepper icon for a step ID
 */
function getStepIcon(stepId: string): string {
  switch (stepId) {
    case 'choice': return LUCIDE_ICONS.fileText;
    case 'file': return LUCIDE_ICONS.upload;
    case 'title': return LUCIDE_ICONS.fileText;
    case 'creators': return LUCIDE_ICONS.users;
    case 'review': return LUCIDE_ICONS.clipboardList;
    default: return '';
  }
}

/**
 * Form step definitions for New Work flow
 * choice -> file -> title -> creators -> review -> processing -> success
 */
export const FORM_STEPS_NEW_WORK = [
  { id: 'choice', label: 'Protection Choice' },
  { id: 'file', label: 'File Selection' },
  { id: 'title', label: 'Title of the work' },
  { id: 'creators', label: 'Creators' },
  { id: 'review', label: 'Summary' },
  { id: 'processing', label: 'Process' },
  { id: 'success', label: 'Done' },
] as const;

/**
 * Form step definitions for New Version flow
 * choice -> file (with ATS) -> creators -> review -> processing -> success
 */
export const FORM_STEPS_NEW_VERSION = [
  { id: 'choice', label: 'Protection Choice' },
  { id: 'file', label: 'File Selection' },
  { id: 'creators', label: 'Creators' },
  { id: 'review', label: 'Summary' },
  { id: 'processing', label: 'Process' },
  { id: 'success', label: 'Done' },
] as const;

/**
 * Get form steps based on work type
 */
export function getFormSteps(workType: WorkType) {
  return workType === 'version' ? FORM_STEPS_NEW_VERSION : FORM_STEPS_NEW_WORK;
}

// For backward compatibility, default to new work steps
export const FORM_STEPS = FORM_STEPS_NEW_WORK;

export type StepId = typeof FORM_STEPS_NEW_WORK[number]['id'] | typeof FORM_STEPS_NEW_VERSION[number]['id'];

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Render the step indicator
 */
export function renderStepIndicator(currentStep: number, workType: WorkType = null): string {
  const steps = getFormSteps(workType);
  // Show steps except 'processing' and 'success' (last 2)
  const visibleSteps = steps.slice(0, -2);

  return `
    <div class="ats-steps">
      ${visibleSteps.map((step, index) => `
        <div class="ats-step ${index < currentStep ? 'completed' : ''} ${index === currentStep ? 'active' : ''}">
          <div class="ats-step-number">${index < currentStep ? '✓' : getStepIcon(step.id)}</div>
          <div class="ats-step-label">${step.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render protection choice step (New Work vs New Version)
 */
export function renderProtectionChoiceStep(workType: WorkType): string {
  const isNewSelected = workType === 'new';
  const isVersionSelected = workType === 'version';

  return `
    <div class="ats-section-title">Protection Choice</div>
    <div class="ats-choice-grid">
      <div class="ats-choice-card ${isNewSelected ? 'selected' : ''}" data-choice="new">
        <div class="ats-choice-icon">
          ${LUCIDE_ICONS.plus}
        </div>
        <div class="ats-choice-content">
          <div class="ats-choice-title">Protect a new work</div>
          <div class="ats-choice-description">
            Register a new musical work on the blockchain
          </div>
        </div>
        <div class="ats-choice-indicator">
          ${isNewSelected ? LUCIDE_ICONS.checkCircle : LUCIDE_ICONS.circle}
        </div>
      </div>
      <div class="ats-choice-card ${isVersionSelected ? 'selected' : ''}" data-choice="version">
        <div class="ats-choice-icon">
          ${LUCIDE_ICONS.refreshCw}
        </div>
        <div class="ats-choice-content">
          <div class="ats-choice-title">Protect a new version</div>
          <div class="ats-choice-description">
            Add a new version to an already protected work
          </div>
        </div>
        <div class="ats-choice-indicator">
          ${isVersionSelected ? LUCIDE_ICONS.checkCircle : LUCIDE_ICONS.circle}
        </div>
      </div>
    </div>
    <div class="ats-btn-group ats-btn-group-right">
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" ${!workType ? 'disabled' : ''}>
        Continue
        ${LUCIDE_ICONS.arrowRight}
      </button>
    </div>
  `;
}

/**
 * Render file upload step
 */
export function renderFileStep(state: FormState, errors: { file?: string; atsFile?: string } = {}): string {
  const hasFile = state.file !== null;
  const hasAtsFile = state.atsFile !== null;
  const isVersionFlow = state.workType === 'version';

  // For version flow, require both files; for new work, only asset file
  const canContinue = isVersionFlow ? (hasFile && hasAtsFile) : hasFile;

  return `
    <div class="ats-section-title ats-section-title-centered">File Selection</div>
    <div class="ats-file-drop ${hasFile ? 'has-file' : ''}" id="file-drop-zone">
      <div class="ats-file-drop-icon">${LUCIDE_ICONS.upload}</div>
      ${hasFile && state.file ? `
        <div class="ats-file-drop-filename">${state.file.name}</div>
        <div class="ats-file-drop-size">${formatFileSize(state.file.size)}</div>
        <button type="button" class="ats-btn ats-btn-outline-destructive" id="remove-file">Remove File</button>
      ` : `
        <div class="ats-file-drop-text"><strong>Drag & drop or select your file</strong></div>
      `}
      <input type="file" id="file-input" class="ats-hidden" />
    </div>
    <div class="ats-file-help-text">All file types are accepted.</div>
    ${errors.file ? `<div class="ats-error-message">${errors.file}</div>` : ''}

    ${isVersionFlow ? `
      <div class="ats-section-title ats-section-title-centered" style="margin-top: 24px;">ATS Certificate</div>
      <div class="ats-file-drop ${hasAtsFile ? 'has-file' : ''}" id="ats-file-drop-zone">
        <div class="ats-file-drop-icon">${LUCIDE_ICONS.upload}</div>
        ${hasAtsFile && state.atsFile ? `
          <div class="ats-file-drop-filename">${state.atsFile.name}</div>
          <div class="ats-file-drop-size">${formatFileSize(state.atsFile.size)}</div>
          <button type="button" class="ats-btn ats-btn-outline-destructive" id="remove-ats-file">Remove File</button>
        ` : `
          <div class="ats-file-drop-text"><strong>Drag & drop or select your file</strong></div>
        `}
        <input type="file" id="ats-file-input" accept=".json,application/json" class="ats-hidden" />
      </div>
      <div class="ats-file-help-text">JSON files only (.json)</div>
      ${errors.atsFile ? `<div class="ats-error-message">${errors.atsFile}</div>` : ''}
    ` : ''}

    <div class="ats-btn-group ats-btn-group-center">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn">
        ${LUCIDE_ICONS.arrowLeft}
        Back
      </button>
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" ${!canContinue ? 'disabled' : ''}>
        Next
        ${LUCIDE_ICONS.arrowRight}
      </button>
    </div>
  `;
}

/**
 * Render work title step (renamed from details, ISWC removed)
 */
export function renderTitleStep(state: FormState, errors: Record<string, string> = {}): string {
  return `
    <div class="ats-section-title">Title of the Work</div>
    <div class="ats-form-group">
      <label class="ats-label ats-label-required" for="title">Title</label>
      <input
        type="text"
        id="title"
        class="ats-input ${errors.title ? 'error' : ''}"
        placeholder="Enter the title of your work"
        value="${escapeHtml(state.title)}"
        maxlength="255"
      />
${errors.title ? `<div class="ats-error-message">${errors.title}</div>` : ''}
    </div>
    <div class="ats-btn-group ats-btn-group-between">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn">Back</button>
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn">Continue</button>
    </div>
  `;
}

// Keep backward compatibility alias
export const renderDetailsStep = renderTitleStep;

/**
 * Render a single creator form
 */
function renderCreatorForm(creator: CreatorFormData, index: number, creatorsCount: number, errors: Record<string, string> = {}): string {
  const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

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

      <div class="ats-form-group" style="margin-top: 16px;">
        <label class="ats-label ats-label-required">Roles</label>
        <div class="ats-checkbox-group">
          ${CREATOR_ROLES.map(role => `
            <label class="ats-role-badge ${creator.roles.includes(role) ? 'selected' : ''}">
              <input
                type="checkbox"
                class="creator-role"
                data-index="${index}"
                value="${role}"
                ${creator.roles.includes(role) ? 'checked' : ''}
              />
              ${creator.roles.includes(role) ? `<span class="ats-role-check">${checkIcon}</span>` : ''}
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
          <div class="ats-help-text">Format: 1-11 digits (IPI Code or ISNI required)</div>
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
          <div class="ats-help-text">Format: 16 characters: 15 digits and one digit or X (IPI Code or ISNI required)</div>
          ${errors.isni ? `<div class="ats-error-message">${errors.isni}</div>` : ''}
        </div>
      </div>

      ${creatorsCount > 1 ? `
        <div class="ats-creator-remove-container">
          <button type="button" class="ats-btn ats-btn-outline-destructive remove-creator" style="width: 100%;" data-index="${index}">
            Remove
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render creators step
 */
export function renderCreatorsStep(state: FormState, errors: Record<string, Record<string, string>> = {}): string {
  return `
    <div class="ats-section-title">Creators</div>
    <div class="ats-creators-list">
      ${state.creators.map((creator, index) => renderCreatorForm(creator, index, state.creators.length, errors[index] || {})).join('')}
    </div>
    ${state.creators.length < 20 ? `
      <button type="button" class="ats-btn ats-btn-outline-primary" id="add-creator" style="margin-top: 16px;">
        Add Creator (${state.creators.length}/20)
      </button>
    ` : ''}
    <div class="ats-btn-group ats-btn-group-between">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn">Back</button>
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn">Continue</button>
    </div>
  `;
}

/**
 * Render validation status for review step
 */
function renderValidationStatus(
  isPreparing: boolean,
  isAtsValid: boolean,
  preparedJob: PrepareRegistrationResponse | null
): string {
  if (isPreparing) {
    return `
      <div class="ats-validation ats-validation-pending">
        <div class="ats-validation-spinner"></div>
        <span>Validating your ATS...</span>
      </div>
    `;
  }

  if (isAtsValid && preparedJob) {
    return `
      <div class="ats-validation ats-validation-success">
        <div class="ats-validation-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <span class="ats-validation-message">Your ATS is valid and ready to be created</span>
      </div>
    `;
  }

  return '';
}

/**
 * Render review step
 */
export function renderReviewStep(
  state: FormState,
  isPreparing: boolean = false,
  isAtsValid: boolean = false,
  preparedJob: PrepareRegistrationResponse | null = null
): string {
  const versionInfo = state.parsedAtsData
    ? ` (Version ${state.parsedAtsData.versionNumber})`
    : '';

  const canSubmit = isAtsValid && preparedJob && !isPreparing;

  return `
    <div class="ats-section-title">Review Your Submission</div>
    <div class="ats-summary">
      <div class="ats-summary-section">
        <div class="ats-summary-label">Asset File</div>
        <div class="ats-summary-value">${state.file?.name || 'No file selected'}</div>
      </div>
      <div class="ats-summary-section">
        <div class="ats-summary-label">Title${versionInfo}</div>
        <div class="ats-summary-value">${escapeHtml(state.title)}</div>
      </div>
      <div class="ats-summary-section">
        <div class="ats-summary-label">Creators (${state.creators.length})</div>
        ${state.creators.map((creator, index) => `
          <div class="ats-summary-value" style="margin-top: ${index > 0 ? '8px' : '0'}; padding-left: 8px; border-left: 2px solid var(--ats-primary);">
            <strong>${escapeHtml(creator.fullName)}</strong><br />
            ${escapeHtml(creator.email)}<br />
            <em>${creator.roles.join(', ')}</em>
          </div>
        `).join('')}
      </div>
    </div>

    ${renderValidationStatus(isPreparing, isAtsValid, preparedJob)}

    <div class="ats-btn-group ats-btn-group-between">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn">Back</button>
      <button type="button" class="ats-btn ats-btn-primary ats-btn-lg" id="submit-btn" ${!canSubmit ? 'disabled' : ''}>
        Create my ATS
      </button>
    </div>
  `;
}

/**
 * Render processing step
 */
export function renderProcessingStep(stage: string, progress: number, message?: string): string {
  return `
    <div class="ats-section-title">Processing Your Submission</div>
    <div style="text-align: center; padding: 32px 0;">
      <div class="ats-spinner" style="width: 48px; height: 48px; border-width: 4px; margin: 0 auto 24px;"></div>
      <div class="ats-progress" style="max-width: 300px; margin: 0 auto;">
        <div class="ats-progress-bar" style="width: ${progress}%;"></div>
      </div>
      <div class="ats-progress-text" style="margin-top: 8px;">${progress}%</div>
      <div class="ats-loading-text" style="margin-top: 16px;">
        ${message || getDefaultProcessingMessage(stage)}
      </div>
    </div>
  `;
}

/**
 * Get default processing message for stage
 */
function getDefaultProcessingMessage(stage: string): string {
  switch (stage) {
    case 'bundle':
      return 'Computing cryptographic hashes...';
    case 'proof':
      return 'Generating zero-knowledge proof...';
    case 'verify':
      return 'Verifying proof...';
    case 'submit':
      return 'Submitting to blockchain...';
    case 'certificate':
      return 'Generating certificate...';
    default:
      return 'Processing...';
  }
}

/**
 * Render success step
 */
export function renderSuccessStep(_atsId: number, _txHash: string, _blockNumber: number): string {
  return `
    <div class="ats-success-container">
      <div class="ats-success-icon-circle">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="ats-success-title">Work Protected!</div>
      <div class="ats-success-message">
        Your work has been successfully submitted and permanently protected on the blockchain.
      </div>
      <div class="ats-success-message-secondary">
        The information is now immutable and cannot be changed.
      </div>
      <button type="button" class="ats-btn ats-btn-primary ats-btn-lg" id="download-btn">
        Download .ZIP File
      </button>
      <div class="ats-success-download-description">
        Download the .ZIP file containing your PDF certificate of anteriority and a JSON file that will allow you to protect multiple versions of the same work if needed. The download includes JSON certificate and PDF files.
      </div>
      <button type="button" class="ats-btn ats-btn-secondary" id="reset-btn">
        Register Another Work
      </button>
    </div>
  `;
}

/**
 * Render error state
 */
export function renderErrorState(error: string, stage?: string): string {
  return `
    <div class="ats-alert ats-alert-error">
      <strong>Error${stage ? ` during ${stage}` : ''}:</strong><br />
      ${escapeHtml(error)}
    </div>
    <div class="ats-btn-group ats-btn-group-right">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn">Go Back</button>
    </div>
  `;
}

/**
 * Render fatal authentication error (replaces entire component)
 * Used for 401 (invalid site-key) and 403 (domain not registered) errors
 */
export function renderFatalAuthError(code: ApiErrorCode, message: string): string {
  const isInvalidKey = code === ApiErrorCode.INVALID_SITE_KEY;

  // Lock icon for invalid key, alert-triangle for domain error
  const icon = isInvalidKey
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;

  const title = isInvalidKey ? 'Invalid Site Key' : 'Domain Not Registered';

  return `
    <div class="ats-fatal-error">
      <div class="ats-fatal-error-icon">
        ${icon}
      </div>
      <div class="ats-fatal-error-title">${title}</div>
      <div class="ats-fatal-error-message">${escapeHtml(message)}</div>
      <div class="ats-fatal-error-code">Error code: ${code}</div>
    </div>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
