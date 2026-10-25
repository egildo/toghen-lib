import type { DesignToken } from '../core/design-token.js';
import type { TokenTypeHandler } from './handler.js';
import type { DimensionValue } from '../types/composite-values.js';
import { computeCssNumeric } from '../utils/css-math.js';

// Define the supported units for dimension tokens.
type DimensionTokenValue = DimensionValue;

// Conversion factors for a 96 DPI screen.
const DPI = 96;
const INCH_TO_MM = 25.4;
const PT_PER_INCH = 72;

const PX_PER_INCH = DPI;
const PX_PER_PT = PX_PER_INCH / PT_PER_INCH; // ~1.333
const PX_PER_MM = PX_PER_INCH / INCH_TO_MM; // ~3.78

/**
 * A handler for 'dimension' type design tokens.
 * It provides validation and utility methods for converting between units.
 */
export const dimensionHandler: TokenTypeHandler = {
  /**
   * Validates a dimension token: the structured shape, or a string like `'24px'`.
   * @param token The design token to validate.
   */
  validate: (token: DesignToken, path: string) => {
    dimensionHandler.normalize!(token.$value, path);
  },

  /**
   * The structured shape of a dimension. A string (`'24px'`, `'1.5rem'`, `'calc(1rem + 2px)'`)
   * is computed by `computeCssNumeric` into `{ value, unit }`; a structured dimension is checked
   * and returned as written.
   */
  normalize: (value: unknown, path: string): DimensionTokenValue => {
    if (typeof value === 'string') {
      try {
        return computeCssNumeric(value, 'length');
      } catch (error) {
        throw new Error(`Token "${path}": ${(error as Error).message}`);
      }
    }

    if (typeof value !== 'object' || value === null) {
      throw new Error(`Token "${path}": $value must be a structured dimension or a string like '16px'.`);
    }

    const { value: number, unit } = value as DimensionTokenValue;

    if (typeof number !== 'number' || !Number.isFinite(number)) {
      throw new Error(`Token "${path}": value must be a finite number.`);
    }

    if (!['px', 'rem', 'pt', 'mm'].includes(unit)) {
      throw new Error(`Token "${path}": unit must be one of 'px', 'rem', 'pt', or 'mm'.`);
    }

    return value as DimensionTokenValue;
  },

  /**
   * Returns a CSS-ready string representation of the dimension.
   * @returns The dimension as a string (e.g., "16px").
   */
  toString: function (this: DesignToken): string {
    const { value, unit } = this.$value as DimensionTokenValue;
    return `${value}${unit}`;
  },

  /**
   * Converts the dimension to a raw number in pixels.
   * @param baseFontSize The base font size for rem conversions (defaults to 16).
   * @returns The pixel value.
   */
  toPx: function (this: DesignToken, baseFontSize = 16): number {
    const { value, unit } = this.$value as DimensionTokenValue;
    switch (unit) {
      case 'px':
        return value;
      case 'rem':
        return value * baseFontSize;
      case 'pt':
        return value * PX_PER_PT;
      case 'mm':
        return value * PX_PER_MM;
    }
  },

  /**
   * Converts the dimension to a raw number in rems.
   * @param baseFontSize The base font size for rem conversions (defaults to 16).
   * @returns The rem value.
   */
  toRem: function (this: DesignToken, baseFontSize = 16): number {
    const pxValue = dimensionHandler.toPx!.call(this, baseFontSize);
    return pxValue / baseFontSize;
  },

  /**
   * Converts the dimension to a raw number in points.
   * @param baseFontSize The base font size for rem conversions (defaults to 16).
   * @returns The point value.
   */
  toPt: function (this: DesignToken, baseFontSize = 16): number {
    const pxValue = dimensionHandler.toPx!.call(this, baseFontSize);
    return pxValue / PX_PER_PT;
  },

  /**
   * Converts the dimension to a raw number in millimeters.
   * @param baseFontSize The base font size for rem conversions (defaults to 16).
   * @returns The millimeter value.
   */
  toMm: function (this: DesignToken, baseFontSize = 16): number {
    const pxValue = dimensionHandler.toPx!.call(this, baseFontSize);
    return pxValue / PX_PER_MM;
  },
};
