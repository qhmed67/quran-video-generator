import { describe, expect, it } from 'vitest';
import { createProject, updateProject } from './project';
import type { StyleTarget } from './style';

describe('Project document', () => {
  it('creates a project with defaults', () => {
    const project = createProject('test-id', 'Test Project');
    expect(project.id).toBe('test-id');
    expect(project.name).toBe('Test Project');
    expect(project.schemaVersion).toBe(1);
    expect(project.createdAt).toBe(project.updatedAt);
    expect(project.source.reciterId).toBe(1);
    expect(project.source.surah).toBe(1);
    expect(project.source.fromAyah).toBe(1);
    expect(project.source.toAyah).toBe(7);
    expect(project.format).toBe('9:16');
    expect(project.background.preset).toBe('forest');
    expect(project.rules).toEqual([]);
    expect(project.annotations).toEqual([]);
  });

  it('creates a project with overrides', () => {
    const overrides = {
      source: {
        reciterId: 2,
        surah: 2,
        fromAyah: 5,
        toAyah: 10,
      },
      format: '1:1' as '1:1',
      background: {
        preset: 'dusk',
        opacity: 0.8,
      },
      rules: [
        {
          id: 'test-rule',
          target: { kind: 'global' } as StyleTarget,
          props: { color: '#ff0000' },
        },
      ],
    };
    const project = createProject('test-id', 'Test Project', overrides);
    expect(project.source.reciterId).toBe(2);
    expect(project.source.surah).toBe(2);
    expect(project.source.fromAyah).toBe(5);
    expect(project.source.toAyah).toBe(10);
    expect(project.format).toBe('1:1');
    expect(project.background.preset).toBe('dusk');
    expect(project.background.opacity).toBe(0.8);
    expect(project.rules).toHaveLength(1);
    expect(project.rules[0].id).toBe('test-rule');
  });

  it('merges overrides deeply', () => {
    const overrides = {
      source: {
        reciterId: 3,
        surah: 1,
        fromAyah: 1,
        toAyah: 3,
      },
      background: {
        preset: 'ocean',
        customImage: 'data:image/png;base64,...',
      },
    };
    const project = createProject('test-id', 'Test Project', overrides);
    expect(project.source.reciterId).toBe(3);
    expect(project.source.surah).toBe(1); // default preserved
    expect(project.background.preset).toBe('ocean');
    expect(project.background.customImage).toBe('data:image/png;base64,...');
    expect(project.background.opacity).toBeUndefined(); // default not present
  });

  it('updates project metadata and content', () => {
    const original = createProject('test-id', 'Original Name');
    // Wait 1ms to ensure different timestamps
    const start = Date.now();
    while (Date.now() - start < 1) {
      // Busy wait for 1ms
    }
    const originalUpdatedAt = original.updatedAt;
    const updated = updateProject(original, {
      name: 'Updated Name',
      background: {
        preset: 'dusk',
      },
      annotations: [
        {
          id: 'ann1',
          anchor: { kind: 'ayah', surah: 1, ayah: 1 },
          placement: 'below',
          text: 'Test annotation',
          lang: 'en',
          style: {},
        },
      ],
    });
    expect(updated.name).toBe('Updated Name');
    expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime(),
    );
    expect(updated.background.preset).toBe('dusk');
    expect(updated.annotations).toHaveLength(1);
    expect(updated.annotations[0].id).toBe('ann1');
    // Unchanged fields preserved
    expect(updated.id).toBe('test-id');
    expect(updated.schemaVersion).toBe(1);
    expect(updated.createdAt).toBe(original.createdAt);
  });

  it('preserves original when updating with empty object', () => {
    const original = createProject('test-id', 'Test');
    // Wait 1ms to ensure different timestamps
    const start = Date.now();
    while (Date.now() - start < 1) {
      // Busy wait for 1ms
    }
    const originalUpdatedAt = original.updatedAt;
    const updated = updateProject(original, {});
    // Check all fields except updatedAt
    const { updatedAt: _, ...originalWithoutUpdatedAt } = original;
    const { updatedAt: __, ...updatedWithoutUpdatedAt } = updated;
    expect(updatedWithoutUpdatedAt).toEqual(originalWithoutUpdatedAt);
    expect(updated.updatedAt).not.toBe(originalUpdatedAt);
  });
});
