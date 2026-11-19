import { describe, expect, it } from 'vitest';
import {
  AYAH_END_MARKER,
  countArabicLetters,
  displayWordText,
  isStandaloneToken,
  ornateAyahMarker,
  stripAyahOrnaments,
  stripQuranicMarks,
  toArabicIndicDigits,
} from './text';

describe('stripAyahOrnaments', () => {
  it('removes ayah-end markers and full/half alif ornaments', () => {
    expect(stripAyahOrnaments('ق ۝١')).toBe('ق ١');
    expect(stripAyahOrnaments('م۝٢')).toBe('م٢');
  });
});

describe('stripQuranicMarks', () => {
  it('removes waqf / small-high-sign marks only', () => {
    expect(stripQuranicMarks('ق\u06DD')).toBe('ق');
    expect(stripQuranicMarks('ب\u06D6ق')).toBe('بق');
  });
});

describe('displayWordText', () => {
  it('drops ayah-end markers and brackets but keeps the word', () => {
    expect(displayWordText('م۝١')).toBe('م١');
    expect(displayWordText('بِسْمِ')).toBe('بِسْمِ');
  });
});

describe('countArabicLetters', () => {
  it('counts Arabic letters, ignoring harakat and marks', () => {
    expect(countArabicLetters('ق')).toBe(1);
    expect(countArabicLetters('')).toBe(0);
    expect(countArabicLetters('ق ۝١')).toBe(1);
  });
});

describe('isStandaloneToken', () => {
  it('treats single-letter tokens (hamza/lā) as standalone', () => {
    expect(isStandaloneToken('ق')).toBe(true);
    expect(isStandaloneToken('بِسْمِ')).toBe(false);
  });
});

describe('toArabicIndicDigits / ornateAyahMarker', () => {
  it('renders the ayah number in Arabic-Indic digits and appends the marker', () => {
    expect(toArabicIndicDigits(12)).toBe('١٢');
    expect(ornateAyahMarker(3)).toBe('۝٣');
    expect(AYAH_END_MARKER).toBe('۝');
  });
});
