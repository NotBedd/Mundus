import type { Character, CharacterRelatives } from '../types';

/**
 * Normalizes and synchronizes reciprocal family & relative relationships across all characters.
 * Guarantees 100% bidirectional integrity:
 * 1. Partners: A has B in partners <=> B has A in partners
 * 2. Father/Mother -> Children:
 *    - If C has father F => F has C in children
 *    - If C has mother M => M has C in children
 * 3. Children -> Father/Mother:
 *    - If P has child C in children:
 *      - If P is Female => C has mother P
 *      - If P is Male / Other => C has father P
 * 4. Siblings: A has B in siblings <=> B has A in siblings
 * 5. Canonicalizes all references from names to character IDs where possible.
 */
export function syncRelativesAcrossCharacters(
  allCharacters: Character[],
  targetId?: string,
  updatedTarget?: Character
): Character[] {
  // 1. Build a working copy map of characters keyed by ID
  const charMap = new Map<string, Character>();
  allCharacters.forEach((c) => {
    charMap.set(c.id, {
      ...c,
      relatives: {
        father: c.relatives?.father || '',
        mother: c.relatives?.mother || '',
        siblings: [...(c.relatives?.siblings || [])],
        partners: [...(c.relatives?.partners || [])],
        children: [...(c.relatives?.children || [])],
      },
    });
  });

  // Apply the active update if provided
  if (targetId && updatedTarget) {
    charMap.set(targetId, {
      ...updatedTarget,
      relatives: {
        father: updatedTarget.relatives?.father || '',
        mother: updatedTarget.relatives?.mother || '',
        siblings: [...(updatedTarget.relatives?.siblings || [])],
        partners: [...(updatedTarget.relatives?.partners || [])],
        children: [...(updatedTarget.relatives?.children || [])],
      },
    });
  }

  // Lookup helper (by ID or exact name case-insensitive)
  const findCharacter = (idOrName?: string): Character | undefined => {
    if (!idOrName) return undefined;
    if (charMap.has(idOrName)) return charMap.get(idOrName);
    for (const c of charMap.values()) {
      if (c.name.toLowerCase() === idOrName.toLowerCase()) return c;
    }
    return undefined;
  };

  // Helper to canonicalize an ID or Name to its Character ID
  const toId = (idOrName?: string): string => {
    if (!idOrName) return '';
    const char = findCharacter(idOrName);
    return char ? char.id : idOrName;
  };

  // Step A: Canonicalize all references to IDs in the map
  charMap.forEach((char) => {
    if (char.relatives) {
      if (char.relatives.father) {
        char.relatives.father = toId(char.relatives.father);
      }
      if (char.relatives.mother) {
        char.relatives.mother = toId(char.relatives.mother);
      }
      if (char.relatives.partners) {
        char.relatives.partners = Array.from(
          new Set(char.relatives.partners.map((p) => toId(p)).filter(Boolean))
        );
      }
      if (char.relatives.siblings) {
        char.relatives.siblings = Array.from(
          new Set(char.relatives.siblings.map((s) => toId(s)).filter(Boolean))
        );
      }
      if (char.relatives.children) {
        char.relatives.children = Array.from(
          new Set(char.relatives.children.map((ch) => toId(ch)).filter(Boolean))
        );
      }
    }
  });

  // Step B: If a specific target was updated, handle explicit removals first
  if (targetId && updatedTarget) {
    const oldTarget = allCharacters.find((c) => c.id === targetId);
    if (oldTarget && oldTarget.relatives) {
      const oldFatherId = toId(oldTarget.relatives.father);
      const newFatherId = toId(updatedTarget.relatives?.father);
      if (oldFatherId && oldFatherId !== newFatherId) {
        const formerFather = charMap.get(oldFatherId);
        if (formerFather && formerFather.relatives?.children) {
          formerFather.relatives.children = formerFather.relatives.children.filter((cid) => cid !== targetId);
        }
      }

      const oldMotherId = toId(oldTarget.relatives.mother);
      const newMotherId = toId(updatedTarget.relatives?.mother);
      if (oldMotherId && oldMotherId !== newMotherId) {
        const formerMother = charMap.get(oldMotherId);
        if (formerMother && formerMother.relatives?.children) {
          formerMother.relatives.children = formerMother.relatives.children.filter((cid) => cid !== targetId);
        }
      }

      // Former partners removed
      const oldPartners = (oldTarget.relatives.partners || []).map(toId);
      const newPartners = (updatedTarget.relatives?.partners || []).map(toId);
      oldPartners.forEach((opId) => {
        if (!newPartners.includes(opId)) {
          const formerPartner = charMap.get(opId);
          if (formerPartner && formerPartner.relatives?.partners) {
            formerPartner.relatives.partners = formerPartner.relatives.partners.filter((p) => p !== targetId);
          }
        }
      });

      // Former siblings removed
      const oldSiblings = (oldTarget.relatives.siblings || []).map(toId);
      const newSiblings = (updatedTarget.relatives?.siblings || []).map(toId);
      oldSiblings.forEach((osId) => {
        if (!newSiblings.includes(osId)) {
          const formerSibling = charMap.get(osId);
          if (formerSibling && formerSibling.relatives?.siblings) {
            formerSibling.relatives.siblings = formerSibling.relatives.siblings.filter((s) => s !== targetId);
          }
        }
      });

      // Former children removed
      const oldChildren = (oldTarget.relatives.children || []).map(toId);
      const newChildren = (updatedTarget.relatives?.children || []).map(toId);
      oldChildren.forEach((ochId) => {
        if (!newChildren.includes(ochId)) {
          const formerChild = charMap.get(ochId);
          if (formerChild && formerChild.relatives) {
            if (formerChild.relatives.father === targetId) {
              formerChild.relatives.father = '';
            }
            if (formerChild.relatives.mother === targetId) {
              formerChild.relatives.mother = '';
            }
          }
        }
      });
    }
  }

  // Step C: Reconcile all forward links into reciprocal targets
  charMap.forEach((char) => {
    const rel = char.relatives;
    if (!rel) return;

    // 1. Father link
    if (rel.father) {
      const father = charMap.get(rel.father);
      if (father) {
        if (!father.relatives) father.relatives = {};
        if (!father.relatives.children) father.relatives.children = [];
        if (!father.relatives.children.includes(char.id)) {
          father.relatives.children.push(char.id);
        }
      }
    }

    // 2. Mother link
    if (rel.mother) {
      const mother = charMap.get(rel.mother);
      if (mother) {
        if (!mother.relatives) mother.relatives = {};
        if (!mother.relatives.children) mother.relatives.children = [];
        if (!mother.relatives.children.includes(char.id)) {
          mother.relatives.children.push(char.id);
        }
      }
    }

    // 3. Partners bilateral link
    (rel.partners || []).forEach((partnerId) => {
      const partner = charMap.get(partnerId);
      if (partner) {
        if (!partner.relatives) partner.relatives = {};
        if (!partner.relatives.partners) partner.relatives.partners = [];
        if (!partner.relatives.partners.includes(char.id)) {
          partner.relatives.partners.push(char.id);
        }
      }
    });

    // 4. Siblings bilateral link
    (rel.siblings || []).forEach((siblingId) => {
      const sibling = charMap.get(siblingId);
      if (sibling) {
        if (!sibling.relatives) sibling.relatives = {};
        if (!sibling.relatives.siblings) sibling.relatives.siblings = [];
        if (!sibling.relatives.siblings.includes(char.id)) {
          sibling.relatives.siblings.push(char.id);
        }
      }
    });

    // 5. Children link -> parent
    (rel.children || []).forEach((childId) => {
      const child = charMap.get(childId);
      if (child) {
        if (!child.relatives) child.relatives = {};
        const isFemale =
          char.sex?.toLowerCase().includes('fem') ||
          char.sex?.toLowerCase().includes('woman');

        if (isFemale) {
          if (!child.relatives.mother) {
            child.relatives.mother = char.id;
          }
        } else {
          if (!child.relatives.father) {
            child.relatives.father = char.id;
          }
        }
      }
    });
  });

  return Array.from(charMap.values());
}

