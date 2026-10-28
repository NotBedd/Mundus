import { safeJsonStringify } from './storage';

/**
 * v0.7.96: Story Flow Graph layout persistence helpers.
 *
 * The graph keeps two localStorage keys per world:
 *   - `mundus_story_flow_nodes_<mundusId>`      → string[] of placed document ids
 *   - `mundus_story_flow_positions_<mundusId>`  → { [docId]: { x, y } }
 *
 * That state used to live ONLY in localStorage, so restoring a Mundus from a
 * backup (app-wide backup, per-Mundus backup, or a local snapshot) on a fresh
 * install / another device dropped every scene into default stacked positions,
 * and imports that rename colliding ids silently detached the saved layout.
 * These helpers let backup payloads carry, remap, merge and restore the layout.
 */

export interface StoryFlowNodePosition {
  x: number;
  y: number;
}

export interface StoryFlowLayout {
  /** Document ids currently placed on the graph canvas, in placement order. */
  nodes: string[];
  /** Position per placed document id. */
  positions: Record<string, StoryFlowNodePosition>;
}

/** Same 'default' fallback the StoryFlowGraph component uses pre-mundusId. */
const keySuffix = (mundusId: string | null | undefined): string => mundusId || 'default';

export const storyFlowNodesKey = (mundusId: string | null | undefined): string =>
  `mundus_story_flow_nodes_${keySuffix(mundusId)}`;

export const storyFlowPositionsKey = (mundusId: string | null | undefined): string =>
  `mundus_story_flow_positions_${keySuffix(mundusId)}`;

const isFiniteNumber = (v: any): v is number => typeof v === 'number' && Number.isFinite(v);

const isValidPosition = (p: any): p is StoryFlowNodePosition =>
  Boolean(p) && typeof p === 'object' && isFiniteNumber(p.x) && isFiniteNumber(p.y);

/**
 * Reads a world's layout from localStorage. Returns null when nothing has
 * been placed yet (or the stored data is unusable) so backups from worlds
 * that never used the graph stay clean.
 */
export const readStoryFlowLayout = (mundusId: string | null | undefined): StoryFlowLayout | null => {
  try {
    let nodes: string[] = [];
    const rawNodes = localStorage.getItem(storyFlowNodesKey(mundusId));
    if (rawNodes) {
      const parsed = JSON.parse(rawNodes);
      if (Array.isArray(parsed)) {
        nodes = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
      }
    }
    if (nodes.length === 0) return null;

    let positions: Record<string, StoryFlowNodePosition> = {};
    const rawPositions = localStorage.getItem(storyFlowPositionsKey(mundusId));
    if (rawPositions) {
      const parsed = JSON.parse(rawPositions);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [id, pos] of Object.entries<any>(parsed)) {
          if (isValidPosition(pos)) positions[id] = { x: pos.x, y: pos.y };
        }
      }
    }

    return { nodes, positions };
  } catch {
    return null;
  }
};

/**
 * Writes a layout into the world's two localStorage keys. Missing/invalid
 * entries are skipped rather than poisoning the graph's own loader.
 */
export const writeStoryFlowLayout = (mundusId: string | null | undefined, layout: StoryFlowLayout | null | undefined): void => {
  if (!layout || !Array.isArray(layout.nodes)) return;
  try {
    const nodes = layout.nodes.filter((id): id is string => typeof id === 'string' && id.length > 0);
    localStorage.setItem(storyFlowNodesKey(mundusId), safeJsonStringify(nodes));
    const positions: Record<string, StoryFlowNodePosition> = {};
    if (layout.positions && typeof layout.positions === 'object') {
      for (const [id, pos] of Object.entries<any>(layout.positions)) {
        if (isValidPosition(pos)) positions[id] = { x: pos.x, y: pos.y };
      }
    }
    localStorage.setItem(storyFlowPositionsKey(mundusId), safeJsonStringify(positions));
  } catch (err) {
    console.warn('Failed to persist story flow layout:', err);
  }
};

/** Normalizes an untrusted (backup payload) layout. Null when unusable. */
export const normalizeStoryFlowLayout = (raw: any): StoryFlowLayout | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.filter((id: any): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (nodes.length === 0) return null;
  const positions: Record<string, StoryFlowNodePosition> = {};
  if (raw.positions && typeof raw.positions === 'object' && !Array.isArray(raw.positions)) {
    for (const [id, pos] of Object.entries<any>(raw.positions)) {
      if (isValidPosition(pos)) positions[id] = { x: pos.x, y: pos.y };
    }
  }
  return { nodes, positions };
};

/**
 * Remaps node ids (and therefore position keys) through `renameMap` — used on
 * import when colliding item ids are renamed to keep foreign worlds intact.
 */
export const remapStoryFlowLayout = (
  layout: StoryFlowLayout,
  renameMap: Map<string, string>
): StoryFlowLayout => {
  if (renameMap.size === 0) return layout;
  const remap = (id: string) => renameMap.get(id) || id;
  const positions: Record<string, StoryFlowNodePosition> = {};
  for (const [id, pos] of Object.entries(layout.positions)) {
    positions[remap(id)] = pos;
  }
  return { nodes: layout.nodes.map(remap), positions };
};

/**
 * Merges an incoming (backup) layout over the world's current one:
 * node order starts from the current layout, new nodes are appended, and the
 * backup wins for shared ids. Position data for nodes that are no longer in
 * `nodes` is dropped so the stored map stays in sync with what is placed.
 */
export const mergeStoryFlowLayouts = (
  current: StoryFlowLayout | null,
  incoming: StoryFlowLayout
): StoryFlowLayout => {
  const nodes: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      nodes.push(id);
    }
  };
  (current?.nodes || []).forEach(push);
  incoming.nodes.forEach(push);

  const positions: Record<string, StoryFlowNodePosition> = {
    ...(current?.positions || {}),
    ...incoming.positions,
  };
  const pruned: Record<string, StoryFlowNodePosition> = {};
  nodes.forEach((id) => {
    if (positions[id]) pruned[id] = positions[id];
  });
  return { nodes, positions: pruned };
};

/** Removes both localStorage keys — used when a world is deleted. */
export const clearStoryFlowLayout = (mundusId: string | null | undefined): void => {
  try {
    localStorage.removeItem(storyFlowNodesKey(mundusId));
    localStorage.removeItem(storyFlowPositionsKey(mundusId));
  } catch {
    /* storage unavailable — nothing to clean */
  }
};
