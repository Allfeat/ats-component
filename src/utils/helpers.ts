/**
 * Converts a byte count to a human-readable file size string (B, KB, or MB).
 * @param bytes - The number of bytes.
 * @returns Formatted string, e.g. `"1.5 MB"`.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * HTML-encodes a string to prevent XSS when inserting user content into the DOM.
 * @param str - The raw string to escape.
 * @returns The HTML-safe string with special characters encoded.
 */
export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Formats an ISO timestamp as a localized UTC date string suitable for display.
 * Returns `'—'` for `null`/invalid inputs.
 * Example output: `"2025-08-12, 02:23:01 PM UTC"`.
 */
export function formatUtcDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  let hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}, ${hh}:${minutes}:${seconds} ${ampm} UTC`;
}

/**
 * Formats an ISO timestamp as a compact short-date string (e.g. `"14 May 2026 15:21"`).
 * Day-month-year + 24-hour `HH:mm`, no UTC suffix. Matches the dashboard's compact format.
 * Returns `'—'` for `null`/invalid inputs.
 */
export function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.getUTCDate();
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

/**
 * Truncates a long hex string for one-line display, keeping the first and last `segmentLen` chars.
 * E.g. `truncateHash('0x1234567890abcdef1234...', 8)` → `"0x123456...ef1234"`.
 * Returns the original string unchanged if it's short enough.
 */
export function truncateHash(hash: string | null | undefined, segmentLen = 10): string {
  if (!hash) return '—';
  // Need enough length to actually save space — otherwise return as-is.
  if (hash.length <= segmentLen * 2 + 3) return hash;
  return `${hash.slice(0, segmentLen)}…${hash.slice(-segmentLen)}`;
}

/**
 * Whether original asset/audio files are retained — and therefore downloadable —
 * for works on the given network. Testnet (Melodie) no longer keeps the uploaded
 * asset after finalization; only mainnet (Allfeat) does, where it's a premium
 * feature. Certificates remain downloadable on both networks.
 *
 * Mirrors the backend gate `assets_retained(network) = (network == "mainnet")`.
 */
export function assetsRetained(network: string): boolean {
  return network === 'mainnet';
}

/**
 * Opens a pre-signed URL in a new browser tab so the user can download the file.
 * Uses a transient `<a>` element rather than `window.open` so popup blockers
 * don't intercept it.
 */
export function openPresignedDownload(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
