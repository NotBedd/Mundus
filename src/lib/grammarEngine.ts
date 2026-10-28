// Harper-powered grammar & spelling engine (v0.7.91-NIGHTLY)
// -------------------------------------------------------------
// Harper (https://writewithharper.com) is a Rust grammar checker compiled to
// WebAssembly. This module lazily loads the WASM binary and exposes:
//   - lintText(text):       full lint list for a text
//   - pickCaretLint(...):   the lint that applies to the word at the caret
//   - lintToSuggestion():   mapping into the inline-autocorrect popup shape
//
// The inline popup's "Tab to confirm" interaction in TextEditor.tsx is
// UNCHANGED — Harper only replaces the source of suggestions (and adds
// grammar/capitalization/punctuation lints the old dictionary engine could
// never produce). If the WASM fails to load, ensureHarper() resolves to
// false and the editor silently falls back to the v0.7.8 dictionary flow.

export interface GrammarSuggestion {
  /** Replacement text; empty string means "delete the flagged span". */
  replacement: string;
  /** True when the suggestion kind is Remove (delete the span). */
  remove: boolean;
}

export interface GrammarLint {
  start: number;
  end: number;
  problemText: string;
  /** Harper lint category, e.g. "Spelling", "Grammar", "Capitalization". */
  lintKind: string;
  /** Human-readable explanation shown as the popup hint. */
  message: string;
  suggestions: GrammarSuggestion[];
}

