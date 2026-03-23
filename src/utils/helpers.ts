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
