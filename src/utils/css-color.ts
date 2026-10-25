/**
 * The colour family: one reader for every colour string lib accepts, and the
 * one bridge between the W3C structured shape and culori.
 *
 * A colour string is reduced to its computed value: everything CSS Color 4
 * spells (through culori), plus `color-mix()` (CSS Color 5 §3), computed here.
 * What needs an element or a page (`currentColor`, `var()`, `light-dark()`,
 * system colours, CSS-wide keywords) is refused with the reason.
 */

import {
  colorsNamed,
  converter,
  fixupHueDecreasing,
  fixupHueIncreasing,
  fixupHueLonger,
  fixupHueShorter,
  formatCss,
  interpolateWithPremultipliedAlpha,
  parse,
} from 'culori';
import type { Color, Mode } from 'culori';
import { colorSpaces } from '../handlers/color-spaces.js';
import type { ColorValue } from '../types/composite-values.js';

/** A culori colour seen as a bag of channels, so channels can be read by name. */
type Channels = Record<string, number | undefined> & { mode: Mode };

const HUE_FIXUPS = {
  shorter: fixupHueShorter,
  longer: fixupHueLonger,
  increasing: fixupHueIncreasing,
  decreasing: fixupHueDecreasing,
} as const;

const POLAR_SPACES = new Set(['hsl', 'hwb', 'lch', 'oklch']);

const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

const SYSTEM_COLOURS = new Set([
  'accentcolor',
  'accentcolortext',
  'activetext',
  'buttonborder',
  'buttonface',
  'buttontext',
  'canvas',
  'canvastext',
  'field',
  'fieldtext',
  'graytext',
  'highlight',
  'highlighttext',
  'linktext',
  'mark',
  'marktext',
  'selecteditem',
  'selecteditemtext',
  'visitedtext',
]);

/** A component this close outside its range is float noise, and is snapped onto the bound. */
const EPSILON = 1e-9;

/** The colour space a culori mode is stored in, by the registry. */
const spaceOfMode = (mode: Mode): string | undefined => Object.keys(colorSpaces).find((space) => colorSpaces[space].culoriFormat === mode);

const isScaledByHundred = (space: string, channel: string): boolean => (space === 'hsl' || space === 'hwb') && channel !== 'h';

/**
 * Reads a colour string into a culori colour, or throws a sentence naming the
 * string and the reason it cannot be computed.
 *
 * Accepts every CSS Color 4 spelling culori parses (hex, named colours in any
 * case, `transparent`, `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`,
 * `oklch()`, `color(<space> …)`) and `color-mix()`, which may nest.
 */
export function parseCssColor(text: string): Color {
  try {
    return readColor(text.trim(), text.trim());
  } catch (error) {
    throw new Error(`'${text}' cannot be computed: ${(error as Error).message}`);
  }
}

