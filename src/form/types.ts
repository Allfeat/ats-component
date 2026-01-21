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
  iswc?: string;
  creators: CreatorFormData[];
}

/**
 * Complete form state
 */
export interface FormState {
  file: File | null;
  title: string;
  iswc: string;
  creators: CreatorFormData[];
}

/**
 * Form validation errors
 */
export interface FormErrors {
  file?: string;
  title?: string;
  iswc?: string;
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
  'Performer',
  'Producer',
  'Arranger',
  'Engineer',
  'Lyricist',
  'Publisher',
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
    file: null,
    title: '',
    iswc: '',
    creators: [createEmptyCreator()],
  };
}
