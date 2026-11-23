import { describe, expect, it, vi } from 'vitest';
import type { FilePort, Project, StoragePort } from '@qvg/core';
import { createProject } from '@qvg/core';
import {
  AUTOSAVE_PREFIX,
  createAutosave,
  deleteAutosave,
  deserializeProject,
  exportProjectFile,
  importProjectFile,
  listAutosaved,
  loadAutosaved,
  projectFileName,
  projectFromSettings,
  serializeProject,
  touchProject,
} from './projectStore';

/** StoragePort over a Map, matching the contract the web adapter implements. */
function memoryStorage(
  seed: Record<string, string> = {},
): StoragePort & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async setItem(k, v) {
      map.set(k, v);
    },
    async getItem(k) {
      return map.get(k) ?? null;
    },
    async removeItem(k) {
      map.delete(k);
    },
    async hasItem(k) {
      return map.has(k);
    },
    async keys(prefix) {
      return [...map.keys()].filter((k) => (prefix ? k.startsWith(prefix) : true));
    },
  };
}

const project = (): Project =>
  projectFromSettings('p1', 'Yasin', {
    reciterId: 6,
    surah: 36,
    fromAyah: 1,
    toAyah: 5,
    format: '9:16',
    backgroundPreset: 'forest',
    rules: [],
    annotations: [],
  });

const filePort = (picked: File | null = null): FilePort & { saved: File[] } => {
  const saved: File[] = [];
  return {
    saved,
    async pickFile() {
      return picked;
    },
    async saveFile(file) {
      saved.push(file);
    },
  };
};

describe('serialize / deserialize', () => {
  it('round-trips a project through its file text', () => {
    const text = serializeProject(project());
    const { result, status } = deserializeProject(text);
    expect(status).toEqual({ ok: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project.name).toBe('Yasin');
  });

  it('rejects truncated JSON with a readable status', () => {
    const { result, status } = deserializeProject('{"schemaVersion":');
    expect(result.ok).toBe(false);
    expect(status).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('marks a future schema clearly', () => {
    const doc = JSON.parse(serializeProject(project()));
    doc.schemaVersion = 99;
    const { status } = deserializeProject(JSON.stringify(doc));
    expect(status).toMatchObject({ ok: false, reason: 'future-version' });
  });
});

describe('autosave', () => {
  it('debounces writes: many saves, one flush of the last', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const autosave = createAutosave(storage, { debounceMs: 500 });
    autosave.save({ ...project(), name: 'one' });
    autosave.save({ ...project(), name: 'two' });
    autosave.save({ ...project(), name: 'three' });
    expect(storage.map.size).toBe(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(storage.map.size).toBe(1);
    const stored = JSON.parse(storage.map.get(`${AUTOSAVE_PREFIX}p1`) ?? '{}');
    expect(stored.name).toBe('three');
    vi.useRealTimers();
  });

  it('flush() writes immediately and clears the timer', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const autosave = createAutosave(storage);
    autosave.save(project());
    await autosave.flush();
    expect(storage.map.size).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(storage.map.size).toBe(1);
    vi.useRealTimers();
  });

  it('dispose drops the pending write', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const autosave = createAutosave(storage);
    autosave.save(project());
    autosave.dispose();
    await vi.advanceTimersByTimeAsync(2000);
    expect(storage.map.size).toBe(0);
    vi.useRealTimers();
  });
});

describe('loadAutosaved / listAutosaved / deleteAutosave', () => {
  it('loads what was saved', async () => {
    const storage = memoryStorage();
    await storage.setItem(`${AUTOSAVE_PREFIX}p1`, serializeProject(project()));
    const { project: loaded, status } = await loadAutosaved(storage, 'p1');
    expect(status).toEqual({ ok: true });
    expect(loaded?.id).toBe('p1');
  });

  it('reports not-found for an unknown id', async () => {
    const { project: loaded, status } = await loadAutosaved(memoryStorage(), 'nope');
    expect(loaded).toBeNull();
    expect(status).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('lists and deletes by id', async () => {
    const storage = memoryStorage();
    await storage.setItem(`${AUTOSAVE_PREFIX}a`, serializeProject(project()));
    await storage.setItem(`${AUTOSAVE_PREFIX}b`, serializeProject(project()));
    await storage.setItem('other:key', 'x');
    expect(await listAutosaved(storage)).toEqual(['a', 'b']);
    await deleteAutosave(storage, 'a');
    expect(await listAutosaved(storage)).toEqual(['b']);
  });

  it('reports a corrupt autosave instead of throwing', async () => {
    const storage = memoryStorage({ [`${AUTOSAVE_PREFIX}p1`]: '{broken' });
    const { project: loaded, status } = await loadAutosaved(storage, 'p1');
    expect(loaded).toBeNull();
    expect(status).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('file import / export', () => {
  it('exports a file with the project name and JSON body', async () => {
    const port = filePort();
    const status = await exportProjectFile(port, project());
    expect(status).toEqual({ ok: true });
    expect(port.saved).toHaveLength(1);
    expect(port.saved[0].name).toBe('Yasin.qvg.json');
    const text = await port.saved[0].text();
    expect(JSON.parse(text).id).toBe('p1');
  });

  it('imports a saved file back', async () => {
    const json = serializeProject(project());
    const file = new File([json], 'Yasin.qvg.json', { type: 'application/json' });
    const { project: loaded, status } = await importProjectFile(filePort(file));
    expect(status).toEqual({ ok: true });
    expect(loaded?.id).toBe('p1');
  });

  it('reports cancelled when the picker is dismissed', async () => {
    const { project: loaded, status } = await importProjectFile(filePort(null));
    expect(loaded).toBeNull();
    expect(status).toMatchObject({ ok: false, reason: 'cancelled' });
  });

  it('reports invalid content from a chosen file', async () => {
    const file = new File(['not json'], 'broken.qvg.json', { type: 'application/json' });
    const { status } = await importProjectFile(filePort(file));
    expect(status).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('helpers', () => {
  it('projectFileName strips characters that upset file systems', () => {
    const p = createProject('x', 'Yasin: <reel> #1?');
    // The stripper keeps letters, digits, spaces, hyphens and underscores;
    // "Yasin: <reel> #1?" collapses to word groups with single spaces.
    expect(projectFileName(p)).toBe('Yasin reel 1.qvg.json');
  });

  it('touchProject updates only the timestamp', () => {
    const before = project();
    const after = touchProject(before);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
    expect(after.id).toBe(before.id);
    expect(after.rules).toEqual(before.rules);
  });
});