function readColor(fragment: string, whole: string): Color {
  const lower = fragment.toLowerCase();

  if (lower.includes('var(')) throw new Error('a custom property (var()) has no value outside the page.');
  if (lower.includes('light-dark(')) throw new Error("light-dark() depends on the element's colour scheme; express it as a mode.");
  if (lower === 'currentcolor') throw new Error('currentColor has no value until an element uses it.');
  if (CSS_WIDE_KEYWORDS.has(lower))
    throw new Error(`'${fragment}' is a CSS-wide keyword, which takes its value from the element's cascade.`);
  if (SYSTEM_COLOURS.has(lower)) throw new Error(`'${fragment}' is a system colour, which only the user's platform knows.`);

  const mix = /^color-mix\(([\s\S]*)\)$/.exec(lower);
  if (mix) return readMix(mix[1], whole);

  if (/^[a-z-]+\(\s*from\s/.test(lower)) throw new Error('relative colour syntax (from) is not computed.');
  if (lower.includes('calc(')) throw new Error('calc() inside a colour channel is not computed.');

  const parsed = parse(lower);
  if (!parsed) {
    throw new Error(fragment === whole ? 'it is not a CSS colour.' : `'${fragment}' is not a CSS colour.`);
  }
  return parsed;
}

/** Splits at the commas outside any parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

const PERCENT = '([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?)%';
const TRAILING_PERCENT = new RegExp(`^([\\s\\S]*\\S)\\s+${PERCENT}$`);
const LEADING_PERCENT = new RegExp(`^${PERCENT}\\s+([\\s\\S]+)$`);

/** One `<color> <percentage>?` argument (the percentage may also come first). */
function readMixArgument(argument: string, whole: string): { color: Color; percent?: number } {
  let colorText = argument;
  let percent: number | undefined;
  const trailing = TRAILING_PERCENT.exec(argument);
  const leading = LEADING_PERCENT.exec(argument);
  if (trailing) {
    colorText = trailing[1];
    percent = Number(trailing[2]);
  } else if (leading) {
    colorText = leading[2];
    percent = Number(leading[1]);
  }
  if (percent !== undefined && (percent < 0 || percent > 100)) {
    throw new Error(`a percentage in color-mix() must lie between 0% and 100%, got ${percent}%.`);
  }
  return { color: readColor(colorText.trim(), whole), percent };
}

function readMix(body: string, whole: string): Color {
  const [method, ...args] = splitTopLevel(body);
  const interpolation = /^in\s+([a-z0-9-]+)(?:\s+(shorter|longer|increasing|decreasing)\s+hue)?$/.exec(method);
  if (!interpolation) {
    throw new Error(
      `color-mix() starts with 'in <colour space>' and an optional '<shorter|longer|increasing|decreasing> hue', got '${method}'.`,
    );
  }
  if (args.length !== 2) {
    throw new Error(`color-mix() takes two colours, got ${args.length}.`);
  }
  const space = interpolation[1] === 'xyz' ? 'xyz-d65' : interpolation[1];
  if (!colorSpaces[space]) {
    throw new Error(`'${interpolation[1]}' is not a colour space color-mix() interpolates in.`);
  }
  const hueMethod = (interpolation[2] ?? 'shorter') as keyof typeof HUE_FIXUPS;
  if (interpolation[2] && !POLAR_SPACES.has(space)) {
    throw new Error(`a hue method needs a space with a hue (hsl, hwb, lch, oklch), got '${space}'.`);
  }

  const a = readMixArgument(args[0], whole);
  const b = readMixArgument(args[1], whole);
  return mixColors(space, hueMethod, a.color, a.percent, b.color, b.percent);
}

/**
 * Mixes two colours as CSS Color 5 §3 does: the percentages normalized
 * (an omitted one is the rest of 100, both omitted are 50/50, a sum other than
 * 100 scales both, a sum below 100 also multiplies the result's alpha by
 * `sum / 100`), then interpolated with premultiplied alpha in `space`, the hue
 * by `hueMethod`. A component missing (`none`) in one colour takes the other's.
 * The result is a colour in `space`.
 */
export function mixColors(
  space: string,
  hueMethod: keyof typeof HUE_FIXUPS,
  a: Color,
  pa: number | undefined,
  b: Color,
  pb: number | undefined,
): Color {
  const definition = colorSpaces[space];
  if (!definition) throw new Error(`'${space}' is not a colour space color-mix() interpolates in.`);

  const p1 = pa ?? (pb === undefined ? 50 : 100 - pb);
  const p2 = pb ?? 100 - p1;
  const sum = p1 + p2;
  if (sum === 0) throw new Error('the percentages in color-mix() add up to 0%.');

  const mode = definition.culoriFormat;
  const toSpace = converter(mode);
  const from = toSpace(a) as unknown as Channels;
  const to = toSpace(b) as unknown as Channels;

  // CSS: a component missing in one colour takes the other's value. culori's
  // premultiplied interpolation reads a missing component as 0, so fill it first.
  const missingInBoth = definition.components.filter((channel) => from[channel] === undefined && to[channel] === undefined);
  for (const channel of definition.components) {
    if (from[channel] === undefined) from[channel] = to[channel];
    if (to[channel] === undefined) to[channel] = from[channel];
  }

  const mixed = interpolateWithPremultipliedAlpha([from as unknown as Color, to as unknown as Color], mode, {
    h: { fixup: HUE_FIXUPS[hueMethod] },
  } as never)(p2 / sum) as unknown as Channels;

  for (const channel of missingInBoth) mixed[channel] = undefined;
  if (sum < 100) mixed.alpha = (mixed.alpha ?? 1) * (sum / 100);
  return mixed as unknown as Color;
}

const snap = (value: number, [min, max]: number[]): number => {
  if (value > max && value - max < EPSILON) return max;
  if (value < min && min - value < EPSILON) return min;
  return value;
};

/**
 * The W3C structured value of a culori colour, in the colour's own space:
 * `hsl`/`hwb` saturation, lightness, whiteness and blackness in 0–100, a hue
 * in [0, 360), a missing channel as `'none'`, alpha omitted at 1. A component
 * that float noise put a hair outside its range is snapped onto the bound.
 */
export function toColorValue(color: Color): ColorValue {
  const channels = color as unknown as Channels;
  const space = spaceOfMode(color.mode);
  if (!space) throw new Error(`culori mode '${color.mode}' has no W3C colour space.`);
  const definition = colorSpaces[space];

  const components = definition.components.map((channel, i): number | 'none' => {
    const raw = channels[channel];
    if (raw === undefined || Number.isNaN(raw)) return 'none';
    if (channel === 'h') return ((raw % 360) + 360) % 360;
    return snap(isScaledByHundred(space, channel) ? raw * 100 : raw, definition.ranges[i]);
  });

  const alpha = channels.alpha === undefined ? 1 : Math.min(1, Math.max(0, channels.alpha));
  return { colorSpace: space, components, ...(alpha < 1 ? { alpha } : {}) };
}

/**
 * The one bridge from the W3C structured shape to a culori colour: the space
 * by the registry, `hsl`/`hwb` channels from 0–100 to culori's 0–1, `'none'`
 * as a missing channel.
 */
export function toCuloriColor(value: ColorValue): Color {
  const definition = colorSpaces[value.colorSpace];
  if (!definition) {
    throw new Error(`Color space '${value.colorSpace}' is not supported.`);
  }
  if (!Array.isArray(value.components) || value.components.length !== definition.components.length) {
    throw new Error(`components must have ${definition.components.length} items for colorSpace '${value.colorSpace}'.`);
  }

  const color: Record<string, unknown> = { mode: definition.culoriFormat };
  definition.components.forEach((channel, i) => {
    const raw = value.components[i];
    if (raw === 'none') return;
    if (typeof raw !== 'number') {
      throw new Error(`Invalid color component at index ${i}. Expected number or 'none'.`);
    }
    color[channel] = isScaledByHundred(value.colorSpace, channel) ? raw / 100 : raw;
  });

  if (value.alpha !== undefined) {
    if (typeof value.alpha !== 'number') throw new Error('alpha must be a number.');
    color.alpha = value.alpha;
  }
  return color as unknown as Color;
}

/**
 * A structured colour spelled inside a string: its `hex` when it carries one
 * (the alpha byte appended only to a six-digit hex, so `transparent`'s
 * `#00000000` stays eight digits), otherwise CSS Color 4 syntax in its own
 * space. `parseCssColor(spellCssColor(c))` gives `c` back, within float tolerance.
 */
export function spellCssColor(value: ColorValue): string {
  const alpha = value.alpha ?? 1;
  if (value.hex && /^#[0-9a-f]{6}$/i.test(value.hex)) {
    return alpha < 1
      ? value.hex +
          Math.round(alpha * 255)
            .toString(16)
            .padStart(2, '0')
      : value.hex;
  }
  if (value.hex && /^#[0-9a-f]{8}$/i.test(value.hex)) return value.hex;
  return formatCss(toCuloriColor(value));
}

/** Whether a colour string is a hex or a named colour, the two spellings that are an sRGB hex. */
export function isHexOrNamed(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return lower.startsWith('#') || Object.prototype.hasOwnProperty.call(colorsNamed, lower);
}
