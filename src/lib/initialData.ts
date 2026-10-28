import type { NovelDocument, Folder, Character, TimelineEvent, TimelineConfig, StoryNodeLink, CodexEntry, MundusProject } from '../types';

export const INITIAL_MUNDUS_PROJECTS: MundusProject[] = [];

export const INITIAL_FOLDERS: Folder[] = [];

export const INITIAL_DOCUMENTS: NovelDocument[] = [];

export const INITIAL_CHARACTERS: Character[] = [];

export const INITIAL_TIMELINE_CONFIG: TimelineConfig = {
  timeSystem: 'fantasy',
  epochName: 'First Age',
  majorUnitName: 'Year',
  minorUnitName: 'Month',
  subUnitName: 'Day',
  baseYear: 1,
  unitsPerMajor: 12,
  subUnitsPerMinor: 30
};

export const INITIAL_TIMELINE_EVENTS: TimelineEvent[] = [];

export const INITIAL_STORY_LINKS: StoryNodeLink[] = [];

export const INITIAL_CODEX_ENTRIES: CodexEntry[] = [];
