import type { DesignToken } from '../core/design-token.js';
import type { TokenTypeHandler } from './handler.js';
import type { DimensionValue, LetterSpacingValue, TypographyValue } from '../types/composite-values.js';
import { normalizeDimensionToPx, normalizeLineHeight } from '../utils/dimensions.js';
import { computeCssNumeric } from '../utils/css-math.js';
import { fontFamilyNames, isFontFamilyList } from '../utils/font-family.js';
import { dimensionHandler } from './dimension-handler.js';
import { fontWeightHandler } from './font-weight-handler.js';
import { letterSpacingHandler } from './letter-spacing-handler.js';
import { computeMember } from './shadow-handler.js';

const isObject = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null;

const EM = /^(-?\d*\.?\d+)em$/i;

/** The multiple of the font size a letter spacing in `em` stands for, or undefined if it is not in `em`. */
const emOf = (value: unknown): number | undefined => {
  if (typeof value === 'string') {
    const match = value.trim().match(EM);
    return match ? Number(match[1]) : undefined;
  }
  if (isObject(value) && value.unit === 'em' && typeof value.value === 'number' && Number.isFinite(value.value)) {
    return value.value;
  }
  return undefined;
};

/** The members the format and lib name; any other key is a CSS property carried as written. */
const KNOWN_MEMBERS = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'fontStyle',
  'textTransform',
  'textDecoration',
]);

const getTypographyValue = (token: DesignToken): TypographyValue => token.$value as TypographyValue;

/**
 * A line height computed, in the form lib stores: a number (a multiple of the font size), a length
 * `{ value, unit }`, or a percentage, which has no structured form and is kept as the string `'150%'`.
 */
const computeLineHeight = (value: unknown, path: string): number | string | DimensionValue => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Token "${path}": a line height number must be finite.`);
    return value;
  }
  if (typeof value === 'string') {
    let computed: number | { value: number; unit: DimensionValue['unit'] | '%' };
    try {
      computed = computeCssNumeric(value, 'lineHeight');
    } catch (error) {
      throw new Error(`Token "${path}": ${(error as Error).message}`);
    }
    if (typeof computed === 'number') return computed;
    return computed.unit === '%' ? `${computed.value}%` : { value: computed.value, unit: computed.unit };
  }
  return dimensionHandler.normalize!(value, path) as DimensionValue;
};

export const typographyHandler: TokenTypeHandler = {
  validate: (token: DesignToken, path: string) => {
    typographyHandler.normalize!(token.$value, path);
  },

  /**
   * A typography value with every member computed: `fontFamily` a list when written as one
   * (`'Inter, sans-serif'` becomes `['Inter', 'sans-serif']`), `fontSize` through the length
   * gate into `{ value, unit }`, `fontWeight` a number (a W3C keyword becomes its number),
   * `lineHeight` a number, a length or a percentage string, `letterSpacing` through the letter
   * spacing gate (`'0.08em'` becomes `{ value: 0.08, unit: 'em' }`). `fontStyle`,
   * `textTransform` and `textDecoration` must be strings; any other member is a CSS property,
   * a string or a number, kept as written. An error names the member.
   */
  normalize: (value: unknown, path: string): TypographyValue => {
    if (!isObject(value)) {
      throw new Error(`Token "${path}": $value must be an object for typography tokens.`);
    }

    const isName = (name: unknown) => typeof name === 'string' && name.trim() !== '';
    const { fontFamily } = value;
    if (Array.isArray(fontFamily)) {
      if (fontFamily.length === 0) {
        throw new Error(`Token "${path}": fontFamily must not be an empty array.`);
      }
      fontFamily.forEach((name, index) => {
        if (!isName(name)) {
          throw new Error(`Token "${path}": fontFamily[${index}] must be a non-empty string.`);
        }
      });
    } else if (!isName(fontFamily)) {
      throw new Error(`Token "${path}": fontFamily must be a non-empty string or an array of them.`);
    }

    for (const member of ['fontStyle', 'textTransform', 'textDecoration']) {
      if (value[member] !== undefined && typeof value[member] !== 'string') {
        throw new Error(`Token "${path}": ${member} must be a string when provided.`);
      }
    }

    for (const [member, memberValue] of Object.entries(value)) {
      if (KNOWN_MEMBERS.has(member)) continue;
      if (typeof memberValue !== 'string' && !(typeof memberValue === 'number' && Number.isFinite(memberValue))) {
        throw new Error(`Token "${path}": ${member} must be a string or a number.`);
      }
    }

    if (value.fontSize === undefined) throw new Error(`Token "${path}": fontSize is required.`);
    if (value.fontWeight === undefined) throw new Error(`Token "${path}": fontWeight is required.`);
    if (value.lineHeight === undefined) throw new Error(`Token "${path}": lineHeight is required.`);

    return {
      ...value,
      fontFamily: computeMember(
        (f) => (typeof f === 'string' && isFontFamilyList(f) ? fontFamilyNames(f) : (f as string | string[])),
        fontFamily,
        path,
        'fontFamily',
      ),
      fontSize: computeMember(dimensionHandler.normalize!, value.fontSize, path, 'fontSize') as DimensionValue,
      fontWeight: computeMember(fontWeightHandler.normalize!, value.fontWeight, path, 'fontWeight') as number,
      lineHeight: computeMember(computeLineHeight, value.lineHeight, path, 'lineHeight'),
      ...(value.letterSpacing !== undefined
        ? {
            letterSpacing: computeMember(letterSpacingHandler.normalize!, value.letterSpacing, path, 'letterSpacing') as LetterSpacingValue,
          }
        : {}),
    } as TypographyValue;
  },

  getFontFamily: function (this: DesignToken): string | string[] {
    return getTypographyValue(this).fontFamily;
  },

  getFontSizePx: function (this: DesignToken, baseFontSize = 16): number {
    return normalizeDimensionToPx(getTypographyValue(this).fontSize, baseFontSize);
  },

  getFontWeight: function (this: DesignToken): number {
    return getTypographyValue(this).fontWeight;
  },

  getLineHeight: function (this: DesignToken, baseFontSize = 16) {
    return normalizeLineHeight(getTypographyValue(this).lineHeight, baseFontSize);
  },

  getLetterSpacingPx: function (this: DesignToken, baseFontSize = 16): number {
    const value = getTypographyValue(this).letterSpacing;
    if (value === undefined) {
      return 0;
    }
    const em = emOf(value);
    if (em !== undefined) {
      return em * typographyHandler.getFontSizePx!.call(this, baseFontSize);
    }
    return normalizeDimensionToPx(value as string | DimensionValue, baseFontSize);
  },

  getFontStyle: function (this: DesignToken): string {
    return getTypographyValue(this).fontStyle ?? 'Regular';
  },
};
