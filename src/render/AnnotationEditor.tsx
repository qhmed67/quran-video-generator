/**
 * Annotation editor component (plan phase 4.4 / 3.3).
 *
 * Add, edit and delete annotations for the selected ayah or word. Text,
 * placement and a small style set live here; the renderer draws them
 * (`drawAnnotations`). Word-anchored annotations are accepted and stored but
 * the renderer does not draw them yet, which the UI says plainly.
 */

import { useState, useEffect, useRef } from 'react';
import type { Annotation, AnnotationAnchor, AnnotationPlacement, TextStyle } from '@qvg/core';
import { resolveTextStyle, DEFAULT_TEXT_STYLE } from '@qvg/core';
import { CloseIcon } from '../components/icons';

/** The anchor the editor targets. */
export interface AnnotationSelection {
  surah: number;
  ayah: number;
  /** Present when the anchor is one word. */
  word?: number;
}

interface AnnotationEditorProps {
  selection: AnnotationSelection | null;
  annotations: Annotation[];
  onAnnotationAdd: (annotation: Annotation) => void;
  onAnnotationUpdate: (id: string, annotation: Partial<Annotation>) => void;
  onAnnotationDelete: (id: string) => void;
  isOpen: boolean;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [placement, setPlacement] = useState<AnnotationPlacement>('below');
  const [lang, setLang] = useState<string>('en');
  const [style, setStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  // Monotonic id counter — event-handler side effect, not called during render.
  const idCounter = useRef(0);

  // Reset the form when the selection moves: a note belongs to one anchor.
  useEffect(() => {
    setEditingId(null);
    setText('');
    setPlacement('below');
    setLang('en');
    setStyle(DEFAULT_TEXT_STYLE);
  }, [selection?.surah, selection?.ayah, selection?.word]);

  useEffect(() => {
    if (isOpen && editingId === null && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [isOpen, editingId]);

  const resetForm = () => {
    setEditingId(null);
    setText('');
    setPlacement('below');
    setLang('en');
    setStyle(DEFAULT_TEXT_STYLE);
  };

  const handleAdd = () => {
    if (!selection || !text.trim()) return;
    const anchor: AnnotationAnchor =
      selection.word !== undefined
        ? {
            kind: 'word',
            ref: { surah: selection.surah, ayah: selection.ayah, word: selection.word },
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

  const handleUpdate = () => {
    if (!editingId || !text.trim()) return;
    onAnnotationUpdate(editingId, { text: text.trim(), placement, lang, style });
    resetForm();
  };

  const handleEdit = (annotation: Annotation) => {
    setEditingId(annotation.id);
    setText(annotation.text);
    setPlacement(annotation.placement);
    setLang(annotation.lang);
    setStyle(resolveTextStyle(annotation.style));
  };

  const handleDelete = (id: string) => {
    onAnnotationDelete(id);
    if (editingId === id) resetForm();
  };

  const handleStyleChange = (property: keyof TextStyle, value: string | number) => {
    setStyle((prev) => ({ ...prev, [property]: value }));
  };

  const selectionAnnotations = annotations.filter((ann) => {
    if (!selection) return false;
    if (selection.word !== undefined) {
      return (
        ann.anchor.kind === 'word' &&
        ann.anchor.ref.surah === selection.surah &&
        ann.anchor.ref.ayah === selection.ayah &&
        ann.anchor.ref.word === selection.word
      );
    }
    return (
      ann.anchor.kind === 'ayah' &&
      ann.anchor.surah === selection.surah &&
      ann.anchor.ayah === selection.ayah
    );
  });

  if (!selection) {
    return (
      <section className="annotation-editor annotation-editor--empty">
        <p className="inspector-empty">Select a word to attach a note to it.</p>
      </section>
    );
  }

  const anchorLabel =
    selection.word !== undefined
      ? `Word ${selection.word} · Ayah ${selection.ayah}`
      : `Ayah ${selection.ayah}`;

  return (
    <section className={`annotation-editor ${isOpen ? 'annotation-editor--open' : ''}`}>
      <button
        type="button"
        className="annotation-toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Hide annotation editor' : 'Show annotation editor'}
      >
        <span aria-hidden="true">{isOpen ? '×' : 'Note'}</span>
        {selectionAnnotations.length > 0 ? (
          <span className="annotation-count measure">{selectionAnnotations.length}</span>
        ) : null}
      </button>

      {isOpen && (
        <div className="editor-content">
          <div className="editor-header">
            <h3 className="inspector-title">Notes</h3>
            <span className="badge">{anchorLabel}</span>
          </div>

          {selectionAnnotations.length > 0 && (
            <ul className="annotation-list">
              {selectionAnnotations.map((ann) => (
                <li key={ann.id} className="annotation-item">
                  <div className="annotation-preview">
                    <span className="badge">{ann.placement}</span>
                    <p className="annotation-text">{ann.text}</p>
                  </div>
                  <div className="annotation-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleEdit(ann)}
                      aria-label="Edit annotation"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleDelete(ann.id)}
                      aria-label="Delete annotation"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="annotation-form">
            <div className="form-group">
              <label className="property-label" htmlFor="annotation-text">
                Text
              </label>
              <textarea
                id="annotation-text"
                ref={textAreaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="A note for this ayah…"
                rows={3}
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                lang={lang === 'ar' ? 'ar' : undefined}
              />
            </div>

            <div className="form-group">
              <label className="property-label" htmlFor="annotation-placement">
                Placement
              </label>
              <div className="group-tabs" role="group" aria-label="Placement">
                {(['above', 'below'] as AnnotationPlacement[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    id={option === 'above' ? 'annotation-placement' : undefined}
                    className={`group-tab ${placement === option ? 'active' : ''}`}
                    onClick={() => setPlacement(option)}
                    aria-pressed={placement === option}
                  >
                    {option === 'above' ? 'Above' : 'Below'}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="property-label" htmlFor="annotation-lang">
                Language
              </label>
              <select id="annotation-lang" value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </div>

            <div className="style-controls">
              <div className="form-group">
                <label className="property-label" htmlFor="annotation-size">
                  Size
                </label>
                <input
                  id="annotation-size"
                  type="number"
                  value={style.fontSize}
                  onChange={(e) =>
                    handleStyleChange('fontSize', Number.parseInt(e.target.value, 10))
                  }
                  min={8}
                  max={32}
                />
              </div>

              <div className="form-group">
                <label className="property-label" htmlFor="annotation-color">
                  Colour
                </label>
                <input
                  id="annotation-color"
                  type="color"
                  className="color-input"
                  value={style.color}
                  onChange={(e) => handleStyleChange('color', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="property-label" htmlFor="annotation-opacity">
                  Opacity
                </label>
                <input
                  id="annotation-opacity"
                  type="range"
                  className="range-input"
                  value={style.opacity}
                  onChange={(e) => handleStyleChange('opacity', Number.parseFloat(e.target.value))}
                  min={0}
                  max={1}
                  step={0.1}
                />
              </div>
            </div>

            <div className="form-actions">
              {editingId ? (
                <>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={handleUpdate}
                    disabled={!text.trim()}
                  >
                    Save changes
                  </button>
                  <button type="button" className="btn btn--secondary" onClick={resetForm}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleAdd}
                  disabled={!text.trim()}
                >
                  Add note
                </button>
              )}
            </div>

            {selection.word !== undefined && (
              <p className="property-unavailable">
                Word-anchored notes are stored but not drawn on the frame yet.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