// ---------------------------------------------------------------------------
// v0.7.95: deletion hygiene. Character ids look like "char-<epoch>" (plus an
// optional "-<rand>" suffix), so an id-shaped relative reference that resolves
// to nobody is a dangling pointer to a deleted character — it can never be a
// hand-typed custom name. UIs hide such refs, and the delete handler purges
// them from the survivors so the raw id is never displayed again.
// ---------------------------------------------------------------------------
const INTERNAL_CHAR_ID_PATTERN = /^char-\d+(?:-\d+)*$/;

export function looksLikeCharacterId(ref: string | undefined | null): boolean {
  return typeof ref === 'string' && INTERNAL_CHAR_ID_PATTERN.test(ref);
}

export interface PurgeDeletedCharacterResult {
  /** Survivor roster with every reference to the deleted character removed. */
  list: Character[];
  /** Ids of survivors whose relatives actually changed (for cloud saves). */
  changedIds: string[];
}

/**
 * v0.7.95: delete-time counterpart of syncRelativesAcrossCharacters. Deleting
 * a character used to leave their raw id inside every survivor's relatives
 * (father/mother strings + siblings/partners/children arrays) — the UI then
 * displayed the id itself ("a number shown as partner").
 *
 * Rules (pure — inputs are never mutated):
 *  1. Any reference equal to the deleted id is removed.
 *  2. Any id-shaped reference that resolves to no survivor is removed too
 *     (opportunistic cleanup of legacy dangling refs; an id-shaped ref cannot
 *     be a custom name by definition).
 *  3. A reference equal to the deleted character's NAME is removed only when
 *     no surviving character owns that name (otherwise the name may point at
 *     the same-named survivor). All other custom-name references survive.
 */
