import type { CodexEntry, MapMarker } from '../types';

export const getMarkerForCodexEntry = (entry: CodexEntry, activeMundusId: string): MapMarker | null => {
  if (!entry) return null;
  try {
    const storageKey = `mundus_map_markers_${activeMundusId || 'default'}`;
    const saved = localStorage.getItem(storageKey);
    if (!saved) return null;
    const markers: MapMarker[] = JSON.parse(saved);
    if (!Array.isArray(markers)) return null;

    return markers.find((m) => {
      if (m.linkedCodexId && m.linkedCodexId === entry.id) return true;
      if (entry.relatedLocationIds && entry.relatedLocationIds.includes(m.id)) return true;
      if (m.id === entry.id) return true;
      if (m.title && entry.title && m.title.trim().toLowerCase() === entry.title.trim().toLowerCase()) return true;
      return false;
    }) || null;
  } catch {
    return null;
  }
};
