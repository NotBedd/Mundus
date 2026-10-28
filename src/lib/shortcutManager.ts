import type { CustomKeybindings, ShortcutBinding } from '../types';

export const DEFAULT_KEYBINDINGS: CustomKeybindings = {
  undo: { key: 'z', ctrlOrCmd: true },
  redo: { key: 'y', ctrlOrCmd: true },
  bold: { key: 'b', ctrlOrCmd: true },
  italic: { key: 'i', ctrlOrCmd: true },
  strikethrough: { key: 'x', ctrlOrCmd: true, shift: true },
  // v0.7.93: lists & blocks
  quote: { key: 'q', ctrlOrCmd: true },
  numberList: { key: 'n', ctrlOrCmd: true },
  bulletList: { key: 'l', ctrlOrCmd: true },
  // v0.7.93: colors
  highlighter: { key: 'h', ctrlOrCmd: true },
  // modes / views
  zenMode: { key: 'z', ctrlOrCmd: true, shift: true },
  focusMode: { key: 'f', ctrlOrCmd: true, shift: true },
  quickSearch: { key: 'k', ctrlOrCmd: true },
  navWriting: { key: '1', ctrlOrCmd: true, alt: true },
  navCharacters: { key: '2', ctrlOrCmd: true, alt: true },
  navLore: { key: '3', ctrlOrCmd: true, alt: true },
  navWorldBuilding: { key: '4', ctrlOrCmd: true, alt: true },
  navMundus: { key: '5', ctrlOrCmd: true, alt: true },
  // v0.7.93: panels & views
  toggleSidebar: { key: ' ', ctrlOrCmd: true },
  spellingReview: { key: 'tab', ctrlOrCmd: true },
  zoomIn: { key: '=', ctrlOrCmd: true },
  zoomOut: { key: '-', ctrlOrCmd: true },
  // v0.7.93: cursor & bars
  caretToEnd: { key: ' ', alt: true },
  focusTopBar: { key: 'arrowup', alt: true },
  focusBottomBar: { key: 'arrowdown', alt: true },
  focusSidebar: { key: 'arrowleft', alt: true }
};

let cachedKeybindings: CustomKeybindings | null = null;

export function getKeybindings(): CustomKeybindings {
  if (cachedKeybindings) {
    return cachedKeybindings;
  }
  try {
    const raw = localStorage.getItem('mundus_custom_keybindings');
    if (raw) {
      const parsed = JSON.parse(raw);
      cachedKeybindings = { ...DEFAULT_KEYBINDINGS, ...parsed };
      return cachedKeybindings;
    }
  } catch (e) {
    console.error('Failed to load keybindings:', e);
  }
  cachedKeybindings = { ...DEFAULT_KEYBINDINGS };
  return cachedKeybindings;
}

export function saveKeybindings(bindings: CustomKeybindings): void {
  cachedKeybindings = { ...bindings };
  try {
    localStorage.setItem('mundus_custom_keybindings', JSON.stringify(bindings));
  } catch (e) {
    console.error('Failed to save keybindings:', e);
  }
}

/** Test-only: clears the in-memory cache so storage-merge paths can be tested. */
export function resetKeybindingsCacheForTests(): void {
  cachedKeybindings = null;
}

/** Human-readable label for special keys (Space, Tab, arrows, …). */
const KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  tab: 'Tab',
  enter: 'Enter',
  escape: 'Esc',
  '=': '=',
  '+': '+',
  '-': '−',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  home: 'Home',
  end: 'End',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  delete: 'Del',
  backspace: 'Bksp'
};

export function formatBinding(binding: ShortcutBinding): string {
  const parts: string[] = [];
  if (binding.ctrlOrCmd) parts.push('Ctrl/Cmd');
  if (binding.shift) parts.push('Shift');
  if (binding.alt) parts.push('Alt');
  const keyLower = (binding.key || '').toLowerCase();
  parts.push(KEY_LABELS[keyLower] || (binding.key || '?').toUpperCase());
  return parts.join(' + ');
}

export function matchesBinding(e: KeyboardEvent, binding: ShortcutBinding): boolean {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (!!binding.ctrlOrCmd !== isCtrlOrCmd) return false;
  if (!!binding.shift !== e.shiftKey) return false;
  if (!!binding.alt !== e.altKey) return false;
  return e.key.toLowerCase() === binding.key.toLowerCase();
}

/** v0.7.96: exact-combo equality (key case-insensitive, modifiers as booleans). */
export function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    (a.key || '').toLowerCase() === (b.key || '').toLowerCase() &&
    !!a.ctrlOrCmd === !!b.ctrlOrCmd &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt
  );
}

/**
 * v0.7.96: returns the ids of every OTHER action whose binding is identical to
 * `binding`. Settings uses this to warn when a shortcut is assigned twice —
 * a duplicate combination fires BOTH actions on the same keypress.
 */
export function findBindingConflicts(
  bindings: CustomKeybindings,
  excludeId: keyof CustomKeybindings | null,
  binding: ShortcutBinding
): (keyof CustomKeybindings)[] {
  const conflicts: (keyof CustomKeybindings)[] = [];
  (Object.keys(bindings) as (keyof CustomKeybindings)[]).forEach((id) => {
    if (id === excludeId) return;
    const other = bindings[id];
    if (other && bindingsEqual(other, binding)) conflicts.push(id);
  });
  return conflicts;
}

/**
 * v0.7.93: zoom bindings tolerate keyboard reality — Ctrl+= and Ctrl+Shift+=
 * (which produces '+') both count as "zoom in", so users never have to think
 * about which physical key produces the plus sign on their layout.
 */
export function matchesZoomBinding(e: KeyboardEvent, binding: ShortcutBinding, direction: 'in' | 'out'): boolean {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (!!binding.ctrlOrCmd !== isCtrlOrCmd) return false;
  if (!!binding.alt !== e.altKey) return false;
  const keyLower = e.key.toLowerCase();
  if (direction === 'in') {
    return binding.key === '=' && (keyLower === '=' || keyLower === '+');
  }
  return binding.key === '-' && keyLower === '-';
}