export function purgeDeletedCharacterReferences(
  survivors: Character[],
  deletedId: string,
  deletedName?: string
): PurgeDeletedCharacterResult {
  const survivorIds = new Set(survivors.map((c) => c.id));
  const nameLower = (deletedName || '').trim().toLowerCase();
  const nameStillOwned = nameLower
    ? survivors.some((c) => (c.name || '').trim().toLowerCase() === nameLower)
    : false;

  const isDeadRef = (ref: string): boolean => {
    if (!ref) return false;
    if (ref === deletedId) return true;
    if (looksLikeCharacterId(ref) && !survivorIds.has(ref)) return true;
    if (nameLower && !nameStillOwned && ref.trim().toLowerCase() === nameLower) return true;
    return false;
  };

  const changedIds: string[] = [];
  const list = survivors.map((char) => {
    const rel = char.relatives;
    if (!rel) return char;

    const nextFather = rel.father && !isDeadRef(rel.father) ? rel.father : '';
    const nextMother = rel.mother && !isDeadRef(rel.mother) ? rel.mother : '';
    const nextSiblings = (rel.siblings || []).filter((s) => !isDeadRef(s));
    const nextPartners = (rel.partners || []).filter((p) => !isDeadRef(p));
    const nextChildren = (rel.children || []).filter((c) => !isDeadRef(c));

    const changed =
      nextFather !== (rel.father || '') ||
      nextMother !== (rel.mother || '') ||
      nextSiblings.length !== (rel.siblings || []).length ||
      nextPartners.length !== (rel.partners || []).length ||
      nextChildren.length !== (rel.children || []).length;
    if (!changed) return char;

    changedIds.push(char.id);
    return {
      ...char,
      relatives: {
        father: nextFather,
        mother: nextMother,
        siblings: nextSiblings,
        partners: nextPartners,
        children: nextChildren,
      },
      updatedAt: new Date().toISOString(),
    };
  });

  return { list, changedIds };
}
