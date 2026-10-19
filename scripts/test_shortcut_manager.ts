/**
 * v0.7.93 — Keyboard shortcut infrastructure tests.
 * Covers: DEFAULT_KEYBINDINGS completeness, legacy-binding merge (old stored
 * profiles still get the new defaults), formatBinding special-key labels,
 * matchesBinding modifier exactness, and matchesZoomBinding '='/'+' tolerance.
 */
import {
  DEFAULT_KEYBINDINGS,
  formatBinding,
  getKeybindings,
  matchesBinding,
  matchesZoomBinding,
  resetKeybindingsCacheForTests
} from '../src/lib/shortcutManager';
import type { CustomKeybindings, ShortcutBinding } from '../src/types';

// node has no localStorage — minimal stub (shortcutManager touches it lazily)
const __store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (__store.has(k) ? __store.get(k)! : null),
  setItem: (k: string, v: string) => { __store.set(k, String(v)); },
  removeItem: (k: string) => { __store.delete(k); }
};

// Reset the module cache so tests start from a clean slate.
localStorage.removeItem('mundus_custom_keybindings');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e: any) {
    failed++;
    failures.push(`${name}: ${e?.message || e}`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function keyEvent(init: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }): KeyboardEvent {
  // jsdom-free harness: build a minimal event-like object.
  return {
    key: init.key,
    ctrlKey: !!init.ctrl,
    shiftKey: !!init.shift,
    altKey: !!init.alt,
    metaKey: !!init.meta
  } as unknown as KeyboardEvent;
}

// ---------------------------------------------------------------------------
// 1. Defaults: every new v0.7.93 action exists with the requested default.
// ---------------------------------------------------------------------------
test('defaults: new v0.7.93 bindings exist with correct defaults', () => {
  const expected: Record<string, ShortcutBinding> = {
    quote: { key: 'q', ctrlOrCmd: true },
    numberList: { key: 'n', ctrlOrCmd: true },
    bulletList: { key: 'l', ctrlOrCmd: true },
    highlighter: { key: 'h', ctrlOrCmd: true },
    toggleSidebar: { key: ' ', ctrlOrCmd: true },
    spellingReview: { key: 'tab', ctrlOrCmd: true },
    zoomIn: { key: '=', ctrlOrCmd: true },
    zoomOut: { key: '-', ctrlOrCmd: true },
    caretToEnd: { key: ' ', alt: true },
    focusTopBar: { key: 'arrowup', alt: true },
    focusBottomBar: { key: 'arrowdown', alt: true },
    focusSidebar: { key: 'arrowleft', alt: true }
  };
  for (const [action, binding] of Object.entries(expected)) {
    const actual = (DEFAULT_KEYBINDINGS as any)[action];
    assert(actual, `missing default binding for ${action}`);
    assert(actual.key === binding.key, `${action}: expected key ${binding.key}, got ${actual.key}`);
    assert(!!actual.ctrlOrCmd === !!binding.ctrlOrCmd, `${action}: ctrlOrCmd mismatch`);
    assert(!!actual.alt === !!binding.alt, `${action}: alt mismatch`);
    assert(!!actual.shift === !!binding.shift, `${action}: shift mismatch`);
  }
});

test('defaults: legacy bindings unchanged', () => {
  assert(DEFAULT_KEYBINDINGS.undo.key === 'z' && DEFAULT_KEYBINDINGS.undo.ctrlOrCmd, 'undo changed');
  assert(DEFAULT_KEYBINDINGS.zenMode.key === 'z' && DEFAULT_KEYBINDINGS.zenMode.shift, 'zenMode changed');
  assert(DEFAULT_KEYBINDINGS.navMundus.key === '5', 'navMundus changed');
});

// ---------------------------------------------------------------------------
// 2. Merge: a stored pre-0.7.93 profile (no new fields) still yields the new
//    defaults while preserving the user's old customizations.
// ---------------------------------------------------------------------------
test('merge: stored legacy profile gains new defaults, keeps old customizations', () => {
  const legacy = {
    undo: { key: 'u', ctrlOrCmd: true }, // pretend the user rebound undo
    bold: { key: 'b', ctrlOrCmd: true }
  } as unknown as CustomKeybindings;

  // Simulate a pre-0.7.93 profile found in storage on a fresh launch:
  localStorage.setItem('mundus_custom_keybindings', JSON.stringify(legacy));
  resetKeybindingsCacheForTests();
  const loaded = getKeybindings();
  assert((loaded as any).undo.key === 'u', 'legacy undo customization lost');
  assert((loaded as any).toggleSidebar && (loaded as any).toggleSidebar.key === ' ', 'new toggleSidebar default missing after merge');
  assert((loaded as any).caretToEnd && (loaded as any).caretToEnd.alt, 'new caretToEnd default missing after merge');
  assert((loaded as any).zoomIn && (loaded as any).zoomIn.key === '=', 'new zoomIn default missing after merge');
});

// ---------------------------------------------------------------------------
// 3. formatBinding: special-key labels.
// ---------------------------------------------------------------------------
test('formatBinding: special keys render human-readable labels', () => {
  assert(formatBinding({ key: ' ', ctrlOrCmd: true }) === 'Ctrl/Cmd + Space', `space label wrong: ${formatBinding({ key: ' ', ctrlOrCmd: true })}`);
  assert(formatBinding({ key: 'tab', ctrlOrCmd: true }) === 'Ctrl/Cmd + Tab', 'tab label wrong');
  assert(formatBinding({ key: 'arrowdown', alt: true }) === 'Alt + ↓', 'arrowdown label wrong');
  assert(formatBinding({ key: 'arrowup', alt: true }) === 'Alt + ↑', 'arrowup label wrong');
  assert(formatBinding({ key: 'arrowleft', alt: true }) === 'Alt + ←', 'arrowleft label wrong');
  assert(formatBinding({ key: 'q', ctrlOrCmd: true }) === 'Ctrl/Cmd + Q', 'letter label wrong');
});

// ---------------------------------------------------------------------------
// 4. matchesBinding: modifier-exact matching.
// ---------------------------------------------------------------------------
test('matchesBinding: exact modifier matching for new bindings', () => {
  const quote = DEFAULT_KEYBINDINGS.quote;
  assert(matchesBinding(keyEvent({ key: 'q', ctrl: true }), quote), 'Ctrl+Q should match quote');
  assert(!matchesBinding(keyEvent({ key: 'q', ctrl: true, shift: true }), quote), 'Ctrl+Shift+Q must NOT match quote (shift-exact)');
  assert(!matchesBinding(keyEvent({ key: 'q' }), quote), 'plain Q must NOT match quote');

  const caretToEnd = DEFAULT_KEYBINDINGS.caretToEnd;
  assert(matchesBinding(keyEvent({ key: ' ', alt: true }), caretToEnd), 'Alt+Space should match caretToEnd');
  assert(!matchesBinding(keyEvent({ key: ' ', ctrl: true, alt: true }), caretToEnd), 'Ctrl+Alt+Space must NOT match caretToEnd');

  const spelling = DEFAULT_KEYBINDINGS.spellingReview;
  assert(matchesBinding(keyEvent({ key: 'Tab', ctrl: true }), spelling), 'Ctrl+Tab should match spellingReview (case-insensitive)');
});

// ---------------------------------------------------------------------------
// 5. matchesZoomBinding: '=' tolerates '+' and Shift (Ctrl+Shift+= layouts).
// ---------------------------------------------------------------------------
test('matchesZoomBinding: zoom in accepts = and +, with or without shift', () => {
  const zoomIn = DEFAULT_KEYBINDINGS.zoomIn;
  const zoomOut = DEFAULT_KEYBINDINGS.zoomOut;
  assert(matchesZoomBinding(keyEvent({ key: '=', ctrl: true }), zoomIn, 'in'), 'Ctrl+= should match zoomIn');
  assert(matchesZoomBinding(keyEvent({ key: '+', ctrl: true, shift: true }), zoomIn, 'in'), 'Ctrl+Shift+= (key "+") should match zoomIn');
  assert(!matchesZoomBinding(keyEvent({ key: '-', ctrl: true }), zoomIn, 'in'), 'Ctrl+- must NOT match zoomIn');
  assert(matchesZoomBinding(keyEvent({ key: '-', ctrl: true }), zoomOut, 'out'), 'Ctrl+- should match zoomOut');
  assert(!matchesZoomBinding(keyEvent({ key: '-', alt: true }), zoomOut, 'out'), 'Alt+- must NOT match zoomOut');
  assert(!matchesZoomBinding(keyEvent({ key: '=', ctrl: true }), zoomOut, 'out'), 'Ctrl+= must NOT match zoomOut');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(failures.map((f) => `  FAIL: ${f}`).join('\n'));
  process.exit(1);
}
