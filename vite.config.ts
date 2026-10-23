import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// v0.8.61: the dictionary-* npm packages (Hunspell data for the multi-language
// spellchecker) declare a restrictive "exports" map that only exposes
// ./index.js, which blocks deep ?raw imports of their .dic/.aff data files.
// These exact-specifier aliases point Vite straight at the real files,
// bypassing the exports map, while the rest of each package resolves normally.
const dictionaryDataAliases: Record<string, string> = Object.fromEntries(
  ['es', 'fr', 'it', 'de'].flatMap((code) => {
    const pkg = path.resolve(__dirname, `node_modules/dictionary-${code}`);
    return [
      [`dictionary-${code}/index.dic?raw`, `${pkg}/index.dic?raw`],
      [`dictionary-${code}/index.aff?raw`, `${pkg}/index.aff?raw`],
    ];
  })
);

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        ...dictionaryDataAliases,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
