import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDimensionToPx, normalizeLineHeight } from '../../../src/index.js';

test('normalizeDimensionToPx', async (t) => {
  await t.test('reads the W3C object form and the string form alike', () => {
    assert.strictEqual(normalizeDimensionToPx({ value: 1.5, unit: 'rem' }), 24);
    assert.strictEqual(normalizeDimensionToPx('1.5rem'), 24);
    assert.strictEqual(normalizeDimensionToPx({ value: 2, unit: 'rem' }, 10), 20);
  });

  await t.test('computes calc(), min(), max(), clamp() and round(), rem at 16 inside the computation', () => {
    assert.strictEqual(normalizeDimensionToPx('calc(1rem + 2px)'), 18);
    assert.strictEqual(normalizeDimensionToPx('calc(1rem + 2px)', 10), 11.25);
    assert.strictEqual(normalizeDimensionToPx('max(1rem, 18pt)'), 24);
    assert.strictEqual(normalizeDimensionToPx('1e1px'), 10);
  });

  await t.test('keeps a unitless string in pixels, as it always has', () => {
    assert.strictEqual(normalizeDimensionToPx('16'), 16);
    assert.strictEqual(normalizeDimensionToPx('calc(2 * 8)'), 16);
  });

  await t.test('rejects what is not a dimension rather than guessing', () => {
    assert.throws(() => normalizeDimensionToPx(16 as never), /string or DimensionValue/);
    assert.throws(() => normalizeDimensionToPx('auto'), /Invalid dimension string: 'auto' cannot be computed/);
    assert.throws(() => normalizeDimensionToPx('8px 13px'), /not one dimension; leave the token untyped/);
    assert.throws(() => normalizeDimensionToPx('50%'), /a percentage needs a reference box/);
    assert.throws(() => normalizeDimensionToPx({ value: 1, unit: 'em' } as never), /Unsupported dimension unit 'em'/);
  });
});

test('normalizeLineHeight', async (t) => {
  await t.test('reads a W3C number as a multiplier', () => {
    assert.deepEqual(normalizeLineHeight(1.5), { value: 1.5, unit: 'ratio' });
  });

  await t.test('reads a length in object form, as it already read one in string form', () => {
    assert.deepEqual(normalizeLineHeight({ value: 24, unit: 'px' }), { value: 24, unit: 'px' });
    assert.deepEqual(normalizeLineHeight({ value: 1.5, unit: 'rem' }), normalizeLineHeight('1.5rem'));
    assert.deepEqual(normalizeLineHeight({ value: 2, unit: 'rem' }, 10), { value: 20, unit: 'px' });
  });

  await t.test('computes a string: a number, a percentage or a length', () => {
    assert.deepEqual(normalizeLineHeight('calc(1.25 * 1.2)'), { value: 1.5, unit: 'ratio' });
    assert.deepEqual(normalizeLineHeight('1.5'), { value: 1.5, unit: 'ratio' });
    assert.deepEqual(normalizeLineHeight('150%'), { value: 150, unit: 'percent' });
    assert.deepEqual(normalizeLineHeight('calc(100% + 25%)'), { value: 125, unit: 'percent' });
    assert.deepEqual(normalizeLineHeight('calc(1rem + 8px)'), { value: 24, unit: 'px' });
    assert.throws(() => normalizeLineHeight('1em'), /Invalid line height: '1em' cannot be computed: an em is a fraction/);
  });

  await t.test('rejects a length with an unknown unit', () => {
    assert.throws(() => normalizeLineHeight({ value: 1, unit: 'em' } as never), /Unsupported dimension unit 'em'/);
  });
});
