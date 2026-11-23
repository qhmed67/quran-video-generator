import { describe, expect, it } from 'vitest';
import { createProject } from './project';
import { parseProject } from './validate';

const valid = () => {
  const project = createProject('p1', 'Test project');
  return JSON.parse(JSON.stringify(project));
};

describe('parseProject', () => {
  it('accepts a well-formed project', () => {
    const result = parseProject(valid());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project.id).toBe('p1');
  });

  it('rejects a non-object', () => {
    const result = parseProject('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it('reports the path of a bad field', () => {
    const doc = valid();
    doc.source.surah = 999;
    const result = parseProject(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.includes('source.surah'))).toBe(true);
    }
  });

  it('collects multiple issues, not just the first', () => {
    const doc = valid();
    doc.source.surah = 999;
    doc.format = '4:3';
    const result = parseProject(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects an unknown property in a rule (typo guard)', () => {
    const doc = valid();
    doc.rules = [{ id: 'r', target: { kind: 'global' }, props: { colour: '#fff' } }];
    const result = parseProject(doc);
    expect(result.ok).toBe(false);
  });

  it('rejects an out-of-range opacity', () => {
    const doc = valid();
    doc.rules = [{ id: 'r', target: { kind: 'global' }, props: { opacity: 5 } }];
    const result = parseProject(doc);
    expect(result.ok).toBe(false);
  });

  it('rejects a rule targeting a non-existent surah', () => {
    const doc = valid();
    doc.rules = [
      { id: 'r', target: { kind: 'word', ref: { surah: 0, ayah: 1, word: 1 } }, props: {} },
    ];
    const result = parseProject(doc);
    expect(result.ok).toBe(false);
  });

  it('accepts a rule with an explicit null glow (off is a value)', () => {
    const doc = valid();
    doc.rules = [{ id: 'r', target: { kind: 'global' }, props: { glow: null } }];
    const result = parseProject(doc);
    expect(result.ok).toBe(true);
  });

  it('rejects an annotation with an empty text of wrong type', () => {
    const doc = valid();
    doc.annotations = [
      {
        id: 'a',
        anchor: { kind: 'ayah', surah: 1, ayah: 1 },
        placement: 'below',
        text: 42,
        lang: 'en',
        style: {},
      },
    ];
    const result = parseProject(doc);
    expect(result.ok).toBe(false);
  });

  it('rejects a bad timestamp format', () => {
    const doc = valid();
    doc.createdAt = 'yesterday';
    const result = parseProject(doc);
    expect(result.ok).toBe(false);
  });

  it('round-trips through JSON.stringify', () => {
    const doc = valid();
    doc.rules = [{ id: 'r', target: { kind: 'global' }, props: { fontScale: 1.2 } }];
    const result = parseProject(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
  });
});
