import { formatHex, converter, wcagLuminance, type Color } from 'culori';
import { colorSpaces } from './color-spaces.js';
import type { DesignToken } from '../core/design-token.js';
import type { TokenTypeHandler } from './handler.js';
import type { ColorValue } from '../types/composite-values.js';
import { isHexOrNamed, parseCssColor, toColorValue, toCuloriColor as bridge } from '../utils/css-color.js';

// Defines the structure for a color token's $value property.
// `currentColor` has no value until an element uses it, so it is the one string kept as written.
type ColorTokenValue = ColorValue | 'currentColor';

/** A colour token's value as a culori colour, through the one shared bridge. */
const toCuloriColor = (tokenValue: ColorTokenValue): Color => {
  if (typeof tokenValue === 'string') {
    throw new Error(`'${tokenValue}' has no value until an element uses it, so it cannot be converted.`);
  }
  return bridge(tokenValue);
};

/**
 * A handler for 'color' type design tokens, providing validation and utility methods.
 * It ensures that color tokens are compliant with the W3C spec and provides
 * useful conversions.
 */
export const colorHandler: TokenTypeHandler = {
  /**
   * Validates a color token: the structured shape, or a colour string.
   * @param token The design token to validate.
   */
  validate: (token: DesignToken, path: string) => {
    colorHandler.normalize!(token.$value, path);
  },

  /**
   * The structured shape of a colour. A colour string is read by
   * `parseCssColor` (any CSS Color 4 spelling, named colours, `color-mix()`)
   * and stored as its computed value in its own space; a hex or a named
   * colour also carries its `#rrggbb` as `hex`. `transparent` becomes black at
   * alpha 0 with `hex: '#00000000'`; `currentColor` is kept as the string
   * `'currentColor'`. Keywords match without regard to case. A structured
   * colour is checked and returned as written.
   */
  normalize: (value: unknown, path: string): ColorTokenValue => {
    if (typeof value === 'string') {
      const keyword = value.trim().toLowerCase();
      if (keyword === 'currentcolor') return 'currentColor';
      if (keyword === 'transparent') {
        return { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0, hex: '#00000000' };
      }
      let parsed: Color;
      try {
        parsed = parseCssColor(value);
      } catch (error) {
        throw new Error(`Token "${path}": ${(error as Error).message}`);
      }
      return isHexOrNamed(value) ? { ...toColorValue(parsed), hex: formatHex(parsed) } : toColorValue(parsed);
    }

    if (typeof value !== 'object' || value === null) {
      throw new Error(`Token "${path}": $value must be a structured colour or a colour string.`);
    }

    const { colorSpace, components, alpha } = value as ColorValue;

    if (!colorSpace || !colorSpaces[colorSpace]) {
      throw new Error(`Token "${path}": colorSpace '${String(colorSpace)}' is invalid or not supported.`);
    }

    const definition = colorSpaces[colorSpace];

    if (!Array.isArray(components) || components.length !== definition.components.length) {
      throw new Error(
        `Token "${path}": components array must have ${definition.components.length} items for colorSpace '${String(colorSpace)}'.`,
      );
    }

    components.forEach((comp: number | 'none', i: number) => {
      const [min, max] = definition.ranges[i];
      if (typeof comp !== 'number' && comp !== 'none') {
        throw new Error(`Token "${path}": component ${i} must be a number or 'none'.`);
      }
      if (typeof comp === 'number' && (comp < min || comp > max)) {
        console.warn(
          `Token "${path}": component ${i} (${comp}) is outside the typical range of [${min}, ${max}] for ${String(colorSpace)}.`,
        );
      }
    });

    if (alpha !== undefined && (typeof alpha !== 'number' || alpha < 0 || alpha > 1)) {
      throw new Error(`Token "${path}": alpha value must be a number between 0 and 1.`);
    }

    return value as ColorValue;
  },

  /**
   * Converts the color to a CSS hex string (e.g., #RRGGBB).
   * @returns The hex color string.
   */
  toHex: function (this: DesignToken): string {
    return formatHex(toCuloriColor(this.$value));
  },

  /**
   * Converts the color to a culori RGB object.
   * @returns The RGB color object.
   */
  toRgb: function (this: DesignToken): Color {
    const rgbConverter = converter('rgb');
    return rgbConverter(toCuloriColor(this.$value));
  },

  /**
   * Converts the color to a CSS rgb(a) string.
   * @returns The CSS color string.
   */
  toRgbString: function (this: DesignToken): string {
    const color = colorHandler.toRgb!.call(this) as Color & { r: number; g: number; b: number; alpha?: number };
    const { r, g, b, alpha } = color;
    const r255 = Math.round(r * 255);
    const g255 = Math.round(g * 255);
    const b255 = Math.round(b * 255);
    if (alpha === undefined || alpha === 1) {
      return `rgb(${r255}, ${g255}, ${b255})`;
    }
    return `rgba(${r255}, ${g255}, ${b255}, ${alpha})`;
  },

  /**
   * Returns the LCH perceptual lightness of the color (0–100).
   * Useful for ordering colors by perceived brightness.
   * @returns The L channel value in LCH.
   */
  getLchLightness: function (this: DesignToken): number {
    const lchConverter = converter('lch');
    return lchConverter(toCuloriColor(this.$value)).l;
  },

  /**
   * Calculates the WCAG 2.x relative luminance of the color (0–1).
   * Use this for contrast ratio calculations per the WCAG spec.
   * @see https://www.w3.org/TR/WCAG20/#relativeluminancedef
   * @returns The WCAG relative luminance value.
   */
  getLuminance: function (this: DesignToken): number {
    return wcagLuminance(toCuloriColor(this.$value));
  },
};
