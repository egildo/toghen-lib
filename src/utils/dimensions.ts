import type { DimensionValue, DimensionUnit, NormalizedLineHeight } from '../types/composite-values.js';
import { computeCssNumeric, PX_PER } from './css-math.js';

const convertToPx = (value: number, unit: DimensionUnit, baseFontSize = 16): number =>
  unit === 'rem' ? value * baseFontSize : value * PX_PER[unit];

/**
 * A dimension string, computed by `computeCssNumeric`. A unitless string (`'16'`, `'calc(2 * 8)'`)
 * has always meant pixels here, and still does.
 */
const parseDimensionString = (value: string): DimensionValue => {
  try {
    return computeCssNumeric(value, 'length');
  } catch (error) {
    try {
      return { value: computeCssNumeric(value, 'number'), unit: 'px' };
    } catch {
      throw new Error(`Invalid dimension string: ${(error as Error).message}`);
    }
  }
};

const parseLineHeightString = (value: string) => {
  try {
    return computeCssNumeric(value, 'lineHeight');
  } catch (error) {
    throw new Error(`Invalid line height: ${(error as Error).message}`);
  }
};

export function normalizeDimensionToPx(value: string | DimensionValue, baseFontSize = 16): number {
  if (typeof value === 'string') {
    const parsed = parseDimensionString(value);
    return convertToPx(parsed.value, parsed.unit, baseFontSize);
  }

  if (typeof value !== 'object' || value === null) {
    throw new Error('Dimension must be a string or DimensionValue object.');
  }

  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    throw new Error('Dimension object must contain a finite numeric value.');
  }

  if (!['px', 'rem', 'pt', 'mm'].includes(value.unit)) {
    throw new Error(`Unsupported dimension unit '${String(value.unit)}'.`);
  }

  return convertToPx(value.value, value.unit, baseFontSize);
}

/**
 * A W3C `lineHeight` is a number, a multiplier of the font size. Toghen also
 * accepts a percentage and a length, and a length may be written either way a
 * dimension can: `'24px'` or `{ value: 24, unit: 'px' }`. A string is computed by
 * `computeCssNumeric`, so `'calc(1.25 * 1.2)'` is the ratio 1.5.
 */
export function normalizeLineHeight(value: string | number | DimensionValue, baseFontSize = 16): NormalizedLineHeight {
  if (typeof value === 'object' && value !== null) {
    return { value: normalizeDimensionToPx(value, baseFontSize), unit: 'px' };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('lineHeight number must be finite.');
    }
    return { value, unit: 'ratio' };
  }

  if (typeof value !== 'string') {
    throw new Error('lineHeight must be a number, a string or a DimensionValue object.');
  }

  const computed = parseLineHeightString(value);
  if (typeof computed === 'number') return { value: computed, unit: 'ratio' };
  if (computed.unit === '%') return { value: computed.value, unit: 'percent' };
  return { value: convertToPx(computed.value, computed.unit, baseFontSize), unit: 'px' };
}
