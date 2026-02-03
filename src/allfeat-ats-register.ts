import { initWasm, buildBundle, prove, verify } from './wasm/loader';
import type { ZkpBundle, ZkpCreator } from './wasm/types';
import { submitAts, DEFAULT_API_ENDPOINT, isValidApiKeyFormat } from './api/client';
import { AtsApiException } from './api/types';
import { FormState, createDefaultFormState, createEmptyCreator, WorkType } from './form/types';
import { creatorSchema, isValidAtsFile, parseAtsFile } from './form/schema';
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
  getFormSteps,
} from './form/renderer';
import {
  dispatchZkpComputing,
  dispatchBlockchainSubmitting,
  dispatchBlockchainSuccess,
  dispatchZipReady,
  dispatchError,
  dispatchStepChange,
} from './utils/events';
import { generateCertificatePackage, downloadBlob, CertificatePackageData } from './certificate/zip-packager';

// Import proving and verification keys (CommonJS modules)
// @ts-ignore - CommonJS import
import pkModule from './constants/pk.js';
// @ts-ignore - CommonJS import
import vkModule from './constants/vk.js';

const PK: string = pkModule.PK;
const VK: string = vkModule.VK;

// Import styles
import styles from './styles/component.css';

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
  zkpBundle: ZkpBundle | null;
  apiResponse: {
    atsId: number;
    txHash: string;
    blockNumber: number;
    blockTimestamp?: string;
  } | null;
  error: string | null;
  errorStage?: string;
}

/**
 * Allfeat ATS Register Custom Element
 *
 * Usage:
 * ```html
 * <allfeat-ats-register
 *   api-key="aft_..."
 *   api-endpoint="https://api.allfeat.io"
 *   theme="light"
 * ></allfeat-ats-register>
 * ```
 */
export class AllfeatAtsRegister extends HTMLElement {
  static observedAttributes = ['api-key', 'wasm-path', 'api-endpoint', 'theme', 'lang'];

