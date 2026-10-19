import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { 
  GitFork, 
  Plus, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  BookOpen, 
  FolderIcon, 
  Link2, 
  Trash2, 
  Check, 
  X, 
  Sparkles, 
  Feather, 
  Layers, 
  Search,
  ChevronRight,
  Clock,
  Calendar,
  CornerDownRight,
  ArrowDown,
  Lock
} from 'lucide-react';
import type { NovelDocument, Folder, StoryNodeLink, StoryLinkType, TimelineConfig, SceneTimelineInfo } from '../../types';
import { SceneTimelineModal } from './SceneTimelineModal';

interface StoryFlowGraphProps {
  documents: NovelDocument[];
  folders: Folder[];
  storyLinks: StoryNodeLink[];
  timelineConfig?: TimelineConfig;
  activeMundusId?: string;
  onSaveSceneTimelineInfo?: (docId: string, info: SceneTimelineInfo) => void;
  onSaveStoryLink: (link: Partial<StoryNodeLink>) => void;
  onDeleteStoryLink: (linkId: string) => void;
  onSelectDocumentForEditor: (docId: string) => void;
  onReturnToHub: () => void;
  isDarkMode: boolean;
}

export const LINK_TYPE_CONFIG: Record<StoryLinkType, { label: string; color: string; strokeDash?: string }> = {
  leads_to: { label: 'Leads To (Sequence)', color: '#3b82f6' },
  causes: { label: 'Causes (Consequence)', color: '#ef4444' },
  parallel: { label: 'Parallel Subplot', color: '#10b981', strokeDash: '5,5' },
  flashback: { label: 'Flashback / Memory', color: '#a855f7', strokeDash: '4,4' },
  foreshadows: { label: 'Foreshadows / Seed', color: '#f59e0b', strokeDash: '6,3' },
  branching: { label: 'Branching Fork', color: '#ec4899', strokeDash: '3,3' }
};

export const NODE_WIDTH = 270;
export const NODE_HEIGHT = 140;
export const COL_GAP = 90;
export const COL_SPACING = NODE_WIDTH + COL_GAP; // 360px
export const ROW_GAP = 55;
export const ROW_UNIT = NODE_HEIGHT + ROW_GAP; // 215px
export const ORIGIN_X = 80;
export const ORIGIN_Y = 80;

export function getAncestors(startId: string, links: StoryNodeLink[]): Set<string> {
  const ancestors = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    links.forEach((l) => {
      if (l.toDocId === curr && !ancestors.has(l.fromDocId)) {
        if (l.linkType !== 'flashback' && l.linkType !== 'foreshadows') {
          ancestors.add(l.fromDocId);
          queue.push(l.fromDocId);
        }
      }
    });
  }
  return ancestors;
}

export function getForwardDescendants(startId: string, links: StoryNodeLink[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    links.forEach((l) => {
      if (l.fromDocId === curr && !descendants.has(l.toDocId)) {
        if (l.linkType !== 'flashback' && l.linkType !== 'foreshadows') {
          descendants.add(l.toDocId);
          queue.push(l.toDocId);
        }
      }
    });
  }
  return descendants;
}

/**
 * Wraps text into multiple lines for SVG label badges so it adapts in shape to fit
 * between scene blocks rather than extending underneath them.
 */
export function wrapTextToFit(text: string, maxCharsPerLine: number, maxLines: number = 4): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      if (word.length > maxCharsPerLine) {
        lines.push(word.slice(0, maxCharsPerLine));
        currentLine = word.slice(maxCharsPerLine);
      } else {
        currentLine = word;
      }
    } else if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      if (lines.length >= maxLines - 1) {
        currentLine = word;
        break;
      }
      if (word.length > maxCharsPerLine) {
        lines.push(word.slice(0, maxCharsPerLine));
        currentLine = word.slice(maxCharsPerLine);
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.slice(0, maxLines);
}

/**
 * Expands the connection line if a link has custom notes/labels that require more room,
 * shifting the destination node and all downstream nodes attached to it to the right.
 */
export function expandLineForLinkNotes(
  positions: Record<string, { x: number; y: number }>,
  nodeIds: string[],
  links: StoryNodeLink[]
): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = { ...positions };

  links.forEach((link) => {
    const text = (link.label || link.notes || '').trim();
    if (!text) return;
    if (link.linkType === 'flashback' || link.linkType === 'foreshadows') return;

    const fromPos = result[link.fromDocId];
    const toPos = result[link.toDocId];
    if (!fromPos || !toPos) return;

    const fromRight = fromPos.x + NODE_WIDTH;
    if (toPos.x > fromRight) {
      // Comfortable space for the note pill + margin
      const neededPillWidth = Math.min(220, Math.max(70, text.length * 6.8 + 24));
      const desiredGap = neededPillWidth + 36;
      const currentGap = toPos.x - fromRight;

      if (currentGap < desiredGap) {
        const shiftX = Math.round(desiredGap - currentGap);

        // Find all attached forward descendants reachable from toDocId
        const attachedNodes = new Set<string>([
          link.toDocId,
          ...getForwardDescendants(link.toDocId, links)
        ]);

        // Shift the target and its descendants to the right
        attachedNodes.forEach((nodeId) => {
          if (result[nodeId]) {
            result[nodeId] = {
              x: result[nodeId].x + shiftX,
              y: result[nodeId].y
            };
          }
        });

        // Also shift any other nodes in nodeIds that are already positioned further to the right
        // to preserve relative order and avoid collisions
        nodeIds.forEach((nodeId) => {
          if (!attachedNodes.has(nodeId) && result[nodeId] && result[nodeId].x >= toPos.x) {
            result[nodeId] = {
              x: result[nodeId].x + shiftX,
              y: result[nodeId].y
            };
          }
        });
      }
    }
  });

  return result;
}

/**
 * Intelligent tree non-overlap algorithm:
 * 1. Groups active graph nodes into connected components (trees).
 * 2. Checks if the branches of a tree above (e.g. tree X) reach down enough to overlap
 *    with the branches of any tree below it (e.g. tree Y).
 * 3. If an overlap is detected, shifts ALL nodes in tree Y down by the required deficit
 *    so that no two cards overlap, keeping tree Y's relative link shapes and branches intact.
 */
export function resolveTreeNonOverlap(
  positions: Record<string, { x: number; y: number }>,
  nodeIds: string[],
  links: StoryNodeLink[]
): Record<string, { x: number; y: number }> {
  if (nodeIds.length <= 1) return { ...positions };

  const result: Record<string, { x: number; y: number }> = {};
  nodeIds.forEach((id) => {
    if (positions[id]) {
      result[id] = { ...positions[id] };
    } else {
      result[id] = { x: ORIGIN_X, y: ORIGIN_Y };
    }
  });

  const activeSet = new Set(nodeIds);

  // Build undirected adjacency between active nodes
  const adj = new Map<string, Set<string>>();
  nodeIds.forEach((id) => adj.set(id, new Set()));

  links.forEach((l) => {
    if (activeSet.has(l.fromDocId) && activeSet.has(l.toDocId)) {
      adj.get(l.fromDocId)?.add(l.toDocId);
      adj.get(l.toDocId)?.add(l.fromDocId);
    }
  });

  // Find connected components
  const visited = new Set<string>();
  const components: string[][] = [];

  nodeIds.forEach((id) => {
    if (!visited.has(id)) {
      const comp: string[] = [];
      const queue = [id];
      visited.add(id);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        comp.push(curr);
        adj.get(curr)?.forEach((neighbor) => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        });
      }
      components.push(comp);
    }
  });

  // Sort components vertically based on the minimum y of their member nodes
  components.sort((compA, compB) => {
    const minY_A = Math.min(...compA.map((id) => result[id]?.y ?? ORIGIN_Y));
    const minY_B = Math.min(...compB.map((id) => result[id]?.y ?? ORIGIN_Y));
    return minY_A - minY_B;
  });

  // For each component from top to bottom, ensure it does not overlap with any preceding component,
  // and compact any excessive empty vertical gaps left by deleted scenes.
  for (let i = 1; i < components.length; i++) {
    const currentComp = components[i];
    const prevComponentsNodes = components.slice(0, i).flat();

    const maxY_preceding = Math.max(
      ...prevComponentsNodes.map((id) => (result[id]?.y ?? ORIGIN_Y) + NODE_HEIGHT)
    );
    const maxX_preceding = Math.max(
      ...prevComponentsNodes.map((id) => (result[id]?.x ?? ORIGIN_X) + NODE_WIDTH)
    );
    const minX_curr = Math.min(...currentComp.map((id) => result[id]?.x ?? ORIGIN_X));
    const currentMinY = Math.min(...currentComp.map((id) => result[id]?.y ?? ORIGIN_Y));

    let minAllowedShift = -Infinity;
    let hasXOverlap = false;

    for (const nodeAboveId of prevComponentsNodes) {
      const posAbove = result[nodeAboveId];
      if (!posAbove) continue;

      for (const nodeBelowId of currentComp) {
        const posBelow = result[nodeBelowId];
        if (!posBelow) continue;

        // Overlap occurs if horizontal distance between centers is less than NODE_WIDTH + 20
        const xOverlap = Math.abs(posAbove.x - posBelow.x) < NODE_WIDTH + 20;
        if (xOverlap) {
          hasXOverlap = true;
          const minAllowedY = posAbove.y + ROW_UNIT;
          const shiftNeeded = minAllowedY - posBelow.y;
          if (shiftNeeded > minAllowedShift) {
            minAllowedShift = shiftNeeded;
          }
        }
      }
    }

    let targetShift = 0;
    if (hasXOverlap) {
      // Tree sits below or overlaps columns with preceding components; pack tightly with standard 50px inter-tree gap
      const desiredGapShift = (maxY_preceding + 50) - currentMinY;
      targetShift = Math.max(minAllowedShift, desiredGapShift);
    } else {
      // Tree is horizontally separated
      if (minX_curr > maxX_preceding + 40) {
        // Completely to the right; if floating too low without reason, align near top
        if (currentMinY > ORIGIN_Y + 120) {
          targetShift = ORIGIN_Y - currentMinY;
        }
      } else {
        // Positioned under preceding trees
        targetShift = (maxY_preceding + 50) - currentMinY;
      }
    }

    // Shift ALL nodes of currentComp as a rigid body to avoid any link distortion
    if (Math.abs(targetShift) > 1) {
      currentComp.forEach((id) => {
        if (result[id]) {
          result[id] = {
            x: result[id].x,
            y: Math.max(ORIGIN_Y, Math.round(result[id].y + targetShift))
          };
        }
      });
    }
  }

  // Internal column collision check within components for any cards placed on identical coordinates
  const colBuckets = new Map<number, string[]>();
  nodeIds.forEach((id) => {
    const xCoord = Math.round(result[id].x / 40) * 40;
    if (!colBuckets.has(xCoord)) colBuckets.set(xCoord, []);
    colBuckets.get(xCoord)!.push(id);
  });

  colBuckets.forEach((docIds) => {
    docIds.sort((a, b) => result[a].y - result[b].y);
    for (let k = 1; k < docIds.length; k++) {
      const prevId = docIds[k - 1];
      const currId = docIds[k];
      if (result[currId].y < result[prevId].y + ROW_UNIT) {
        const shift = result[prevId].y + ROW_UNIT - result[currId].y;
        result[currId] = {
          x: result[currId].x,
          y: result[currId].y + shift
        };
        // Also shift all forward descendants of currId so branches remain intact
        const descendants = getForwardDescendants(currId, links);
        descendants.forEach((dId) => {
          if (result[dId]) {
            result[dId] = {
              x: result[dId].x,
              y: result[dId].y + shift
            };
          }
        });
      }
    }
  });

  return result;
}

