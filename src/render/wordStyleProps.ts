/**
 * Word style properties registry (plan section 3.5).
 *
 * This registry provides a centralized way to define and access word style properties.
 * Adding a new word style property requires changes in only:
 * (1) the WordStyle type + default, (2) one paint function in render/paint/,
 * (3) one control in ui/inspector/ registered in this controls table.
 */

import type { WordStyle } from '@qvg/core';
import { DEFAULT_WORD_STYLE } from '@qvg/core';

export interface PropDescriptor {
  /** Display name for the property */
  displayName: string;
  /** Description of what the property does */
  description: string;
  /** Type of the property value */
  type: 'color' | 'number' | 'boolean' | 'object' | 'select';
  /** Minimum value for numeric properties */
  min?: number;
  /** Maximum value for numeric properties */
  max?: number;
  /** Step value for numeric properties */
  step?: number;
  /** Default value for the property */
  defaultValue: any;
  /** Options for select properties */
  options?: { label: string; value: any }[];
  /** Whether the property can be null */
  nullable?: boolean;
  /** Custom control component name (for complex controls) */
  control?: string;
  /** Group for organizing properties in the UI */
  group?: 'text' | 'effects' | 'animation';
}

export const wordStyleProps: Record<keyof WordStyle, PropDescriptor> = {
  color: {
    displayName: 'Color',
    description: 'Text color',
    type: 'color',
    defaultValue: DEFAULT_WORD_STYLE.color,
    group: 'text',
  },
  opacity: {
    displayName: 'Opacity',
    description: 'Text opacity (0-1)',
    type: 'number',
    min: 0,
    max: 1,
    step: 0.1,
    defaultValue: DEFAULT_WORD_STYLE.opacity,
    group: 'text',
  },
  fontScale: {
    displayName: 'Font Scale',
    description: 'Font size scaling factor',
    type: 'number',
    min: 0.5,
    max: 2,
    step: 0.1,
    defaultValue: DEFAULT_WORD_STYLE.fontScale,
    group: 'text',
  },
  glow: {
    displayName: 'Glow',
    description: 'Text glow effect',
    type: 'object',
    defaultValue: DEFAULT_WORD_STYLE.glow,
    nullable: true,
    control: 'GlowControl',
    group: 'effects',
  },
  shadow: {
    displayName: 'Shadow',
    description: 'Text shadow effect',
    type: 'object',
    defaultValue: DEFAULT_WORD_STYLE.shadow,
    nullable: true,
    control: 'ShadowControl',
    group: 'effects',
  },
  highlight: {
    displayName: 'Highlight',
    description: 'Text background highlight',
    type: 'object',
    defaultValue: DEFAULT_WORD_STYLE.highlight,
    nullable: true,
    control: 'HighlightControl',
    group: 'effects',
  },
  underline: {
    displayName: 'Underline',
    description: 'Text underline',
    type: 'object',
    defaultValue: DEFAULT_WORD_STYLE.underline,
    nullable: true,
    control: 'UnderlineControl',
    group: 'effects',
  },
  entrance: {
    displayName: 'Entrance Animation',
    description: 'Text entrance animation',
    type: 'object',
    defaultValue: DEFAULT_WORD_STYLE.entrance,
    nullable: true,
    control: 'AnimationControl',
    group: 'animation',
  },
};

// Helper functions for working with the registry

/**
 * Get all properties grouped by category
 */
export function getPropsByGroup(): Record<string, PropDescriptor[]> {
  const groups: Record<string, PropDescriptor[]> = {
    text: [],
    effects: [],
    animation: [],
  };

  Object.values(wordStyleProps).forEach((prop) => {
    const group = prop.group || 'text';
    if (groups[group]) {
      groups[group].push(prop);
    }
  });

  return groups;
}

/**
 * Get properties for a specific group
 */
export function getPropsForGroup(group: string): PropDescriptor[] {
  return getPropsByGroup()[group] || [];
}

/**
 * Create a default WordStyle from the registry
 */
export function createDefaultStyle(): WordStyle {
  const style: WordStyle = {
    color: wordStyleProps.color.defaultValue,
    opacity: wordStyleProps.opacity.defaultValue,
    fontScale: wordStyleProps.fontScale.defaultValue,
    glow: wordStyleProps.glow.defaultValue,
    shadow: wordStyleProps.shadow.defaultValue,
    highlight: wordStyleProps.highlight.defaultValue,
    underline: wordStyleProps.underline.defaultValue,
    entrance: wordStyleProps.entrance.defaultValue,
  };
  
  return style;
}

/**
 * Check if a style has any non-default values
 */
export function hasNonDefaultValues(style: WordStyle): boolean {
  return Object.keys(style).some((key) => {
    const prop = wordStyleProps[key as keyof WordStyle];
    return style[key as keyof WordStyle] !== prop.defaultValue;
  });
}

/**
 * Get the inheritance path for a style value
 */
export function getInheritancePath(
  style: WordStyle,
  currentLevel: string
): string[] {
  // This would be implemented based on the style resolution logic
  // For now, return a simple path
  const path: string[] = [];
  
  if (hasNonDefaultValues(style)) {
    path.push(currentLevel);
  }
  
  return path;
}