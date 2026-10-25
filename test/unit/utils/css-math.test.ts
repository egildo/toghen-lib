import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeCssNumeric, type NumericKind } from '../../../src/utils/css-math.js';

const refused = (text: string, kind: NumericKind, reason: string) =>
  assert.throws(() => computeCssNumeric(text, kind), { message: `'${text}' cannot be computed: ${reason}.` });

describe('computeCssNumeric: plain values go through the same grammar', () => {
  it('reads a number and a unit, with a sign and an exponent', () => {
    assert.deepEqual(computeCssNumeric('16px', 'length'), { value: 16, unit: 'px' });
    assert.deepEqual(computeCssNumeric('-0.5rem', 'length'), { value: -0.5, unit: 'rem' });
    assert.deepEqual(computeCssNumeric('+2pt', 'length'), { value: 2, unit: 'pt' });
    assert.deepEqual(computeCssNumeric('1e1px', 'length'), { value: 10, unit: 'px' });
    assert.deepEqual(computeCssNumeric('2.5E-1mm', 'length'), { value: 0.25, unit: 'mm' });
    assert.deepEqual(computeCssNumeric('.5REM', 'length'), { value: 0.5, unit: 'rem' });
    assert.deepEqual(computeCssNumeric('1em', 'letterSpacing'), { value: 1, unit: 'em' });
    assert.equal(computeCssNumeric('-3', 'number'), -3);
  });
});

describe('computeCssNumeric: lengths', () => {
  it('reads a bare zero as 0px, as CSS reads it, and refuses any other bare number', () => {
    assert.deepEqual(computeCssNumeric('0', 'length'), { value: 0, unit: 'px' });
    assert.deepEqual(computeCssNumeric('-0', 'letterSpacing'), { value: 0, unit: 'px' });
    assert.throws(() => computeCssNumeric('2', 'length'), /a dimension string must be a number and a unit/);
  });

  it('keeps the unit of a computation in one unit', () => {
    assert.deepEqual(computeCssNumeric('calc(1rem + 0.5rem)', 'length'), { value: 1.5, unit: 'rem' });
    assert.deepEqual(computeCssNumeric('calc(2mm * 3)', 'length'), { value: 6, unit: 'mm' });
    assert.deepEqual(computeCssNumeric('min(4pt, 2pt)', 'length'), { value: 2, unit: 'pt' });
  });

  it('reduces absolute units mixed with each other to px', () => {
    assert.deepEqual(computeCssNumeric('calc(12pt + 4px)', 'length'), { value: 20, unit: 'px' });
    assert.deepEqual(computeCssNumeric('max(25.4mm, 90px)', 'length'), { value: 96, unit: 'px' });
  });

  it('stores rem mixed with absolute units in rem, each px divided by 16 (ruling 2b)', () => {
    assert.deepEqual(computeCssNumeric('calc(1rem + 2px)', 'length'), { value: 1.125, unit: 'rem' });
    assert.deepEqual(computeCssNumeric('max(1rem, 12pt)', 'length'), { value: 1, unit: 'rem' });
    assert.deepEqual(computeCssNumeric('max(1rem, 18pt)', 'length'), { value: 1.5, unit: 'rem' });
    assert.deepEqual(computeCssNumeric('calc(2px - 1rem)', 'length'), { value: -0.875, unit: 'rem' });
  });

  it('computes min, max and clamp', () => {
    assert.deepEqual(computeCssNumeric('min(10px, 4px, 6px)', 'length'), { value: 4, unit: 'px' });
    assert.deepEqual(computeCssNumeric('max(10px, 4px)', 'length'), { value: 10, unit: 'px' });
    assert.deepEqual(computeCssNumeric('clamp(1rem, 40px, 2rem)', 'length'), { value: 2, unit: 'rem' });
    assert.deepEqual(computeCssNumeric('clamp(1rem, 4px, 2rem)', 'length'), { value: 1, unit: 'rem' });
    assert.deepEqual(computeCssNumeric('clamp(1rem, 20px, 2rem)', 'length'), { value: 1.25, unit: 'rem' });
  });

  it('nests functions and parentheses, with precedence and signed operands', () => {
    assert.deepEqual(computeCssNumeric('calc((1px + 2px) * 2)', 'length'), { value: 6, unit: 'px' });
    assert.deepEqual(computeCssNumeric('calc(1px + 2px * 2)', 'length'), { value: 5, unit: 'px' });
    assert.deepEqual(computeCssNumeric('calc(min(1px, 2px) * (2 + 1))', 'length'), { value: 3, unit: 'px' });
    assert.deepEqual(computeCssNumeric('max(calc(1rem / 2), min(4px, 6px))', 'length'), { value: 0.5, unit: 'rem' });
    assert.deepEqual(computeCssNumeric('calc(1px - -2px)', 'length'), { value: 3, unit: 'px' });
    assert.deepEqual(computeCssNumeric('calc(-1e1px / 4)', 'length'), { value: -2.5, unit: 'px' });
  });

  it('rounds with every strategy, nearest by default and ties upwards', () => {
    assert.deepEqual(computeCssNumeric('round(17px, 4px)', 'length'), { value: 16, unit: 'px' });
    assert.deepEqual(computeCssNumeric('round(nearest, 18px, 4px)', 'length'), { value: 20, unit: 'px' });
    assert.deepEqual(computeCssNumeric('round(up, 13px, 4px)', 'length'), { value: 16, unit: 'px' });
    assert.deepEqual(computeCssNumeric('round(down, 15px, 4px)', 'length'), { value: 12, unit: 'px' });
    assert.deepEqual(computeCssNumeric('round(down, -13px, 4px)', 'length'), { value: -16, unit: 'px' });
    assert.deepEqual(computeCssNumeric('round(to-zero, -13px, 4px)', 'length'), { value: -12, unit: 'px' });
    assert.deepEqual(computeCssNumeric('round(up, 1.1rem, 4px)', 'length'), { value: 1.25, unit: 'rem' });
    assert.equal(computeCssNumeric('round(2.5)', 'number'), 3);
    assert.deepEqual(computeCssNumeric('round(down, 0.3px, 0.1px)', 'length'), { value: 0.3, unit: 'px' });
  });

  it('rounds off float noise to 10 decimal places', () => {
    assert.deepEqual(computeCssNumeric('calc(0.1px + 0.2px)', 'length'), { value: 0.3, unit: 'px' });
    assert.deepEqual(computeCssNumeric('calc(1pt + 1px)', 'length'), { value: 2.3333333333, unit: 'px' });
  });
});

