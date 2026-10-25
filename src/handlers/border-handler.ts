import type { DesignToken } from '../core/design-token.js';
import type { TokenTypeHandler } from './handler.js';
import type { BorderValue, StrokeStyleValue } from '../types/composite-values.js';
import { colorHandler } from './color-handler.js';
import { dimensionHandler } from './dimension-handler.js';
import { computeMember } from './shadow-handler.js';

/** The W3C stroke style keywords (DTCG §9.2). */
const STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset'];
const LINE_CAPS = ['round', 'butt', 'square'];

/** A stroke style: a keyword, or the object form with each dash computed into `{ value, unit }`. */
const computeStyle = (style: unknown, path: string): StrokeStyleValue => {
  if (typeof style === 'string') {
    if (STYLES.includes(style)) return style as StrokeStyleValue;
    throw new Error(`Token "${path}": a stroke style keyword is one of ${STYLES.join(', ')}, got '${style}'.`);
  }
  if (typeof style !== 'object' || style === null) {
    throw new Error(`Token "${path}": a stroke style is a keyword or an object with dashArray and lineCap.`);
  }
  const { dashArray, lineCap } = style as Record<string, unknown>;
  if (!Array.isArray(dashArray) || dashArray.length === 0) {
    throw new Error(`Token "${path}": dashArray must be a non-empty array of dimensions.`);
  }
  if (typeof lineCap !== 'string' || !LINE_CAPS.includes(lineCap)) {
    throw new Error(`Token "${path}": lineCap is one of ${LINE_CAPS.join(', ')}, got ${JSON.stringify(lineCap)}.`);
  }
  return {
    ...style,
    dashArray: dashArray.map((dash, index) => computeMember(dimensionHandler.normalize!, dash, path, `dashArray.${index}`)),
    lineCap,
  } as StrokeStyleValue;
};

/** A handler for `border` tokens (W3C §9.3): a colour, a width and a stroke style. */
export const borderHandler: TokenTypeHandler = {
  validate: (token: DesignToken, path: string) => {
    borderHandler.normalize!(token.$value, path);
  },

  /**
   * A border with every member computed: `color` through the colour gate (`currentColor` kept
   * as the string), `width` through the length gate into `{ value, unit }`, `style` a W3C
   * keyword or the object form, its `dashArray` computed. An error names the member.
   */
  normalize: (value: unknown, path: string): BorderValue => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`Token "${path}": a border must be an object with color, width and style.`);
    }
    const border = value as Record<string, unknown>;
    for (const member of ['color', 'width', 'style']) {
      if (border[member] === undefined) throw new Error(`Token "${path}": ${member} is required.`);
    }
    return {
      ...border,
      color: computeMember(colorHandler.normalize!, border.color, path, 'color') as BorderValue['color'],
      width: computeMember(dimensionHandler.normalize!, border.width, path, 'width') as BorderValue['width'],
      style: computeMember(computeStyle, border.style, path, 'style'),
    };
  },
};
