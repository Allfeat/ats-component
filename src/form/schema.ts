import { z } from 'zod';
import { parseCertificateViaProxy } from '../api/client';
import { AtsApiException } from '../api/types';

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
 * Parse ATS certificate via API (proxy mode)
 *
 * Sends the certificate JSON to the proxy backend for server-side parsing.
 * This avoids the need for client-side WASM certificate parsing.
 *
 * @param file - The certificate JSON file
 * @param proxyEndpoint - The organization's proxy URL
 * @returns Parsed certificate data or error
 */
export async function parseAtsFileViaApi(
  file: File,
  proxyEndpoint: string
): Promise<{
  success: true;
  data: {
    title: string;
    creators: Array<{ fullName: string; email: string; roles: string[]; ipi: string; isni: string }>;
    atsId: number;
    versionNumber: number;
  };
} | { success: false; error: string }> {
  try {
    // Read file content
    const certificateJson = await file.text();

    // Validate it's valid JSON before sending
    try {
      JSON.parse(certificateJson);
    } catch {
      return { success: false, error: 'Invalid JSON file' };
    }

    // Call API to parse certificate
    const response = await parseCertificateViaProxy(proxyEndpoint, certificateJson);

    // Map response to expected format
    // Note: API returns fullname (lowercase n), we need fullName (camelCase)
    const mappedCreators = response.creators.map((c) => ({
      fullName: c.fullname, // Map fullname -> fullName
      email: c.email,
      roles: c.roles,
      ipi: c.ipi || '',
      isni: c.isni || '',
    }));

    return {
      success: true,
      data: {
        title: response.title,
        creators: mappedCreators,
        atsId: response.ats_id,
        versionNumber: response.version_number + 1, // Increment for new version
      },
    };
  } catch (error) {
    // Return error message
    const message =
      error instanceof AtsApiException ? error.message : 'Failed to parse certificate via API';
    return { success: false, error: message };
  }
}
