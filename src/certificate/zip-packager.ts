import JSZip from 'jszip';
import { generateCertificatePDF, CertificateData } from './pdf-generator';
import { generateJsonCertificate, generateJsonCertificateFallback } from './json-generator';
import type { CreatorFormData } from '../form/types';
import type { ZkpBundle } from '../wasm/types';
import { isWasmInitialized } from '../wasm/loader';

/**
 * Generate a sanitized filename from title
 * Format: <title>_YYYYMMDD_HHMMSS
 */
export function generateAtsFileName(title: string): string {
  const now = new Date();
  const dateStr = now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .replace(/\.\d{3}Z$/, '');

  // Sanitize title: remove invalid characters, limit length
  const sanitizedTitle = title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);

  return `${sanitizedTitle}_${dateStr}`;
}

/**
 * Generate ZIP filename following ATS convention
 * Format: CertificatAllfeat_<sanitized_filename>_<version>.zip
 */
export function generateZipFileName(assetFilename: string, versionNumber: string): string {
  // Remove file extension
  const filenameWithoutExtension = assetFilename.replace(/\.[^/.]+$/, '');
  // Replace dots with underscores
  const sanitizedFilename = filenameWithoutExtension.replace(/\./g, '_');

  return `CertificatAllfeat_${sanitizedFilename}_${versionNumber}.zip`;
}

/**
 * Data required to generate the complete certificate package
 */
export interface CertificatePackageData {
  // Work data
  title: string;
  assetFilename: string;
  creators: CreatorFormData[];

  // Blockchain data
  atsId: string | number;
  versionNumber: string | number;
  txHash: string;
  blockNumber: number;
  blockTimestamp?: string;

  // ZKP data
  zkpBundle: ZkpBundle;

  // Optional
  explorerUrl?: string;
  /** Custom primary color for the PDF certificate */
  primaryColor?: string;
}

/**
 * Result of certificate package generation
 */
export interface CertificatePackageResult {
  zipBlob: Blob;
  zipFilename: string;
  jsonFilename: string;
  pdfFilename: string;
  pdfGenerated: boolean;
}

/**
 * Generate complete certificate package (ZIP with PDF and JSON)
 */
export async function generateCertificatePackage(
  data: CertificatePackageData
): Promise<CertificatePackageResult> {
  const zip = new JSZip();

  // Generate base filename
  const baseFilename = generateAtsFileName(data.title);
  const jsonFilename = `${baseFilename}.json`;
  const pdfFilename = `${baseFilename}.pdf`;
  const zipFilename = generateZipFileName(data.assetFilename, String(data.versionNumber));

  // Generate JSON certificate
  let jsonContent: string;
  try {
    if (isWasmInitialized()) {
      jsonContent = generateJsonCertificate(
        data.atsId,
        data.versionNumber,
        data.title,
        data.assetFilename,
        data.creators
      );
    } else {
      // Fallback if WASM not initialized
      jsonContent = generateJsonCertificateFallback(
        data.atsId,
        data.versionNumber,
        data.title,
        data.assetFilename,
        data.creators
      );
    }
  } catch (error) {
    // Use fallback on any error
    console.warn('WASM JSON generation failed, using fallback:', error);
    jsonContent = generateJsonCertificateFallback(
      data.atsId,
      data.versionNumber,
      data.title,
      data.assetFilename,
      data.creators
    );
  }

  zip.file(jsonFilename, jsonContent);

  // Generate PDF certificate
  let pdfGenerated = false;
  try {
    const pdfData: CertificateData = {
      title: data.title,
      assetFilename: data.assetFilename,
      hashAudio: data.zkpBundle.hash_audio,
      hashTitle: data.zkpBundle.hash_title,
      hashCreators: data.zkpBundle.hash_creators,
      hashCommitment: data.zkpBundle.commitment,
      secret: data.zkpBundle.secret,
      proof: data.zkpBundle.proof,
      timestamp: data.zkpBundle.timestamp,
      creators: data.creators.map((c) => ({
        fullName: c.fullName,
        email: c.email,
        roles: c.roles,
        ipi: c.ipi || '',
        isni: c.isni || '',
      })),
      blockNumber: data.blockNumber,
      blockTimestamp: data.blockTimestamp,
      explorerUrl: data.explorerUrl,
      primaryColor: data.primaryColor,
    };

    const pdfBlob = generateCertificatePDF(pdfData);
    zip.file(pdfFilename, pdfBlob);
    pdfGenerated = true;
  } catch (error) {
    console.error('PDF generation failed:', error);
    // Continue without PDF - user still gets JSON
  }

  // Generate ZIP blob
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  return {
    zipBlob,
    zipFilename,
    jsonFilename,
    pdfFilename,
    pdfGenerated,
  };
}

/**
 * Trigger browser download of a blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Generate and download complete certificate package
 */
export async function generateAndDownloadCertificate(
  data: CertificatePackageData
): Promise<CertificatePackageResult> {
  const result = await generateCertificatePackage(data);
  downloadBlob(result.zipBlob, result.zipFilename);
  return result;
}
