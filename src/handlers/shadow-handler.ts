import type { DesignToken } from '../core/design-token.js';
import type { TokenTypeHandler } from './handler.js';
import type { NormalizedShadow, ShadowValue } from '../types/composite-values.js';
import { normalizeColorToSRGB01 } from '../utils/normalize-color.js';
import { normalizeDimensionToPx } from '../utils/dimensions.js';
import { colorHandler } from './color-handler.js';
import { dimensionHandler } from './dimension-handler.js';

const isObject = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null;

/**
 * A composite's member through its type's gate, computed. The gate's error is the token's,
 * with the member named after the token: `Token "ds.shadow.raised": color: …`.
 * Shared by the composite handlers.
 */
export function computeMember<T>(gate: (value: unknown, path: string) => T, value: unknown, path: string, member: string): T {
  try {
    return gate(value, path);
  } catch (error) {
    const message = (error as Error).message;
    const prefix = `Token "${path}": `;
    throw new Error(`${prefix}${member}: ${message.startsWith(prefix) ? message.slice(prefix.length) : message}`);
  }
}

const normalizeOneShadow = (shadow: ShadowValue): NormalizedShadow => ({
  color: normalizeColorToSRGB01(shadow.color),
  offsetX: normalizeDimensionToPx(shadow.offsetX),
  offsetY: normalizeDimensionToPx(shadow.offsetY),
  blur: normalizeDimensionToPx(shadow.blur),
  spread: shadow.spread !== undefined ? normalizeDimensionToPx(shadow.spread) : 0,
  inset: shadow.inset ?? false,
});

/** One shadow with every member computed: the colour structured (or `'currentColor'`), each length `{ value, unit }`. */
const computeOneShadow = (value: unknown, path: string, at: string): ShadowValue => {
  if (!isObject(value)) {
    throw new Error(`Token "${path}": ${at}a shadow must be an object.`);
  }
  if (value.color === undefined) {
    throw new Error(`Token "${path}": ${at}color is required.`);
  }
  if (value.offsetX === undefined || value.offsetY === undefined || value.blur === undefined) {
    throw new Error(`Token "${path}": ${at}offsetX, offsetY and blur are required.`);
  }
  if (value.inset !== undefined && typeof value.inset !== 'boolean') {
    throw new Error(`Token "${path}": ${at}inset must be a boolean when provided.`);
  }

  const length = (member: string) => computeMember(dimensionHandler.normalize!, value[member], path, `${at}${member}`);
  return {
    ...value,
    color: computeMember(colorHandler.normalize!, value.color, path, `${at}color`) as ShadowValue['color'],
    offsetX: length('offsetX'),
    offsetY: length('offsetY'),
    blur: length('blur'),
    ...(value.spread !== undefined ? { spread: length('spread') } : {}),
  } as ShadowValue;
};

export const shadowHandler: TokenTypeHandler = {
  validate: (token: DesignToken, path: string) => {
    shadowHandler.normalize!(token.$value, path);
  },

  /**
   * A shadow, or a non-empty array of them, with every member computed: `color` through the
   * colour gate (any CSS colour, `color-mix()`, `transparent`; `currentColor` kept as the
   * string), `offsetX`, `offsetY`, `blur` and `spread` through the length gate into
   * `{ value, unit }`. `inset` must be a boolean when given. An error names the member,
   * and in an array its index (`1.color`).
   */
  normalize: (value: unknown, path: string): ShadowValue | ShadowValue[] => {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        throw new Error(`Token "${path}": a shadow array cannot be empty.`);
      }
      return value.map((entry, index) => computeOneShadow(entry, path, `${index}.`));
    }
    return computeOneShadow(value, path, '');
  },

  getShadows: function (this: DesignToken): NormalizedShadow[] {
    const raw = this.$value as ShadowValue | ShadowValue[];
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map(normalizeOneShadow);
  },
};
