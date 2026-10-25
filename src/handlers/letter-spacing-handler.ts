import type { DesignToken } from '../core/design-token.js';
import type { TokenTypeHandler } from './handler.js';
import type { LetterSpacingValue } from '../types/composite-values.js';
import { computeCssNumeric } from '../utils/css-math.js';

const UNITS: readonly string[] = ['px', 'rem', 'em'];

/**
 * A handler for 'letterSpacing' type design tokens: a Toghen extension, not a W3C type.
 * A letter spacing is a length in `px`, `rem` or `em`; `em` is a fraction of the font size.
 */
export const letterSpacingHandler: TokenTypeHandler = {
  validate: (token: DesignToken, path: string) => {
    letterSpacingHandler.normalize!(token.$value, path);
  },

  /**
   * The structured shape of a letter spacing. A string (`'-0.021em'`, `'calc(0.1em - 0.02em)'`)
   * is computed by `computeCssNumeric` into `{ value, unit }`; a structured one is checked and
   * returned as written. A bare number, `pt` and `mm` are refused, and so is an `em` mixed with
   * another unit.
   */
  normalize: (value: unknown, path: string): LetterSpacingValue => {
    if (typeof value === 'string') {
      try {
        return computeCssNumeric(value, 'letterSpacing');
      } catch (error) {
        throw new Error(`Token "${path}": ${(error as Error).message}`);
      }
    }

    if (typeof value !== 'object' || value === null) {
      throw new Error(
        `Token "${path}": $value must be a structured letter spacing or a string like '0.08em', got ${JSON.stringify(value)}.`,
      );
    }

    const { value: number, unit } = value as LetterSpacingValue;

    if (typeof number !== 'number' || !Number.isFinite(number)) {
      throw new Error(`Token "${path}": value must be a finite number.`);
    }
    if (!UNITS.includes(unit)) {
      throw new Error(`Token "${path}": a letter spacing unit must be one of 'px', 'rem' or 'em', got '${String(unit)}'.`);
    }

    return value as LetterSpacingValue;
  },

  /** The letter spacing as written (e.g. "-0.021em"). */
  toString: function (this: DesignToken): string {
    const { value, unit } = this.$value as LetterSpacingValue;
    return `${value}${unit}`;
  },

  /**
   * The letter spacing in pixels. `em` is a fraction of `fontSize`; `rem` is of 16.
   * @param fontSize The font size `em` is measured against (defaults to 16).
   */
  toPx: function (this: DesignToken, fontSize = 16): number {
    const { value, unit } = this.$value as LetterSpacingValue;
    switch (unit) {
      case 'px':
        return value;
      case 'rem':
        return value * 16;
      case 'em':
        return value * fontSize;
    }
  },
};
