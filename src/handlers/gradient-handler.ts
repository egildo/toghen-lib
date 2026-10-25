import type { DesignToken } from '../core/design-token.js';
import type { TokenTypeHandler } from './handler.js';
import type { GradientKind, GradientObjectValue, GradientStopValue, GradientValue, NormalizedGradient } from '../types/composite-values.js';
import { isGradientStopsValue, normalizeGradient, parseAngleToDegrees } from '../utils/normalize-gradient.js';
import { colorHandler } from './color-handler.js';
import { computeMember } from './shadow-handler.js';

const GRADIENT_KINDS: readonly GradientKind[] = ['linear', 'radial', 'angular', 'conic'];

/** The stops with each colour computed; `at` is the stops' member address (`''` or `'stops.'`). */
const computeStops = (stops: unknown, path: string, at: string): GradientStopValue[] => {
  if (!Array.isArray(stops) || stops.length === 0) {
    throw new Error(`Token "${path}": ${at ? 'stops' : 'a gradient'} must be a non-empty array of stops.`);
  }
  return stops.map((stop, index) => {
    if (typeof stop !== 'object' || stop === null) {
      throw new Error(`Token "${path}": ${at}${index} must be an object.`);
    }
    const { color, position } = stop as Record<string, unknown>;
    if (typeof position !== 'number' || !Number.isFinite(position)) {
      throw new Error(`Token "${path}": ${at}${index}.position must be a finite number.`);
    }
    if (position < 0 || position > 1) {
      throw new Error(`Token "${path}": ${at}${index}.position must be between 0 and 1.`);
    }
    return { ...stop, color: computeMember(colorHandler.normalize!, color, path, `${at}${index}.color`) } as GradientStopValue;
  });
};

const read = (token: DesignToken): NormalizedGradient => normalizeGradient(token.$value as GradientValue);

/**
 * Handler for `gradient` tokens.
 *
 * Accepts both gradient forms — the W3C array of stops (§9.7) and Toghen's
 * object form carrying `type` and `angle`. See {@link normalizeGradient}.
 */
export const gradientHandler: TokenTypeHandler = {
  validate: (token: DesignToken, path: string) => {
    gradientHandler.normalize!(token.$value, path);
  },

  /**
   * A gradient with every member computed, in the form it was written: each stop's `color`
   * through the colour gate, and in the object form the `angle` (`'0.25turn'`,
   * `'calc(90deg + 0.25turn)'`) as a number of degrees. A position must lie in [0, 1].
   * An error names the member (`1.color`, `stops.1.color`, `angle`).
   */
  normalize: (value: unknown, path: string): GradientValue => {
    if (isGradientStopsValue(value)) return computeStops(value, path, '');
    if (typeof value !== 'object' || value === null) {
      throw new Error(`Token "${path}": a gradient must be an array of stops, or an object with "type" and "stops".`);
    }
    const object = value as GradientObjectValue;
    if (!GRADIENT_KINDS.includes(object.type)) {
      throw new Error(`Token "${path}": type must be one of ${GRADIENT_KINDS.join(', ')}.`);
    }
    return {
      ...object,
      ...(object.angle !== undefined
        ? { angle: computeMember((a) => parseAngleToDegrees(a as string | number), object.angle, path, 'angle') }
        : {}),
      stops: computeStops(object.stops, path, 'stops.'),
    };
  },

  getType: function (this: DesignToken): GradientKind {
    return read(this).type;
  },

  getAngleDeg: function (this: DesignToken): number {
    return read(this).angleDeg;
  },

  getStops: function (this: DesignToken): NormalizedGradient['stops'] {
    return read(this).stops;
  },
};
