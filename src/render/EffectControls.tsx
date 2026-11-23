/**
 * Effect controls for the inspector (plan section 3.5).
 *
 * The registry marks `glow`, `shadow`, `highlight` and `underline` as objects
 * with `nullable: true`. That means three states, not two: off (null), on with
 * the inherited value, and on with a value the user edited. A plain toggle
 * loses the middle state, so each control has an explicit switch plus fields
 * that only render when the effect is on.
 */

import type { GlowSpec, HighlightSpec, ShadowSpec, UnderlineSpec } from '@qvg/core';
import type { ReactNode } from 'react';
import { isHexColor, normalizeHex } from './colorValue';

interface EffectFrameProps {
  label: string;
  /** Whether the effect is present at all. */
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** Whether the effect comes from a parent scope rather than this one. */
  inherited?: boolean;
  children?: ReactNode;
}

function EffectFrame({ label, enabled, onToggle, inherited, children }: EffectFrameProps) {
  const inputId = `effect-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="property-control property-control--effect">
      <div className="effect-head">
        <label className="property-label" htmlFor={inputId}>
          {label}
        </label>
        {inherited ? <span className="effect-note">inherited</span> : null}
        <input
          id={inputId}
          type="checkbox"
          className="checkbox-input"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </div>
      {enabled && children ? <div className="effect-body">{children}</div> : null}
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  // `input type="color"` cannot show an invalid value and would silently
  // reset it, so fall back to black while the field is mid-edit.
  const safeValue = isHexColor(value) ? normalizeHex(value) : '#000000';
  return (
    <div className="effect-row">
      <label className="effect-row__label">{label}</label>
      <input
        type="color"
        className="color-input"
        value={safeValue}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="effect-row">
      <label className="effect-row__label">{label}</label>
      <input
        type="range"
        className="range-input"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      />
      <span className="measure effect-row__value">{value.toFixed(step < 1 ? 1 : 0)}</span>
    </div>
  );
}

/** Glow: a colour and a blur radius in canvas pixels. */
export function GlowControl({
  value,
  inherited,
  fallbackColor,
  onChange,
}: {
  value: GlowSpec | null;
  inherited?: boolean;
  /** Colour to seed the effect with when the user turns it on. */
  fallbackColor: string;
  onChange: (value: GlowSpec | null) => void;
}) {
  const enabled = value !== null;
  return (
    <EffectFrame
      label="Glow"
      enabled={enabled}
      inherited={inherited}
      onToggle={(on) => onChange(on ? { color: fallbackColor, radius: 12 } : null)}
    >
      {value ? (
        <>
          <ColorRow
            label="Colour"
            value={value.color}
            onChange={(color) => onChange({ ...value, color })}
          />
          <RangeRow
            label="Radius"
            value={value.radius}
            min={0}
            max={60}
            step={1}
            onChange={(radius) => onChange({ ...value, radius })}
          />
        </>
      ) : null}
    </EffectFrame>
  );
}

/** Shadow: a colour and a blur radius. */
export function ShadowControl({
  value,
  inherited,
  onChange,
}: {
  value: ShadowSpec | null;
  inherited?: boolean;
  onChange: (value: ShadowSpec | null) => void;
}) {
  const enabled = value !== null;
  return (
    <EffectFrame
      label="Shadow"
      enabled={enabled}
      inherited={inherited}
      onToggle={(on) => onChange(on ? { color: '#000000', blur: 8 } : null)}
    >
      {value ? (
        <>
          <ColorRow
            label="Colour"
            value={value.color}
            onChange={(color) => onChange({ ...value, color })}
          />
          <RangeRow
            label="Blur"
            value={value.blur}
            min={0}
            max={48}
            step={1}
            onChange={(blur) => onChange({ ...value, blur })}
          />
        </>
      ) : null}
    </EffectFrame>
  );
}

/** Highlight: a background fill and a radius. */
export function HighlightControl({
  value,
  inherited,
  onChange,
}: {
  value: HighlightSpec | null;
  inherited?: boolean;
  onChange: (value: HighlightSpec | null) => void;
}) {
  const enabled = value !== null;
  return (
    <EffectFrame
      label="Highlight"
      enabled={enabled}
      inherited={inherited}
      onToggle={(on) => onChange(on ? { fill: 'rgba(255, 255, 255, 0.18)', radius: 8 } : null)}
    >
      {value ? (
        <>
          <ColorRow
            label="Fill"
            value={value.fill}
            onChange={(fill) => onChange({ ...value, fill })}
          />
          <RangeRow
            label="Radius"
            value={value.radius}
            min={0}
            max={32}
            step={1}
            onChange={(radius) => onChange({ ...value, radius })}
          />
        </>
      ) : null}
    </EffectFrame>
  );
}

/** Underline: a colour and a thickness in canvas pixels. */
export function UnderlineControl({
  value,
  inherited,
  fallbackColor,
  onChange,
}: {
  value: UnderlineSpec | null;
  inherited?: boolean;
  fallbackColor: string;
  onChange: (value: UnderlineSpec | null) => void;
}) {
  const enabled = value !== null;
  return (
    <EffectFrame
      label="Underline"
      enabled={enabled}
      inherited={inherited}
      onToggle={(on) => onChange(on ? { color: fallbackColor, thickness: 2 } : null)}
    >
      {value ? (
        <>
          <ColorRow
            label="Colour"
            value={value.color}
            onChange={(color) => onChange({ ...value, color })}
          />
          <RangeRow
            label="Thickness"
            value={value.thickness}
            min={1}
            max={12}
            step={1}
            onChange={(thickness) => onChange({ ...value, thickness })}
          />
        </>
      ) : null}
    </EffectFrame>
  );
}
