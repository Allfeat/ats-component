import { z } from 'zod';

/**
 * Error messages for form validation
 * These can be overridden for i18n support
 */
export const defaultErrorMessages = {
  // File errors
  fileRequired: 'Please select an asset file',

  // ATS file errors
  atsFileRequired: 'Please upload your existing ATS certificate',
  atsFileInvalidType: 'Please select a valid ATS certificate (.json)',
  atsFileInvalidStructure: 'Invalid ATS certificate structure',

  // Title errors
  titleRequired: 'Title is required',
  titleMaxLength: 'Title must be 255 characters or less',

  // Creator errors
  fullNameRequired: 'Full name is required',
  fullNameMaxLength: 'Full name must be 255 characters or less',
  emailRequired: 'Email is required',
  emailInvalid: 'Please enter a valid email address',
  emailMaxLength: 'Email must be 255 characters or less',
  rolesRequired: 'At least one role is required',
  rolesMaxCount: 'Maximum 10 roles allowed',

  // IPI errors
  ipiMaxLength: 'IPI must be 11 digits or less',
  ipiFormat: 'IPI must contain only digits (1-11)',

  // ISNI errors
  isniFormat: 'ISNI must be 15 digits followed by a digit or X (no spaces)',

  // Creators array errors
  creatorsMin: 'At least one creator is required',
  creatorsMax: 'Maximum 20 creators allowed',
};

export type ErrorMessages = typeof defaultErrorMessages;

/**
 * Create validation schemas with custom error messages
 */
export function createValidationSchemas(messages: ErrorMessages = defaultErrorMessages) {
  // IPI validation - 1-11 digits
  const IPI_REGEX = /^[0-9]{1,11}$/;

  // ISNI validation - 15 digits + 1 digit or X (no spaces)
  const ISNI_REGEX = /^[0-9]{15}[0-9X]$/;

  // Base IPI validation
  const baseIpiSchema = z
    .string()
    .max(11, { message: messages.ipiMaxLength })
    .regex(IPI_REGEX, { message: messages.ipiFormat });

  // IPI with optional handling (empty string allowed)
  const ipiCodeSchema = z.union([z.literal(''), baseIpiSchema]).optional();

  // ISNI validation with space stripping
  const isniCodeSchema = z
    .string()
    .transform((val) => (val === '' ? val : val.replace(/\s/g, '')))
    .refine((val) => val === '' || ISNI_REGEX.test(val), {
      message: messages.isniFormat,
    })
    .optional();

  // Title validation
  const titleSchema = z
    .string()
    .min(1, { message: messages.titleRequired })
    .max(255, { message: messages.titleMaxLength });

  // Full name validation
  const fullNameSchema = z
    .string()
    .trim()
    .min(1, { message: messages.fullNameRequired })
    .max(255, { message: messages.fullNameMaxLength });

  // Email validation
  const emailSchema = z
    .string()
    .trim()
    .min(1, { message: messages.emailRequired })
    .email({ message: messages.emailInvalid })
    .max(255, { message: messages.emailMaxLength });

  // Roles validation
  const rolesSchema = z
    .array(z.string())
    .min(1, { message: messages.rolesRequired })
    .max(10, { message: messages.rolesMaxCount });

  // Creator schema
  const creatorSchema = z.object({
    fullName: fullNameSchema,
    email: emailSchema,
    roles: rolesSchema,
    ipi: ipiCodeSchema.default(''),
    isni: isniCodeSchema.default(''),
  });

  // Work form schema
  const workFormSchema = z.object({
    title: titleSchema,
    creators: z
      .array(creatorSchema)
      .min(1, { message: messages.creatorsMin })
      .max(20, { message: messages.creatorsMax }),
  });

  return {
    titleSchema,
    fullNameSchema,
    emailSchema,
    rolesSchema,
    ipiCodeSchema,
    isniCodeSchema,
    creatorSchema,
    workFormSchema,
  };
}

// Default schemas with default messages
const schemas = createValidationSchemas();

export const {
  titleSchema,
  fullNameSchema,
  emailSchema,
  rolesSchema,
  ipiCodeSchema,
  isniCodeSchema,
  creatorSchema,
  workFormSchema,
} = schemas;

// Type exports
export type Creator = z.infer<typeof creatorSchema>;
export type WorkForm = z.infer<typeof workFormSchema>;

/**
 * Validate the complete form data
 */
export function validateForm(data: unknown): { success: true; data: WorkForm } | { success: false; errors: z.ZodError } {
  const result = workFormSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Validate a single creator
 */
export function validateCreator(data: unknown): { success: true; data: Creator } | { success: false; errors: z.ZodError } {
  const result = creatorSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Check if a file is a valid ATS certificate JSON file
 */
export function isValidAtsFile(file: File): boolean {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  return extension === '.json' || file.type === 'application/json';
}

/**
 * Parse and validate ATS certificate JSON structure
 */
export async function parseAtsFile(file: File): Promise<{
  success: true;
  data: {
    title: string;
    creators: Array<{ fullName: string; email: string; roles: string[]; ipi: string; isni: string }>;
    atsId: number;
    versionNumber: number;
  };
} | { success: false; error: string }> {
  try {
    const text = await file.text();
    const json = JSON.parse(text);

    // Validate required fields
    if (!json.title || typeof json.title !== 'string') {
      return { success: false, error: 'Missing or invalid title in ATS certificate' };
    }

    if (!json.atsId || typeof json.atsId !== 'number') {
      return { success: false, error: 'Missing or invalid atsId in ATS certificate' };
    }

    // Creators are optional but should be validated if present
    const creators = json.creators || [];
    if (!Array.isArray(creators)) {
      return { success: false, error: 'Invalid creators format in ATS certificate' };
    }

    // Map creators to expected format with required string fields
    const mappedCreators = creators.map((c: Record<string, unknown>) => ({
      fullName: String(c.fullName || ''),
      email: String(c.email || ''),
      roles: Array.isArray(c.roles) ? c.roles.map(String) : [],
      ipi: String(c.ipi || ''),
      isni: String(c.isni || ''),
    }));

    return {
      success: true,
      data: {
        title: json.title,
        creators: mappedCreators,
        atsId: json.atsId,
        versionNumber: (json.versionNumber || 1) + 1, // Increment version for new version
      },
    };
  } catch {
    return { success: false, error: 'Failed to parse ATS certificate file' };
  }
}
