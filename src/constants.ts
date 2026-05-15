export const DEFAULT_PRIMARY_COLOR = '#4DB8A8';
export const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const TOKEN_EXPIRY_TIMEOUT_MS = 60_000;
export const UPLOAD_MAX_RETRIES = 3;
export const POLLING_INTERVAL_MS = 3_000;
export const POLLING_TIMEOUT_MS = 120_000;
export const MAX_CREATORS = 20;
export const MAX_TITLE_LENGTH = 200;
export const ACCESS_CODE_REGEX = /^atc_[0-9a-fA-F]{64}$/;
export const ACCESS_CODE_LENGTH = 68;
export const ACCESS_CODE_POLL_MAX_ATTEMPTS = 10;
export const ACCESS_CODE_POLL_INTERVAL_MS = 2_000;
export const AUTH_FETCH_MAX_RETRIES = 2;

/**
 * Toggle mock implementations of the user-scoped works endpoints (list + downloads + version updates).
 * Flip to `false` once the backend ships the real endpoints; the mock module is then tree-shaken
 * out of the production bundle by Rollup.
 */
export const USE_MOCK_USER_WORKS = true;
