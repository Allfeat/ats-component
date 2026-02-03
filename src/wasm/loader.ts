import type {
  ZkpWasmModule,
  CertWasmModule,
  ZkpCreator,
  BundleResult,
  ProofResult,
  AtsCertificateData,
} from './types';

// WASM module state
let zkpModule: ZkpWasmModule | null = null;
let certModule: CertWasmModule | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;

// WASM URL configuration
let wasmBaseUrl = './wasm/';

/**
 * Configure the base URL for WASM files
 * Call this before initWasm() if your WASM files are not in the default location
 *
 * @param baseUrl - Base URL path where WASM files are located (should end with /)
 *
 * @example
 * // For files served from /assets/wasm/
 * setWasmBaseUrl('/assets/wasm/');
 *
 * // For files served from a CDN
 * setWasmBaseUrl('https://cdn.example.com/wasm/');
 */
export function setWasmBaseUrl(baseUrl: string): void {
  wasmBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

/**
 * Get the full URL for a WASM file
 */
function getWasmUrl(filename: string): string {
  return `${wasmBaseUrl}${filename}`;
}

/**
 * Initialize both WASM modules
 * This should be called once before using any WASM functions
 *
 * The WASM files must be accessible at the configured base URL:
 * - {baseUrl}/allfeat_ats_zkp_wasm_bg.wasm
 * - {baseUrl}/ats_cert_parser_bg.wasm
 *
 * By default, files are expected at ./wasm/ relative to the page.
 * Use setWasmBaseUrl() to change this before calling initWasm().
 */
export async function initWasm(): Promise<void> {
  if (isInitialized) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // Import the wrapper modules
      const [zkpMod, certMod] = await Promise.all([
        import('./zkp/allfeat_ats_zkp_wasm.js'),
        import('./cert/ats_cert_parser.js'),
      ]);

      // Initialize both WASM modules with their respective URLs
      await Promise.all([
        zkpMod.initZkpWasm(getWasmUrl('allfeat_ats_zkp_wasm_bg.wasm')),
        certMod.initCertWasm(getWasmUrl('ats_cert_parser_bg.wasm')),
      ]);

      zkpModule = zkpMod as unknown as ZkpWasmModule;
      certModule = certMod as unknown as CertWasmModule;
      isInitialized = true;
    } catch (error) {
      initPromise = null;
      throw new Error(`Failed to initialize WASM modules: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();

  return initPromise;
}

/**
 * Check if WASM modules are initialized
 */
export function isWasmInitialized(): boolean {
  return isInitialized;
}

/**
 * Get the ZKP WASM module (throws if not initialized)
 */
function getZkpModule(): ZkpWasmModule {
  if (!zkpModule) {
    throw new Error('ZKP WASM module not initialized. Call initWasm() first.');
  }
  return zkpModule;
}

/**
 * Get the Certificate WASM module (throws if not initialized)
 */
function getCertModule(): CertWasmModule {
  if (!certModule) {
    throw new Error('Certificate WASM module not initialized. Call initWasm() first.');
  }
  return certModule;
}

// ============================================
// ZKP Functions
// ============================================

/**
 * Build a ZKP bundle from work data
 * Generates all hashes, commitment, and nullifier with a random secret
 */
export function buildBundle(
  title: string,
  audioBytes: Uint8Array,
  creators: ZkpCreator[],
  timestamp: bigint
): BundleResult {
  const zkp = getZkpModule();
  return zkp.build_bundle(title, audioBytes, creators, timestamp);
}

/**
 * Generate a Groth16 proof
 * @param pk - Compressed proving key (0x-hex)
 * @param secret - Secret from bundle (0x-hex)
 * @param publics - Array of 6 public inputs in order:
 *   [hash_title, hash_audio, hash_creators, commitment, timestamp, nullifier]
 */
export function prove(
  pk: string,
  secret: string,
  publics: string[]
): ProofResult {
  const zkp = getZkpModule();
  return zkp.prove(pk, secret, publics);
}

/**
 * Verify a Groth16 proof
 * @param vk - Compressed verification key (0x-hex)
 * @param proof - Proof from prove() (0x-hex)
 * @param publics - Same public inputs used in prove()
 */
export function verify(
  vk: string,
  proof: string,
  publics: string[]
): boolean {
  const zkp = getZkpModule();
  return zkp.verify(vk, proof, publics);
}

/**
 * Calculate commitment from existing secret
 * Used for proof verification flow
 */
export function calculateCommitment(
  title: string,
  audioBytes: Uint8Array,
  creators: ZkpCreator[],
  secret: string
): string {
  const zkp = getZkpModule();
  return zkp.calculate_commitment(title, audioBytes, creators, secret);
}

// ============================================
// Certificate Functions
// ============================================

/**
 * Generate JSON certificate from data
 * Uses WASM for proper serialization
 */
export function generateCertificateJson(data: AtsCertificateData): string {
  const cert = getCertModule();
  return cert.createAtsCertificateFromJsObject(data);
}

/**
 * Parse an existing ATS certificate JSON
 */
export function parseCertificate(jsonStr: string): AtsCertificateData {
  const cert = getCertModule();
  return cert.parseAtsCertificateToJs(jsonStr);
}
