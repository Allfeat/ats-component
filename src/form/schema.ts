import { z } from 'zod';
import { MAX_CREATORS, MAX_TITLE_LENGTH } from '../constants';

/** Default validation error messages used by all form schemas. Override individual keys to customize. */
export const defaultErrorMessages = {
  fileRequired: 'Please select a file',

  titleRequired: 'Title is required',
  titleMaxLength: `Title must be ${MAX_TITLE_LENGTH} characters or less`,

  fullNameRequired: 'Full name is required',
  fullNameMaxLength: 'Full name must be 255 characters or less',
  emailRequired: 'Email is required',
  emailInvalid: 'Please enter a valid email address',
  emailMaxLength: 'Email must be 255 characters or less',
  rolesRequired: 'At least one role is required',
  rolesMaxCount: 'Maximum 10 roles allowed',

  ipiMaxLength: 'IPI must be 11 digits or less',
  ipiFormat: 'IPI must contain only digits (1-11)',

  isniFormat: 'ISNI must be 15 digits followed by a digit or X (no spaces)',

  creatorsMin: 'At least one creator is required',
  creatorsMax: `Maximum ${MAX_CREATORS} creators allowed`,
};

/** Type of the `defaultErrorMessages` object for use in custom overrides. */
export type ErrorMessages = typeof defaultErrorMessages;

// ============================================
// Zod schemas
// ============================================

const messages = defaultErrorMessages;

const IPI_REGEX = /^[0-9]{1,11}$/;
const ISNI_REGEX = /^[0-9]{15}[0-9X]$/;

const baseIpiSchema = z
  .string()
  .max(11, { message: messages.ipiMaxLength })
  .regex(IPI_REGEX, { message: messages.ipiFormat });

/** Validates an optional IPI code: empty string or 1–11 digits. */
export const ipiCodeSchema = z.union([z.literal(''), baseIpiSchema]).optional();

/** Validates an optional ISNI code: empty string or 16 characters (15 digits + digit/X), strips spaces. */
export const isniCodeSchema = z
  .string()
  .transform((val) => (val === '' ? val : val.replace(/\s/g, '')))
  .refine((val) => val === '' || ISNI_REGEX.test(val), {
    message: messages.isniFormat,
  })
  .optional();

/** Validates a work title: non-empty, max length from constants. */
export const titleSchema = z
  .string()
  .min(1, { message: messages.titleRequired })
  .max(MAX_TITLE_LENGTH, { message: messages.titleMaxLength });

/** Validates a creator's full name: trimmed, non-empty, max 255 chars. */
export const fullNameSchema = z
  .string()
  .trim()
  .min(1, { message: messages.fullNameRequired })
  .max(255, { message: messages.fullNameMaxLength });

/** Validates a creator's email: trimmed, non-empty, valid format, max 255 chars. */
export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: messages.emailRequired })
  .email({ message: messages.emailInvalid })
  .max(255, { message: messages.emailMaxLength });

/** Validates roles: at least 1, at most 10 string entries. */
export const rolesSchema = z
  .array(z.string())
  .min(1, { message: messages.rolesRequired })
  .max(10, { message: messages.rolesMaxCount });

/** Validates a single creator's form data (fullName, email, roles, ipi, isni). */
export const creatorSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  roles: rolesSchema,
  ipi: ipiCodeSchema.default(''),
  isni: isniCodeSchema.default(''),
});

/** Validates the complete work registration form (title + creators array). */
export const workFormSchema = z.object({
  title: titleSchema,
  creators: z
    .array(creatorSchema)
    .min(1, { message: messages.creatorsMin })
    .max(MAX_CREATORS, { message: messages.creatorsMax }),
});
