#!/usr/bin/env node
// v0.8.62 — postinstall patch for hunspell-asm's nanoid interop under Vite.
//
// hunspell-asm@4 and its dependency emscripten-wasm-loader use:
//     import * as nanoid from 'nanoid';
//     nanoid(45)
// With nanoid@2 (CommonJS) that is a CALL ON A MODULE NAMESPACE — Vite/Rollup
// emit "Cannot call a namespace (nanoid)" and the generated code throws
// `TypeError: nanoid is not a function` the moment a dictionary file is
// mounted (i.e. every non-English spellcheck load would die).
//
// The fix is the standard interop correction: import the default export.
// This script rewrites the two dist files in place; it is idempotent and
// safe to run on every install.

const fs = require('node:fs');
const path = require('node:path');

const targets = [
  'node_modules/hunspell-asm/dist/esm/hunspellLoader.js',
  'node_modules/hunspell-asm/dist/cjs/hunspellLoader.js',
  'node_modules/emscripten-wasm-loader/dist/esm/path/mountBuffer.js',
  'node_modules/emscripten-wasm-loader/dist/esm/path/mountPhysicalPath.js',
  'node_modules/emscripten-wasm-loader/dist/esm/path/mountDirectoryPath.js',
  'node_modules/emscripten-wasm-loader/dist/cjs/path/mountBuffer.js',
];

const root = process.cwd();
let patched = 0;

for (const rel of targets) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, 'utf8');
  const before = src;
  // Only the star-import form is broken; the default import works everywhere.
  src = src.replace(
    /import\s+\*\s+as\s+nanoid\s+from\s+'nanoid'\s*;/g,
    "import nanoid from 'nanoid';"
  );
  src = src.replace(
    /import\s+\*\s+as\s+nanoid\s+from\s+"nanoid"\s*;/g,
    'import nanoid from "nanoid";'
  );
  if (src !== before) {
    fs.writeFileSync(file, src);
    patched += 1;
    console.log(`[patch-hunspell-nanoid] fixed ${rel}`);
  }
}

// ---------------------------------------------------------------------------
// v0.8.62 patch #2 — emscripten runtime namespace interop.
// emscripten-wasm-loader's getModuleLoader calls `runtimeModule(...)`, where
// the runtime is imported with `import * as runtime from './lib/browser/hunspell'`.
// The browser preamble is a UMD factory (module.exports = factory). Depending
// on the bundler the imported binding is either the factory itself (Rollup
// build interop) or a `{ default: factory }` namespace (esbuild / dev server)
// — calling the namespace raw throws "runtimeModule is not a function".
// Normalizing here makes BOTH paths work.
// ---------------------------------------------------------------------------
const loaderRel = 'node_modules/emscripten-wasm-loader/dist/esm/getModuleLoader.js';
const loaderFile = path.join(root, loaderRel);
if (fs.existsSync(loaderFile)) {
  let src = fs.readFileSync(loaderFile, 'utf8');
  const marker = 'MUNDUS v0.8.62 runtime-interop patch';
  if (!src.includes(marker)) {
    const broken = 'const asmModule = runtimeModule(constructedModule);';
    const fixed = [
      `// ${marker}: the UMD runtime may arrive as the factory itself or as a`,
      `// { default: factory } namespace depending on the bundler's CJS interop.`,
      `const __mundusRuntime = typeof runtimeModule === 'function'`,
      `    ? runtimeModule`,
      `    : (runtimeModule && typeof runtimeModule.default === 'function' ? runtimeModule.default : runtimeModule);`,
      `const asmModule = __mundusRuntime(constructedModule);`,
    ].join('\n');
    if (src.includes(broken)) {
      src = src.replace(broken, fixed);
      fs.writeFileSync(loaderFile, src);
      patched += 1;
      console.log(`[patch-hunspell-nanoid] fixed ${loaderRel} (runtime interop)`);
    }
  }
}

if (patched === 0) {
  console.log('[patch-hunspell-nanoid] nothing to patch (already fixed or packages absent)');
}
