import { describe, expect, it } from 'vitest';
import { AnnotationEditor } from './AnnotationEditor';

describe('AnnotationEditor', () => {
  it('exports a React component', () => {
    expect(typeof AnnotationEditor).toBe('function');
    expect(AnnotationEditor.name).toBe('AnnotationEditor');
  });
});