/**
 * Resolves parallel subplots so they sit directly below their parent scene.
 * If another branch (e.g. Scene 4) was occupying that vertical slot, that branch
 * and its relative descendants (e.g. Scene 7) are shifted down so the parallel
 * scene (e.g. Scene 6) can be right below the source (e.g. Scene 3).
 */
export function resolveParallelAndBranchPlacement(
  positions: Record<string, { x: number; y: number }>,
  nodeIds: string[],
  links: StoryNodeLink[]
): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = {};
  nodeIds.forEach((id) => {
    if (positions[id]) result[id] = { ...positions[id] };
    else result[id] = { x: ORIGIN_X, y: ORIGIN_Y };
  });

  const validSet = new Set(nodeIds);
  const parallelLinks = links.filter(
    (l) => l.linkType === 'parallel' && validSet.has(l.fromDocId) && validSet.has(l.toDocId)
  );

  parallelLinks.forEach((link) => {
    const fromId = link.fromDocId;
    const toId = link.toDocId;
    const fromPos = result[fromId];
    if (!fromPos) return;

    const desiredX = fromPos.x;
    const otherParallels = parallelLinks
      .filter((l) => l.fromDocId === fromId && l.toDocId !== toId)
      .map((l) => l.toDocId);

    const desiredY = fromPos.y + ROW_UNIT;

    // Check if another node (not fromId, toId, or another parallel child of fromId) is occupying the slot
    const intervening = nodeIds.filter((id) => {
      if (id === fromId || id === toId || otherParallels.includes(id)) return false;
      const p = result[id];
      if (!p) return false;
      return Math.abs(p.x - desiredX) < NODE_WIDTH - 20 && p.y >= desiredY - 20 && p.y <= (result[toId]?.y ?? desiredY) + 20;
    });

    if (intervening.length > 0) {
      const ancestorsOfFrom = getAncestors(fromId, links);
      const keepUntouched = new Set([fromId, toId, ...otherParallels, ...ancestorsOfFrom]);

      const nodesToShift = new Set<string>();
      intervening.forEach((intId) => {
        if (!keepUntouched.has(intId)) {
          nodesToShift.add(intId);
          const desc = getForwardDescendants(intId, links);
          desc.forEach((d) => {
            if (!keepUntouched.has(d)) nodesToShift.add(d);
          });
        }
      });

      nodesToShift.forEach((id) => {
        if (result[id]) {
          result[id] = {
            x: result[id].x,
            y: result[id].y + ROW_UNIT
          };
        }
      });
    }

    result[toId] = {
      x: desiredX,
      y: desiredY
    };
  });

  return result;
}

/**
 * Recursively centers parent/start scenes with their downstream branches.
 * Processes from right to left (descending X), ensuring child branches
 * have established positions, then centering each parent vertically to the
 * midpoint of its rightward children.
 * For example:
 * - Scene 9 centers between Scene 10, 11, 12 (at Scene 11).
 * - Scene 8 (parent of Scene 9) aligns with Scene 9 (and Scene 11).
 * - Scene 2 centers between Scene 3 and Scene 4.
 * - Scene 1 (parent of Scene 2) aligns with Scene 2.
 */
export function centerTreeBranches(
  positions: Record<string, { x: number; y: number }>,
  nodeIds: string[],
  links: StoryNodeLink[]
): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = { ...positions };
  const validSet = new Set(nodeIds);

  const forwardOutgoing = new Map<string, string[]>();
  nodeIds.forEach((id) => forwardOutgoing.set(id, []));

  links.forEach((l) => {
    if (validSet.has(l.fromDocId) && validSet.has(l.toDocId) && l.linkType !== 'flashback' && l.linkType !== 'foreshadows') {
      forwardOutgoing.get(l.fromDocId)?.push(l.toDocId);
    }
  });

  // Sort nodes from right to left (descending X coordinates)
  // This allows child positions to stabilize first before parent centers to them
  const sortedByXDesc = [...nodeIds].sort((a, b) => (result[b]?.x ?? 0) - (result[a]?.x ?? 0));

  sortedByXDesc.forEach((u) => {
    const uPos = result[u];
    if (!uPos) return;

    // Find rightward children (forward children positioned to the right of u)
    const rChildren = (forwardOutgoing.get(u) || []).filter((c) => {
      const cPos = result[c];
      return cPos && cPos.x > uPos.x + 20;
    });

    if (rChildren.length > 0) {
      const childYs = rChildren.map((c) => result[c].y);
      const minY = Math.min(...childYs);
      const maxY = Math.max(...childYs);
      result[u] = {
        x: uPos.x,
        y: Math.round((minY + maxY) / 2)
      };
    }
  });

  return result;
}


/**
 * Computes an intelligent timeline story-flow layout from scratch for the Auto-Flow action.
 */
