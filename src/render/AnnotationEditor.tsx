/**
 * Annotation editor component (plan phase 4.4).
 *
 * Allows users to add, edit, and delete annotations per ayah or word.
 */

import { useState, useEffect, useRef } from 'react';
import type { Annotation, AnnotationAnchor, AnnotationPlacement, TextStyle } from '@qvg/core';
import { resolveTextStyle, DEFAULT_TEXT_STYLE } from '@qvg/core';

interface AnnotationEditorProps {
  /** Currently selected word or ayah for annotation */
  selection: {
    type: 'word' | 'ayah';
    surah: number;
    ayah: number;
    word?: number; // Only for word type
  } | null;
  /** Existing annotations for the current selection */
  annotations: Annotation[];
  /** Callback when annotation is added */
  onAnnotationAdd: (annotation: Annotation) => void;
  /** Callback when annotation is updated */
  onAnnotationUpdate: (id: string, annotation: Partial<Annotation>) => void;
  /** Callback when annotation is deleted */
  onAnnotationDelete: (id: string) => void;
  /** Whether the editor is open */
  isOpen: boolean;
  /** Callback to toggle editor */
  onToggle: () => void;
}

export function AnnotationEditor({
  selection,
  annotations,
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  isOpen,
  onToggle,
}: AnnotationEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Partial<Annotation>>({});
  const [text, setText] = useState('');
  const [placement, setPlacement] = useState<AnnotationPlacement>('below');
  const [lang, setLang] = useState<'ar' | 'en' | string>('en');
  const [style, setStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  // Monotonic id counter — event-handler side effect, not called during render.
  const idCounter = useRef(0);

  // Reset state when selection changes
  useEffect(() => {
    if (selection) {
      setIsEditing(false);
      setCurrentAnnotation({});
      setText('');
      setPlacement('below');
      setLang('en');
      setStyle(DEFAULT_TEXT_STYLE);
    }
  }, [selection]);

  // Focus text area when editing starts
  useEffect(() => {
    if (isEditing && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [isEditing]);

  // Handle adding a new annotation
  const handleAdd = () => {
    if (!selection || !text.trim()) return;

    const anchor: AnnotationAnchor =
      selection.type === 'word'
        ? {
            kind: 'word',
            ref: { surah: selection.surah, ayah: selection.ayah, word: selection.word! },
          }
        : { kind: 'ayah', surah: selection.surah, ayah: selection.ayah };

    const newAnnotation: Annotation = {
      id: `annotation-${++idCounter.current}`,
      anchor,
      placement,
      text: text.trim(),
      lang,
      style,
    };

    onAnnotationAdd(newAnnotation);
    resetForm();
  };

  // Handle updating an existing annotation
  const handleUpdate = () => {
    if (!currentAnnotation.id || !text.trim()) return;

    const updates: Partial<Annotation> = {
      text: text.trim(),
      placement,
      lang,
      style,
    };

    onAnnotationUpdate(currentAnnotation.id, updates);
    resetForm();
  };

  // Handle editing an existing annotation
  const handleEdit = (annotation: Annotation) => {
    setIsEditing(true);
    setCurrentAnnotation(annotation);
    setText(annotation.text);
    setPlacement(annotation.placement);
    setLang(annotation.lang);
    setStyle(resolveTextStyle(annotation.style));
  };

  // Handle deleting an annotation
  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this annotation?')) {
      onAnnotationDelete(id);
    }
  };

  // Reset the form
  const resetForm = () => {
    setIsEditing(false);
    setCurrentAnnotation({});
    setText('');
    setPlacement('below');
    setLang('en');
    setStyle(DEFAULT_TEXT_STYLE);
  };

  // Handle style property changes
  const handleStyleChange = (property: keyof TextStyle, value: any) => {
    setStyle((prev) => ({ ...prev, [property]: value }));
  };

  // Get selection display text
  const getSelectionText = () => {
    if (!selection) return '';
    return selection.type === 'word'
      ? `Word ${selection.word} in Surah ${selection.surah}:${selection.ayah}`
      : `Ayah ${selection.ayah} in Surah ${selection.surah}`;
  };

  // Get existing annotations for the current selection
  const selectionAnnotations = annotations.filter((ann) => {
    if (!selection) return false;

    if (selection.type === 'word') {
      return (
        ann.anchor.kind === 'word' &&
        ann.anchor.ref.surah === selection.surah &&
        ann.anchor.ref.ayah === selection.ayah &&
        ann.anchor.ref.word === selection.word
      );
    } else {
      return (
        ann.anchor.kind === 'ayah' &&
        ann.anchor.surah === selection.surah &&
        ann.anchor.ayah === selection.ayah
      );
    }
  });

  if (!selection) {
    return (
      <div className="annotation-editor">
        <p>Select a word or ayah to add an annotation</p>
      </div>
    );
  }

  return (
    <div className={`annotation-editor ${isOpen ? 'open' : 'closed'}`}>
      {/* Editor toggle button */}
      <button
        className="annotation-toggle"
        onClick={onToggle}
        aria-label="Toggle annotation editor"
      >
        <span className="icon">📝</span>
        <span className="count">{selectionAnnotations.length}</span>
      </button>

      {/* Editor content */}
      <div className="editor-content">
        <div className="editor-header">
          <h3>Annotation Editor</h3>
          <div className="selection-info">{getSelectionText()}</div>
        </div>

        {/* Annotation list */}
        {selectionAnnotations.length > 0 && (
          <div className="annotation-list">
            <h4>Existing Annotations</h4>
            {selectionAnnotations.map((ann) => (
              <div key={ann.id} className="annotation-item">
                <div className="annotation-preview">
                  <span className="placement-badge">{ann.placement}</span>
                  <span className="lang-badge">{ann.lang}</span>
                  <p>{ann.text}</p>
                </div>
                <div className="annotation-actions">
                  <button
                    className="edit-button"
                    onClick={() => handleEdit(ann)}
                    title="Edit annotation"
                  >
                    ✏️
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => handleDelete(ann.id)}
                    title="Delete annotation"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit form */}
        <div className="annotation-form">
          <h4>{isEditing ? 'Edit Annotation' : 'Add New Annotation'}</h4>

          <div className="form-group">
            <label>Text</label>
            <textarea
              ref={textAreaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter annotation text..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Placement</label>
            <div className="placement-options">
              {(['above', 'below', 'inline-after'] as AnnotationPlacement[]).map((option) => (
                <button
                  key={option}
                  className={`placement-option ${placement === option ? 'active' : ''}`}
                  onClick={() => setPlacement(option)}
                >
                  {option === 'above' && 'Above'}
                  {option === 'below' && 'Below'}
                  {option === 'inline-after' && 'Inline After'}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Language</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="style-group">
            <h5>Style</h5>
            <div className="style-controls">
              <div className="style-control">
                <label>Font Size</label>
                <input
                  type="number"
                  value={style.fontSize}
                  onChange={(e) => handleStyleChange('fontSize', parseInt(e.target.value))}
                  min={8}
                  max={32}
                />
              </div>

              <div className="style-control">
                <label>Color</label>
                <input
                  type="color"
                  value={style.color}
                  onChange={(e) => handleStyleChange('color', e.target.value)}
                />
              </div>

              <div className="style-control">
                <label>Opacity</label>
                <input
                  type="number"
                  value={style.opacity}
                  onChange={(e) => handleStyleChange('opacity', parseFloat(e.target.value))}
                  min={0}
                  max={1}
                  step={0.1}
                />
              </div>

              <div className="style-control">
                <label>Align</label>
                <select
                  value={style.align}
                  onChange={(e) => handleStyleChange('align', e.target.value)}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-actions">
            {isEditing ? (
              <>
                <button className="save-button" onClick={handleUpdate} disabled={!text.trim()}>
                  Save Changes
                </button>
                <button className="cancel-button" onClick={resetForm}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="add-button" onClick={handleAdd} disabled={!text.trim()}>
                Add Annotation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
