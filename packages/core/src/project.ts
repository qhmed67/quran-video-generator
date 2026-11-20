/**
 * Project document — plan phase 3.4.
 *
 * The single source of truth for a video: recitation range, styling,
 * background, and annotations.
 */

import type { Annotation } from './annotation';
import type { StyleRule as WordStyleRule } from './style';

/** Background specification for the video. */
export interface BackgroundSpec {
  preset: string; // matches GRADIENT_PRESETS id
  customImage?: string; // data URL or external URL
  opacity?: number;
}

/** Project document — the single source of truth for a video. */
export interface Project {
  /** Schema version: bump on any breaking change. */
  schemaVersion: number;
  /** Unique project ID. */
  id: string;
  /** User-visible name. */
  name: string;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
  /** Recitation source and range. */
  source: {
    reciterId: number;
    surah: number;
    fromAyah: number;
    toAyah: number;
  };
  /** Video format. */
  format: '9:16' | '1:1';
  /** Background specification. */
  background: BackgroundSpec;
  /** Word style rules. */
  rules: WordStyleRule[];
  /** User-added annotations. */
  annotations: Annotation[];
}

/** Default project settings. */
export const DEFAULT_PROJECT: Omit<Project, 'id' | 'name' | 'createdAt' | 'updatedAt'> = {
  schemaVersion: 1,
  source: {
    reciterId: 1,
    surah: 1,
    fromAyah: 1,
    toAyah: 7,
  },
  format: '9:16',
  background: {
    preset: 'forest',
  },
  rules: [],
  annotations: [],
};

/**
 * Create a new project with defaults and timestamps.
 */
export function createProject(
  id: string,
  name: string,
  overrides: Partial<Omit<Project, 'id' | 'name' | 'createdAt' | 'updatedAt'>> = {},
): Project {
  const now = new Date().toISOString();
  const base: Omit<Project, 'id' | 'name' | 'createdAt' | 'updatedAt'> = DEFAULT_PROJECT;
  const merged = {
    ...base,
    ...overrides,
    source: { ...base.source, ...overrides.source },
    background: { ...base.background, ...overrides.background },
    rules: overrides.rules ?? [],
    annotations: overrides.annotations ?? [],
  };
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    ...merged,
  };
}

/**
 * Update a project's metadata and content.
 */
export function updateProject(
  project: Project,
  updates: Partial<Omit<Project, 'id' | 'createdAt' | 'schemaVersion'>>,
): Project {
  return {
    ...project,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}
