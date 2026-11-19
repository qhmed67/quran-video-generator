import { describe, expect, it } from 'vitest';
import { wordStyleProps, getPropsByGroup, getPropsForGroup, createDefaultStyle, hasNonDefaultValues } from './wordStyleProps';
import { DEFAULT_WORD_STYLE } from '@qvg/core';

describe('wordStyleProps registry', () => {
  it('contains all WordStyle properties', () => {
    const expectedProps = [
      'color',
      'opacity',
      'fontScale',
      'glow',
      'shadow',
      'highlight',
      'underline',
      'entrance',
    ];
    
    expect(Object.keys(wordStyleProps)).toEqual(expectedProps);
  });
  
  it('has correct property descriptors', () => {
    // Test color property
    expect(wordStyleProps.color).toEqual({
      displayName: 'Color',
      description: 'Text color',
      type: 'color',
      defaultValue: DEFAULT_WORD_STYLE.color,
      group: 'text',
    });
    
    // Test opacity property
    expect(wordStyleProps.opacity).toEqual({
      displayName: 'Opacity',
      description: 'Text opacity (0-1)',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: DEFAULT_WORD_STYLE.opacity,
      group: 'text',
    });
    
    // Test fontScale property
    expect(wordStyleProps.fontScale).toEqual({
      displayName: 'Font Scale',
      description: 'Font size scaling factor',
      type: 'number',
      min: 0.5,
      max: 2,
      step: 0.1,
      defaultValue: DEFAULT_WORD_STYLE.fontScale,
      group: 'text',
    });
    
    // Test glow property
    expect(wordStyleProps.glow).toEqual({
      displayName: 'Glow',
      description: 'Text glow effect',
      type: 'object',
      defaultValue: DEFAULT_WORD_STYLE.glow,
      nullable: true,
      control: 'GlowControl',
      group: 'effects',
    });
  });
  
  it('groups properties correctly', () => {
    const groups = getPropsByGroup();
    
    expect(groups).toHaveProperty('text');
    expect(groups).toHaveProperty('effects');
    expect(groups).toHaveProperty('animation');
    
    // Check that text properties are in the text group
    expect(groups.text).toContain(wordStyleProps.color);
    expect(groups.text).toContain(wordStyleProps.opacity);
    expect(groups.text).toContain(wordStyleProps.fontScale);
    
    // Check that effect properties are in the effects group
    expect(groups.effects).toContain(wordStyleProps.glow);
    expect(groups.effects).toContain(wordStyleProps.shadow);
    expect(groups.effects).toContain(wordStyleProps.highlight);
    expect(groups.effects).toContain(wordStyleProps.underline);
    
    // Check that animation properties are in the animation group
    expect(groups.animation).toContain(wordStyleProps.entrance);
  });
  
  it('gets properties for a specific group', () => {
    const textProps = getPropsForGroup('text');
    expect(textProps).toHaveLength(3);
    expect(textProps).toContain(wordStyleProps.color);
    expect(textProps).toContain(wordStyleProps.opacity);
    expect(textProps).toContain(wordStyleProps.fontScale);
  });
  
  it('creates default style correctly', () => {
    const defaultStyle = createDefaultStyle();
    
    expect(defaultStyle.color).toBe(DEFAULT_WORD_STYLE.color);
    expect(defaultStyle.opacity).toBe(DEFAULT_WORD_STYLE.opacity);
    expect(defaultStyle.fontScale).toBe(DEFAULT_WORD_STYLE.fontScale);
    expect(defaultStyle.glow).toBe(DEFAULT_WORD_STYLE.glow);
    expect(defaultStyle.shadow).toBe(DEFAULT_WORD_STYLE.shadow);
    expect(defaultStyle.highlight).toBe(DEFAULT_WORD_STYLE.highlight);
    expect(defaultStyle.underline).toBe(DEFAULT_WORD_STYLE.underline);
    expect(defaultStyle.entrance).toBe(DEFAULT_WORD_STYLE.entrance);
  });
  
  it('detects non-default values correctly', () => {
    // Test with default values
    const defaultStyle = createDefaultStyle();
    expect(hasNonDefaultValues(defaultStyle)).toBe(false);
    
    // Test with modified values
    const modifiedStyle = {
      ...defaultStyle,
      color: '#ff0000',
      opacity: 0.5,
    };
    expect(hasNonDefaultValues(modifiedStyle)).toBe(true);
    
    // Test with partially modified values
    const partiallyModifiedStyle = {
      ...defaultStyle,
      fontScale: 1.2,
    };
    expect(hasNonDefaultValues(partiallyModifiedStyle)).toBe(true);
  });
});