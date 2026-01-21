import { generateCertificateJson } from '../wasm/loader';
import type { AtsCertificateData, CertificateCreator } from '../wasm/types';
import type { CreatorFormData } from '../form/types';

/**
 * Generate timestamp in the format expected by the certificate
 * Format: "YYYY-MM-DD HH:MM:SS UTC"
 */
export function generateTimestamp(): string {
  return new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');
}

/**
 * Convert form creator data to certificate creator format
 */
export function convertCreatorForCertificate(creator: CreatorFormData): CertificateCreator {
  return {
    fullname: creator.fullName, // Note: lowercase 'n' for WASM compatibility
    email: creator.email,
    roles: creator.roles,
    ipi: creator.ipi || '',
    isni: creator.isni || '',
  };
}

/**
 * Generate JSON certificate content using WASM
 *
 * @param atsId - The ATS ID from the blockchain
 * @param versionNumber - The version number (usually "1" for new works)
 * @param title - The work title
 * @param assetFilename - The original uploaded filename
 * @param creators - Array of creator data from the form
 * @returns JSON string of the certificate
 */
export function generateJsonCertificate(
  atsId: string | number,
  versionNumber: string | number,
  title: string,
  assetFilename: string,
  creators: CreatorFormData[]
): string {
  const certificateData: AtsCertificateData = {
    id_allfeat: String(atsId),
    version_number: String(versionNumber),
    title,
    asset_filename: assetFilename,
    creators: creators.map(convertCreatorForCertificate),
    timestamp: generateTimestamp(),
  };

  return generateCertificateJson(certificateData);
}

/**
 * Generate JSON certificate without WASM (fallback)
 * This creates a compatible JSON structure manually
 */
export function generateJsonCertificateFallback(
  atsId: string | number,
  versionNumber: string | number,
  title: string,
  assetFilename: string,
  creators: CreatorFormData[]
): string {
  const certificateData = {
    id_allfeat: String(atsId),
    version_number: String(versionNumber),
    title,
    asset_filename: assetFilename,
    creators: creators.map((creator) => ({
      fullname: creator.fullName,
      email: creator.email,
      roles: creator.roles,
      ipi: creator.ipi || '',
      isni: creator.isni || '',
    })),
    timestamp: generateTimestamp(),
  };

  return JSON.stringify(certificateData, null, 2);
}
