/**
 * Inspector UI component (plan phase 4.3).
 *
 * Built from the wordStyleProps registry, with inheritance display and reset
 * functionality. A side panel on desktop, a bottom sheet on mobile.
 *
 * The inspector edits a whole `WordStyle`; translating that into a `StyleRule`
 * for the current selection is `styleRules.ts`'s job, not the inspector's.
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { GlowSpec, HighlightSpec, ShadowSpec, UnderlineSpec, WordStyle } from '@qvg/core';
import { getPropsByGroup, createDefaultStyle, wordStyleProps } from './wordStyleProps';
import type { PropDescriptor } from './wordStyleProps';
import type { SelectionState } from './usePreviewPointer';
import { GlowControl, HighlightControl, ShadowControl, UnderlineControl } from './EffectControls';

type StyleValue = WordStyle[keyof WordStyle];

interface InspectorProps {
  /** Currently selected word or range. */
  selection: SelectionState;
  /** Scope the edit will be written to. */
  scopeLabel: string;
  /** Effective style for the selection, this scope's own rule included. */
  currentStyle: WordStyle;
  /** Style the selection would inherit if its own rule were removed. */
  inheritedStyle: WordStyle;
  /** Whether the selection has its own rule. */
  hasOwnRule: boolean;
  /** Callback when a single property changes. */
  onPropertyChange: <K extends keyof WordStyle>(key: K, value: WordStyle[K]) => void;
  /** Callback when reset is clicked. */
  onReset: () => void;
  /** Whether the inspector is open. */
  isOpen: boolean;
  /** Callback to toggle inspector. */
  onToggle: () => void;
}

export function Inspector({
  selection,
  scopeLabel,
  currentStyle,
  inheritedStyle,
  hasOwnRule,
  onPropertyChange,
  onReset,
  isOpen,
  onToggle,
}: InspectorProps) {
  const [activeGroup, setActiveGroup] = useState<string>('text');

  const groups = getPropsByGroup();
  const groupNames = Object.keys(groups);
  const activeProps = groups[activeGroup] || [];

  const inheritanceInfo = !selection.current
    ? 'No word selected'
    : hasOwnRule
      ? `Set on this ${scopeLabel}`
      : `Inherited ${scopeLabel === 'word' ? 'from ayah and global' : 'from global'}`;

  const handlePropertyChange = <K extends keyof WordStyle>(key: K, value: WordStyle[K]) => {
    onPropertyChange(key, value);
  };

  return (
    <aside className={`inspector ${isOpen ? 'inspector--open' : 'inspector--closed'}`}>
      {/* Toggle is only reachable on narrow layouts; the CSS hides it above 720px. */}
      <button
        className="inspector-toggle"
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Hide style inspector' : 'Show style inspector'}
      >
        <span aria-hidden="true">{isOpen ? '×' : 'Aa'}</span>
      </button>

      <div className="inspector-content">
        <div className="inspector-header">
          <h2 className="inspector-title">Word style</h2>
          <span className="badge">{scopeLabel}</span>
        </div>

        <div className="inheritance-info">
          <span className="inheritance-text">{inheritanceInfo}</span>
          <button
            className="reset-button"
            type="button"
            onClick={onReset}
            disabled={!hasOwnRule}
            title={
              hasOwnRule
                ? 'Remove this scope’s rule and inherit again'
                : 'Nothing to reset at this scope'
            }
          >
            ↺ Reset
          </button>
        </div>

        {!selection.current ? (
          <p className="inspector-empty">
            Select a word on the frame — or use the arrow keys — to style it.
          </p>
        ) : (
          <div className="property-groups">
            <div className="group-tabs" role="tablist" aria-label="Style property groups">
              {groupNames.map((group) => (
                <button
                  key={group}
                  type="button"
                  role="tab"
                  aria-selected={activeGroup === group}
                  className={`group-tab ${activeGroup === group ? 'active' : ''}`}
                  onClick={() => setActiveGroup(group)}
                >
                  {group.charAt(0).toUpperCase() + group.slice(1)}
                </button>
              ))}
            </div>

            <div className="property-controls">
              {activeProps.map((prop) => (
                <PropertyControl
                  key={prop.key}
                  prop={prop}
                  value={currentStyle[prop.key]}
                  inheritValue={inheritedStyle[prop.key]}
                  hasOwnRule={hasOwnRule}
                  textColor={currentStyle.color}
                  onChange={(value) => handlePropertyChange(prop.key, value)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

interface PropertyControlProps {
  prop: PropDescriptor;
  value: StyleValue;
  inheritValue: StyleValue;
  hasOwnRule: boolean;
  textColor: string;
  onChange: (value: StyleValue) => void;
}

function PropertyControl({
  prop,
  value,
  inheritValue,
  hasOwnRule,
  textColor,
  onChange,
}: PropertyControlProps) {
  // Unset means "inherit": show the inherited value in the field, but mark the
  // row so the user can tell a real local value from a fallback.
  const inherited = !hasOwnRule || value === inheritValue;
  const controlId = `prop-${prop.key}`;

  const label = (
    <label className="property-label" htmlFor={controlId}>
      {prop.displayName}
      {inherited ? <span className="property-from">inherited</span> : null}
    </label>
  );

  switch (prop.key) {
    case 'color': {
      const color = typeof value === 'string' ? value : '#ffffff';
      return (
        <div className="property-control">
          {label}
          <input
            id={controlId}
            type="color"
            className="color-input"
            value={color}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    }

    case 'opacity':
    case 'fontScale': {
      const numeric = typeof value === 'number' ? value : Number(prop.defaultValue);
      return (
        <div className="property-control">
          {label}
          <div className="effect-row">
            <input
              id={controlId}
              type="range"
              className="range-input"
              min={prop.min}
              max={prop.max}
              step={prop.step}
              value={numeric}
              onChange={(e) => onChange(Number.parseFloat(e.target.value))}
            />
            <span className="measure effect-row__value">{numeric.toFixed(2)}</span>
          </div>
        </div>
      );
    }

    case 'glow':
      return (
        <GlowControl
          value={value as GlowSpec | null}
          inherited={inherited}
          fallbackColor={textColor}
          onChange={onChange}
        />
      );

    case 'shadow':
      return (
        <ShadowControl
          value={value as ShadowSpec | null}
          inherited={inherited}
          onChange={onChange}
        />
      );

    case 'highlight':
      return (
        <HighlightControl
          value={value as HighlightSpec | null}
          inherited={inherited}
          onChange={onChange}
        />
      );

    case 'underline':
      return (
        <UnderlineControl
          value={value as UnderlineSpec | null}
          inherited={inherited}
          fallbackColor={textColor}
          onChange={onChange}
        />
      );

    case 'entrance':
      // Not implemented by the renderer yet; showing a dead control would lie.
      return (
        <div className="property-control">
          <span className="property-label">{prop.displayName}</span>
          <p className="property-unavailable">
            Entrance animation is not available yet. The renderer paints static words.
          </p>
        </div>
      );

    default:
      return null;
  }
}

/** Reset control factory kept for callers that need a default style object. */
export function defaultWordStyle(): WordStyle {
  return createDefaultStyle();
}

/** Inline style helper for the inspector's swatch rows. */
export function swatchStyle(color: string): CSSProperties {
  return { background: color };
}

export { wordStyleProps };
