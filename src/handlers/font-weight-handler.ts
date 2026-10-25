import type { DesignToken } from '../core/design-token.js';
import type { TokenTypeHandler } from './handler.js';
import { computeCssNumeric } from '../utils/css-math.js';

/** The W3C font weight keywords (DTCG §8.4) and the numbers they stand for. */
const KEYWORDS: Readonly<Record<string, number>> = {
  thin: 100,
  hairline: 100,
  'extra-light': 200,
  'ultra-light': 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  'semi-bold': 600,
  'demi-bold': 600,
  bold: 700,
  'extra-bold': 800,
  'ultra-bold': 800,
  black: 900,
  heavy: 900,
  'extra-black': 950,
  'ultra-black': 950,
};

/**
 * A handler for `fontWeight` tokens, also the gate of a typography's `fontWeight` member.
 * A weight is stored as a number from 1 to 1000.
 */
export const fontWeightHandler: TokenTypeHandler = {
  validate: (token: DesignToken, path: string) => {
    fontWeightHandler.normalize!(token.$value, path);
  },

  /**
   * The number a font weight stands for. A W3C keyword (`'bold'`, `'semi-bold'`, any case)
   * becomes its number; any other string is computed by `computeCssNumeric` (`'700'`,
   * `'calc(400 + 300)'`). The result must lie from 1 to 1000.
   */
  normalize: (value: unknown, path: string): number => {
    let weight = value;
    if (typeof value === 'string') {
      const keyword = KEYWORDS[value.trim().toLowerCase()];
      if (keyword !== undefined) return keyword;
      try {
        weight = computeCssNumeric(value, 'number');
      } catch {
        weight = undefined;
      }
    }
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 1 || weight > 1000) {
      throw new Error(
        `Token "${path}": a font weight must be a number from 1 to 1000 or a W3C keyword (thin, light, normal, bold, black, …), got ${JSON.stringify(value)}.`,
      );
    }
    return weight;
  },
};
