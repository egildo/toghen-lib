import { converter, type Color } from 'culori';
import type { ColorValue, NormalizedColorValue } from '../types/composite-values.js';
import { parseCssColor, toCuloriColor } from './css-color.js';

const rgbConverter = converter('rgb');

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Converts any colour lib accepts to sRGB 0–1 channels, clamped into the gamut.
 *
 * Supported input:
 * - every colour string the load gate accepts, read by `parseCssColor`: hex,
 *   named colours, `transparent`, any CSS Color 4 function, `color-mix()`.
 *   A string it refuses (`currentColor`, `var()`, …) throws its sentence.
 * - W3C structured color objects (`{ colorSpace, components, alpha }`)
 */
export function normalizeColorToSRGB01(value: string | ColorValue): NormalizedColorValue {
  let color: Color;
  if (typeof value === 'string') {
    color = parseCssColor(value);
  } else if (typeof value === 'object' && value !== null) {
    color = toCuloriColor(value);
  } else {
    throw new Error('Unsupported color value. Expected a colour string or a ColorValue object.');
  }

  const rgb = rgbConverter(color);
  if (!rgb) {
    throw new Error('Unable to convert color to sRGB.');
  }

  return {
    r: clamp01(rgb.r ?? 0),
    g: clamp01(rgb.g ?? 0),
    b: clamp01(rgb.b ?? 0),
    a: clamp01(rgb.alpha ?? 1),
  };
}
