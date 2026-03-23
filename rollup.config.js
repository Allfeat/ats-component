import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
import { readFileSync } from 'fs';
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
      file: 'dist/ats-widget.esm.js',
      format: 'esm',
      sourcemap: !production,
      inlineDynamicImports: true,
    },
    {
      file: 'dist/ats-widget.cjs.js',
      format: 'cjs',
      sourcemap: !production,
      inlineDynamicImports: true,
    },
    {
      file: 'dist/ats-widget.iife.js',
      format: 'iife',
      name: 'AtsWidgetComponent',
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
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist',
      exclude: ['node_modules/**', 'demo/**'],
    }),
    production && terser({
      format: {
        comments: false,
      },
    }),
  ].filter(Boolean),
  onwarn(warning, warn) {
    warn(warning);
  },
};
