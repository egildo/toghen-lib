import type { DimensionUnit, DimensionValue, LetterSpacingValue } from '../types/composite-values.js';

/**
 * The numeric family: one grammar for every length, letter spacing, angle, number and line
 * height lib holds, a plain `'16px'` and a `calc()` alike.
 *
 * It computes what CSS can compute without an element: `calc()`, `min()`, `max()`, `clamp()`
 * and `round()`, with `+ - * /` and parentheses, over the units the place takes. What needs the
 * element (`em` outside a letter spacing, `%` without a reference box, viewport, font and
 * container units, `var()`) is refused with a sentence, never guessed.
 *
 * Units: a computation in one unit keeps it (`calc(1rem + 0.5rem)` is `1.5rem`). Absolute units
 * mixed with each other reduce to `px` at 96 dpi. A `rem` mixed with absolute units is stored in
 * `rem`, each absolute length turned into px and divided by 16, lib's one assumption about the
 * root font size (`calc(1rem + 2px)` is `1.125rem`). An `em` mixes only with `em`. Angles are
 * stored in `deg`.
 *
 * Results are rounded to 10 decimal places, so float noise (`0.1 + 0.2`) is not stored.
 */
export type NumericKind = 'length' | 'letterSpacing' | 'angle' | 'number' | 'lineHeight';

/** Pixels per unit: absolute units at 96 dpi, `rem` at a root font size of 16px. */
export const PX_PER: Readonly<Record<DimensionUnit, number>> = { px: 1, rem: 16, pt: 96 / 72, mm: 96 / 25.4 };

const DEG_PER: Readonly<Record<string, number>> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

const KINDS: Readonly<Record<NumericKind, { noun: string; units: readonly string[] }>> = {
  length: { noun: 'dimension', units: ['px', 'rem', 'pt', 'mm'] },
  letterSpacing: { noun: 'letter spacing', units: ['px', 'rem', 'em'] },
  angle: { noun: 'angle', units: ['deg', 'grad', 'rad', 'turn'] },
  number: { noun: 'number', units: [] },
  lineHeight: { noun: 'line height', units: ['px', 'rem', 'pt', 'mm', '%'] },
};

const EM = 'an em is a fraction of the font size, which only the element has';
const VIEWPORT = 'a viewport unit is a fraction of the viewport, which only the page has';
const GLYPH = "it is measured on the font's glyphs, which only the element has";
const CONTAINER = 'a container unit is a fraction of a container, which only the page has';
const NEEDS_ELEMENT: Readonly<Record<string, string>> = {
  em: EM,
  vw: VIEWPORT,
  vh: VIEWPORT,
  vmin: VIEWPORT,
  vmax: VIEWPORT,
  ch: GLYPH,
  ex: GLYPH,
  cqw: CONTAINER,
  cqh: CONTAINER,
  cqi: CONTAINER,
  cqb: CONTAINER,
  cqmin: CONTAINER,
  cqmax: CONTAINER,
};

