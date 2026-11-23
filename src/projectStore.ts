/**
 * App-level project persistence — plan phase 3.4.
 *
 * Bridges the studio's live settings and style rules to a `Project` document,
 * autosaves it through the `StoragePort`, and imports/exports `.qvg.json`
 * files through the `FilePort`. The document is derived: the studio's state
 * stays the source of truth, the project is what gets saved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation, Project, StyleRule } from '@qvg/core';
import type { FilePort, StoragePort } from '@qvg/platform';
import { LocalStoragePort, BrowserFilePort } from '@qvg/platform/web';
import {
  AUTOSAVE_PREFIX,
  createAutosave,
  exportProjectFile,
  importProjectFile,
  listAutosaved,
  loadAutosaved,
  projectFromSettings,
} from '@qvg/platform';

/** How the studio's current settings map to a project document. */
export interface StudioSnapshot {
  reciterId: string;
  surah: number;
  from: number;
  to: number;
  aspect: '9:16' | '1:1';
  bgId: string;
  rules: StyleRule[];
  annotations: Annotation[];
}

export interface UseProjectStoreOptions {
  snapshot: StudioSnapshot;
  /** Bumped whenever anything in the snapshot meaningfully changes. */
  revision: number;
}

export interface ProjectStore {
  /** The current document, or null before the first save. */
  project: Project | null;
  /** Saved project ids in storage. */
  savedIds: string[];
  /** Last completed or failed operation, for a notice line. */
  message: string | null;
  saveNow: () => Promise<void>;
  importFile: () => Promise<void>;
  exportFile: () => Promise<void>;
  dismissMessage: () => void;
}

/**
 * Debounced persistence wired to the web adapters.
 *
 * The autosave key is stable per document id; `snapshot.reciterId` is a
 * string in the UI and a number in the document, so the conversion happens
 * once here.
 */
export function useProjectStore({ snapshot, revision }: UseProjectStoreOptions): ProjectStore {
  const storage = useMemo<StoragePort>(() => new LocalStoragePort(), []);
  const filePort = useMemo<FilePort>(() => new BrowserFilePort(), []);
  const [project, setProject] = useState<Project | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  // One document id per session keeps autosave from littering storage with a
  // row per settings change.
  const documentId = useMemo(
    () => `studio-${snapshot.surah}-${snapshot.from}-${snapshot.to}`,
    [snapshot.surah, snapshot.from, snapshot.to],
  );

  const autosave = useMemo(
    () => createAutosave(storage, { keyPrefix: AUTOSAVE_PREFIX }),
    [storage],
  );

  const buildDocument = useCallback((): Project => {
    const s = snapshotRef.current;
    return projectFromSettings(documentId, 'Studio session', {
      reciterId: Number(s.reciterId) || 1,
      surah: s.surah,
      fromAyah: s.from,
      toAyah: s.to,
      format: s.aspect,
      backgroundPreset: s.bgId,
      rules: s.rules,
      annotations: s.annotations,
    });
  }, [documentId]);

  // Re-seed the document whenever the settings change; autosave debounces the
  // write.
  useEffect(() => {
    const doc = buildDocument();
    setProject(doc);
    autosave.save(doc);
    void listAutosaved(storage).then(setSavedIds);
  }, [buildDocument, autosave, storage, revision]);

  useEffect(() => () => autosave.dispose(), [autosave]);

  const saveNow = useCallback(async () => {
    const doc = buildDocument();
    setProject(doc);
    await autosave.flush();
    autosave.save(doc);
    await autosave.flush();
    setSavedIds(await listAutosaved(storage));
    setMessage('Project saved to this browser.');
  }, [autosave, buildDocument, storage]);

  const importFile = useCallback(async () => {
    const { project: loaded, status } = await importProjectFile(filePort);
    if (loaded) {
      setProject(loaded);
      setMessage(`Imported “${loaded.name}”.`);
      return;
    }
    if (!status.ok && status.reason === 'cancelled') return;
    if (!status.ok && status.reason === 'future-version') {
      setMessage(status.detail ?? 'This file needs a newer version of the app.');
      return;
    }
    setMessage(!status.ok ? (status.detail ?? 'That file could not be read as a project.') : null);
  }, [filePort]);

  const exportFile = useCallback(async () => {
    const doc = buildDocument();
    setProject(doc);
    const status = await exportProjectFile(filePort, doc);
    if (status.ok) setMessage('Project file saved.');
    else if (!status.ok && status.reason !== 'cancelled')
      setMessage('The file could not be saved.');
  }, [buildDocument, filePort]);

  const dismissMessage = useCallback(() => setMessage(null), []);

  return { project, savedIds, message, saveNow, importFile, exportFile, dismissMessage };
}

/** Load a specific autosaved project into the studio (ids from `savedIds`). */
export async function loadSavedProject(storage: StoragePort, id: string): Promise<Project | null> {
  const { project } = await loadAutosaved(storage, id);
  return project;
}