interface WasmSpan {
  start: number;
  end: number;
}
interface WasmSuggestion {
  get_replacement_text(): string;
  kind(): number;
  free(): void;
}
interface WasmLint {
  span(): WasmSpan;
  get_problem_text(): string;
  lint_kind(): string;
  message(): string;
  suggestion_count(): number;
  suggestions(): WasmSuggestion[];
  free(): void;
}
interface HarperBgApi {
  __wbg_set_wasm(val: unknown): void;
  setup?(): void;
  lint(text: string): WasmLint[];
  get_lint_config_as_object(): Record<string, unknown>;
  set_lint_config_from_object(object: Record<string, unknown>): void;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// WASM bootstrap
// ---------------------------------------------------------------------------

let harperPromise: Promise<boolean> | null = null;
let harperReady = false;
let harperBg: HarperBgApi | null = null;

/**
 * Introspection-based import binding (see ensureHarper). No classic `wbg`
 * namespace is needed — the wasm module names its import modules itself.
 */

/**
 * Loads Harper once. Resolves true when the engine is usable, false when the
 * WASM could not be instantiated (caller should use the dictionary fallback).
 */
export function ensureHarper(): Promise<boolean> {
  if (!harperPromise) {
    harperPromise = (async () => {
      try {
        const bg = (await import('harper-wasm/harper_wasm_bg.js')) as unknown as Record<string, unknown>;
        // The wasm binary declares ES-module-level imports named
        // "./harper_wasm_bg.js" (wasm-bindgen's native-ESM output), so we
        // introspect the import section and bind every imported name to the
        // glue module's exported shim with the same name.
        const wasmUrl = (await import('harper-wasm/harper_wasm_bg.wasm?url')).default;
        const bytes = await (await fetch(wasmUrl)).arrayBuffer();
        const wasmModule = new WebAssembly.Module(bytes);
        const imports: Record<string, Record<string, unknown>> = {};
        for (const imp of WebAssembly.Module.imports(wasmModule)) {
          const fn = (bg as Record<string, unknown>)[imp.name];
          if (typeof fn !== 'function') {
            throw new Error(`Missing WASM import ${imp.module}::${imp.name}`);
          }
          (imports[imp.module] ??= {})[imp.name] = fn;
        }
        const instance = new WebAssembly.Instance(wasmModule, imports as unknown as WebAssembly.Imports);
        const exports = instance.exports;
        (bg as HarperBgApi).__wbg_set_wasm(exports);
        // Match the official harper_wasm.js bootstrap: run the wasm start fn.
        try {
          const startFn = (exports as Record<string, unknown>).__wbindgen_start;
          if (typeof startFn === 'function') (startFn as () => void)();
        } catch (startErr) {
          console.warn('[grammarEngine] __wbindgen_start raised (continuing):', startErr);
        }
        // NOTE: api.setup() is intentionally NOT called — it installs a
        // tracing-wasm global dispatcher and panics when one already exists
        // (harmless but noisy). Logging is optional for Harper to function.
        harperBg = bg as HarperBgApi;
        harperReady = true;
        try { (window as unknown as Record<string, unknown>).__mundusDebugHarper = debugLint; } catch { /* non-browser */ }
        return true;
      } catch (err) {
        console.error('[grammarEngine] Harper WASM failed to load — falling back to dictionary suggestions:', err);
        return false;
      }
    })();
  }
  return harperPromise;
}

/** True once ensureHarper() has succeeded. */
export function isHarperReady(): boolean {
  return harperReady;
}

// ---------------------------------------------------------------------------
// Lint API
// ---------------------------------------------------------------------------

/** Run Harper lints on `text`. Returns [] when the engine is not loaded. */
export function lintText(text: string): GrammarLint[] {
  if (!harperReady || !harperBg || !text || !text.trim()) return [];
  try {
    const bg = harperBg;
    const raw = bg.lint(text);
    const out: GrammarLint[] = [];
    for (const lint of raw) {
      const span = lint.span();
      const suggestions: GrammarSuggestion[] = [];
      try {
        for (const s of lint.suggestions()) {
          suggestions.push({ replacement: s.get_replacement_text(), remove: s.kind() === 1 });
          try { s.free(); } catch { /* ignore */ }
        }
      } catch { /* suggestions are best-effort */ }
      out.push({
        start: span.start,
        end: span.end,
        problemText: lint.get_problem_text(),
        lintKind: lint.lint_kind(),
        message: lint.message(),
        suggestions,
      });
      try { lint.free(); } catch { /* ignore */ }
    }
    return out;
  } catch (err) {
    console.error('[grammarEngine] lint failed:', err);
    return [];
  }
}

/**
 * Debug/test hook (exposed as window.__mundusDebugHarper after load):
 * returns plain-object lints for a text, safe to inspect from Playwright.
 */
export function debugLint(text: string): Array<{ start: number; end: number; problem: string; kind: string; message: string; suggestions: string[] }> {
  return lintText(text).map((l) => ({
    start: l.start,
    end: l.end,
    problem: l.problemText,
    kind: l.lintKind,
    message: l.message,
    suggestions: l.suggestions.map((s) => (s.remove ? '(delete)' : s.replacement)),
  }));
}

// ---------------------------------------------------------------------------
// Pure mapping helpers (unit-tested in scripts/test_nightly_features.ts)
// ---------------------------------------------------------------------------

/**
 * Pick the lint that applies to the caret word span [caretStart, caretEnd).
 * Prefers the smallest span that overlaps the caret span, and only considers
 * lints that actually carry at least one suggestion (Harper emits some
 * advisory lints, e.g. Readability, with no actionable suggestion).
 */
export function pickCaretLint(lints: GrammarLint[], caretStart: number, caretEnd: number): GrammarLint | null {
  let best: GrammarLint | null = null;
  let bestSize = Number.POSITIVE_INFINITY;
  for (const lint of lints) {
    if (!lint.suggestions.length) continue;
    if (lint.end <= caretStart || lint.start >= caretEnd) continue; // no overlap
    const size = lint.end - lint.start;
    // Prefer a lint that exactly covers the caret word, otherwise the smallest
    // overlapping span (a two-word grammar lint beats a whole-sentence one).
    const exact = lint.start === caretStart && lint.end === caretEnd;
    const bestExact = best && best.start === caretStart && best.end === caretEnd;
    if (exact) return lint;
    if (bestExact) continue;
    if (size < bestSize) {
      best = lint;
      bestSize = size;
    }
  }
  return best;
}

/**
 * Map a lint into the inline-popup state fields. Returns null when the lint
 * has no usable suggestion. Remove-kind suggestions surface as '(delete)'.
 *
 * v0.8.0: the popup can now cycle through up to THREE corrections with the
 * arrow keys, so the full candidate list is returned as `choices` (index 0
 * keeps historical precedence, i.e. Harper's own top suggestion). The
 * pre-0.8.0 `replacement`/`alternatives` fields are still filled in for
 * backward compatibility (unit tests + dictionary fallback consumers).
 */
export function lintToSuggestion(lint: GrammarLint): {
  originalWord: string;
  replacement: string;
  alternatives: string[];
  choices: string[];
  lintKind: string;
  grammarMessage: string;
} | null {
  if (!lint.suggestions.length) return null;
  const first = lint.suggestions[0];
  // Build the cycle list: up to 3 unique candidates, Remove-kind mapped to ''.
  const choices: string[] = [];
  for (const s of lint.suggestions) {
    if (choices.length >= 3) break;
    if (!s.remove && !s.replacement) continue; // skip empty non-remove entries
    const val = s.remove ? '' : s.replacement;
    if (choices.includes(val)) continue; // dedupe identical candidates
    choices.push(val);
  }
  if (choices.length === 0) return null;
  const alternatives = lint.suggestions
    .slice(1, 3)
    .map((s) => (s.remove ? '(delete)' : s.replacement))
    .filter((t) => t && t !== first.replacement);
  return {
    originalWord: lint.problemText,
    replacement: choices[0],
    alternatives,
    choices,
    lintKind: lint.lintKind,
    grammarMessage: lint.message,
  };
}

/**
 * When a Remove suggestion is accepted, collapse ONE adjacent space so
 * deleting a duplicated word does not leave a double space behind.
 * Returns adjusted [start, end] for the splice.
 */
export function adjustedRemoveSpan(text: string, start: number, end: number): [number, number] {
  if (text[start - 1] === ' ' && text[end] === ' ') return [start - 1, end];
  if (text[end - 1] === ' ' && text[end] === ' ') return [start, end + 1];
  return [start, end];
}
