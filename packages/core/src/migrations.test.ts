import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrateProject } from './migrations';
import { createProject } from './project';

describe('migrateProject', () => {
  it('accepts a current-version document unchanged', () => {
    const doc = JSON.parse(JSON.stringify(createProject('p1', 'Test')));
    const result = migrateProject(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.id).toBe('p1');
      expect(result.applied).toEqual([]);
    }
  });

  it('stamps an unversioned draft up to v1', () => {
    const doc = JSON.parse(JSON.stringify(createProject('p1', 'Test')));
    delete doc.schemaVersion;
    const result = migrateProject(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.applied).toEqual([1]);
    }
  });

  it('refuses a document from a newer schema with a clear message', () => {
    const doc = JSON.parse(JSON.stringify(createProject('p1', 'Test')));
    doc.schemaVersion = CURRENT_SCHEMA_VERSION + 1;
    const result = migrateProject(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues?.[0].message).toContain('Update the app');
    }
  });

  it('rejects garbage', () => {
    expect(migrateProject('x').ok).toBe(false);
    expect(migrateProject(null).ok).toBe(false);
    expect(migrateProject([1]).ok).toBe(false);
  });

  it('reports validation problems of the migrated document', () => {
    const doc = JSON.parse(JSON.stringify(createProject('p1', 'Test')));
    delete doc.schemaVersion;
    doc.source.surah = 999;
    const result = migrateProject(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues?.some((i) => i.path.includes('source.surah'))).toBe(true);
    }
  });
});

describe('migration fixtures', () => {
  it('migrates the committed unversioned fixture to v1', async () => {
    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(
      await readFile(
        new URL('../../../tests/fixtures/migrations/unversioned-to-v1.json', import.meta.url),
        'utf8',
      ),
    );
    expect(raw.schemaVersion).toBeUndefined();
    const result = migrateProject(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.schemaVersion).toBe(1);
      expect(result.project.id).toBe('fixture-0');
    }
  });
});