const FUNCTIONS = ['calc', 'min', 'max', 'clamp', 'round'];
const STRATEGIES = ['nearest', 'up', 'down', 'to-zero'];
const NUMBER = /^([+-]?)(\d*\.\d+|\d+)(e[+-]?\d+)?([a-z]+|%)?/;
const WORD = /^[a-z][a-z0-9-]*\(?/;

/** A quantity: `u` is `''` for a number, `'%'`, `'deg'` for any angle, or a length unit. */
type Q = { n: number; u: string };
type Token = { s: string } & ({ t: 'num'; q: Q } | { t: 'op' | '(' | ')' | ',' } | { t: 'fn' | 'word'; name: string });

const article = (noun: string) => (/^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`);
const category = (u: string) => (u === '' ? 'a number' : u === '%' ? 'a percentage' : u === 'deg' ? 'an angle' : 'a length');
const tidy = (n: number) => Number(n.toFixed(10)) + 0; // + 0 turns -0 into 0
/** `q` in `unit`; only lengths ever need converting, since every angle is already `deg`. */
const as = (q: Q, unit: string) => (q.u === unit ? q.n : (q.n * PX_PER[q.u as DimensionUnit]) / PX_PER[unit as DimensionUnit]);

/**
 * Computes a CSS numeric value for the place `kind` describes, or throws a sentence that names
 * the text and the reason.
 *
 * @returns A number for `number` (and a unitless `lineHeight`); otherwise `{ value, unit }`, an
 *   angle always in `deg`, a line height percentage with unit `'%'`
 * @throws {Error} When the text is not a value of the kind, or needs an element to compute
 *
 * @example
 * ```typescript
 * computeCssNumeric('calc(1rem + 2px)', 'length');   // → { value: 1.125, unit: 'rem' }
 * computeCssNumeric('calc(90deg + 0.25turn)', 'angle'); // → { value: 180, unit: 'deg' }
 * computeCssNumeric('calc(1.25 * 1.2)', 'lineHeight');  // → 1.5
 * ```
 */
export function computeCssNumeric(text: string, kind: 'length'): DimensionValue;
export function computeCssNumeric(text: string, kind: 'letterSpacing'): LetterSpacingValue;
export function computeCssNumeric(text: string, kind: 'angle'): { value: number; unit: 'deg' };
export function computeCssNumeric(text: string, kind: 'number'): number;
export function computeCssNumeric(text: string, kind: 'lineHeight'): number | { value: number; unit: DimensionUnit | '%' };
export function computeCssNumeric(text: string, kind: NumericKind): number | { value: number; unit: string };
export function computeCssNumeric(text: string, kind: NumericKind): number | { value: number; unit: string } {
  const { noun, units } = KINDS[kind];
  const fail = (reason: string): never => {
    throw new Error(`'${text}' cannot be computed: ${reason}.`);
  };

  const tokens = tokenize(text, kind, fail);
  let i = 0;
  const peek = (): Token | undefined => tokens[i];
  const unexpected = (tok: Token | undefined): never =>
    fail(!tok ? 'a parenthesis is not closed' : tok.t === ')' ? "a ')' closes nothing" : `unexpected '${tok.s}'`);
  const expect = (t: Token['t']) => {
    const tok = tokens[i++];
    if (tok?.t !== t) unexpected(tok);
  };

  const common = (a: string, b: string): string => {
    if (category(a) !== category(b)) fail(`cannot combine ${category(a)} with ${category(b)}`);
    if (a === b) return a;
    if (a === 'em' || b === 'em') fail(EM);
    return a === 'rem' || b === 'rem' ? 'rem' : 'px';
  };

  const primary = (): Q => {
    const tok = tokens[i++];
    if (!tok || tok.t === ')' || tok.t === ',') return fail('a value is missing');
    if (tok.t === 'num') return tok.q;
    if (tok.t === '(') {
      const q = sum();
      expect(')');
      return q;
    }
    if (tok.t === 'fn') return call(tok.name);
    if (tok.t === 'word') return fail(`'${tok.s}' is not a number, nor one of calc(), min(), max(), clamp(), round()`);
    return unexpected(tok);
  };

  const product = (): Q => {
    let a = primary();
    for (let tok = peek(); tok?.t === 'op' && (tok.s === '*' || tok.s === '/'); tok = peek()) {
      i++;
      const b = primary();
      if (tok.s === '*') {
        if (a.u && b.u) fail(`cannot multiply ${category(a.u)} by ${category(b.u)}: one of the two must be a number`);
        a = { n: a.n * b.n, u: a.u || b.u };
      } else {
        if (b.u) fail(`cannot divide by ${category(b.u)}: the divisor must be a number`);
        if (b.n === 0) fail('division by zero');
        a = { n: a.n / b.n, u: a.u };
      }
    }
    return a;
  };

  const sum = (): Q => {
    let a = product();
    for (let tok = peek(); tok?.t === 'op' && (tok.s === '+' || tok.s === '-'); tok = peek()) {
      i++;
      const b = product();
      const u = common(a.u, b.u);
      a = { n: tok.s === '+' ? as(a, u) + as(b, u) : as(a, u) - as(b, u), u };
    }
    return a;
  };

  const call = (name: string): Q => {
    if (name === 'calc') {
      const q = sum();
      expect(')');
      return q;
    }

    if (name === 'round') {
      let strategy = 'nearest';
      const first = peek();
      if (first?.t === 'word') {
        i++;
        if (!STRATEGIES.includes(first.name)) fail(`round() rounds nearest, up, down or to-zero, got '${first.name}'`);
        strategy = first.name;
        expect(',');
      }
      const a = sum();
      const b = peek()?.t === ',' ? (i++, sum()) : a.u === '' ? { n: 1, u: '' } : fail('round() of a value with a unit needs a step');
      expect(')');
      const u = common(a.u, b.u);
      const step = Math.abs(as(b, u));
      if (step === 0) fail('round() cannot round to a step of zero');
      const x = tidy(as(a, u) / step);
      const k =
        strategy === 'up'
          ? Math.ceil(x)
          : strategy === 'down'
            ? Math.floor(x)
            : strategy === 'to-zero'
              ? Math.trunc(x)
              : Math.floor(x + 0.5);
      return { n: k * step, u };
    }

    const args = [sum()];
    while (peek()?.t === ',') {
      i++;
      args.push(sum());
    }
    expect(')');
    if (name === 'clamp' && args.length !== 3) fail(`clamp() takes three values, got ${args.length}`);
    const u = args.reduce((unit, q) => common(unit, q.u), args[0].u);
    const ns = args.map((q) => as(q, u));
    const n = name === 'min' ? Math.min(...ns) : name === 'max' ? Math.max(...ns) : Math.max(ns[0], Math.min(ns[1], ns[2]));
    return { n, u };
  };

  if (tokens.length === 0) fail('it is empty');
  const { n, u } = primary();
  if (i < tokens.length) {
    const tok = tokens[i];
    if (tok.t === 'num' || tok.t === 'fn' || tok.t === '(') {
      fail(`it is a list of values, not one ${noun}; leave the token untyped to keep it as written`);
    }
    if (tok.t === 'op') fail('an operator outside a function; write it inside calc()');
    unexpected(tok);
  }
  if (!Number.isFinite(n)) fail('the result is not a finite number');

  const value = tidy(n);
  // CSS reads a bare zero as a length (`0` is `0px`), the one number a length may be written as.
  if (u === '' && value === 0 && (kind === 'length' || kind === 'letterSpacing')) return { value: 0, unit: 'px' };
  if (u === '' && (kind === 'length' || kind === 'letterSpacing')) {
    throw new Error(`${article(noun)} string must be a number and a unit (${units.join(', ')}), got '${text}'.`);
  }
  if (u === '' && kind !== 'angle') return value;
  return { value, unit: u === '' ? 'deg' : u };
}

/** The tokens of `text`, each unit checked against what `kind` takes. */
function tokenize(text: string, kind: NumericKind, fail: (reason: string) => never): Token[] {
  const { noun, units } = KINDS[kind];
  const src = text.trim().toLowerCase();
  const tokens: Token[] = [];

  for (let i = 0; i < src.length; ) {
    const rest = src.slice(i);
    const prev = tokens[tokens.length - 1];
    const number = NUMBER.exec(rest);
    // A sign belongs to the number only where an operand starts; elsewhere it is an operator.
    if (number && (!number[1] || !prev || (prev.t !== 'num' && prev.t !== ')'))) {
      const n = Number(number[1] + number[2] + (number[3] ?? ''));
      tokens.push({ t: 'num', s: number[0], q: quantity(n, number[4] ?? '') });
      i += number[0].length;
      continue;
    }

    const word = WORD.exec(rest);
    if (word) {
      const s = word[0];
      if (s.endsWith('(')) {
        const name = s.slice(0, -1);
        if (name === 'var') fail('a custom property has no value outside the page');
        if (!FUNCTIONS.includes(name)) fail(`${name}() is not computed; only calc(), min(), max(), clamp() and round() are`);
        tokens.push({ t: 'fn', s, name });
      } else {
        tokens.push({ t: 'word', s, name: s });
      }
      i += s.length;
      continue;
    }

    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if ('+-*/'.includes(c)) tokens.push({ t: 'op', s: c });
    else if (c === '(' || c === ')' || c === ',') tokens.push({ t: c, s: c });
    else fail(`unexpected '${c}'`);
    i++;
  }
  return tokens;

  function quantity(n: number, unit: string): Q {
    if (!Number.isFinite(n)) fail('a number is too large');
    if (unit === '') return { n, u: '' };
    if (unit === 'em' && kind === 'letterSpacing') return { n, u: unit };
    if (NEEDS_ELEMENT[unit]) fail(NEEDS_ELEMENT[unit]);
    if (unit === '%' && kind !== 'lineHeight') fail('a percentage needs a reference box, which only the element has');
    if (!units.includes(unit)) {
      throw new Error(
        kind === 'number'
          ? `a number takes no unit, got '${unit}' in '${text}'.`
          : `${article(noun)} unit must be one of ${units.join(', ')}, got '${unit}' in '${text}'.`,
      );
    }
    return kind === 'angle' ? { n: n * DEG_PER[unit], u: 'deg' } : { n, u: unit };
  }
}
