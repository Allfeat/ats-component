/**
 * Creator form data
 */
export interface CreatorFormData {
  fullName: string;
  email: string;
  roles: string[];
  ipi: string;
  isni: string;
}

/**
 * Work form data
 */
export interface WorkFormData {
  title: string;
  creators: CreatorFormData[];
}

/**
 * Work type for protection flow
 */
export type WorkType = 'new' | 'version' | null;

/**
 * Parsed ATS certificate data (from existing certificate JSON)
 */
export interface ParsedAtsData {
  title: string;
  creators: CreatorFormData[];
  atsId: number;
  versionNumber: number;
}

/**
 * Complete form state
 */
export interface FormState {
  workType: WorkType;
  file: File | null;
  atsFile: File | null;
  parsedAtsData: ParsedAtsData | null;
  title: string;
  creators: CreatorFormData[];
}

/**
 * Form validation errors
 */
export interface FormErrors {
  workType?: string;
  file?: string;
  atsFile?: string;
  title?: string;
  creators?: {
    [index: number]: {
      fullName?: string;
      email?: string;
      roles?: string;
      ipi?: string;
      isni?: string;
    };
  };
  general?: string;
}

/**
 * Available creator roles
 */
export const CREATOR_ROLES = [
  'Author',
  'Composer',
  'Arranger',
  'Adapter',
] as const;

export type CreatorRole = typeof CREATOR_ROLES[number];

/**
 * Create default empty creator
 */
export function createEmptyCreator(): CreatorFormData {
  return {
    fullName: '',
    email: '',
    roles: [],
    ipi: '',
    isni: '',
  };
}

/**
 * Create default form state
 */
export function createDefaultFormState(): FormState {
  return {
    workType: null,
    file: null,
    atsFile: null,
    parsedAtsData: null,
    title: '',
    creators: [createEmptyCreator()],
  };
}
