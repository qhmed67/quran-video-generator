/**
 * Inspector UI component (plan phase 4.3).
 *
 * Built from the wordStyleProps registry, with inheritance display and reset functionality.
 * A side panel on desktop, a bottom sheet on mobile.
 */

import { useState, useEffect } from 'react';
import { getPropsByGroup, createDefaultStyle } from './wordStyleProps';
import type { WordStyle, WordRef } from '@qvg/core';

interface InspectorProps {
  /** Currently selected word or range */
  selection: {
    type: 'word' | 'range' | 'ayah' | 'global';
    start: WordRef | null;
    end: WordRef | null;
    current: WordRef | null;
  };
  /** Current style for the selection */
  currentStyle: WordStyle;
  /** Parent style for inheritance display */
  parentStyle: WordStyle | null;
  /** Callback when style changes */
  onStyleChange: (style: WordStyle) => void;
  /** Callback when reset is clicked */
  onReset: () => void;
  /** Whether the inspector is open */
  isOpen: boolean;
  /** Callback to toggle inspector */
  onToggle: () => void;
}

export function Inspector({
  selection,
  currentStyle,
  parentStyle,
  onStyleChange,
  onReset,
  isOpen,
  onToggle,
}: InspectorProps) {
  const [localStyle, setLocalStyle] = useState<WordStyle>(currentStyle);
  const [activeGroup, setActiveGroup] = useState<string>('text');
  
  // Update local style when current style changes
  useEffect(() => {
    setLocalStyle(currentStyle);
  }, [currentStyle]);
  
  // Handle style property changes
  const handlePropertyChange = (property: keyof WordStyle, value: any) => {
    const newStyle = { ...localStyle, [property]: value };
    setLocalStyle(newStyle);
    onStyleChange(newStyle);
  };
  
  // Reset to parent style
  const handleReset = () => {
    if (parentStyle) {
      setLocalStyle(parentStyle);
      onStyleChange(parentStyle);
    } else {
      const defaultStyle = createDefaultStyle();
      setLocalStyle(defaultStyle);
      onStyleChange(defaultStyle);
    }
    onReset();
  };
  
  // Get properties by group
  const groups = getPropsByGroup();
  const groupNames = Object.keys(groups);
  
  // Get active properties
  const activeProps = groups[activeGroup] || [];
  
  // Get inheritance information
  const getInheritanceInfo = () => {
    if (!parentStyle) {
      return 'Using default style';
    }
    
    const hasCustomValues = Object.keys(localStyle).some((key) => {
      return localStyle[key as keyof WordStyle] !== parentStyle[key as keyof WordStyle];
    });
    
    if (hasCustomValues) {
      return 'Custom style (inherited from parent)';
    } else {
      return 'Inherited from parent';
    }
  };
  
  const inheritanceInfo = getInheritanceInfo();
  
  return (
    <div className={`inspector ${isOpen ? 'open' : 'closed'}`}>
      {/* Inspector toggle button (mobile only) */}
      <button
        className="inspector-toggle"
        onClick={onToggle}
        aria-label="Toggle inspector"
      >
        <span className="icon">⚙️</span>
      </button>
      
      {/* Inspector content */}
      <div className="inspector-content">
        <div className="inspector-header">
          <h2>Style Inspector</h2>
          <div className="selection-info">
            {selection.type === 'word' && 'Word'}
            {selection.type === 'range' && 'Word Range'}
            {selection.type === 'ayah' && 'Ayah'}
            {selection.type === 'global' && 'Global'}
          </div>
        </div>
        
        {/* Inheritance info */}
        <div className="inheritance-info">
          <span className="inheritance-text">{inheritanceInfo}</span>
          <button
            className="reset-button"
            onClick={handleReset}
            title="Reset to parent style"
          >
            ↺ Reset
          </button>
        </div>
        
        {/* Property groups */}
        <div className="property-groups">
          <div className="group-tabs">
            {groupNames.map((group) => (
              <button
                key={group}
                className={`group-tab ${activeGroup === group ? 'active' : ''}`}
                onClick={() => setActiveGroup(group)}
              >
                {group.charAt(0).toUpperCase() + group.slice(1)}
              </button>
            ))}
          </div>
          
          {/* Property controls */}
          <div className="property-controls">
            {activeProps.map((prop) => (
              <PropertyControl
                key={prop.displayName}
                prop={prop}
                value={localStyle[prop.displayName as keyof WordStyle]}
                onChange={(value) => handlePropertyChange(prop.displayName as keyof WordStyle, value)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PropertyControlProps {
  prop: any;
  value: any;
  onChange: (value: any) => void;
}

function PropertyControl({ prop, value, onChange }: PropertyControlProps) {
  const handleChange = (newValue: any) => {
    if (prop.nullable && newValue === null) {
      onChange(null);
    } else if (prop.type === 'number') {
      onChange(parseFloat(newValue));
    } else {
      onChange(newValue);
    }
  };
  
  switch (prop.type) {
    case 'color':
      return (
        <div className="property-control">
          <label className="property-label">{prop.displayName}</label>
          <input
            type="color"
            value={value || prop.defaultValue}
            onChange={(e) => handleChange(e.target.value)}
            className="color-input"
          />
        </div>
      );
    
    case 'number':
      return (
        <div className="property-control">
          <label className="property-label">{prop.displayName}</label>
          <input
            type="number"
            value={value || prop.defaultValue}
            min={prop.min}
            max={prop.max}
            step={prop.step}
            onChange={(e) => handleChange(e.target.value)}
            className="number-input"
          />
        </div>
      );
    
    case 'boolean':
      return (
        <div className="property-control">
          <label className="property-label">{prop.displayName}</label>
          <input
            type="checkbox"
            checked={value || prop.defaultValue}
            onChange={(e) => handleChange(e.target.checked)}
            className="checkbox-input"
          />
        </div>
      );
    
    case 'select':
      return (
        <div className="property-control">
          <label className="property-label">{prop.displayName}</label>
          <select
            value={value || prop.defaultValue}
            onChange={(e) => handleChange(e.target.value)}
            className="select-input"
          >
            {prop.options?.map((option: { label: string; value: any }) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    
    case 'object':
      // For complex objects, we'd render custom controls
      return (
        <div className="property-control">
          <label className="property-label">{prop.displayName}</label>
          <button
            className="object-button"
            onClick={() => handleChange(prop.defaultValue)}
          >
            {prop.control} ↺
          </button>
        </div>
      );
    
    default:
      return null;
  }
}