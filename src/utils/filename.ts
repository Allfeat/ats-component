/**
 * Characters that are invalid in filenames across different operating systems
 */
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

/**
 * Reserved Windows filenames
 */
const RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
];

/**
 * Sanitize a string for use as a filename
 *
 * @param name - The string to sanitize
 * @param options - Sanitization options
 * @returns A safe filename string
 */
export function sanitizeFilename(
  name: string,
  options: {
    maxLength?: number;
    replacement?: string;
    preserveExtension?: boolean;
  } = {}
): string {
  const {
    maxLength = 255,
    replacement = '_',
    preserveExtension = false,
  } = options;

  let basename = name;
  let extension = '';

  // Extract extension if preserving
  if (preserveExtension) {
    const lastDot = name.lastIndexOf('.');
    if (lastDot > 0) {
      basename = name.substring(0, lastDot);
      extension = name.substring(lastDot);
    }
  }

  // Remove invalid characters
  let sanitized = basename.replace(INVALID_FILENAME_CHARS, replacement);

  // Replace multiple consecutive replacements with single
  sanitized = sanitized.replace(new RegExp(`${replacement}+`, 'g'), replacement);

  // Remove leading/trailing spaces and dots
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');

  // Handle reserved names
  if (RESERVED_NAMES.includes(sanitized.toUpperCase())) {
    sanitized = `_${sanitized}`;
  }

  // Truncate to max length (accounting for extension)
  const availableLength = maxLength - extension.length;
  if (sanitized.length > availableLength) {
    sanitized = sanitized.substring(0, availableLength);
    // Remove trailing replacement character
    sanitized = sanitized.replace(new RegExp(`${replacement}+$`), '');
  }

  // Ensure we have something
  if (!sanitized) {
    sanitized = 'file';
  }

  return sanitized + extension;
}

/**
 * Generate a timestamped filename
 *
 * @param basename - The base name for the file
 * @param extension - The file extension (without dot)
 * @returns A filename with timestamp
 */
export function generateTimestampedFilename(
  basename: string,
  extension: string
): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
  const sanitizedBase = sanitizeFilename(basename, { maxLength: 50 });

  return `${sanitizedBase}_${timestamp}.${extension}`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot < 0) return '';
  return filename.substring(lastDot + 1).toLowerCase();
}

/**
 * Get filename without extension
 */
export function getFilenameWithoutExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot < 0) return filename;
  return filename.substring(0, lastDot);
}

/**
 * Check if a filename has a specific extension
 */
export function hasExtension(filename: string, ...extensions: string[]): boolean {
  const ext = getFileExtension(filename);
  return extensions.some((e) => e.toLowerCase() === ext);
}
