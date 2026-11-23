/**
 * Project persistence — plan phase 3.4.
 *
 * Owns three things: the current project document, autosave to the
 * `StoragePort` (debounced, so a slider drag does not write on every tick),
 * and import/export through the `FilePort` as a `.qvg.json` file. Documents
 * cross the boundary through `migrateProject`, which validates them, so a
 * corrupt or future-versioned file is reported, never half-loaded.
 *
 * Pure TypeScript: storage and files arrive as ports, so core stays testable
 * and native adapters can reuse this unchanged.
 */

import type { Project } from '@qvg/core';
import { CURRENT_SCHEMA_VERSION, createProject, updateProject } from '@qvg/core';
import { migrateProject } from '@qvg/core';
import type { MigrationResult } from '@qvg/core';
import type { StoragePort, FilePort } from '@qvg/platform';

/** Key prefix for autosaved projects in the `StoragePort`. */
export const AUTOSAVE_PREFIX = 'qvg:project:';

/** Debounce window for autosave (ms). */
export const AUTOSAVE_DEBOUNCE_MS = 800;

/** The file extension of an exported project. */
export const PROJECT_EXTENSION = 'qvg.json';

/** Why an autosave or load attempt did nothing. */
export type PersistenceStatus =
  | { ok: true }
  | {
      ok: false;
      reason: 'not-found' | 'invalid' | 'future-version' | 'storage-failed' | 'cancelled';
      detail?: string;
    };

/**
 * Serialise a project for storage or export.
 *
 * Exported separately so the file name, MIME type and serialisation stay in
 * one place.
 */
export function serializeProject(project: Project): string {
  return JSON.stringify({ ...project, schemaVersion: CURRENT_SCHEMA_VERSION }, null, 2);
}

/** Suggested file name for an exported project. */
export function projectFileName(project: Project): string {
  const safe =
    project.name
      .replace(/[^\p{L}\p{N} _-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'project';
  return `${safe}.${PROJECT_EXTENSION}`;
}

/**
 * Parse a `.qvg.json` file's text through the migration chain.
 *
 * The result is a typed Project or a status the UI can show.
 */
export function deserializeProject(text: string): {
  result: MigrationResult;
  status: PersistenceStatus;
} {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return {
      result: { ok: false, applied: [], issues: [{ path: '(root)', message: 'Not valid JSON' }] },
      status: { ok: false, reason: 'invalid', detail: e instanceof Error ? e.message : 'not JSON' },
    };
  }
  const result = migrateProject(doc);
  if (result.ok) return { result, status: { ok: true } };
  const future = result.issues.some((i) => i.message.includes('Update the app'));
  return {
    result,
    status: {
      ok: false,
      reason: future ? 'future-version' : 'invalid',
      detail: result.issues[0]?.message,
    },
  };
}

/**
 * Debounced autosave: collects writes and flushes the last one after the
 * window. Returns a disposer for unmount.
 */
export function createAutosave(
  storage: StoragePort,
  options: { debounceMs?: number; keyPrefix?: string } = {},
): {
  save: (project: Project) => void;
  flush: () => Promise<void>;
  dispose: () => void;
} {
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const keyPrefix = options.keyPrefix ?? AUTOSAVE_PREFIX;
  let pending: Project | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const project = pending;
    pending = null;
    if (!project) return;
    await storage.setItem(`${keyPrefix}${project.id}`, serializeProject(project));
  };

  const save = (project: Project): void => {
    pending = project;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, debounceMs);
  };

  const dispose = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  return { save, flush, dispose };
}

/** Load the autosaved project for `id`, or a status explaining why not. */
export async function loadAutosaved(
  storage: StoragePort,
  id: string,
  keyPrefix: string = AUTOSAVE_PREFIX,
): Promise<{ project: Project | null; status: PersistenceStatus }> {
  let text: string | null;
  try {
    text = await storage.getItem(`${keyPrefix}${id}`);
  } catch {
    return { project: null, status: { ok: false, reason: 'storage-failed' } };
  }
  if (text === null) return { project: null, status: { ok: false, reason: 'not-found' } };
  const { result, status } = deserializeProject(text);
  return { project: result.ok ? result.project : null, status };
}

/** List the autosaved project ids. */
export async function listAutosaved(
  storage: StoragePort,
  keyPrefix: string = AUTOSAVE_PREFIX,
): Promise<string[]> {
  const keys = await storage.keys(keyPrefix);
  return keys.map((key) => key.slice(keyPrefix.length));
}

/** Delete the autosave for `id`. */
export async function deleteAutosave(
  storage: StoragePort,
  id: string,
  keyPrefix: string = AUTOSAVE_PREFIX,
): Promise<void> {
  await storage.removeItem(`${keyPrefix}${id}`);
}

/**
 * Import a project through the file picker.
 * Returns `cancelled` when the user dismisses the picker.
 */
export async function importProjectFile(
  filePort: FilePort,
): Promise<{ project: Project | null; status: PersistenceStatus }> {
  const file = await filePort.pickFile({ accept: `application/json,.${PROJECT_EXTENSION}` });
  if (!file) return { project: null, status: { ok: false, reason: 'cancelled' } };
  const { result, status } = deserializeProject(await file.text());
  return { project: result.ok ? result.project : null, status };
}

/**
 * Export a project through the save dialog.
 * Returns `cancelled` when the user dismisses it.
 */
export async function exportProjectFile(
  filePort: FilePort,
  project: Project,
): Promise<PersistenceStatus> {
  const json = serializeProject(project);
  const file = new File([json], projectFileName(project), { type: 'application/json' });
  try {
    await filePort.saveFile(file, projectFileName(project));
    return { ok: true };
  } catch {
    return { ok: false, reason: 'cancelled' };
  }
}

/**
 * A new project seeded from the user's current settings.
 *
 * Used when the user starts from scratch: the document captures what is on
 * screen, not a blank template.
 */
export function projectFromSettings(
  id: string,
  name: string,
  settings: {
    reciterId: number;
    surah: number;
    fromAyah: number;
    toAyah: number;
    format: '9:16' | '1:1';
    backgroundPreset: string;
    rules: Project['rules'];
    annotations: Project['annotations'];
  },
): Project {
  return createProject(id, name, {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    source: {
      reciterId: settings.reciterId,
      surah: settings.surah,
      fromAyah: settings.fromAyah,
      toAyah: settings.toAyah,
    },
    format: settings.format,
    background: { preset: settings.backgroundPreset },
    rules: settings.rules,
    annotations: settings.annotations,
  });
}

/** Touch `updatedAt` (every mutation goes through here). */
export function touchProject(project: Project): Project {
  return updateProject(project, {});
}
