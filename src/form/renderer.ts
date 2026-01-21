import type { FormState, CreatorFormData } from './types';
import { CREATOR_ROLES } from './types';

/**
 * Form step definitions
 */
export const FORM_STEPS = [
  { id: 'file', label: 'File' },
  { id: 'details', label: 'Details' },
  { id: 'creators', label: 'Creators' },
  { id: 'review', label: 'Review' },
  { id: 'processing', label: 'Process' },
  { id: 'success', label: 'Done' },
] as const;

export type StepId = typeof FORM_STEPS[number]['id'];

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
export function renderStepIndicator(currentStep: number): string {
  return `
    <div class="ats-steps">
      ${FORM_STEPS.slice(0, -1).map((step, index) => `
        <div class="ats-step ${index < currentStep ? 'completed' : ''} ${index === currentStep ? 'active' : ''}">
          <div class="ats-step-number">${index < currentStep ? '✓' : index + 1}</div>
          <div class="ats-step-label">${step.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render file upload step
 */
export function renderFileStep(state: FormState, error?: string): string {
  const hasFile = state.file !== null;

  return `
    <div class="ats-section-title">Upload Audio File</div>
    <div class="ats-file-drop ${hasFile ? 'has-file' : ''}" id="file-drop-zone">
      <div class="ats-file-drop-icon">${hasFile ? '✓' : '📁'}</div>
      <div class="ats-file-drop-text">
        ${hasFile ? 'File selected' : 'Drag and drop your audio file here'}
      </div>
      <div class="ats-file-drop-hint">
        ${hasFile ? 'Click to change file' : 'or click to browse (MP3, WAV, FLAC, etc.)'}
      </div>
      <input type="file" id="file-input" accept="audio/*" class="ats-hidden" />
    </div>
    ${hasFile && state.file ? `
      <div class="ats-file-info">
        <div class="ats-file-name">${state.file.name}</div>
        <div class="ats-file-size">${formatFileSize(state.file.size)}</div>
        <button type="button" class="ats-btn ats-btn-sm ats-btn-secondary" id="remove-file">✕</button>
      </div>
    ` : ''}
    ${error ? `<div class="ats-error-message">${error}</div>` : ''}
    <div class="ats-btn-group ats-btn-group-right">
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn" ${!hasFile ? 'disabled' : ''}>
        Continue
      </button>
    </div>
  `;
}

/**
 * Render work details step
 */
export function renderDetailsStep(state: FormState, errors: Record<string, string> = {}): string {
  return `
    <div class="ats-section-title">Work Details</div>
    <div class="ats-form-group">
      <label class="ats-label ats-label-required" for="title">Title of the Work</label>
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
    <div class="ats-form-group">
      <label class="ats-label" for="iswc">ISWC (Optional)</label>
      <input
        type="text"
        id="iswc"
        class="ats-input ${errors.iswc ? 'error' : ''}"
        placeholder="T0123456789"
        value="${escapeHtml(state.iswc)}"
        maxlength="11"
      />
      <div class="ats-help-text">International Standard Musical Work Code</div>
      ${errors.iswc ? `<div class="ats-error-message">${errors.iswc}</div>` : ''}
    </div>
    <div class="ats-btn-group ats-btn-group-between">
      <button type="button" class="ats-btn ats-btn-secondary" id="back-btn">Back</button>
      <button type="button" class="ats-btn ats-btn-primary" id="next-btn">Continue</button>
    </div>
  `;
}

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
        />
        <div class="ats-help-text">1-11 digits, numbers only</div>
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
        <div class="ats-help-text">16 characters (15 digits + check digit/X)</div>
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
  return `
    <div class="ats-section-title">Review Your Submission</div>
    <div class="ats-summary">
      <div class="ats-summary-section">
        <div class="ats-summary-label">File</div>
        <div class="ats-summary-value">${state.file?.name || 'No file selected'}</div>
      </div>
      <div class="ats-summary-section">
        <div class="ats-summary-label">Title</div>
        <div class="ats-summary-value">${escapeHtml(state.title)}</div>
      </div>
      ${state.iswc ? `
        <div class="ats-summary-section">
          <div class="ats-summary-label">ISWC</div>
          <div class="ats-summary-value">${escapeHtml(state.iswc)}</div>
        </div>
      ` : ''}
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