describe('computeCssNumeric: letter spacing, angles, numbers, line heights', () => {
  it('computes em with em only', () => {
    assert.deepEqual(computeCssNumeric('calc(0.1em - 0.02em)', 'letterSpacing'), { value: 0.08, unit: 'em' });
    assert.deepEqual(computeCssNumeric('calc(1rem + 2px)', 'letterSpacing'), { value: 1.125, unit: 'rem' });
  });

  it('stores an angle in deg from any of the four units', () => {
    assert.deepEqual(computeCssNumeric('45deg', 'angle'), { value: 45, unit: 'deg' });
    assert.deepEqual(computeCssNumeric('200grad', 'angle'), { value: 180, unit: 'deg' });
    assert.deepEqual(computeCssNumeric('3.141592653589793rad', 'angle'), { value: 180, unit: 'deg' });
    assert.deepEqual(computeCssNumeric('0.25turn', 'angle'), { value: 90, unit: 'deg' });
    assert.deepEqual(computeCssNumeric('calc(90deg + 0.25turn)', 'angle'), { value: 180, unit: 'deg' });
    assert.deepEqual(computeCssNumeric('45', 'angle'), { value: 45, unit: 'deg' });
  });

  it('computes a number and a line height', () => {
    assert.equal(computeCssNumeric('calc(2 * 3 + 1)', 'number'), 7);
    assert.equal(computeCssNumeric('calc(1.25 * 1.2)', 'lineHeight'), 1.5);
    assert.deepEqual(computeCssNumeric('calc(100% + 20%)', 'lineHeight'), { value: 120, unit: '%' });
    assert.deepEqual(computeCssNumeric('calc(1rem + 8px)', 'lineHeight'), { value: 1.5, unit: 'rem' });
  });
});