export function computeTimelineStoryFlowLayout(
  documents: NovelDocument[],
  folders: Folder[],
  storyLinks: StoryNodeLink[],
  timelineConfig?: TimelineConfig
): Record<string, { x: number; y: number }> {
  if (documents.length === 0) return {};

  const docMap = new Map<string, NovelDocument>();
  documents.forEach((d) => docMap.set(d.id, d));

  const unitsPerMajor = timelineConfig?.unitsPerMajor || 12;
  const subUnitsPerMinor = timelineConfig?.subUnitsPerMinor || 30;

  interface DocMeta {
    doc: NovelDocument;
    hasExactTime: boolean;
    timeVal: number;
    folderIndex: number;
    docIndex: number;
    col: number;
  }

  const metaMap = new Map<string, DocMeta>();

  folders.forEach((folder, fIdx) => {
    const fDocs = documents.filter((d) => d.folderId === folder.id);
    fDocs.forEach((d, dIdx) => {
      const info = d.timelineInfo;
      let hasExactTime = false;
      let timeVal = 0;
      if (info && info.startYear !== undefined && info.startYear !== null && !isNaN(Number(info.startYear))) {
        hasExactTime = true;
        const y = Number(info.startYear);
        const m = Number(info.startMonth || 1);
        const day = Number(info.startDay || 1);
        timeVal = y + (m - 1) / unitsPerMajor + (day - 1) / (unitsPerMajor * subUnitsPerMinor);
      }
      metaMap.set(d.id, {
        doc: d,
        hasExactTime,
        timeVal,
        folderIndex: fIdx,
        docIndex: dIdx,
        col: 0
      });
    });
  });

  const unfiled = documents.filter((d) => !d.folderId);
  unfiled.forEach((d, dIdx) => {
    const info = d.timelineInfo;
    let hasExactTime = false;
    let timeVal = 0;
    if (info && info.startYear !== undefined && info.startYear !== null && !isNaN(Number(info.startYear))) {
      hasExactTime = true;
      const y = Number(info.startYear);
      const m = Number(info.startMonth || 1);
      const day = Number(info.startDay || 1);
      timeVal = y + (m - 1) / unitsPerMajor + (day - 1) / (unitsPerMajor * subUnitsPerMinor);
    }
    metaMap.set(d.id, {
      doc: d,
      hasExactTime,
      timeVal,
      folderIndex: folders.length,
      docIndex: dIdx,
      col: 0
    });
  });

  const forwardLinks = storyLinks.filter(
    (l) => docMap.has(l.fromDocId) && docMap.has(l.toDocId) && l.linkType !== 'flashback' && l.linkType !== 'foreshadows'
  );

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  documents.forEach((d) => {
    outgoing.set(d.id, []);
    incoming.set(d.id, []);
  });

  forwardLinks.forEach((l) => {
    outgoing.get(l.fromDocId)!.push(l.toDocId);
    incoming.get(l.toDocId)!.push(l.fromDocId);
  });

  const distinctTimeValues = Array.from(
    new Set(
      Array.from(metaMap.values())
        .filter((m) => m.hasExactTime)
        .map((m) => m.timeVal)
    )
  ).sort((a, b) => a - b);

  metaMap.forEach((meta) => {
    if (meta.hasExactTime) {
      meta.col = distinctTimeValues.indexOf(meta.timeVal);
    } else {
      meta.col = meta.folderIndex * 2 + Math.floor(meta.docIndex / 2);
    }
  });

  for (let iter = 0; iter < documents.length; iter++) {
    let changed = false;
    forwardLinks.forEach((l) => {
      const uMeta = metaMap.get(l.fromDocId)!;
      const vMeta = metaMap.get(l.toDocId)!;
      if (l.linkType === 'parallel') {
        if (vMeta.col < uMeta.col) {
          vMeta.col = uMeta.col;
          changed = true;
        }
      } else {
        if (vMeta.col <= uMeta.col) {
          vMeta.col = uMeta.col + 1;
          changed = true;
        }
      }
    });
    if (!changed) break;
  }

  let minCol = Infinity;
  metaMap.forEach((m) => {
    if (m.col < minCol) minCol = m.col;
  });
  if (minCol < 0 || minCol === Infinity) minCol = 0;
  metaMap.forEach((m) => {
    m.col -= minCol;
  });

  const heightUnits = new Map<string, number>();
  const visitedForHeight = new Set<string>();

  function computeHeightUnit(nodeId: string): number {
    if (visitedForHeight.has(nodeId)) return heightUnits.get(nodeId) || 1;
    visitedForHeight.add(nodeId);

    const children = outgoing.get(nodeId) || [];
    if (children.length === 0) {
      heightUnits.set(nodeId, 1);
      return 1;
    }

    let sum = 0;
    children.forEach((c) => {
      sum += computeHeightUnit(c);
    });
    const h = Math.max(1, sum);
    heightUnits.set(nodeId, h);
    return h;
  }

  documents.forEach((d) => computeHeightUnit(d.id));

  const rootDocs = documents.filter((d) => (incoming.get(d.id) || []).length === 0);
  rootDocs.sort((a, b) => {
    const ma = metaMap.get(a.id)!;
    const mb = metaMap.get(b.id)!;
    if (ma.col !== mb.col) return ma.col - mb.col;
    if (ma.hasExactTime && mb.hasExactTime) return ma.timeVal - mb.timeVal;
    if (ma.folderIndex !== mb.folderIndex) return ma.folderIndex - mb.folderIndex;
    return ma.docIndex - mb.docIndex;
  });

  const rawY = new Map<string, number>();
  let currentYOffset = ORIGIN_Y;

  function layoutTree(nodeId: string, startY: number, allocatedHeight: number) {
    const children = outgoing.get(nodeId) || [];
    if (children.length === 0) {
      rawY.set(nodeId, startY + (allocatedHeight * ROW_UNIT - ROW_UNIT) / 2);
      return;
    }

    let childYCursor = startY;
    const childCenters: number[] = [];

    children.forEach((cId) => {
      const cHeight = heightUnits.get(cId) || 1;
      layoutTree(cId, childYCursor, cHeight);
      childCenters.push(rawY.get(cId)!);
      childYCursor += cHeight * ROW_UNIT;
    });

    const minY = childCenters[0];
    const maxY = childCenters[childCenters.length - 1];
    const centeredY = (minY + maxY) / 2;
    rawY.set(nodeId, centeredY);
  }

  rootDocs.forEach((r) => {
    const h = heightUnits.get(r.id) || 1;
    layoutTree(r.id, currentYOffset, h);
    currentYOffset += Math.max(1, h) * ROW_UNIT + 40;
  });

  documents.forEach((d) => {
    if (!rawY.has(d.id)) {
      rawY.set(d.id, currentYOffset);
      currentYOffset += ROW_UNIT;
    }
  });

  const rawPositions: Record<string, { x: number; y: number }> = {};
  documents.forEach((d) => {
    const meta = metaMap.get(d.id)!;
    rawPositions[d.id] = {
      x: ORIGIN_X + meta.col * COL_SPACING,
      y: Math.round(rawY.get(d.id) || ORIGIN_Y)
    };
  });

  return resolveTreeNonOverlap(rawPositions, documents.map((d) => d.id), storyLinks);
}

