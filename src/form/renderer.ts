import type { FormState, CreatorFormData, WorkType } from './types';
import { CREATOR_ROLES } from './types';

/**
 * Lucide SVG icons (inline for zero dependencies)
 * Icons from https://lucide.dev - MIT License
 */
const LUCIDE_ICONS = {
  // file-plus icon for "New Work"
  filePlus: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/></svg>`,
  // refresh-cw icon for "New Version"
  refreshCw: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  // layers icon for Type step
  layers: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>`,
  // file icon for File step
  file: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  // type icon for Title step
  type: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>`,
  // users icon for Creators step
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  // check-circle icon for Review step
  checkCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
} as const;

/**
 * Get stepper icon for a step ID
 */
function getStepIcon(stepId: string): string {
  switch (stepId) {
    case 'choice': return LUCIDE_ICONS.layers;
    case 'file': return LUCIDE_ICONS.file;
    case 'title': return LUCIDE_ICONS.type;
    case 'creators': return LUCIDE_ICONS.users;
    case 'review': return LUCIDE_ICONS.checkCircle;
    default: return '';
  }
}

/**
 * Form step definitions for New Work flow
 * choice -> file -> title -> creators -> review -> processing -> success
 */
export const FORM_STEPS_NEW_WORK = [
  { id: 'choice', label: 'Type' },
  { id: 'file', label: 'File' },
  { id: 'title', label: 'Title' },
  { id: 'creators', label: 'Creators' },
  { id: 'review', label: 'Review' },
  { id: 'processing', label: 'Process' },
  { id: 'success', label: 'Done' },
] as const;

/**
 * Form step definitions for New Version flow
 * choice -> file (with ATS) -> creators -> review -> processing -> success
 */
export const FORM_STEPS_NEW_VERSION = [
  { id: 'choice', label: 'Type' },
  { id: 'file', label: 'File' },
  { id: 'creators', label: 'Creators' },
  { id: 'review', label: 'Review' },
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
  return `
    <div class="ats-section-title">Choose Protection Type</div>
    <div class="ats-choice-grid">
      <div class="ats-choice-card ${workType === 'new' ? 'selected' : ''}" data-choice="new">
        <div class="ats-choice-icon">${LUCIDE_ICONS.filePlus}</div>
        <div class="ats-choice-title">New Work</div>
        <div class="ats-choice-description">
          Register a brand new creative work that hasn't been protected before.
        </div>
      </div>
      <div class="ats-choice-card ${workType === 'version' ? 'selected' : ''}" data-choice="version">
        <div class="ats-choice-icon">${LUCIDE_ICONS.refreshCw}</div>
        <div class="ats-choice-title">New Version</div>
        <div class="ats-choice-description">
          Register a new version of an existing protected work using your ATS certificate.
        </div>
      </div>
    </div>
    <div class="ats-btn-group ats-btn-group-right">
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" ${!workType ? 'disabled' : ''}>
        Continue
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
    <div class="ats-section-title">Upload Asset File</div>
    <div class="ats-file-drop ${hasFile ? 'has-file' : ''}" id="file-drop-zone">
      <div class="ats-file-drop-icon">${hasFile ? '✓' : '📁'}</div>
      <div class="ats-file-drop-text">
        ${hasFile ? 'File selected' : 'Drag and drop your asset file here'}
      </div>
      <div class="ats-file-drop-hint">
        ${hasFile ? 'Click to change file' : 'or click to browse (any file type)'}
      </div>
      <input type="file" id="file-input" class="ats-hidden" />
    </div>
    ${hasFile && state.file ? `
      <div class="ats-file-info">
        <div class="ats-file-name">${state.file.name}</div>
        <div class="ats-file-size">${formatFileSize(state.file.size)}</div>
        <button type="button" class="ats-btn ats-btn-sm ats-btn-secondary" id="remove-file">✕</button>
      </div>
    ` : ''}
    ${errors.file ? `<div class="ats-error-message">${errors.file}</div>` : ''}

    ${isVersionFlow ? `
      <div class="ats-section-title" style="margin-top: 24px;">Upload Existing ATS Certificate</div>
      <div class="ats-file-drop ${hasAtsFile ? 'has-file' : ''}" id="ats-file-drop-zone">
        <div class="ats-file-drop-icon">${hasAtsFile ? '✓' : '📋'}</div>
        <div class="ats-file-drop-text">
          ${hasAtsFile ? 'Certificate selected' : 'Drag and drop your ATS certificate here'}
        </div>
        <div class="ats-file-drop-hint">
          ${hasAtsFile ? 'Click to change file' : 'or click to browse (.json file)'}
        </div>
        <input type="file" id="ats-file-input" accept=".json,application/json" class="ats-hidden" />
      </div>
      ${hasAtsFile && state.atsFile ? `
        <div class="ats-file-info">
          <div class="ats-file-name">${state.atsFile.name}</div>
          <div class="ats-file-size">${formatFileSize(state.atsFile.size)}</div>
          <button type="button" class="ats-btn ats-btn-sm ats-btn-secondary" id="remove-ats-file">✕</button>
        </div>
      ` : ''}
      ${state.parsedAtsData ? `
        <div class="ats-alert ats-alert-success" style="margin-top: 12px;">
          <strong>Certificate loaded:</strong> "${escapeHtml(state.parsedAtsData.title)}" (v${state.parsedAtsData.versionNumber - 1})
        </div>
      ` : ''}
      ${errors.atsFile ? `<div class="ats-error-message">${errors.atsFile}</div>` : ''}
    ` : ''}

    <div class="ats-btn-group ats-btn-group-between">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn">Back</button>
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" ${!canContinue ? 'disabled' : ''}>
        Continue
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
function renderCreatorForm(creator: CreatorFormData, index: number, errors: Record<string, string> = {}): string {
  return `
    <div class="ats-creator-card" data-creator-index="${index}">
      <div class="ats-creator-header">
        <span class="ats-creator-title">Creator ${index + 1}</span>
        ${index > 0 ? `<button type="button" class="ats-btn ats-btn-sm ats-btn-danger remove-creator" data-index="${index}">Remove</button>` : ''}
      </div>

      <div class="ats-form-group">
        <label class="ats-label ats-label-required">Full Name</label>
        <input
          type="text"
          class="ats-input creator-fullname ${errors.fullName ? 'error' : ''}"
          data-index="${index}"
          placeholder="John Doe"
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
          placeholder="john@example.com"
          value="${escapeHtml(creator.email)}"
          maxlength="255"
        />
        ${errors.email ? `<div class="ats-error-message">${errors.email}</div>` : ''}
      </div>

      <div class="ats-form-group">
        <label class="ats-label ats-label-required">Role(s)</label>
        <div class="ats-checkbox-group">
          ${CREATOR_ROLES.map(role => `
            <label class="ats-checkbox-item ${creator.roles.includes(role) ? 'selected' : ''}">
              <input
                type="checkbox"
                class="creator-role"
                data-index="${index}"
                value="${role}"
                ${creator.roles.includes(role) ? 'checked' : ''}
              />
              ${role}
            </label>
          `).join('')}
        </div>
        ${errors.roles ? `<div class="ats-error-message">${errors.roles}</div>` : ''}
      </div>

      <div class="ats-form-group">
        <label class="ats-label">IPI (Optional)</label>
        <input
          type="text"
          class="ats-input creator-ipi ${errors.ipi ? 'error' : ''}"
          data-index="${index}"
          placeholder="00123456789"
          value="${escapeHtml(creator.ipi)}"
          maxlength="11"
          inputmode="numeric"
          pattern="[0-9]*"
        />
        <div class="ats-help-text">1-11 digits, numbers only (letters will be filtered)</div>
        ${errors.ipi ? `<div class="ats-error-message">${errors.ipi}</div>` : ''}
      </div>

      <div class="ats-form-group">
        <label class="ats-label">ISNI (Optional)</label>
        <input
          type="text"
          class="ats-input creator-isni ${errors.isni ? 'error' : ''}"
          data-index="${index}"
          placeholder="0000000000000000"
          value="${escapeHtml(creator.isni)}"
          maxlength="16"
        />
        <div class="ats-help-text">16 characters: 15 digits + check digit (0-9 or X)</div>
        ${errors.isni ? `<div class="ats-error-message">${errors.isni}</div>` : ''}
      </div>
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
      ${state.creators.map((creator, index) => renderCreatorForm(creator, index, errors[index] || {})).join('')}
    </div>
    ${state.creators.length < 20 ? `
      <button type="button" class="ats-btn ats-btn-secondary" id="add-creator" style="margin-top: 16px;">
        + Add Creator
      </button>
    ` : ''}
    <div class="ats-btn-group ats-btn-group-between">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn">Back</button>
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn">Continue</button>
    </div>
  `;
}

/**
 * Render review step
 */
export function renderReviewStep(state: FormState): string {
  const isVersionFlow = state.workType === 'version';
  const versionInfo = state.parsedAtsData
    ? ` (Version ${state.parsedAtsData.versionNumber})`
    : '';

  return `
    <div class="ats-section-title">Review Your Submission</div>
    <div class="ats-summary">
      ${isVersionFlow && state.parsedAtsData ? `
        <div class="ats-summary-section">
          <div class="ats-summary-label">Registration Type</div>
          <div class="ats-summary-value">New Version of existing work (ATS ID: ${state.parsedAtsData.atsId})</div>
        </div>
      ` : `
        <div class="ats-summary-section">
          <div class="ats-summary-label">Registration Type</div>
          <div class="ats-summary-value">New Work</div>
        </div>
      `}
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
    <div class="ats-alert ats-alert-warning" style="margin-top: 16px;">
      Please review all information carefully. Once submitted, this data will be permanently recorded on the blockchain.
    </div>
    <div class="ats-btn-group ats-btn-group-between">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn">Back</button>
      <button type="button" class="ats-btn ats-btn-primary ats-btn-lg" id="submit-btn">
        Register Work
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
export function renderSuccessStep(atsId: number, txHash: string, blockNumber: number): string {
  return `
    <div class="ats-success-container">
      <div class="ats-success-icon">✓</div>
      <div class="ats-success-title">Work Registered Successfully!</div>
      <div class="ats-success-message">
        Your work has been permanently recorded on the Allfeat blockchain.
      </div>
      <div class="ats-summary" style="text-align: left; margin-bottom: 24px;">
        <div class="ats-summary-section">
          <div class="ats-summary-label">ATS ID</div>
          <div class="ats-summary-value">${atsId}</div>
        </div>
        <div class="ats-summary-section">
          <div class="ats-summary-label">Transaction Hash</div>
          <div class="ats-summary-value" style="font-size: 12px; word-break: break-all;">${txHash}</div>
        </div>
        <div class="ats-summary-section">
          <div class="ats-summary-label">Block Number</div>
          <div class="ats-summary-value">${blockNumber}</div>
        </div>
      </div>
      <button type="button" class="ats-btn ats-btn-primary ats-btn-lg" id="download-btn">
        Download Certificate
      </button>
      <button type="button" class="ats-btn ats-btn-secondary" id="reset-btn" style="margin-top: 12px;">
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
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
