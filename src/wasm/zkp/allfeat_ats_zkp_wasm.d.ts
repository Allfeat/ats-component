/* tslint:disable */
/* eslint-disable */
/**
 * Build a full precomputed bundle (random secret):
 * - inputs: `title`, `audio_bytes` (Uint8Array), `creators` (array of JsCreator), `timestamp` (seconds)
 * - returns: all hashes + commitment + nullifier as hex, plus the numeric timestamp
 */
export function build_bundle(title: string, audio_bytes: Uint8Array, creators_js: any, timestamp: bigint): any;
/**
 * Calculate the hash commitment from the provided inputs:
 * - inputs: `title`, `audio_bytes` (Uint8Array), `creators` (array of JsCreator), `secret` (hex string)
 * - returns: commitment as hex string
 */
export function calculate_commitment(title: string, audio_bytes: Uint8Array, creators_js: any, secret: string): string;
/**
 * Groth16 proof (hex-only API passthrough):
 * - `pk`: compressed PK (0x-hex)
 * - `secret`: 0x-hex Fr
 * - `publics`: array(6) of 0x-hex Fr in circuit order
 */
export function prove(pk: string, secret: string, publics: any): any;
/**
 * Groth16 verify (hex-only API passthrough):
 * - `vk`: compressed VK (0x-hex)
 * - `proof`: 0x-hex compressed proof
 * - `publics`: array(6) of 0x-hex Fr in circuit order
 */
export function verify(vk: string, proof: string, publics: any): boolean;
