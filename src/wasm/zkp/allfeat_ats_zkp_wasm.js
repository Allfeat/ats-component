/**
 * WASM wrapper for ZKP module with async initialization
 *
 * This module handles manual WASM instantiation with proper imports.
 * The @rollup/plugin-wasm is incompatible with wasm-bindgen because it
 * instantiates WASM with empty imports, but wasm-bindgen modules require
 * JavaScript glue functions (__wbg_*, __wbindgen_*) at instantiation time.
 */
import * as bg from "./allfeat_ats_zkp_wasm_bg.js";
import { __wbg_set_wasm } from "./allfeat_ats_zkp_wasm_bg.js";

let initialized = false;

/**
 * Initialize the ZKP WASM module
 * @param {string} wasmUrl - URL to the .wasm file
 */
export async function initZkpWasm(wasmUrl) {
  if (initialized) return;

  // Collect all __wbg and __wbindgen imports from bg.js
  // These are the JavaScript functions that the WASM module calls
  const imports = {};
  for (const key of Object.keys(bg)) {
    if (key.startsWith('__wbg') || key.startsWith('__wbindgen')) {
      imports[key] = bg[key];
    }
  }

  // The wasm-bindgen import module name
  const importObject = {
    './allfeat_ats_zkp_wasm_bg.js': imports,
  };

  // Fetch and instantiate the WASM module
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
  }
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, importObject);

  // Set the wasm instance in bg.js so its exported functions can use it
  __wbg_set_wasm(instance.exports);

  // Call the initialization function if present
  if (typeof instance.exports.__wbindgen_start === 'function') {
    instance.exports.__wbindgen_start();
  }

  initialized = true;
}

/**
 * Check if the WASM module is initialized
 */
export function isInitialized() {
  return initialized;
}

// Re-export the actual functions from bg.js
// These will work after initZkpWasm() has been called
export { build_bundle, calculate_commitment, prove, verify } from "./allfeat_ats_zkp_wasm_bg.js";