export const StoryFlowGraph: React.FC<StoryFlowGraphProps> = ({
  documents,
  folders,
  storyLinks,
  timelineConfig,
  activeMundusId,
  onSaveSceneTimelineInfo,
  onSaveStoryLink,
  onDeleteStoryLink,
  onSelectDocumentForEditor,
  onReturnToHub,
  isDarkMode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Storage Keys for persistent session recovery
  const STORAGE_POSITIONS_KEY = `mundus_story_flow_positions_${activeMundusId || 'default'}`;
  const STORAGE_NODES_KEY = `mundus_story_flow_nodes_${activeMundusId || 'default'}`;

  // Pan & Zoom
  const [zoom, setZoom] = useState<number>(0.9);
  const [panX, setPanX] = useState<number>(40);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStartX, setDragStartX] = useState<number>(0);

  // Set of documents placed on the graph canvas
  const [graphDocIds, setGraphDocIds] = useState<string[]>([]);
  // Node position map (docId -> { x, y })
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragStart, setNodeDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Modals & linking tool
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [selectedFromDocId, setSelectedFromDocId] = useState<string>('');
  const [selectedToDocId, setSelectedToDocId] = useState<string>('');
  const [selectedLinkType, setSelectedLinkType] = useState<StoryLinkType>('leads_to');
  const [linkLabel, setLinkLabel] = useState<string>('');
  const [linkNotes, setLinkNotes] = useState<string>('');
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [isSourceLocked, setIsSourceLocked] = useState(false);

  // Scene Timeline Modal state
  const [timelineDocToEdit, setTimelineDocToEdit] = useState<NovelDocument | null>(null);

  // Filters & selection
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Unlinked scenes sidebar state
  const [isUnlinkedSidebarOpen, setIsUnlinkedSidebarOpen] = useState(true);
  const [unlinkedSearch, setUnlinkedSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  // Helper to persist state to localStorage
  const saveToStorage = useCallback(
    (positions: Record<string, { x: number; y: number }>, nodeIds: string[]) => {
      try {
        localStorage.setItem(STORAGE_POSITIONS_KEY, JSON.stringify(positions));
        localStorage.setItem(STORAGE_NODES_KEY, JSON.stringify(nodeIds));
      } catch (err) {
        console.error('Failed to save story flow state:', err);
      }
    },
    [STORAGE_POSITIONS_KEY, STORAGE_NODES_KEY]
  );

  // Initial load from storage or initialize with existing links
  useEffect(() => {
    try {
      const savedNodes = localStorage.getItem(STORAGE_NODES_KEY);
      const savedPositions = localStorage.getItem(STORAGE_POSITIONS_KEY);

      let initialNodeIds: string[] = [];
      if (savedNodes) {
        try {
          initialNodeIds = JSON.parse(savedNodes);
        } catch {
          initialNodeIds = [];
        }
      }

      // Automatically include any nodes that have existing links in storyLinks
      const linkedIds = new Set<string>();
      storyLinks.forEach((l) => {
        if (documents.some((d) => d.id === l.fromDocId)) linkedIds.add(l.fromDocId);
        if (documents.some((d) => d.id === l.toDocId)) linkedIds.add(l.toDocId);
      });

      // Filter only documents that actually exist in the current project AND have active links
      // Any scenes that remain without links automatically belong in the unlinked scenes sidebar
      const validNodeIds = initialNodeIds.filter(
        (id) => documents.some((d) => d.id === id) && linkedIds.has(id)
      );
      linkedIds.forEach((id) => {
        if (!validNodeIds.includes(id)) {
          validNodeIds.push(id);
        }
      });
      setGraphDocIds(validNodeIds);

      let positions: Record<string, { x: number; y: number }> = {};
      if (savedPositions) {
        try {
          positions = JSON.parse(savedPositions);
        } catch {
          positions = {};
        }
      }

      // Ensure every placed node has valid coordinates
      let currentY = ORIGIN_Y;
      let needsSave = false;
      validNodeIds.forEach((id) => {
        if (!positions[id]) {
          positions[id] = { x: ORIGIN_X, y: currentY };
          currentY += ROW_UNIT;
          needsSave = true;
        }
      });

      const placed = resolveParallelAndBranchPlacement(positions, validNodeIds, storyLinks);
      const expanded = expandLineForLinkNotes(placed, validNodeIds, storyLinks);
      const centered = centerTreeBranches(expanded, validNodeIds, storyLinks);
      const resolved = resolveTreeNonOverlap(centered, validNodeIds, storyLinks);
      setNodePositions(resolved);

      if (needsSave) {
        saveToStorage(resolved, validNodeIds);
      }
    } catch (err) {
      console.error('Failed to load story flow state:', err);
    }
  }, [STORAGE_NODES_KEY, STORAGE_POSITIONS_KEY, documents, storyLinks, saveToStorage]);

  // Sorted folders: sorted alphabetically by folder name
  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [folders]);

  // Unlinked docs are documents not currently placed on the graph
  const unlinkedDocs = useMemo(() => {
    const onGraphSet = new Set(graphDocIds);
    return documents.filter((d) => !onGraphSet.has(d.id));
  }, [documents, graphDocIds]);

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  /**
   * Clicking an unlinked scene from the sidebar adds it to the graph all the way to the left,
   * placed below the ones added earlier.
   */
  const handleAddSceneToGraph = (docId: string) => {
    if (graphDocIds.includes(docId)) return;

    // Find the next vertical slot all the way to the left
    let nextY = ORIGIN_Y;
    if (graphDocIds.length > 0) {
      const existingYs = graphDocIds.map((id) => nodePositions[id]?.y ?? ORIGIN_Y);
      nextY = Math.max(...existingYs) + ROW_UNIT;
    }

    const updatedNodeIds = [...graphDocIds, docId];
    const updatedPositions = {
      ...nodePositions,
      [docId]: { x: ORIGIN_X, y: nextY }
    };

    const placed = resolveParallelAndBranchPlacement(updatedPositions, updatedNodeIds, storyLinks);
    const expanded = expandLineForLinkNotes(placed, updatedNodeIds, storyLinks);
    const centered = centerTreeBranches(expanded, updatedNodeIds, storyLinks);
    const resolved = resolveTreeNonOverlap(centered, updatedNodeIds, storyLinks);
    setGraphDocIds(updatedNodeIds);
    setNodePositions(resolved);
    saveToStorage(resolved, updatedNodeIds);
  };

  /**
   * Allows removing a scene from the graph back to the sidebar.
   * If it has active narrative links, it deletes all attached link arrows as well.
   * Any other scene in the graph that remains without links automatically gets removed
   * from the graph and sent back to unlinked scenes.
   */
  const handleRemoveSceneFromGraph = (docId: string) => {
    // 1. Delete all links attached to this node (both incoming and outgoing)
    const attachedLinks = storyLinks.filter((l) => l.fromDocId === docId || l.toDocId === docId);
    attachedLinks.forEach((l) => {
      onDeleteStoryLink(l.id);
    });

    const remainingLinks = storyLinks.filter((l) => l.fromDocId !== docId && l.toDocId !== docId);

    // 2. Identify all scenes that remain without links in remainingLinks
    const candidateDocIds = graphDocIds.filter((id) => id !== docId);
    const nodesToKeep: string[] = [];
    const nodesToRemove: string[] = [docId];

    candidateDocIds.forEach((id) => {
      const hasLinks = remainingLinks.some((l) => l.fromDocId === id || l.toDocId === id);
      if (hasLinks) {
        nodesToKeep.push(id);
      } else {
        nodesToRemove.push(id);
      }
    });

    const updatedPositions = { ...nodePositions };
    nodesToRemove.forEach((id) => {
      delete updatedPositions[id];
    });

    const placed = resolveParallelAndBranchPlacement(updatedPositions, nodesToKeep, remainingLinks);
    const expanded = expandLineForLinkNotes(placed, nodesToKeep, remainingLinks);
    const centered = centerTreeBranches(expanded, nodesToKeep, remainingLinks);
    const resolved = resolveTreeNonOverlap(centered, nodesToKeep, remainingLinks);
    setGraphDocIds(nodesToKeep);
    setNodePositions(resolved);
    saveToStorage(resolved, nodesToKeep);
  };

  /**
   * Deletes an existing narrative link from the graph.
   * Any scenes connected to this link that now remain without any links
   * automatically get removed from the graph and sent back to unlinked scenes.
   */
  const handleDeleteLink = (linkId: string) => {
    onDeleteStoryLink(linkId);

    const remainingLinks = storyLinks.filter((l) => l.id !== linkId);
    const nodesToKeep: string[] = [];
    const nodesToRemove: string[] = [];

    graphDocIds.forEach((id) => {
      const hasLinks = remainingLinks.some((l) => l.fromDocId === id || l.toDocId === id);
      if (hasLinks) {
        nodesToKeep.push(id);
      } else {
        nodesToRemove.push(id);
      }
    });

    const updatedPositions = { ...nodePositions };
    nodesToRemove.forEach((id) => {
      delete updatedPositions[id];
    });

    const placed = resolveParallelAndBranchPlacement(updatedPositions, nodesToKeep, remainingLinks);
    const expanded = expandLineForLinkNotes(placed, nodesToKeep, remainingLinks);
    const centered = centerTreeBranches(expanded, nodesToKeep, remainingLinks);
    const resolved = resolveTreeNonOverlap(centered, nodesToKeep, remainingLinks);
    setGraphDocIds(nodesToKeep);
    setNodePositions(resolved);
    saveToStorage(resolved, nodesToKeep);
    setIsLinkModalOpen(false);
  };

  // Handler for explicit Auto-Arrange button
  const handleAutoArrangeFlow = () => {
    const targetDocs = documents.filter((d) => graphDocIds.includes(d.id));
    if (targetDocs.length === 0) return;

    const calculated = computeTimelineStoryFlowLayout(targetDocs, folders, storyLinks, timelineConfig);
    const placed = resolveParallelAndBranchPlacement(calculated, graphDocIds, storyLinks);
    const expanded = expandLineForLinkNotes(placed, graphDocIds, storyLinks);
    const centered = centerTreeBranches(expanded, graphDocIds, storyLinks);
    const resolved = resolveTreeNonOverlap(centered, graphDocIds, storyLinks);
    setNodePositions(resolved);
    saveToStorage(resolved, graphDocIds);
    setPanX(40);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  };

  // Filtered documents currently displayed on the canvas
  const visibleDocs = useMemo(() => {
    const onGraphSet = new Set(graphDocIds);
    return documents.filter((d) => {
      if (!onGraphSet.has(d.id)) return false;
      const matchSearch = d.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchFolder = selectedFolderId === 'all' || d.folderId === selectedFolderId;
      return matchSearch && matchFolder;
    });
  }, [documents, graphDocIds, searchQuery, selectedFolderId]);

  // Compute graph bounds for canvas scrolling
  const { maxX, maxY, totalTrackWidth, totalTrackHeight } = useMemo(() => {
    const xs = visibleDocs.map((d) => nodePositions[d.id]?.x ?? ORIGIN_X);
    const ys = visibleDocs.map((d) => nodePositions[d.id]?.y ?? ORIGIN_Y);
    const calculatedMaxX = xs.length > 0 ? Math.max(...xs) + NODE_WIDTH + 80 : 1200;
    const calculatedMaxY = ys.length > 0 ? Math.max(...ys) + ROW_UNIT : 500;
    const width = Math.max(calculatedMaxX + 80, 1400);
    const height = Math.max(calculatedMaxY + 80, 500);
    return {
      maxX: calculatedMaxX,
      maxY: calculatedMaxY,
      totalTrackWidth: width * zoom,
      totalTrackHeight: height
    };
  }, [visibleDocs, nodePositions, zoom]);

  // Canvas Horizontal Pan Handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('.story-node-card') || 
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('input')
    ) {
      return;
    }
    setIsPanning(true);
    setDragStartX(e.clientX - panX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const newPanX = e.clientX - dragStartX;
      const cWidth = containerRef.current?.offsetWidth || 1200;
      const maxPan = Math.max(0, totalTrackWidth - cWidth);
      setPanX(Math.min(40, Math.max(-maxPan - 40, newPanX)));
    } else if (draggingNodeId) {
      const sTop = containerRef.current?.scrollTop || 0;
      const newX = (e.clientX - nodeDragStart.x - panX) / zoom;
      const newY = (e.clientY + sTop - nodeDragStart.y) / zoom;
      setNodePositions((prev) => ({
        ...prev,
        [draggingNodeId]: {
          x: Math.max(10, Math.round(newX)),
          y: Math.max(10, Math.round(newY))
        }
      }));
    }
  };

  const handleMouseUp = () => {
    if (draggingNodeId) {
      setNodePositions((current) => {
        const resolved = resolveTreeNonOverlap(current, graphDocIds, storyLinks);
        saveToStorage(resolved, graphDocIds);
        return resolved;
      });
    }
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  // Touch handlers for Graph Panning & Node Dragging
  const touchStartRef = useRef<{
    x: number;
    y: number;
    initialPanX: number;
    initialScrollTop: number;
    nodeId?: string | null;
    nodeDragStartX?: number;
    nodeDragStartY?: number;
  } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    const nodeCard = (e.target as HTMLElement).closest('.story-node-card') as HTMLElement | null;
    if (nodeCard) {
      const docId = nodeCard.getAttribute('data-doc-id');
      if (docId) {
        setDraggingNodeId(docId);
        const currentPos = nodePositions[docId] || { x: ORIGIN_X, y: ORIGIN_Y };
        const sTop = containerRef.current?.scrollTop || 0;
        const dragStartX = touch.clientX - (panX + currentPos.x * zoom);
        const dragStartY = touch.clientY + sTop - currentPos.y * zoom;
        
        setNodeDragStart({ x: dragStartX, y: dragStartY });
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          initialPanX: panX,
          initialScrollTop: sTop,
          nodeId: docId,
          nodeDragStartX: dragStartX,
          nodeDragStartY: dragStartY
        };
        return;
      }
    }

    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('select')
    ) {
      return;
    }

    setIsPanning(true);
    const sTop = containerRef.current?.scrollTop || 0;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      initialPanX: panX,
      initialScrollTop: sTop
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];

    if (touchStartRef.current.nodeId && draggingNodeId) {
      const sTop = containerRef.current?.scrollTop || 0;
      const newX = (touch.clientX - touchStartRef.current.nodeDragStartX! - panX) / zoom;
      const newY = (touch.clientY + sTop - touchStartRef.current.nodeDragStartY!) / zoom;
      setNodePositions((prev) => ({
        ...prev,
        [draggingNodeId]: {
          x: Math.max(10, Math.round(newX)),
          y: Math.max(10, Math.round(newY))
        }
      }));
    } else if (isPanning) {
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const cWidth = containerRef.current?.offsetWidth || 1200;
      const maxPan = Math.max(0, totalTrackWidth - cWidth);
      const newPanX = touchStartRef.current.initialPanX + deltaX;
      setPanX(Math.min(40, Math.max(-maxPan - 40, newPanX)));

      if (containerRef.current) {
        containerRef.current.scrollTop = touchStartRef.current.initialScrollTop - deltaY;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (draggingNodeId) {
      setNodePositions((current) => {
        const resolved = resolveTreeNonOverlap(current, graphDocIds, storyLinks);
        saveToStorage(resolved, graphDocIds);
        return resolved;
      });
    }
    setIsPanning(false);
    setDraggingNodeId(null);
    touchStartRef.current = null;
  };

  // Node Dragging Handlers
  const handleStartNodeDrag = (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    setDraggingNodeId(docId);
    const currentPos = nodePositions[docId] || { x: ORIGIN_X, y: ORIGIN_Y };
    const sTop = containerRef.current?.scrollTop || 0;
    setNodeDragStart({
      x: e.clientX - (panX + currentPos.x * zoom),
      y: e.clientY + sTop - currentPos.y * zoom
    });
  };

  const handleStartLinkFromNode = (fromDocId: string) => {
    setSelectedFromDocId(fromDocId);
    const candidate = documents.find((d) => d.id !== fromDocId);
    setSelectedToDocId(candidate ? candidate.id : '');
    setSelectedLinkType('leads_to');
    setLinkLabel('');
    setLinkNotes('');
    setEditingLinkId(null);
    setIsSourceLocked(true);
    setIsLinkModalOpen(true);
  };

  /**
   * Save Link Handler:
   * Positions the target node relative to the linker based on linkType,
   * without resetting other nodes! Then shifts lower trees down to avoid overlap.
   */
  const handleSaveLink = () => {
    if (!selectedFromDocId || !selectedToDocId || selectedFromDocId === selectedToDocId) return;

    const newLinkId = editingLinkId || `link-${Date.now()}`;
    const linkObj: Partial<StoryNodeLink> = {
      id: newLinkId,
      fromDocId: selectedFromDocId,
      toDocId: selectedToDocId,
      linkType: selectedLinkType,
      label: linkLabel.trim(),
      notes: linkNotes.trim()
    };

    onSaveStoryLink(linkObj);

    // Ensure both nodes are in the active graph
    const newGraphDocIds = Array.from(new Set([...graphDocIds, selectedFromDocId, selectedToDocId]));
    setGraphDocIds(newGraphDocIds);

    const updatedPositions = { ...nodePositions };
    const fromPos = updatedPositions[selectedFromDocId] || { x: ORIGIN_X, y: ORIGIN_Y };
    if (!updatedPositions[selectedFromDocId]) {
      updatedPositions[selectedFromDocId] = fromPos;
    }

    // Build the updated list of story links first for graph inspection
    const updatedFullLinks: StoryNodeLink[] = editingLinkId
      ? storyLinks.map((l) => (l.id === editingLinkId ? ({ ...l, ...linkObj } as StoryNodeLink) : l))
      : ([...storyLinks, linkObj as StoryNodeLink]);

    // Position target based on linkType
    if (selectedLinkType === 'leads_to' || selectedLinkType === 'causes') {
      // Place to the right of the linker
      const targetX = fromPos.x + COL_SPACING;

      // Check if fromDocId already has other rightward linked children
      const existingRightChildren = storyLinks
        .filter(
          (l) =>
            l.fromDocId === selectedFromDocId &&
            (l.linkType === 'leads_to' || l.linkType === 'causes') &&
            l.toDocId !== selectedToDocId &&
            l.id !== editingLinkId
        )
        .map((l) => l.toDocId);

      if (existingRightChildren.length === 0) {
        // First rightward child: align horizontally with linker
        updatedPositions[selectedToDocId] = { x: targetX, y: fromPos.y };
      } else {
        // Stack below previous rightward children
        const childYs = existingRightChildren.map((cId) => updatedPositions[cId]?.y ?? fromPos.y);
        const lowestChildY = Math.max(...childYs);
        const newChildY = lowestChildY + ROW_UNIT;
        updatedPositions[selectedToDocId] = { x: targetX, y: newChildY };

        // Re-center parent node vertically relative to all its rightward children
        const allChildYs = [...childYs, newChildY];
        const minY = Math.min(...allChildYs);
        const maxY = Math.max(...allChildYs);
        updatedPositions[selectedFromDocId] = {
          x: fromPos.x,
          y: Math.round((minY + maxY) / 2)
        };
      }
    } else if (selectedLinkType === 'parallel') {
      // Linked scene placed right below the linker with vertical line
      const existingParallel = storyLinks
        .filter(
          (l) =>
            l.fromDocId === selectedFromDocId &&
            l.linkType === 'parallel' &&
            l.toDocId !== selectedToDocId &&
            l.id !== editingLinkId
        )
        .map((l) => l.toDocId);

      const targetX = fromPos.x;
      const targetY = fromPos.y + (existingParallel.length + 1) * ROW_UNIT;

      // Shift down any existing lower branches (such as Scene 4 and Scene 7) so target is right below linker
      const ancestorsOfFrom = getAncestors(selectedFromDocId, updatedFullLinks);
      const keepUntouched = new Set([selectedFromDocId, selectedToDocId, ...existingParallel, ...ancestorsOfFrom]);

      const nodesToShift = new Set<string>();
      newGraphDocIds.forEach((id) => {
        if (keepUntouched.has(id)) return;
        const pos = updatedPositions[id];
        if (pos && pos.y >= targetY - 20) {
          nodesToShift.add(id);
          const desc = getForwardDescendants(id, updatedFullLinks);
          desc.forEach((dId) => {
            if (!keepUntouched.has(dId)) nodesToShift.add(dId);
          });
        }
      });

      nodesToShift.forEach((id) => {
        if (updatedPositions[id]) {
          updatedPositions[id] = {
            x: updatedPositions[id].x,
            y: updatedPositions[id].y + ROW_UNIT
          };
        }
      });

      updatedPositions[selectedToDocId] = { x: targetX, y: targetY };
    } else {
      // Flashback or foreshadows: if not positioned yet, place nearby
      if (!updatedPositions[selectedToDocId]) {
        updatedPositions[selectedToDocId] = { x: fromPos.x + COL_SPACING, y: fromPos.y };
      }
    }

    // Keep only nodes that have active links in updatedFullLinks
    const finalGraphDocIds = newGraphDocIds.filter((id) =>
      updatedFullLinks.some((l) => l.fromDocId === id || l.toDocId === id)
    );

    // Resolve any parallel overlaps, expand line for notes, align branch starts vertically, and shift lower trees to prevent collision
    const placed = resolveParallelAndBranchPlacement(updatedPositions, finalGraphDocIds, updatedFullLinks);
    const expanded = expandLineForLinkNotes(placed, finalGraphDocIds, updatedFullLinks);
    const centered = centerTreeBranches(expanded, finalGraphDocIds, updatedFullLinks);
    const resolved = resolveTreeNonOverlap(centered, finalGraphDocIds, updatedFullLinks);
    setGraphDocIds(finalGraphDocIds);
    setNodePositions(resolved);
    saveToStorage(resolved, finalGraphDocIds);

    setIsLinkModalOpen(false);
  };

  const visibleDocIds = useMemo(() => new Set(visibleDocs.map((d) => d.id)), [visibleDocs]);

  // Generate SVG Connector Paths between scenes
  const connectorPaths = useMemo(() => {
    return storyLinks.map((link) => {
      // Both source and destination scenes must be visible in the current folder/search filter
      if (!visibleDocIds.has(link.fromDocId) || !visibleDocIds.has(link.toDocId)) {
        return null;
      }

      const fromPos = nodePositions[link.fromDocId];
      const toPos = nodePositions[link.toDocId];

      if (!fromPos || !toPos) return null;

      const config = LINK_TYPE_CONFIG[link.linkType] || LINK_TYPE_CONFIG.leads_to;
      let pathData = '';
      let midX = 0;
      let midY = 0;

      if (link.linkType === 'parallel') {
        // Parallel plot: vertical line from bottom of linker to top of destination
        const fromX = fromPos.x + NODE_WIDTH / 2;
        const fromY = fromPos.y + NODE_HEIGHT;
        const toX = toPos.x + NODE_WIDTH / 2;
        const toY = toPos.y;

        if (Math.abs(fromX - toX) < 10) {
          pathData = `M ${fromX} ${fromY} L ${toX} ${toY}`;
        } else {
          const lead = 18;
          const startY = fromY + lead;
          const endY = toY - lead;
          const dy = (endY - startY) * 0.5;
          pathData = `M ${fromX} ${fromY} L ${fromX} ${startY} C ${fromX} ${startY + dy}, ${toX} ${endY - dy}, ${toX} ${endY} L ${toX} ${toY}`;
        }

        midX = (fromX + toX) / 2;
        midY = (fromY + toY) / 2;
      } else if (toPos.x <= fromPos.x + 20 || link.linkType === 'flashback') {
        // Flashback / Backward link:
        // Routes cleanly along the outer border of the destination scene,
        // wraps around its outer corner, and arrives with a straight horizontal lead-in
        // directly into the flat base of the arrowhead.
        // The transition between the source node and the scene border uses a smooth
        // regular curve without crossing control points or unnatural kinks.
        const toLeft = toPos.x;
        const toRight = toPos.x + NODE_WIDTH;
        const toTop = toPos.y;
        const toBottom = toPos.y + NODE_HEIGHT;
        const toCenterY = toPos.y + NODE_HEIGHT / 2;

        const targetX = toLeft;
        const targetY = toCenterY;
        const isBelow = (fromPos.y + NODE_HEIGHT / 2) >= toCenterY;

        const borderMargin = 18;
        const cornerRadius = 14;
        const cornerX = toLeft - 24;

        if (isBelow) {
          // Source is below destination (e.g. Scene 7 to Scene 6):
          // Route along the bottom border of the destination scene
          const borderY = toBottom + borderMargin;
          const fromX = fromPos.x;
          const fromY = fromPos.y + 35;
          const approachX = Math.min(fromX, toRight + 16);
          const approachDiff = Math.max(0, fromX - approachX);
          const cdx = approachDiff * 0.5;

          pathData =
            `M ${fromX} ${fromY} ` +
            `C ${fromX - cdx} ${fromY}, ${approachX + cdx} ${borderY}, ${approachX} ${borderY} ` +
            `L ${cornerX + cornerRadius} ${borderY} ` +
            `Q ${cornerX} ${borderY}, ${cornerX} ${borderY - cornerRadius} ` +
            `L ${cornerX} ${targetY + cornerRadius} ` +
            `Q ${cornerX} ${targetY}, ${cornerX + cornerRadius} ${targetY} ` +
            `L ${targetX} ${targetY}`;

          midX = toLeft + NODE_WIDTH / 2;
          midY = borderY;
        } else {
          // Source is above destination:
          // Route along the top border of the destination scene
          const borderY = toTop - borderMargin;
          const fromX = fromPos.x;
          const fromY = fromPos.y + NODE_HEIGHT - 35;
          const approachX = Math.min(fromX, toRight + 16);
          const approachDiff = Math.max(0, fromX - approachX);
          const cdx = approachDiff * 0.5;

          pathData =
            `M ${fromX} ${fromY} ` +
            `C ${fromX - cdx} ${fromY}, ${approachX + cdx} ${borderY}, ${approachX} ${borderY} ` +
            `L ${cornerX + cornerRadius} ${borderY} ` +
            `Q ${cornerX} ${borderY}, ${cornerX} ${borderY + cornerRadius} ` +
            `L ${cornerX} ${targetY - cornerRadius} ` +
            `Q ${cornerX} ${targetY}, ${cornerX + cornerRadius} ${targetY} ` +
            `L ${targetX} ${targetY}`;

          midX = toLeft + NODE_WIDTH / 2;
          midY = borderY;
        }
      } else {
        // Forward links (leads_to, causes, foreshadows, branching):
        // Moving to the right from linker's right edge to destination's left edge.
        const fromX = fromPos.x + NODE_WIDTH;
        const fromY = fromPos.y + NODE_HEIGHT / 2;
        const toX = toPos.x;
        const toY = toPos.y + NODE_HEIGHT / 2;

        // Check for intermediate scene cards that lie horizontally between source and target
        // and vertically overlap or obstruct the direct connector path
        const intermediateBlockingNodes = visibleDocs.filter((d) => {
          if (d.id === link.fromDocId || d.id === link.toDocId) return false;
          const pos = nodePositions[d.id];
          if (!pos) return false;

          const isBetweenX = pos.x > fromPos.x + 30 && pos.x < toPos.x - 30;
          if (!isBetweenX) return false;

          const corridorMinY = Math.min(fromY, toY) - 25;
          const corridorMaxY = Math.max(fromY, toY) + 25;
          const nodeTop = pos.y;
          const nodeBottom = pos.y + NODE_HEIGHT;

          return !(nodeBottom < corridorMinY || nodeTop > corridorMaxY);
        });

        if (intermediateBlockingNodes.length > 0) {
          // Route cleanly ABOVE all intermediate scene blocks
          const highestTop = Math.min(
            fromPos.y,
            toPos.y,
            ...intermediateBlockingNodes.map((d) => nodePositions[d.id]?.y ?? fromPos.y)
          );

          const arcY = highestTop - 32; // 32px clearance above highest block
          const startX = fromX;
          const startY = fromY;
          const endX = toX;
          const endY = toY;

          const distanceX = endX - startX;
          const upX = Math.min(startX + 40, startX + distanceX * 0.25);
          const downX = Math.max(endX - 40, endX - distanceX * 0.25);

          pathData =
            `M ${startX} ${startY} ` +
            `C ${startX + 25} ${startY}, ${upX - 15} ${arcY}, ${upX} ${arcY} ` +
            `L ${downX} ${arcY} ` +
            `C ${downX + 15} ${arcY}, ${endX - 25} ${endY}, ${endX} ${endY}`;

          midX = (startX + endX) / 2;
          midY = arcY;
        } else {
          // Direct un-obstructed path
          const distanceX = toX - fromX;
          const leadIn = Math.min(22, Math.max(12, distanceX * 0.22));
          const leadOut = leadIn;
          const startX = fromX + leadOut;
          const endX = toX - leadIn;

          if (endX > startX) {
            const dx = (endX - startX) * 0.5;
            pathData = `M ${fromX} ${fromY} L ${startX} ${fromY} C ${startX + dx} ${fromY}, ${endX - dx} ${toY}, ${endX} ${toY} L ${toX} ${toY}`;
          } else {
            pathData = `M ${fromX} ${fromY} L ${toX} ${toY}`;
          }

          midX = (fromX + toX) / 2;
          midY = (fromY + toY) / 2;
        }
      }

      return (
        <g key={link.id} className="group cursor-pointer">
          {/* Main Connector Line */}
          <path
            d={pathData}
            fill="none"
            stroke={config.color}
            strokeWidth="2.5"
            strokeDasharray={config.strokeDash}
            markerEnd={`url(#arrow-${link.linkType})`}
            className="transition-all hover:stroke-width-[4]"
          />

          {/* Invisible broader hit area for clicking */}
          <path
            d={pathData}
            fill="none"
            stroke="transparent"
            strokeWidth="18"
            onClick={() => {
              setEditingLinkId(link.id);
              setSelectedFromDocId(link.fromDocId);
              setSelectedToDocId(link.toDocId);
              setSelectedLinkType(link.linkType);
              setLinkLabel(link.label || '');
              setLinkNotes(link.notes || '');
              setIsSourceLocked(false);
              setIsLinkModalOpen(true);
            }}
          />

          {/* Link Label Tag Badge - Dynamically adapts shape and wraps text to fit within gap */}
          {Boolean(link.label || link.notes) && (() => {
            const displayText = (link.label || link.notes || '').trim();
            const tooltipText = link.label && link.notes ? `${link.label}\n\n${link.notes}` : displayText;

            // Compute available gap between blocks if this is a forward horizontal link
            let maxPillWidth = 240;
            if (fromPos && toPos && toPos.x > fromPos.x + NODE_WIDTH) {
              const gap = toPos.x - (fromPos.x + NODE_WIDTH);
              maxPillWidth = Math.max(64, gap - 20);
            }

            // Estimate character capacity per line
            const maxCharsPerLine = Math.max(8, Math.floor((maxPillWidth - 16) / 6.8));
            
            // Adapt shape: wrap text into multiple lines if single-line exceeds maxPillWidth
            const rawEstimatedWidth = displayText.length * 6.8 + 18;
            let lines: string[] = [displayText];
            if (rawEstimatedWidth > maxPillWidth) {
              lines = wrapTextToFit(displayText, maxCharsPerLine, 4);
            }

            const longestLine = Math.max(...lines.map((l) => l.length));
            const pillWidth = Math.max(50, Math.min(maxPillWidth, Math.round(longestLine * 6.8 + 18)));
            const lineHeight = 13;
            const pillHeight = Math.max(22, 12 + lines.length * lineHeight);
            const halfWidth = pillWidth / 2;
            const halfHeight = pillHeight / 2;
            const startTextY = -(lines.length - 1) * (lineHeight / 2) + 3.5;

            return (
              <g
                key={`badge-${link.id}`}
                transform={`translate(${midX}, ${midY})`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingLinkId(link.id);
                  setSelectedFromDocId(link.fromDocId);
                  setSelectedToDocId(link.toDocId);
                  setSelectedLinkType(link.linkType);
                  setLinkLabel(link.label || '');
                  setLinkNotes(link.notes || '');
                  setIsSourceLocked(false);
                  setIsLinkModalOpen(true);
                }}
              >
                <title>{tooltipText}</title>
                <rect
                  x={-halfWidth}
                  y={-halfHeight}
                  width={pillWidth}
                  height={pillHeight}
                  rx="7"
                  fill={isDarkMode ? '#222222' : '#ffffff'}
                  stroke={config.color}
                  strokeWidth="1.5"
                  className="shadow-md transition-transform hover:scale-105"
                />
                <text
                  x="0"
                  y={startTextY}
                  textAnchor="middle"
                  fill={isDarkMode ? '#e5e5e5' : '#171717'}
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                  className="select-none pointer-events-none"
                >
                  {lines.map((line, i) => (
                    <tspan key={i} x="0" dy={i === 0 ? 0 : lineHeight}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })()}
        </g>
      );
    });
  }, [storyLinks, nodePositions, isDarkMode, visibleDocIds]);

  return (
    <div className={`w-full h-full flex flex-col ${isDarkMode ? 'bg-[#0f0f0f] text-white' : 'bg-neutral-50 text-neutral-900'}`}>
      {/* Header Bar */}
      <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
        isDarkMode ? 'border-neutral-800 bg-[#121212]' : 'border-neutral-200 bg-white'
      }`}>
        <div className="flex items-center gap-3">
          <button
            onClick={onReturnToHub}
            className={`flex items-center gap-2.5 p-1 -m-1 rounded-lg transition-colors cursor-pointer group text-left ${
              isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-neutral-100'
            }`}
            title="Return to Lore starting page"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-transform group-hover:scale-105 ${
              isDarkMode ? 'bg-blue-950/40 border-blue-800 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-600'
            }`}>
              <GitFork className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-display flex items-center gap-2 group-hover:text-blue-400 transition-colors">
                <span>Lore</span>
                <span className="text-neutral-400 text-xs font-normal">/</span>
                <span>Story Flow</span>
              </h1>
            </div>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search scenes in graph..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pl-8 pr-3 py-1.5 rounded-lg text-xs border outline-hidden w-40 sm:w-48 transition-all ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-700 focus:border-blue-500 text-white' 
                  : 'bg-neutral-50 border-neutral-300 focus:border-blue-600 text-neutral-900'
              }`}
            />
          </div>

          {/* Chapter Filter */}
          <select
            value={selectedFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg text-xs border outline-hidden ${
              isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-300' : 'bg-white border-neutral-300 text-neutral-700'
            }`}
          >
            <option value="all">All Chapters</option>
            {sortedFolders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          {/* Auto-Flow Arrangement Button (Disabled / Coming Soon) */}
          <button
            id="btn-auto-arrange-flow"
            disabled
            title="Auto-Flow arrangement (disabled / coming soon)"
            className="px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-900/40 text-neutral-400 dark:text-neutral-500 text-xs font-medium flex items-center gap-1.5 cursor-not-allowed opacity-50 select-none"
          >
            <Sparkles className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
            <span className="hidden sm:inline font-semibold">Auto-Flow</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center border rounded-lg overflow-hidden border-neutral-300 dark:border-neutral-700">
            <button
              onClick={() => setZoom((prev) => Math.max(0.4, prev - 0.15))}
              title="Zoom Out"
              className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[10px] font-mono font-semibold">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((prev) => Math.min(2.0, prev + 0.15))}
              title="Zoom In"
              className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { 
                setZoom(0.9); 
                setPanX(40); 
                if (containerRef.current) containerRef.current.scrollTop = 0; 
                setScrollTop(0);
              }}
              title="Reset View"
              className="p-1.5 border-l border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* New Connection Button */}
          <button
            id="btn-add-story-link"
            onClick={() => {
              setSelectedFromDocId(documents[0]?.id || '');
              setSelectedToDocId(documents[1]?.id || '');
              setSelectedLinkType('leads_to');
              setLinkLabel('');
              setLinkNotes('');
              setEditingLinkId(null);
              setIsSourceLocked(false);
              setIsLinkModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg border border-accent text-accent hover:bg-accent/10 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Link Scenes</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Workspace Area */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Left Column: Unlinked Scenes Grouped by Folders */}
        <div
          className={`shrink-0 border-r flex flex-col transition-all duration-200 z-20 ${
            isDarkMode ? 'bg-[#141414] border-neutral-800' : 'bg-white border-neutral-200'
          } ${isUnlinkedSidebarOpen ? 'w-72' : 'w-10'}`}
        >
          {/* Sidebar Toggle Header */}
          <div className={`p-2.5 border-b flex items-center justify-between ${
            isDarkMode ? 'border-neutral-800 bg-[#181818]' : 'border-neutral-200 bg-neutral-50'
          }`}>
            {isUnlinkedSidebarOpen ? (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-accent" />
                  <span className="font-bold text-xs">Unlinked Scenes</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-accent/20 text-accent font-semibold">
                    {unlinkedDocs.length}
                  </span>
                </div>
                <button
                  onClick={() => setIsUnlinkedSidebarOpen(false)}
                  className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
                  title="Collapse Unlinked Scenes Panel"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsUnlinkedSidebarOpen(true)}
                className="w-full flex flex-col items-center gap-2 py-2 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors text-accent cursor-pointer"
                title="Expand Unlinked Scenes Panel"
              >
                <Layers className="w-4 h-4" />
                <span className="text-[10px] font-mono font-bold">{unlinkedDocs.length}</span>
              </button>
            )}
          </div>

          {isUnlinkedSidebarOpen && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-2 space-y-3">
              {/* Unlinked search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Filter unlinked..."
                  value={unlinkedSearch}
                  onChange={(e) => setUnlinkedSearch(e.target.value)}
                  className={`w-full pl-7 pr-2 py-1 rounded text-xs border outline-none ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-neutral-50 border-neutral-300'
                  }`}
                />
              </div>

              {unlinkedDocs.length === 0 ? (
                <div className="text-center py-8 text-xs text-neutral-400">
                  <Check className="w-6 h-6 mx-auto mb-1 text-emerald-500 opacity-80" />
                  <span>All scenes placed on graph!</span>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  {/* Folders sorted alphabetically */}
                  {sortedFolders.map((folder) => {
                    const folderUnlinked = unlinkedDocs
                      .filter(
                        (d) => d.folderId === folder.id && d.title.toLowerCase().includes(unlinkedSearch.toLowerCase())
                      )
                      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

                    if (folderUnlinked.length === 0) return null;
                    const isCollapsed = collapsedFolders[folder.id];

                    return (
                      <div key={folder.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                        <button
                          onClick={() => toggleFolderCollapse(folder.id)}
                          className={`w-full px-2.5 py-1.5 flex items-center justify-between text-left font-semibold text-xs cursor-pointer ${
                            isDarkMode ? 'bg-neutral-900/60 hover:bg-neutral-800' : 'bg-neutral-100 hover:bg-neutral-200'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <FolderIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                            <span className="truncate">{folder.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-neutral-400">{folderUnlinked.length}</span>
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                          </div>
                        </button>

                        {!isCollapsed && (
                          <div className="p-1.5 space-y-1.5 bg-transparent">
                            {folderUnlinked.map((doc) => (
                              <div
                                key={doc.id}
                                onClick={() => handleAddSceneToGraph(doc.id)}
                                className={`p-2 rounded-md border text-xs transition-all cursor-pointer group ${
                                  isDarkMode 
                                    ? 'bg-neutral-900/80 border-neutral-800 hover:border-blue-500/60 hover:bg-neutral-800/80' 
                                    : 'bg-white border-neutral-200 hover:border-blue-500/60 hover:bg-blue-50/40'
                                }`}
                                title="Click to add scene to graph (placed on the left)"
                              >
                                <div className="font-semibold truncate mb-1 text-neutral-800 dark:text-neutral-200 group-hover:text-blue-400 transition-colors">
                                  {doc.title}
                                </div>
                                <div className="flex items-center justify-between gap-1 text-[10px] text-neutral-400">
                                  <span>{doc.wordCount} words</span>
                                  <span className="px-2 py-0.5 rounded bg-accent/10 group-hover:bg-accent/20 text-accent font-semibold flex items-center gap-1 transition-colors">
                                    <Plus className="w-3 h-3" />
                                    <span>Add to Graph</span>
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Unfiled Scenes Group */}
                  {(() => {
                    const unfiledUnlinked = unlinkedDocs
                      .filter(
                        (d) => !d.folderId && d.title.toLowerCase().includes(unlinkedSearch.toLowerCase())
                      )
                      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

                    if (unfiledUnlinked.length === 0) return null;
                    const isCollapsed = collapsedFolders['unfiled'];

                    return (
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                        <button
                          onClick={() => toggleFolderCollapse('unfiled')}
                          className={`w-full px-2.5 py-1.5 flex items-center justify-between text-left font-semibold text-xs cursor-pointer ${
                            isDarkMode ? 'bg-neutral-900/60 hover:bg-neutral-800' : 'bg-neutral-100 hover:bg-neutral-200'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <BookOpen className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            <span className="truncate">Unfiled Scenes</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-neutral-400">{unfiledUnlinked.length}</span>
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                          </div>
                        </button>

                        {!isCollapsed && (
                          <div className="p-1.5 space-y-1.5 bg-transparent">
                            {unfiledUnlinked.map((doc) => (
                              <div
                                key={doc.id}
                                onClick={() => handleAddSceneToGraph(doc.id)}
                                className={`p-2 rounded-md border text-xs transition-all cursor-pointer group ${
                                  isDarkMode 
                                    ? 'bg-neutral-900/80 border-neutral-800 hover:border-blue-500/60 hover:bg-neutral-800/80' 
                                    : 'bg-white border-neutral-200 hover:border-blue-500/60 hover:bg-blue-50/40'
                                }`}
                                title="Click to add scene to graph (placed on the left)"
                              >
                                <div className="font-semibold truncate mb-1 text-neutral-800 dark:text-neutral-200 group-hover:text-blue-400 transition-colors">
                                  {doc.title}
                                </div>
                                <div className="flex items-center justify-between gap-1 text-[10px] text-neutral-400">
                                  <span>{doc.wordCount} words</span>
                                  <span className="px-2 py-0.5 rounded bg-accent/10 group-hover:bg-accent/20 text-accent font-semibold flex items-center gap-1 transition-colors">
                                    <Plus className="w-3 h-3" />
                                    <span>Add to Graph</span>
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Canvas Workspace Viewport Wrapper */}
        <div className="flex-1 relative overflow-hidden flex flex-col min-w-0">
          {/* Dynamic Full-Bleed Infinite Dot Grid Background */}
          <div className="absolute inset-0 pointer-events-none opacity-40 overflow-hidden">
            <svg className="w-full h-full">
              <defs>
                <pattern
                  id="story-flow-dot-grid"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                  patternTransform={`translate(${panX}, ${-scrollTop}) scale(${zoom})`}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="1.2"
                    fill={isDarkMode ? '#ffffff' : '#000000'}
                    opacity={isDarkMode ? 0.3 : 0.25}
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#story-flow-dot-grid)" />
            </svg>
          </div>

          {/* Interactive Canvas */}
          <div
            ref={containerRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            className={`flex-1 relative overflow-x-hidden overflow-y-auto select-none cursor-grab bg-transparent ${isPanning ? 'cursor-grabbing' : ''}`}
          >
            {/* Spacer that dynamically matches graph vertical height expansion */}
            <div 
              style={{ 
                height: `${totalTrackHeight * zoom + 60}px`, 
                width: '1px', 
                pointerEvents: 'none' 
              }} 
            />

            {/* SVG Defs for Arrow Markers */}
            <svg className="absolute w-0 h-0 pointer-events-none">
              <defs>
                {Object.entries(LINK_TYPE_CONFIG).map(([type, config]) => (
                  <marker
                    key={type}
                    id={`arrow-${type}`}
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={config.color} />
                  </marker>
                ))}
              </defs>
            </svg>

            {/* Canvas World Area */}
            <div
              style={{
                transform: `translateX(${panX}px) scale(${zoom})`,
                transformOrigin: '0 0',
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${Math.max(maxX + 160, 1400)}px`,
                height: `${totalTrackHeight}px`
              }}
            >
              {/* SVG Links Layer */}
              <svg className="absolute inset-0 w-full h-full pointer-events-auto">
                {connectorPaths}
              </svg>

              {/* HTML Scene Node Cards Layer */}
              {visibleDocs.map((doc) => {
                const pos = nodePositions[doc.id] || { x: ORIGIN_X, y: ORIGIN_Y };
                const folder = folders.find((f) => f.id === doc.folderId);
                const isHovered = hoveredNodeId === doc.id;
                const isDraft = doc.status === 'draft';
                const hasLinks = storyLinks.some((l) => l.fromDocId === doc.id || l.toDocId === doc.id);

                const timelineDisplay = doc.timelineInfo?.startDisplay || 
                  (doc.timelineInfo?.startYear !== undefined ? `Year ${doc.timelineInfo.startYear}` : null);

                return (
                  <div
                    key={doc.id}
                    data-doc-id={doc.id}
                    style={{
                      left: `${pos.x}px`,
                      top: `${pos.y}px`,
                      width: `${NODE_WIDTH}px`,
                      height: `${NODE_HEIGHT}px`
                    }}
                    onMouseEnter={() => setHoveredNodeId(doc.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    className={`story-node-card absolute rounded-xl border p-3.5 shadow-md backdrop-blur-md flex flex-col justify-between transition-all duration-75 cursor-move ${
                      isDarkMode 
                        ? 'bg-[#181818]/95 border-neutral-700/80 hover:border-blue-500' 
                        : 'bg-white/95 border-neutral-200 hover:border-blue-500 shadow-lg'
                    } ${isHovered ? 'ring-2 ring-blue-500/50 z-30' : 'z-10'}`}
                    onMouseDown={(e) => handleStartNodeDrag(e, doc.id)}
                  >
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                      {/* Chapter header, status & return-to-sidebar if unlinked */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 truncate max-w-[160px]">
                          {folder ? folder.name : 'Unfiled Scene'}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            isDraft ? 'bg-amber-400' : 'bg-emerald-400'
                          }`} title={doc.status} />

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSceneFromGraph(doc.id);
                            }}
                            title="Remove from canvas (return to sidebar and delete attached links)"
                            className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Scene Title - Prominent and bold below the folder tag for easy reading at distance */}
                      <h3 
                        className="text-sm md:text-[15px] font-bold font-display line-clamp-1 text-neutral-900 dark:text-neutral-100 tracking-tight mt-0.5 mb-0.5"
                        title={doc.title}
                      >
                        {doc.title}
                      </h3>

                      {/* Plain text preview snippet */}
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                        {doc.plainText ? doc.plainText.slice(0, 85) : 'Empty scene content...'}
                      </p>
                    </div>

                    {/* Metrics & Action Bar: Quill on bottom left, Timeline pill, and bigger Link button on bottom right */}
                    <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800 pt-2 mt-auto">
                      {/* Open in editor (Quill button replacing word counter in bottom-left) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDocumentForEditor(doc.id);
                        }}
                        title="Open scene in Writing Studio"
                        className="p-1 rounded text-neutral-400 hover:text-purple-400 hover:bg-neutral-800 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                      >
                        <Feather className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1.5 ml-auto">
                        {/* Timeline Date Pill Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTimelineDocToEdit(doc);
                          }}
                          title="Edit Scene Timeline Date"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors cursor-pointer max-w-[85px]"
                        >
                          <Clock className="w-3 h-3 shrink-0" />
                          <span className="truncate font-medium">
                            {timelineDisplay || 'Timeline'}
                          </span>
                        </button>

                        {/* Bigger Link handle button in the bottom right corner */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartLinkFromNode(doc.id);
                          }}
                          title="Create Link from this Scene"
                          className="px-2.5 py-1 rounded-md text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 flex items-center gap-1.5 transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer shrink-0"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Link</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Empty state hint when no scenes are on the graph yet */}
              {graphDocIds.length === 0 && (
                <div className="absolute left-20 top-20 max-w-sm p-6 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-100/50 dark:bg-neutral-900/40 text-neutral-500 dark:text-neutral-400 space-y-2">
                  <div className="flex items-center gap-2 text-accent font-semibold text-xs">
                    <CornerDownRight className="w-4 h-4" />
                    <span>Get Started with Story Flow</span>
                  </div>
                  <p className="text-xs leading-relaxed">
                    Click any scene in the <strong>Unlinked Scenes</strong> panel on the left to place it on the canvas.
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    You can then connect scenes using the <strong>Link</strong> button.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Scrollable Pan Slider Bar */}
      <div 
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        className={`px-3 py-2 border-t shrink-0 flex items-center gap-3 z-20 ${
          isDarkMode ? 'border-neutral-800 bg-[#121212]' : 'border-neutral-200 bg-white'
        }`}
      >
        {/* Range Slider for panning */}
        <div className="flex-1 w-full flex items-center gap-2.5">
          <span className="text-[10px] font-mono text-neutral-400 shrink-0 font-semibold">Start</span>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={(() => {
              const cWidth = containerRef.current?.offsetWidth || 1200;
              const maxPan = Math.max(1, totalTrackWidth - cWidth);
              const pct = (-panX / maxPan) * 100;
              return Math.max(0, Math.min(100, isNaN(pct) ? 0 : pct));
            })()}
            onChange={(e) => {
              const pct = parseFloat(e.target.value);
              const cWidth = containerRef.current?.offsetWidth || 1200;
              const maxPan = Math.max(1, totalTrackWidth - cWidth);
              setPanX(-(pct / 100) * maxPan);
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500 transition-all"
            title="Drag slider to quickly move across the story flow"
          />
          <span className="text-[10px] font-mono text-neutral-400 shrink-0 font-semibold">End</span>
        </div>
      </div>

      {/* Narrative Legend - DESKTOP / LANDSCAPE ONLY */}
      <div className={`hidden sm:flex p-3 border-t flex-wrap items-center justify-between gap-3 text-xs shrink-0 ${
        isDarkMode ? 'border-neutral-800 bg-[#121212]' : 'border-neutral-200 bg-white'
      }`}>
        <div className="flex items-center flex-wrap gap-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            Legend:
          </span>
          {Object.entries(LINK_TYPE_CONFIG).map(([type, config]) => (
            <div key={type} className="flex items-center gap-1.5 text-[11px]">
              <span
                className="w-3 h-0.5 rounded-sm"
                style={{ backgroundColor: config.color }}
              />
              <span className="text-neutral-400 font-medium">
                {config.label.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>

        <div className="text-[11px] text-neutral-400 flex items-center gap-4">
          <span>Drag nodes freely to fine-tune</span>
        </div>
      </div>

      {/* Link Creation / Editing Modal */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`w-full max-w-md rounded-xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
            isDarkMode ? 'bg-[#181818] border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
          }`}>
            {/* Header */}
            <div className={`p-4 border-b flex items-center justify-between ${
              isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-200 bg-neutral-50'
            }`}>
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-bold font-display">
                  {editingLinkId ? 'Edit Narrative Link' : 'Create Narrative Connection'}
                </h2>
              </div>
              <button
                onClick={() => setIsLinkModalOpen(false)}
                className="p-1 rounded-md text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="p-4 space-y-3.5">
              {/* From Scene */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-neutral-400">
                    Source Scene (Cause / Origin)
                  </label>
                  {isSourceLocked && (
                    <span className="text-[10px] text-amber-500 dark:text-amber-400 font-medium flex items-center gap-1 select-none">
                      <Lock className="w-2.5 h-2.5" />
                      Locked to scene
                    </span>
                  )}
                </div>
                <select
                  value={selectedFromDocId}
                  onChange={(e) => setSelectedFromDocId(e.target.value)}
                  disabled={isSourceLocked}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs border outline-hidden transition-all ${
                    isSourceLocked
                      ? 'opacity-70 cursor-not-allowed bg-neutral-200 dark:bg-neutral-800/80 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 select-none'
                      : isDarkMode
                      ? 'bg-neutral-900 border-neutral-700 text-white'
                      : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                >
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>

              {/* To Scene */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                  Target Scene (Outcome / Follow-up)
                </label>
                <select
                  value={selectedToDocId}
                  onChange={(e) => setSelectedToDocId(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs border outline-hidden ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                >
                  {documents.map((d) => (
                    <option key={d.id} value={d.id} disabled={d.id === selectedFromDocId}>
                      {d.title} {d.id === selectedFromDocId ? '(Cannot link to self)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Relationship Type */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                  Plot Relationship Type
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(LINK_TYPE_CONFIG) as StoryLinkType[]).map((type) => {
                    const cfg = LINK_TYPE_CONFIG[type];
                    const isSel = selectedLinkType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedLinkType(type)}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                          isSel 
                            ? 'border-blue-500 bg-blue-500/10 text-white' 
                            : 'border-neutral-700 hover:border-neutral-600 text-neutral-300'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                        <span className="text-xs truncate">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Label */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                  Optional Connection Label (e.g. &quot;Betrayal&quot;, &quot;3 days later&quot;)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Discovers Secret, Divergence Point..."
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs border outline-hidden ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                  Author Plot Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Private plot notes and reasoning..."
                  value={linkNotes}
                  onChange={(e) => setLinkNotes(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs border outline-hidden resize-none ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>
            </div>

            {/* Footer */}
            <div className={`p-3 border-t flex items-center justify-between ${
              isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'
            }`}>
              {editingLinkId ? (
                <button
                  onClick={() => {
                    handleDeleteLink(editingLinkId);
                  }}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Link</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsLinkModalOpen(false)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                    isDarkMode ? 'border-neutral-700 bg-neutral-800 text-neutral-300' : 'border-neutral-300 bg-white text-neutral-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLink}
                  disabled={!selectedFromDocId || !selectedToDocId || selectedFromDocId === selectedToDocId}
                  className="px-4 py-1.5 rounded-lg border border-accent text-accent hover:bg-accent/10 disabled:opacity-40 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingLinkId ? 'Save Link' : 'Create Connection'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scene Timeline Modal */}
      {timelineDocToEdit && (
        <SceneTimelineModal
          isOpen={true}
          onClose={() => setTimelineDocToEdit(null)}
          document={timelineDocToEdit}
          folders={folders}
          timelineConfig={timelineConfig}
          onSaveTimelineInfo={(info) => {
            onSaveSceneTimelineInfo?.(timelineDocToEdit.id, info);
            setTimelineDocToEdit(null);
          }}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
};
