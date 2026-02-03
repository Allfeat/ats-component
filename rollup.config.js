import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
// import wasm from '@rollup/plugin-wasm'; // Disabled - incompatible with wasm-bindgen
import copy from 'rollup-plugin-copy';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const production = !process.env.ROLLUP_WATCH;

// CSS plugin to inline CSS as string
function cssPlugin() {
  return {
    name: 'css-inline',
    transform(code, id) {
      if (id.endsWith('.css')) {
        // Read the CSS file and export as string
        const css = readFileSync(id, 'utf-8');
        return {
          code: `export default ${JSON.stringify(css)};`,
          map: null,
        };
      }
    },
  };
}

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/allfeat-ats-register.esm.js',
      format: 'esm',
      sourcemap: !production,
      inlineDynamicImports: true,
    },
    {
      file: 'dist/allfeat-ats-register.cjs.js',
      format: 'cjs',
      sourcemap: !production,
      inlineDynamicImports: true,
    },
    {
      file: 'dist/allfeat-ats-register.iife.js',
      format: 'iife',
      name: 'AllfeatAtsComponent',
      sourcemap: !production,
      inlineDynamicImports: true,
    },
  ],
  plugins: [
    cssPlugin(),
    resolve({
      browser: true,
      preferBuiltins: false,
      extensions: ['.js', '.ts'],
    }),
    commonjs(),
    json(),
    // Note: @rollup/plugin-wasm is disabled because it's incompatible with wasm-bindgen modules.
    // wasm-bindgen requires JavaScript import functions (__wbg_*) at instantiation time,
    // but @rollup/plugin-wasm instantiates with empty imports.
    // WASM files are loaded via fetch() and WebAssembly.instantiate() in the wrapper files.
    // wasm({
    //   targetEnv: 'browser',
    //   sync: ['**/*.wasm'],
    // }),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist',
      exclude: ['node_modules/**', 'demo/**'],
    }),
    copy({
      targets: [
        { src: 'src/wasm/zkp/*.wasm', dest: 'dist/wasm' },
        { src: 'src/wasm/cert/*.wasm', dest: 'dist/wasm' },
      ],
      hook: 'writeBundle',
    }),
    production && terser({
      format: {
        comments: false,
      },
    }),
  ].filter(Boolean),
  onwarn(warning, warn) {
    // Suppress circular dependency warnings from jspdf
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    // Suppress eval warning from WASM
    if (warning.code === 'EVAL') return;
    warn(warning);
  },
};
