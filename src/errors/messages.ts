// ============================================
// Error Message Catalog
// ============================================

/**
 * Maps dotted error codes from the unified backend envelope to user-facing English messages.
 * Programming errors (e.g. session.invalid_action_type) are intentionally omitted —
 * they fall through to the FALLBACK_MESSAGE.
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Session & Auth
  'session.invalid_token': 'Your session has expired. Please refresh your credentials.',
  'session.key_inactive': 'This widget is currently disabled. Please contact your administrator.',
  'session.widget_not_enabled': 'The widget feature is not enabled for your organization.',
  'session.origin_not_allowed': 'This website is not authorized to use the widget.',
  'session.rate_limited': 'Too many requests. Please wait a moment and try again.',
  'common.auth.missing_token': 'Authentication is required. Please provide a valid token.',
  'common.auth.expired': 'Your session has expired. Please refresh your credentials.',
  'common.auth.invalid_token': 'Your authentication token is invalid. Please provide a new one.',
  'common.auth.invalid_api_key': 'The API key is invalid. Please contact your administrator.',
  'common.auth.jwks_unavailable': 'Authentication service is temporarily unavailable. Please try again later.',
  'common.auth.backend_unavailable': 'Authentication service is temporarily unavailable. Please try again later.',

  // Organization
  'organization.not_found': 'Organization not found. Please check your configuration.',
  'organization.inactive': 'Your organization account is currently inactive.',
  'organization.no_integration': 'No integration is configured for your organization.',

  // Registration
  'registration.duplicate_title': 'A work with this title already exists.',
  'registration.audio_too_large': 'The audio file is too large ({size_mb} MB). Maximum allowed size is {max_mb} MB.',
  'registration.invalid_audio_format': 'The audio file format is not supported.',
  'registration.insufficient_credits': 'Insufficient credits to complete this registration.',

  // Works & Access
  'work.not_found': 'The requested work was not found.',
  'work.already_registered': 'This work has already been registered.',
  'work.not_owned_by_user': "You don't have access to this work.",
  'work.no_asset': 'The asset file is not available for download.',
  'work.certificate_unavailable': 'The certificate is not yet available for download.',
  'access_code.not_found': 'The access code is invalid or does not exist.',
  'access_code.expired': 'This access code has expired.',

  // User-scoped works (external-user-id)
  'external_user.not_found': 'No user found for the provided ID.',
  'version.already_in_progress': 'A previous version update is still in progress.',

  // Transactions
  'transaction.not_found': 'Transaction not found.',
  'transaction.store_unavailable': 'Transaction service is temporarily unavailable. Please try again later.',
  'transaction.already_confirmed': 'This transaction has already been confirmed.',
  'transaction.expired': 'This transaction has expired. Please start over.',

  // Common
  'common.rate_limited': 'Too many requests. Please wait a moment and try again.',
  'common.validation_failed': 'The submitted data is invalid. Please check your input and try again.',
  'common.service_unavailable': 'The service is temporarily unavailable. Please try again later.',
  'common.not_found': 'The requested resource was not found.',
};

const FALLBACK_MESSAGE = 'An unexpected error occurred. Please try again.';

/**
 * Resolves a dotted error code to a user-facing English message.
 *
 * Supports `{placeholder}` interpolation from `details`. Special handling:
 * - `registration.audio_too_large`: converts `size_bytes`/`max_bytes` to MB
 *   and maps to `{size_mb}`/`{max_mb}` template keys.
 *
 * @param code - Dotted error code (e.g. `"session.origin_not_allowed"`).
 * @param details - Optional details object from the API error envelope.
 * @returns The localized user-facing message.
 */
export function getErrorMessage(code: string, details?: Record<string, unknown>): string {
  const template = ERROR_MESSAGES[code];
  if (!template) return FALLBACK_MESSAGE;

  if (!details) return template;

  // Special case: convert bytes to MB for audio_too_large
  const interpolationDetails: Record<string, unknown> = { ...details };
  if (code === 'registration.audio_too_large') {
    if (typeof details.size_bytes === 'number' && Number.isFinite(details.size_bytes)) {
      interpolationDetails.size_mb = (details.size_bytes / (1024 * 1024)).toFixed(1);
    }
    if (typeof details.max_bytes === 'number' && Number.isFinite(details.max_bytes)) {
      interpolationDetails.max_mb = (details.max_bytes / (1024 * 1024)).toFixed(1);
    }
  }

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = interpolationDetails[key];
    return value !== undefined && value !== null ? String(value) : match;
  });
}
