import type { GradientKind, GradientObjectValue, GradientStopValue, GradientValue, NormalizedGradient } from '../types/composite-values.js';
import { normalizeColorToSRGB01 } from './normalize-color.js';
import { computeCssNumeric } from './css-math.js';

const GRADIENT_KINDS: readonly GradientKind[] = ['linear', 'radial', 'angular', 'conic'];

/** A gradient written the W3C way is an array of stops (§9.7). */
export function isGradientStopsValue(value: unknown): value is GradientStopValue[] {
  return Array.isArray(value);
}

/**
 * Reads an angle: a number of degrees, or a string computed by `computeCssNumeric` in any of
 * `deg grad rad turn`, `calc()` included (`'0.25turn'`, `'calc(90deg + 0.25turn)'`). A unitless
 * string is degrees, as a number is.
 *
 * @param angle - Angle value, or undefined for 0
 * @returns The angle in degrees
 *
 * @throws {Error} When the angle is not a finite number or a computable angle string
 */
export function parseAngleToDegrees(angle: string | number | undefined): number {
  if (angle === undefined) {
    return 0;
  }

  if (typeof angle === 'number') {
    if (!Number.isFinite(angle)) {
      throw new Error('angle must be a finite number.');
    }
    return angle;
  }

  if (typeof angle !== 'string') {
    throw new Error('angle must be a string or number.');
  }

  try {
    return computeCssNumeric(angle, 'angle').value;
  } catch (error) {
    throw new Error(`Invalid angle: ${(error as Error).message}`);
  }
}

/**
 * Reduces either gradient form to one shape, with colours resolved to sRGB.
 *
 * The W3C format defines a gradient value as a bare array of stops (§9.7), with
 * no gradient kind and no angle; Toghen also accepts an object carrying `type`
 * and `angle`, which the spec has no representation for. Consumers should call
 * this instead of reading `.type`/`.stops`, since only one of the two forms has
 * those properties — reading them directly is what made every spec-conformant
 * gradient token throw.
 *
 * An array-form gradient is reported as `linear` at 0deg.
 *
 * @param value - A gradient in either form
 * @returns The gradient's kind, angle in degrees, and normalized stops
 *
 * @throws {Error} When the value is neither form, has no stops, or a stop has an
 *   invalid colour or position
 *
 * @example
 * ```typescript
 * // W3C form
 * normalizeGradient([{ color: '#0066cc', position: 0 }, { color: '#004d99', position: 1 }]);
 * // → { type: 'linear', angleDeg: 0, stops: [...] }
 *
 * // Toghen form
 * normalizeGradient({ type: 'radial', angle: '90deg', stops: [...] });
 * // → { type: 'radial', angleDeg: 90, stops: [...] }
 * ```
 */
export function normalizeGradient(value: GradientValue): NormalizedGradient {
  const { type, angle, stops } = isGradientStopsValue(value)
    ? { type: 'linear' as GradientKind, angle: undefined, stops: value }
    : readObjectForm(value);

  validateStops(stops);

  return {
    type,
    angleDeg: parseAngleToDegrees(angle),
    stops: stops.map((stop) => ({
      color: normalizeColorToSRGB01(stop.color),
      position: stop.position,
    })),
  };
}

function readObjectForm(value: GradientObjectValue): {
  type: GradientKind;
  angle: string | number | undefined;
  stops: GradientStopValue[];
} {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Gradient $value must be an array of stops, or an object with "type" and "stops".');
  }

  if (!GRADIENT_KINDS.includes(value.type)) {
    throw new Error(`type must be one of ${GRADIENT_KINDS.join(', ')}.`);
  }

  return { type: value.type, angle: value.angle, stops: value.stops };
}

function validateStops(stops: unknown): asserts stops is GradientStopValue[] {
  if (!Array.isArray(stops) || stops.length === 0) {
    throw new Error('stops must be a non-empty array.');
  }

  stops.forEach((stop, index) => {
    if (typeof stop !== 'object' || stop === null) {
      throw new Error(`stop at index ${index} must be an object.`);
    }

    const { color, position } = stop as Record<string, unknown>;

    try {
      normalizeColorToSRGB01(color as Parameters<typeof normalizeColorToSRGB01>[0]);
    } catch (error) {
      throw new Error(`stop ${index} has invalid color. ${(error as Error).message}`);
    }

    if (typeof position !== 'number' || !Number.isFinite(position)) {
      throw new Error(`stop ${index} position must be a finite number.`);
    }

    if (position < 0 || position > 1) {
      throw new Error(`stop ${index} position must be between 0 and 1.`);
    }
  });
}
