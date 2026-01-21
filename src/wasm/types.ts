/**
 * Creator data structure for ZKP computation
 */
export interface ZkpCreator {
  fullName: string;
  email: string;
  roles: string[];
}

/**
 * Result from build_bundle WASM function
 */
export interface BundleResult {
  bundle: {
    secret: string;         // 0x-hex private secret
    hash_title: string;     // 0x-hex Poseidon hash
    hash_audio: string;     // 0x-hex Poseidon hash
    hash_creators: string;  // 0x-hex Poseidon hash
    commitment: string;     // 0x-hex Poseidon commitment
    timestamp: string;      // 0x-hex Fr-encoded timestamp
    nullifier: string;      // 0x-hex nullifier value
  };
}

/**
 * Result from prove WASM function
 */
export interface ProofResult {
  proof: string;    // 0x-hex compressed Groth16 proof
  publics: string[]; // Array of public inputs
}

/**
 * Complete ZKP bundle with proof included
 */
export interface ZkpBundle {
  secret: string;
  hash_title: string;
  hash_audio: string;
  hash_creators: string;
  commitment: string;
  timestamp: string;
  nullifier: string;
  proof: string;
}

/**
 * Creator data for certificate generation
 */
export interface CertificateCreator {
  fullname: string;   // Note: lowercase 'n' for WASM compatibility
  email: string;
  roles: string[];
  ipi: string;
  isni: string;
}

/**
 * Certificate data structure for JSON generation
 */
export interface AtsCertificateData {
  id_allfeat: string;
  version_number: string;
  title: string;
  asset_filename: string;
  creators: CertificateCreator[];
  timestamp?: string;
}

/**
 * ZKP WASM module interface
 */
export interface ZkpWasmModule {
  build_bundle(
    title: string,
    audio_bytes: Uint8Array,
    creators_js: ZkpCreator[],
    timestamp: bigint
  ): BundleResult;

  prove(pk: string, secret: string, publics: string[]): ProofResult;

  verify(vk: string, proof: string, publics: string[]): boolean;

  calculate_commitment(
    title: string,
    audio_bytes: Uint8Array,
    creators_js: ZkpCreator[],
    secret: string
  ): string;
}

/**
 * Certificate parser WASM module interface
 */
export interface CertWasmModule {
  createAtsCertificateFromJsObject(js_obj: AtsCertificateData): string;
  parseAtsCertificateToJs(json_str: string): AtsCertificateData;
}
