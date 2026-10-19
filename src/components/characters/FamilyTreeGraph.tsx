import React, { useState, useMemo, useRef } from 'react';
import type { Character } from '../../types';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Users, 
  Heart, 
  Home, 
  ChevronDown,
  Info,
  Calendar
} from 'lucide-react';

interface FamilyTreeGraphProps {
  characters: Character[];
  selectedCharacterId?: string;
  onSelectCharacter: (charOrId: Character | string) => void;
  isDarkMode: boolean;
}

interface TreeNode {
  id: string; // union key e.g. "char-1+char-2" or "char-1"
  primary: Character;
  partner?: Character;
  children: TreeNode[];
  width: number;
  x: number;
  y: number;
}

const CARD_WIDTH_SINGLE = 220;
const CARD_WIDTH_COUPLE = 390;
const CARD_HEIGHT = 86;
const HORIZONTAL_GAP = 36;
const VERTICAL_LEVEL_GAP = 120;

export const FamilyTreeGraph: React.FC<FamilyTreeGraphProps> = ({
  characters,
  selectedCharacterId,
  onSelectCharacter,
  isDarkMode,
}) => {
  // Lineage filter: 'all' or specific family name
  const [selectedFamilyFilter, setSelectedFamilyFilter] = useState<string>('all');
  const [zoom, setZoom] = useState<number>(0.95);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Available families
  const allFamilies = useMemo(() => {
    return Array.from(new Set(characters.flatMap((c) => c.families || []).filter(Boolean)));
  }, [characters]);

  // Filter characters if a specific family is selected
  const activeCharacters = useMemo(() => {
    if (selectedFamilyFilter === 'all') return characters;
    return characters.filter((c) => c.families?.includes(selectedFamilyFilter));
  }, [characters, selectedFamilyFilter]);

  // Helper to find a character by ID or fallback name
  const findCharacter = (idOrName?: string): Character | undefined => {
    if (!idOrName) return undefined;
    return characters.find(
      (c) => c.id === idOrName || c.name.toLowerCase() === idOrName.toLowerCase()
    );
  };

  // Helper to extract life span display (e.g. "1902 - 1982" or "b. 418")
  const getLifespan = (char: Character) => {
    const birth = char.birthTime ? char.birthTime.replace(/Year\s*/i, '').split(',')[0].trim() : '';
    const death = char.deathTime ? char.deathTime.replace(/Year\s*/i, '').split(',')[0].trim() : '';
    
    if (birth && death) return `${birth} – ${death}`;
    if (birth) return `${birth} – Present`;
    if (death) return `† ${death}`;
    return char.status === 'deceased' ? 'Deceased' : 'Alive';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  };

  // Build the hierarchical tree data structure with dynamic multi-generational expansion
  const treeRoots = useMemo(() => {
    const visitedCharacters = new Set<string>();

    // Recursively build a tree node for a character and their partner
    const buildSubtree = (primary: Character, partner?: Character): TreeNode => {
      visitedCharacters.add(primary.id);
      if (partner) visitedCharacters.add(partner.id);

      // Identify all children of this union
      const childIds = new Set<string>();

      // From primary's explicit children list
      (primary.relatives?.children || []).forEach((cid) => {
        const char = findCharacter(cid);
        if (char) childIds.add(char.id);
      });
      
      // From partner's explicit children list
      if (partner?.relatives?.children) {
        partner.relatives.children.forEach((cid) => {
          const char = findCharacter(cid);
          if (char) childIds.add(char.id);
        });
      }

      // Reverse lookup: any character who lists primary or partner as father/mother
      characters.forEach((c) => {
        const fatherMatch = c.relatives?.father && (
          c.relatives.father === primary.id || 
          c.relatives.father === primary.name || 
          (partner && (c.relatives.father === partner.id || c.relatives.father === partner.name))
        );
        const motherMatch = c.relatives?.mother && (
          c.relatives.mother === primary.id || 
          c.relatives.mother === primary.name || 
          (partner && (c.relatives.mother === partner.id || c.relatives.mother === partner.name))
        );
        if (fatherMatch || motherMatch) {
          childIds.add(c.id);
        }
      });

      const childrenNodes: TreeNode[] = [];

      childIds.forEach((childId) => {
        const childChar = findCharacter(childId);
        if (!childChar) return;
        if (visitedCharacters.has(childChar.id)) return;

        // Check if child has a partner (who is not already visited as an ancestor)
        let childPartner: Character | undefined;
        const partnerIdOrName = childChar.relatives?.partners?.[0];
        if (partnerIdOrName) {
          const p = findCharacter(partnerIdOrName);
          if (p && !visitedCharacters.has(p.id)) {
            childPartner = p;
          }
        }

        childrenNodes.push(buildSubtree(childChar, childPartner));
      });

      const nodeWidth = partner ? CARD_WIDTH_COUPLE : CARD_WIDTH_SINGLE;

      // Subtree width calculation
      const childrenTotalWidth = childrenNodes.reduce(
        (sum, ch, idx) => sum + ch.width + (idx > 0 ? HORIZONTAL_GAP : 0),
        0
      );

      const totalWidth = Math.max(nodeWidth, childrenTotalWidth);

      return {
        id: partner ? `${primary.id}+${partner.id}` : primary.id,
        primary,
        partner,
        children: childrenNodes,
        width: totalWidth,
        x: 0,
        y: 0,
      };
    };

    // Helper: Determine if a character has active parents in the dataset
    const hasParentsInGraph = (c: Character): boolean => {
      const hasFather = Boolean(c.relatives?.father && findCharacter(c.relatives.father));
      const hasMother = Boolean(c.relatives?.mother && findCharacter(c.relatives.mother));
      return hasFather || hasMother;
    };

    // Determine True Lineage Roots:
    // A character is a true root ONLY if:
    // 1. They have NO parents in the graph.
    // 2. AND if they have a partner, that partner also does NOT have parents in the graph
    //    (if their partner HAS parents, this character is an in-law who should be placed under the partner's parents).
    const isTrueRoot = (c: Character): boolean => {
      if (hasParentsInGraph(c)) return false;

      const partnerIdOrName = c.relatives?.partners?.[0];
      if (partnerIdOrName) {
        const partner = findCharacter(partnerIdOrName);
        if (partner && hasParentsInGraph(partner)) {
          return false;
        }
      }

      return true;
    };

    const rootCandidates = activeCharacters.filter(isTrueRoot);
    const roots: TreeNode[] = [];

    rootCandidates.forEach((candidate) => {
      if (visitedCharacters.has(candidate.id)) return;

      // Check for partner
      let partner: Character | undefined;
      const partnerIdOrName = candidate.relatives?.partners?.[0];
      if (partnerIdOrName) {
        const p = findCharacter(partnerIdOrName);
        if (p && !visitedCharacters.has(p.id)) {
          partner = p;
        }
      }

      roots.push(buildSubtree(candidate, partner));
    });

    // If some characters were not reached from roots (e.g. isolated or cyclic links), include them
    activeCharacters.forEach((c) => {
      if (!visitedCharacters.has(c.id)) {
        let partner: Character | undefined;
        const partnerIdOrName = c.relatives?.partners?.[0];
        if (partnerIdOrName) {
          const p = findCharacter(partnerIdOrName);
          if (p && !visitedCharacters.has(p.id)) {
            partner = p;
          }
        }
        roots.push(buildSubtree(c, partner));
      }
    });

    // Layout positioning: assign X, Y coordinates and track maxDepth
    let currentXOffset = 40;
    let maxDepth = 0;

    const assignCoordinates = (node: TreeNode, leftX: number, depth: number) => {
      if (depth > maxDepth) maxDepth = depth;
      node.y = depth * (CARD_HEIGHT + VERTICAL_LEVEL_GAP) + 40;
      const nodeCardWidth = node.partner ? CARD_WIDTH_COUPLE : CARD_WIDTH_SINGLE;

      // Center the parent above its subtree width
      node.x = leftX + (node.width - nodeCardWidth) / 2;

      // Lay out children recursively side-by-side
      const childrenTotalWidth = node.children.reduce(
        (sum, ch, idx) => sum + ch.width + (idx > 0 ? HORIZONTAL_GAP : 0),
        0
      );

      // If children take less space than parent card, center the children block under the parent
      let childLeftX = leftX;
      if (node.children.length > 0 && childrenTotalWidth < node.width) {
        childLeftX = leftX + (node.width - childrenTotalWidth) / 2;
      }

      node.children.forEach((child) => {
        assignCoordinates(child, childLeftX, depth + 1);
        childLeftX += child.width + HORIZONTAL_GAP;
      });
    };

    roots.forEach((root) => {
      assignCoordinates(root, currentXOffset, 0);
      currentXOffset += root.width + HORIZONTAL_GAP * 2;
    });

    const calculatedTotalHeight = (maxDepth + 1) * (CARD_HEIGHT + VERTICAL_LEVEL_GAP) + 200;

    return { 
      roots, 
      maxDepth,
      totalWidth: currentXOffset + 100, 
      totalHeight: Math.max(calculatedTotalHeight, 1400) 
    };
  }, [activeCharacters, characters]);

  // Mouse & Touch pan handlers
  const touchStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.clickable-node') || (e.target as HTMLElement).closest('select')) {
      return;
    }
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        panX: panOffset.x,
        panY: panOffset.y,
      };
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (touchStartRef.current && e.touches.length === 1) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      setPanOffset({
        x: touchStartRef.current.panX + deltaX,
        y: touchStartRef.current.panY + deltaY,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    touchStartRef.current = null;
    setIsDragging(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.clickable-node') || (e.target as HTMLElement).closest('select')) {
      return;
    }
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))));
  const handleResetView = () => {
    setZoom(0.95);
    setPanOffset({ x: 40, y: 40 });
  };

  // Helper to determine parent anchor X coordinate for a child under a tree node
  const getParentAnchorX = (node: TreeNode, child: TreeNode): number => {
    if (!node.partner) {
      return node.x + CARD_WIDTH_SINGLE / 2;
    }

    const childChar = child.primary;
    const partnerChar = child.partner;
    const primaryChar = node.primary;
    const parentPartnerChar = node.partner;

    const primaryMatch = Boolean(
      (childChar.relatives?.father && (childChar.relatives.father === primaryChar.id || childChar.relatives.father.toLowerCase() === primaryChar.name.toLowerCase())) ||
      (childChar.relatives?.mother && (childChar.relatives.mother === primaryChar.id || childChar.relatives.mother.toLowerCase() === primaryChar.name.toLowerCase())) ||
      (partnerChar && partnerChar.relatives?.father && (partnerChar.relatives.father === primaryChar.id || partnerChar.relatives.father.toLowerCase() === primaryChar.name.toLowerCase())) ||
      (partnerChar && partnerChar.relatives?.mother && (partnerChar.relatives.mother === primaryChar.id || partnerChar.relatives.mother.toLowerCase() === primaryChar.name.toLowerCase())) ||
      primaryChar.relatives?.children?.includes(childChar.id) ||
      (partnerChar && primaryChar.relatives?.children?.includes(partnerChar.id))
    );

    const partnerMatch = Boolean(
      (childChar.relatives?.father && (childChar.relatives.father === parentPartnerChar.id || childChar.relatives.father.toLowerCase() === parentPartnerChar.name.toLowerCase())) ||
      (childChar.relatives?.mother && (childChar.relatives.mother === parentPartnerChar.id || childChar.relatives.mother.toLowerCase() === parentPartnerChar.name.toLowerCase())) ||
      (partnerChar && partnerChar.relatives?.father && (partnerChar.relatives.father === parentPartnerChar.id || partnerChar.relatives.father.toLowerCase() === parentPartnerChar.name.toLowerCase())) ||
      (partnerChar && partnerChar.relatives?.mother && (partnerChar.relatives.mother === parentPartnerChar.id || partnerChar.relatives.mother.toLowerCase() === parentPartnerChar.name.toLowerCase())) ||
      parentPartnerChar.relatives?.children?.includes(childChar.id) ||
      (partnerChar && parentPartnerChar.relatives?.children?.includes(partnerChar.id))
    );

    if (primaryMatch && !partnerMatch) {
      // Connects ONLY to primary parent pill (left side of parent box: center = node.x + 97)
      return node.x + 97;
    }
    if (partnerMatch && !primaryMatch) {
      // Connects ONLY to partner parent pill (right side of parent box: center = node.x + 293)
      return node.x + 293;
    }

    // Default: Joint child of couple (center of couple box)
    return node.x + CARD_WIDTH_COUPLE / 2;
  };

  // Helper to determine child target anchor X coordinate (connecting directly to the blood descendant's head)
  const getChildTargetAnchorX = (parentNode: TreeNode, child: TreeNode): number => {
    if (!child.partner) {
      return child.x + CARD_WIDTH_SINGLE / 2;
    }

    const primaryChar = child.primary;
    const partnerChar = child.partner;
    const parentPrimary = parentNode.primary;
    const parentPartner = parentNode.partner;

    const isPartnerDescendant = Boolean(
      partnerChar && (
        (partnerChar.relatives?.father && (partnerChar.relatives.father === parentPrimary.id || partnerChar.relatives.father.toLowerCase() === parentPrimary.name.toLowerCase() || (parentPartner && (partnerChar.relatives.father === parentPartner.id || partnerChar.relatives.father.toLowerCase() === parentPartner.name.toLowerCase())))) ||
        (partnerChar.relatives?.mother && (partnerChar.relatives.mother === parentPrimary.id || partnerChar.relatives.mother.toLowerCase() === parentPrimary.name.toLowerCase() || (parentPartner && (partnerChar.relatives.mother === parentPartner.id || partnerChar.relatives.mother.toLowerCase() === parentPartner.name.toLowerCase())))) ||
        parentPrimary.relatives?.children?.includes(partnerChar.id) ||
        (parentPartner && parentPartner.relatives?.children?.includes(partnerChar.id))
      )
    );

    const isPrimaryDescendant = Boolean(
      (primaryChar.relatives?.father && (primaryChar.relatives.father === parentPrimary.id || primaryChar.relatives.father.toLowerCase() === parentPrimary.name.toLowerCase() || (parentPartner && (primaryChar.relatives.father === parentPartner.id || primaryChar.relatives.father.toLowerCase() === parentPartner.name.toLowerCase())))) ||
      (primaryChar.relatives?.mother && (primaryChar.relatives.mother === parentPrimary.id || primaryChar.relatives.mother.toLowerCase() === parentPrimary.name.toLowerCase() || (parentPartner && (primaryChar.relatives.mother === parentPartner.id || primaryChar.relatives.mother.toLowerCase() === parentPartner.name.toLowerCase())))) ||
      parentPrimary.relatives?.children?.includes(primaryChar.id) ||
      (parentPartner && parentPartner.relatives?.children?.includes(primaryChar.id))
    );

    if (isPartnerDescendant && !isPrimaryDescendant) {
      // Connects directly above partner (right pill center = child.x + 293)
      return child.x + 293;
    }

    // Standard/Default: Connects directly above the biological child / primary persona (left pill center = child.x + 97)
    return child.x + 97;
  };

  // Collect all connector lines (orthogonal tree links)
  const connectorPaths = useMemo(() => {
    const paths: React.ReactNode[] = [];

    const traverse = (node: TreeNode) => {
      if (node.children.length === 0) return;

      const parentBottomY = node.y + CARD_HEIGHT;
      const branchY = parentBottomY + VERTICAL_LEVEL_GAP / 2;

      // Group children by their calculated parent anchor X coordinate
      const groups = new Map<number, { child: TreeNode; childX: number; childY: number }[]>();

      node.children.forEach((child) => {
        const anchorX = getParentAnchorX(node, child);
        const childX = getChildTargetAnchorX(node, child);
        const childY = child.y;

        if (!groups.has(anchorX)) {
          groups.set(anchorX, []);
        }
        groups.get(anchorX)!.push({ child, childX, childY });
      });

      // Render connector paths for each parent anchor X group
      groups.forEach((childrenGroup, parentBottomX) => {
        if (childrenGroup.length === 1) {
          const childPt = childrenGroup[0];
          if (Math.abs(parentBottomX - childPt.childX) < 1) {
            // Direct straight vertical line from parent to child
            paths.push(
              <line
                key={`single-line-${node.id}-${parentBottomX}-${childPt.child.id}`}
                x1={parentBottomX}
                y1={parentBottomY}
                x2={parentBottomX}
                y2={childPt.childY}
                stroke={isDarkMode ? '#64748b' : '#94a3b8'}
                strokeWidth="2"
              />
            );
          } else {
            // Stepped orthogonal line: Parent bottom -> down to branchY -> over to childPt.childX -> down to childPt.childY
            const pathD = `M ${parentBottomX} ${parentBottomY} L ${parentBottomX} ${branchY} L ${childPt.childX} ${branchY} L ${childPt.childX} ${childPt.childY}`;
            paths.push(
              <path
                key={`stepped-line-${node.id}-${parentBottomX}-${childPt.child.id}`}
                d={pathD}
                fill="none"
                stroke={isDarkMode ? '#64748b' : '#94a3b8'}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            );
          }
        } else {
          // Multiple children in this parent group:
          // 1. Vertical stem line from specific parent bottom down to horizontal branch bus
          paths.push(
            <line
              key={`stem-${node.id}-${parentBottomX}`}
              x1={parentBottomX}
              y1={parentBottomY}
              x2={parentBottomX}
              y2={branchY}
              stroke={isDarkMode ? '#64748b' : '#94a3b8'}
              strokeWidth="2"
            />
          );

          // 2. Horizontal bus bar spanning from min(parent, children) to max(parent, children)
          const allXs = [parentBottomX, ...childrenGroup.map((p) => p.childX)];
          const minX = Math.min(...allXs);
          const maxX = Math.max(...allXs);

          paths.push(
            <line
              key={`bus-${node.id}-${parentBottomX}`}
              x1={minX}
              y1={branchY}
              x2={maxX}
              y2={branchY}
              stroke={isDarkMode ? '#64748b' : '#94a3b8'}
              strokeWidth="2"
            />
          );

          // 3. Drop lines from horizontal branch bus down into each child's top center
          childrenGroup.forEach((pt) => {
            paths.push(
              <line
                key={`drop-${node.id}-${parentBottomX}-${pt.child.id}`}
                x1={pt.childX}
                y1={branchY}
                x2={pt.childX}
                y2={pt.childY}
                stroke={isDarkMode ? '#64748b' : '#94a3b8'}
                strokeWidth="2"
              />
            );
          });
        }
      });

      // Recurse for children
      node.children.forEach(traverse);
    };

    treeRoots.roots.forEach(traverse);
    return paths;
  }, [treeRoots, isDarkMode]);

  // Render individual character pill (within single card or couple unit)
  const renderCharacterPill = (char: Character, isPartner: boolean = false) => {
    const isSelected = selectedCharacterId === char.id;
    const lifespan = getLifespan(char);

    return (
      <div
        key={char.id}
        onClick={(e) => {
          e.stopPropagation();
          onSelectCharacter(char);
        }}
        className={`clickable-node flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
          isSelected
            ? 'ring-2 ring-blue-500 bg-blue-500/10'
            : isDarkMode
            ? 'hover:bg-neutral-800/70'
            : 'hover:bg-neutral-100/80'
        }`}
      >
        {/* Avatar circle */}
        {char.avatarUrl ? (
          <img
            src={char.avatarUrl}
            alt={char.name}
            className="w-10 h-10 rounded-full object-cover shadow-xs shrink-0 ring-2 ring-white/20"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-xs shrink-0 tracking-wider ring-2 ring-white/20"
            style={{ backgroundColor: char.avatarColor || '#3b82f6' }}
          >
            {getInitials(char.name)}
          </div>
        )}

        {/* Character Info Pill (like the clean blue tag in reference image) */}
        <div className={`flex-1 min-w-0 px-3 py-1.5 rounded-lg border ${
          isDarkMode
            ? 'bg-neutral-800/90 border-neutral-700/60'
            : 'bg-blue-50/70 border-blue-200/80'
        }`}>
          <div className="flex items-center justify-between gap-1">
            <span className="font-semibold text-xs truncate font-display text-neutral-900 dark:text-neutral-100">
              {char.name}
            </span>
            {char.status === 'deceased' && (
              <span className="text-[9px] text-rose-500 font-mono shrink-0">†</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">
            <Calendar className="w-2.5 h-2.5 opacity-60" />
            <span className="truncate">{lifespan}</span>
          </div>
        </div>
      </div>
    );
  };

  // Render node box (either single or couple card)
  const renderNodeBox = (node: TreeNode) => {
    const isCouple = !!node.partner;
    const width = isCouple ? CARD_WIDTH_COUPLE : CARD_WIDTH_SINGLE;

    return (
      <div
        key={node.id}
        style={{
          position: 'absolute',
          left: `${node.x}px`,
          top: `${node.y}px`,
          width: `${width}px`,
          height: `${CARD_HEIGHT}px`,
        }}
        className={`rounded-2xl border shadow-md flex items-center transition-shadow backdrop-blur-xs select-none ${
          isDarkMode
            ? 'bg-[#151515]/95 border-neutral-700/80 hover:border-neutral-500'
            : 'bg-white/95 border-neutral-300 hover:border-neutral-400'
        }`}
      >
        {isCouple ? (
          <div className="w-full flex items-center justify-between px-2 relative">
            <div className="w-[178px]">
              {renderCharacterPill(node.primary)}
            </div>

            {/* Horizontal Union Connector between partners */}
            <div className="flex flex-col items-center justify-center shrink-0 px-0.5">
              <div className={`w-3 h-0.5 ${isDarkMode ? 'bg-neutral-600' : 'bg-neutral-300'}`} />
              <Heart className="w-3.5 h-3.5 text-rose-500 my-0.5 fill-rose-500/20" />
              <div className={`w-3 h-0.5 ${isDarkMode ? 'bg-neutral-600' : 'bg-neutral-300'}`} />
            </div>

            <div className="w-[178px]">
              {node.partner && renderCharacterPill(node.partner, true)}
            </div>
          </div>
        ) : (
          <div className="w-full px-2">
            {renderCharacterPill(node.primary)}
          </div>
        )}
      </div>
    );
  };

  // Recursive collection of all node boxes for rendering
  const allNodeElements = useMemo(() => {
    const elements: React.ReactNode[] = [];
    const traverse = (node: TreeNode) => {
      elements.push(renderNodeBox(node));
      node.children.forEach(traverse);
    };
    treeRoots.roots.forEach(traverse);
    return elements;
  }, [treeRoots, selectedCharacterId, isDarkMode]);

  return (
    <div 
      id="family-tree-graph-container"
      className="relative w-full h-full flex flex-col overflow-hidden select-none"
    >
      {/* Top Controls Bar */}
      <div className={`p-3 border-b flex flex-wrap items-center justify-between gap-3 z-10 shrink-0 ${
        isDarkMode ? 'bg-[#121212] border-neutral-800' : 'bg-white border-neutral-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Home className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-bold font-display uppercase tracking-wider text-neutral-500">
              Lineage:
            </span>
          </div>

          {/* Family / Bloodline Filter Dropdown */}
          <div className="relative">
            <select
              value={selectedFamilyFilter}
              onChange={(e) => setSelectedFamilyFilter(e.target.value)}
              className={`text-xs pl-3 pr-8 py-1.5 rounded-lg border font-semibold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-700 text-white' 
                  : 'bg-neutral-50 border-neutral-300 text-neutral-900'
              }`}
            >
              <option value="all">All Lineages & Houses</option>
              {allFamilies.map((fam) => (
                <option key={fam} value={fam}>
                  {fam}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          <span className="text-xs text-neutral-400 font-mono hidden sm:inline">
            {activeCharacters.length} characters in view
          </span>
        </div>

        {/* Zoom & Canvas Controls */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-neutral-400 mr-1.5">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className={`p-1.5 rounded-md border text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer ${
              isDarkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-100'
            }`}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className={`p-1.5 rounded-md border text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer ${
              isDarkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-100'
            }`}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetView}
            title="Reset Pan & Zoom"
            className={`p-1.5 rounded-md border text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer ${
              isDarkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-100'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Graph Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`flex-1 w-full h-full relative overflow-hidden cursor-grab active:cursor-grabbing ${
          isDarkMode ? 'bg-[#0d0d0d]' : 'bg-[#f8fafc]'
        }`}
        style={{
          backgroundImage: isDarkMode
            ? 'radial-gradient(#262626 1px, transparent 1px)'
            : 'radial-gradient(#e2e8f0 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {treeRoots.roots.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <Users className="w-12 h-12 text-neutral-400 mb-3 opacity-40" />
            <h3 className="text-base font-semibold font-display">No Family Tree Recorded</h3>
            <p className="text-xs text-neutral-400 max-w-sm mt-1 mb-4 leading-relaxed">
              To form branches and lineage trees, open a character’s dossier and link their Father, Mother, Partners, or Children.
            </p>
          </div>
        ) : (
          <div
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: `${Math.max(treeRoots.totalWidth, 2000)}px`,
              height: `${Math.max(treeRoots.totalHeight, 1400)}px`,
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            {/* SVG Connecting Lines Layer */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={Math.max(treeRoots.totalWidth, 2000)}
              height={Math.max(treeRoots.totalHeight, 1400)}
            >
              {connectorPaths}
            </svg>

            {/* Tree Nodes Cards Layer */}
            {allNodeElements}
          </div>
        )}

        {/* Helpful Tip floating banner */}
        <div className={`absolute bottom-3 left-3 px-3 py-1.5 rounded-lg border text-[11px] flex items-center gap-2 pointer-events-none opacity-80 backdrop-blur-xs ${
          isDarkMode ? 'bg-neutral-900/80 border-neutral-800 text-neutral-400' : 'bg-white/80 border-neutral-200 text-neutral-600'
        }`}>
          <Info className="w-3 h-3 text-blue-500" />
          <span>Click any character node to inspect and edit their dossier</span>
        </div>
      </div>
    </div>
  );
};
