// Ambient module declarations for WASM-based engines (v0.7.91-NIGHTLY)
// ---------------------------------------------------------------------
// Vite's `?init` suffix turns a .wasm file into a loader that instantiates
// the module with caller-provided imports and resolves to the Instance.

declare module '*.wasm?url' {
  const url: string;
  export default url;
}

declare module '*.wasm?init' {
  const init: (imports?: WebAssembly.Imports) => Promise<WebAssembly.Instance> | Promise<{ instance: WebAssembly.Instance }>;
  export default init;
}

// Deep import into harper-wasm's wasm-bindgen glue. The package's root entry
// (`harper_wasm.js`) uses native-ESM `import * from './harper_wasm_bg.wasm'`
// which plain Vite cannot resolve, so we bootstrap the module ourselves and
// therefore only need types for the glue's public API. The full set of
// `__wbg_*` / `__wbindgen_*` host-import shims is intentionally not
// enumerated — grammarEngine.ts accesses them through an index signature.
declare module 'harper-wasm/harper_wasm_bg.js' {
  export interface WasmSpan {
    start: number;
    end: number;
  }
  export interface WasmSuggestion {
    get_replacement_text(): string;
    kind(): number;
    free(): void;
  }
  export interface WasmLint {
    span(): WasmSpan;
    get_problem_text(): string;
    lint_kind(): string;
    message(): string;
    suggestion_count(): number;
    suggestions(): WasmSuggestion[];
    free(): void;
  }
  export function __wbg_set_wasm(val: unknown): void;
  export function setup(): void;
  export function lint(text: string): WasmLint[];
  export function get_lint_config_as_object(): Record<string, unknown>;
  export function set_lint_config_from_object(object: Record<string, unknown>): void;
}