describe('computeCssNumeric: refusals, each with its sentence', () => {
  it('refuses what needs the element, the page or the viewport', () => {
    refused('1em', 'length', 'an em is a fraction of the font size, which only the element has');
    refused('calc(1em + 2px)', 'letterSpacing', 'an em is a fraction of the font size, which only the element has');
    refused('calc(1em + 1rem)', 'letterSpacing', 'an em is a fraction of the font size, which only the element has');
    refused('50%', 'length', 'a percentage needs a reference box, which only the element has');
    refused('10%', 'angle', 'a percentage needs a reference box, which only the element has');
    for (const unit of ['vw', 'vh', 'vmin', 'vmax']) {
      refused(`10${unit}`, 'length', 'a viewport unit is a fraction of the viewport, which only the page has');
    }
    refused('2ch', 'length', "it is measured on the font's glyphs, which only the element has");
    refused('1ex', 'length', "it is measured on the font's glyphs, which only the element has");
    refused('calc(5cqw + 1px)', 'length', 'a container unit is a fraction of a container, which only the page has');
    refused('var(--space)', 'length', 'a custom property has no value outside the page');
    refused('calc(var(--space) * 2)', 'length', 'a custom property has no value outside the page');
  });

  it('refuses arithmetic CSS has no type for', () => {
    refused('calc(1px * 2px)', 'length', 'cannot multiply a length by a length: one of the two must be a number');
    refused('calc(4px / 2px)', 'length', 'cannot divide by a length: the divisor must be a number');
    refused('calc(4px / 0)', 'length', 'division by zero');
    refused('calc(45deg + 10)', 'angle', 'cannot combine an angle with a number');
    refused('calc(150% + 1px)', 'lineHeight', 'cannot combine a percentage with a length');
    refused('calc(1.5 + 2px)', 'lineHeight', 'cannot combine a number with a length');
    refused('round(1px)', 'length', 'round() of a value with a unit needs a step');
    refused('round(5px, 0px)', 'length', 'round() cannot round to a step of zero');
    refused('round(sideways, 1px, 2px)', 'length', "round() rounds nearest, up, down or to-zero, got 'sideways'");
    refused('clamp(1px, 2px)', 'length', 'clamp() takes three values, got 2');
  });

  it('refuses a unit the kind does not take, and a missing unit', () => {
    assert.throws(() => computeCssNumeric('1deg', 'length'), {
      message: "a dimension unit must be one of px, rem, pt, mm, got 'deg' in '1deg'.",
    });
    assert.throws(() => computeCssNumeric('1in', 'length'), {
      message: "a dimension unit must be one of px, rem, pt, mm, got 'in' in '1in'.",
    });
    assert.throws(() => computeCssNumeric('1pt', 'letterSpacing'), {
      message: "a letter spacing unit must be one of px, rem, em, got 'pt' in '1pt'.",
    });
    assert.throws(() => computeCssNumeric('1px', 'angle'), {
      message: "an angle unit must be one of deg, grad, rad, turn, got 'px' in '1px'.",
    });
    assert.throws(() => computeCssNumeric('2px', 'number'), { message: "a number takes no unit, got 'px' in '2px'." });
    assert.throws(() => computeCssNumeric('24', 'length'), {
      message: "a dimension string must be a number and a unit (px, rem, pt, mm), got '24'.",
    });
    assert.throws(() => computeCssNumeric('calc(2 * 3)', 'letterSpacing'), {
      message: "a letter spacing string must be a number and a unit (px, rem, em), got 'calc(2 * 3)'.",
    });
  });

  it('refuses any function outside the five, and words', () => {
    refused('env(safe-area-inset-top)', 'length', 'env() is not computed; only calc(), min(), max(), clamp() and round() are');
    refused('calc(mod(5px, 2px))', 'length', 'mod() is not computed; only calc(), min(), max(), clamp() and round() are');
    refused('auto', 'length', "'auto' is not a number, nor one of calc(), min(), max(), clamp(), round()");
  });

  it('refuses mismatched parentheses and broken syntax', () => {
    refused('calc(1px + 2px', 'length', 'a parenthesis is not closed');
    refused('calc((1px + 2px)', 'length', 'a parenthesis is not closed');
    refused('calc(1px))', 'length', "a ')' closes nothing");
    refused('calc(1px +)', 'length', 'a value is missing');
    refused('min(1px, )', 'length', 'a value is missing');
    refused('calc(1px 2px)', 'length', "unexpected '2px'");
    refused('1px + 2px', 'length', 'an operator outside a function; write it inside calc()');
    refused('1px; 2px', 'length', "unexpected ';'");
    refused('', 'length', 'it is empty');
  });

  it('refuses a space-separated list: it is not one dimension (ruling 5a)', () => {
    refused('8px 13px', 'length', 'it is a list of values, not one dimension; leave the token untyped to keep it as written');
    refused('0 1px 2px 3px', 'length', 'it is a list of values, not one dimension; leave the token untyped to keep it as written');
  });
});
