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

/**
 * Dynamically load ZKP WASM module
 */
async function loadZkpModule(): Promise<ZkpWasmModule> {
  // Dynamic import of the WASM module
  const zkp = await import('./zkp/allfeat_ats_zkp_wasm');
  return zkp as unknown as ZkpWasmModule;
}

/**
 * Dynamically load Certificate parser WASM module
 */
async function loadCertModule(): Promise<CertWasmModule> {
  // Dynamic import of the WASM module
  const cert = await import('./cert/ats_cert_parser');
  return cert as unknown as CertWasmModule;
}

/**
 * Initialize both WASM modules
 * This should be called once before using any WASM functions
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
      // Load both modules in parallel
      const [zkp, cert] = await Promise.all([
        loadZkpModule(),
        loadCertModule(),
      ]);

      zkpModule = zkp;
      certModule = cert;
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
