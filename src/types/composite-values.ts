export type DimensionUnit = 'px' | 'rem' | 'pt' | 'mm';

export interface DimensionValue {
  value: number;
  unit: DimensionUnit;
}

/** A typography `letterSpacing` may also be in `em`, a multiple of the text's own size. */
export interface LetterSpacingEmValue {
  value: number;
  unit: 'em';
}

export type LetterSpacingUnit = 'px' | 'rem' | 'em';

/** The value of a `letterSpacing` token: a length in `px`, `rem` or `em`. */
export interface LetterSpacingValue {
  value: number;
  unit: LetterSpacingUnit;
}

export interface ColorValue {
  colorSpace: string;
  components: (number | 'none')[];
  alpha?: number;
  /** W3C fallback: the colour as `#rrggbb`. Set when the token was written as a hex string. */
  hex?: string;
}

/**
 * A typography value as lib stores it, every member computed: `fontSize` and a length `lineHeight`
 * as `{ value, unit }`, `fontWeight` a number, a unitless `lineHeight` a number and a percentage one
 * the string `'150%'`, `letterSpacing` `{ value, unit }`.
 */
export interface TypographyValue {
  fontFamily: string | string[];
  fontSize: DimensionValue;
  fontWeight: number;
  lineHeight: number | string | DimensionValue;
  letterSpacing?: LetterSpacingValue;
  fontStyle?: string;
  textTransform?: string;
  textDecoration?: string;
  /** Any further CSS property, keyed in camelCase (`fontVariantNumeric`); a string or a number. */
  [property: string]: unknown;
}

/** One shadow as lib stores it, every member computed: a structured colour (or `'currentColor'`), lengths as `{ value, unit }`. */
export interface ShadowValue {
  color: ColorValue | 'currentColor';
  offsetX: DimensionValue;
  offsetY: DimensionValue;
  blur: DimensionValue;
  spread?: DimensionValue;
  inset?: boolean;
}

/** A gradient stop as lib stores it: its colour computed, its position in [0, 1]. */
export interface GradientStopValue {
  color: ColorValue | 'currentColor';
  position: number;
}

/** The W3C stroke style keywords (§9.2). */
export type StrokeStyleKeyword = 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'outset' | 'inset';

/** A stroke style: a keyword, or dashes (each a computed length) and their caps. */
export type StrokeStyleValue = StrokeStyleKeyword | { dashArray: DimensionValue[]; lineCap: 'round' | 'butt' | 'square' };

/** A border as lib stores it (W3C §9.3), every member computed. */
export interface BorderValue {
  color: ColorValue | 'currentColor';
  width: DimensionValue;
  style: StrokeStyleValue;
}

export type GradientKind = 'linear' | 'radial' | 'angular' | 'conic';

/**
 * A gradient in the W3C form: an array of stops and nothing else (§9.7).
 *
 * The spec has no place for a gradient *kind* or an angle, so a value in this
 * form is taken to be a linear gradient at 0deg.
 */
export type GradientStopsValue = GradientStopValue[];

/**
 * A gradient in Toghen's extended form.
 *
 * Retained because `type` and `radial`/`conic` gradients have no W3C
 * representation at all, and dropping them would lose expressiveness the spec
 * does not replace.
 */
export interface GradientObjectValue {
  type: GradientKind;
  /** Stored as a number of degrees; a reader also takes a string in `deg grad rad turn`. */
  angle?: string | number;
  stops: GradientStopValue[];
}

/**
 * Either gradient form.
 *
 * Both are accepted everywhere; use {@link normalizeGradient} rather than
 * reading `.type`/`.stops` directly, which is only valid for one of them.
 */
export type GradientValue = GradientStopsValue | GradientObjectValue;

/** A gradient reduced to one shape, with colours resolved to sRGB. */
export interface NormalizedGradient {
  type: GradientKind;
  angleDeg: number;
  stops: Array<{ color: NormalizedColorValue; position: number }>;
}

export interface NormalizedColorValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface NormalizedLineHeight {
  value: number;
  unit: 'px' | 'percent' | 'ratio';
}

export interface NormalizedShadow {
  color: NormalizedColorValue;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  inset: boolean;
}