  private shadow: ShadowRoot;
  private state: ComponentState;
  private wasmInitialized = false;

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
      zkpBundle: null,
      apiResponse: null,
      error: null,
    };
  }

  // ============================================
  // Lifecycle
  // ============================================

  async connectedCallback() {
    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    this.shadow.appendChild(styleEl);

    // Create container
    const container = document.createElement('div');
    container.className = 'ats-container';
    container.setAttribute('part', 'container');
    this.shadow.appendChild(container);

    // Initialize WASM
    try {
      await initWasm();
      this.wasmInitialized = true;
    } catch (error) {
      console.error('Failed to initialize WASM:', error);
      dispatchError(this, {
        stage: 'wasm-init',
        error: 'Failed to initialize cryptographic module',
        details: error,
      });
    }

    // Render initial state
    this.render();
  }

  disconnectedCallback() {
    // Cleanup if needed
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;

    switch (name) {
      case 'theme':
        // Theme is handled via CSS :host([theme="dark"])
        break;
      case 'api-key':
        // Validate API key format
        if (newValue && !isValidApiKeyFormat(newValue)) {
          console.warn('Invalid API key format. Expected: aft_<64-hex-chars>');
        }
        this.render();
        break;
    }
  }

  // ============================================
  // Getters
  // ============================================

  get apiKey(): string {
    return this.getAttribute('api-key') || '';
  }

  get apiEndpoint(): string {
    return this.getAttribute('api-endpoint') || DEFAULT_API_ENDPOINT;
  }

  get theme(): 'light' | 'dark' {
    return (this.getAttribute('theme') as 'light' | 'dark') || 'light';
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
    this.state = {
      currentStep: 0,
      formState: createDefaultFormState(),
      formErrors: {},
      isLoading: false,
      processingStage: '',
      processingProgress: 0,
      zkpBundle: null,
      apiResponse: null,
      error: null,
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
  // Rendering
  // ============================================

  private render(): void {
    const container = this.shadow.querySelector('.ats-container');
    if (!container) return;

    // Check for API key
    if (!this.apiKey) {
      container.innerHTML = `
        <div class="ats-alert ats-alert-error">
          <strong>Configuration Error:</strong><br />
          API key is required. Please set the <code>api-key</code> attribute.
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
          content += renderReviewStep(this.state.formState);
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
              this.state.apiResponse.blockNumber
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
        const label = target.closest('.ats-checkbox-item');
        if (label) {
          label.classList.toggle('selected', target.checked);
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
        if (idx > 0) {
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
    // Accept any file type (no validation needed)
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

    // Parse the ATS certificate
    const result = await parseAtsFile(file);

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
    this.render();

    const steps = getFormSteps(this.state.formState.workType);
    dispatchStepChange(this, {
      step: this.state.currentStep,
      stepName: steps[this.state.currentStep]?.id || 'unknown',
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

  private async handleSubmit(): Promise<void> {
    if (!this.wasmInitialized) {
      this.state.error = 'Cryptographic module not initialized. Please refresh the page.';
      this.state.errorStage = 'wasm-init';
      this.render();
      return;
    }

    const { formState } = this.state;
    const steps = getFormSteps(formState.workType);

    // Move to processing step
    const processingIndex = steps.findIndex(s => s.id === 'processing');
    this.state.currentStep = processingIndex;
    this.state.processingStage = 'bundle';
    this.state.processingProgress = 0;
    this.render();

    try {
      // Read file bytes
      const fileBuffer = await formState.file!.arrayBuffer();
      const audioBytes = new Uint8Array(fileBuffer);

      // Prepare creators for WASM
      const zkpCreators: ZkpCreator[] = formState.creators.map((c) => ({
        fullName: c.fullName,
        email: c.email,
        roles: c.roles,
      }));

      // Get timestamp
      const timestamp = BigInt(Math.floor(Date.now() / 1000));

      // Stage 1: Build bundle
      dispatchZkpComputing(this, { progress: 10, stage: 'bundle' });
      this.updateProgress('bundle', 10, 'Computing cryptographic hashes...');

      const { bundle } = buildBundle(formState.title, audioBytes, zkpCreators, timestamp);

      this.updateProgress('bundle', 30, 'Bundle created successfully');

      // Stage 2: Generate proof
      dispatchZkpComputing(this, { progress: 40, stage: 'proof' });
      this.updateProgress('proof', 40, 'Generating zero-knowledge proof...');

      const publics = [
        bundle.hash_title,
        bundle.hash_audio,
        bundle.hash_creators,
        bundle.commitment,
        bundle.timestamp,
        bundle.nullifier,
      ];

      const { proof, publics: proofsPublics } = prove(PK, bundle.secret, publics);

      this.updateProgress('proof', 60, 'Proof generated successfully');

      // Stage 3: Verify proof
      dispatchZkpComputing(this, { progress: 70, stage: 'verify' });
      this.updateProgress('verify', 70, 'Verifying proof...');

      const isValid = verify(VK, proof, proofsPublics);

      if (!isValid) {
        throw new Error('Proof verification failed');
      }

      this.updateProgress('verify', 80, 'Proof verified successfully');

      // Store ZKP bundle
      this.state.zkpBundle = {
        secret: bundle.secret,
        hash_title: bundle.hash_title,
        hash_audio: bundle.hash_audio,
        hash_creators: bundle.hash_creators,
        commitment: bundle.commitment,
        timestamp: bundle.timestamp,
        nullifier: bundle.nullifier,
        proof: proof,
      };

      // Stage 4: Submit to API
      dispatchBlockchainSubmitting(this, { commitment: bundle.commitment });
      this.updateProgress('submit', 85, 'Submitting to blockchain...');

      const apiResponse = await submitAts(this.apiKey, bundle.commitment, this.apiEndpoint);

      this.updateProgress('submit', 95, 'Transaction confirmed');

      // Store API response
      this.state.apiResponse = {
        atsId: apiResponse.ats_id,
        txHash: apiResponse.tx_hash,
        blockNumber: apiResponse.block_number,
        blockTimestamp: new Date().toISOString(),
      };

      // Dispatch success event
      dispatchBlockchainSuccess(this, {
        atsId: apiResponse.ats_id,
        txHash: apiResponse.tx_hash,
        blockNumber: apiResponse.block_number,
        message: apiResponse.message,
      });

      // Move to success step
      const successIndex = steps.findIndex(s => s.id === 'success');
      this.state.currentStep = successIndex;
      this.state.processingProgress = 100;
      this.render();

    } catch (error) {
      console.error('Submission error:', error);

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
        stage: errorStage as 'wasm-init' | 'validation' | 'zkp' | 'api' | 'certificate' | 'unknown',
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

  private async handleDownload(): Promise<void> {
    if (!this.state.zkpBundle || !this.state.apiResponse) {
      return;
    }

    const { formState, zkpBundle, apiResponse } = this.state;

    try {
      const packageData: CertificatePackageData = {
        title: formState.title,
        assetFilename: formState.file?.name || 'unknown',
        creators: formState.creators,
        atsId: apiResponse.atsId,
        versionNumber: 1,
        txHash: apiResponse.txHash,
        blockNumber: apiResponse.blockNumber,
        blockTimestamp: apiResponse.blockTimestamp,
        zkpBundle: zkpBundle,
        explorerUrl: `https://polkadot.js.org/apps/?rpc=${encodeURIComponent('wss://node-dev.allfeat.io')}#/explorer/query/${apiResponse.txHash}`,
      };

      const result = await generateCertificatePackage(packageData);

      // Dispatch zip ready event
      dispatchZipReady(this, {
        blob: result.zipBlob,
        filename: result.zipFilename,
        pdfGenerated: result.pdfGenerated,
      });

      // Download the file
      downloadBlob(result.zipBlob, result.zipFilename);

    } catch (error) {
      console.error('Certificate generation error:', error);
      dispatchError(this, {
        stage: 'certificate',
        error: 'Failed to generate certificate',
        details: error,
      });
    }
  }
}

// Register the custom element
customElements.define('allfeat-ats-register', AllfeatAtsRegister);
