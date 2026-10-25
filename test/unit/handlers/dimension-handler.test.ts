import { test } from 'node:test';
import assert from 'node:assert';
import { dimensionHandler } from '../../../src/handlers/dimension-handler.js';
import { DesignToken } from '../../../src/core/design-token.js';

test('Dimension Handler Unit Tests', async (t) => {
  await t.test('Validation', async (t) => {
    await t.test('should not throw for a valid token', () => {
      const validToken = new DesignToken({ value: 16, unit: 'px' }, 'dimension');
      assert.doesNotThrow(() => dimensionHandler.validate?.(validToken, 'test.path'));
    });

    await t.test('should throw for an invalid unit', () => {
      const token = new DesignToken({ value: 16, unit: 'em' }, 'dimension');
      assert.throws(() => dimensionHandler.validate?.(token, 'test.path'), /unit must be one of 'px', 'rem', 'pt', or 'mm'/);
    });

    await t.test('should throw for a non-numeric value', () => {
      const token = new DesignToken({ value: '16', unit: 'px' }, 'dimension');
      assert.throws(() => dimensionHandler.validate?.(token, 'test.path'), /value must be a finite number/);
    });
  });

  await t.test('Normalization', async (t) => {
    await t.test('computes a string into the structured shape', () => {
      assert.deepEqual(dimensionHandler.normalize?.('24px', 'space.md'), { value: 24, unit: 'px' });
      assert.deepEqual(dimensionHandler.normalize?.('-0.5rem', 'space.md'), { value: -0.5, unit: 'rem' });
      assert.deepEqual(dimensionHandler.normalize?.('calc(1rem + 0.5rem)', 'space.md'), { value: 1.5, unit: 'rem' });
      assert.deepEqual(dimensionHandler.normalize?.('calc(1rem + 2px)', 'space.md'), { value: 1.125, unit: 'rem' });
      assert.deepEqual(dimensionHandler.normalize?.('calc(12pt + 4px)', 'space.md'), { value: 20, unit: 'px' });
      assert.deepEqual(dimensionHandler.normalize?.('clamp(4px, 0.5rem, 12px)', 'space.md'), { value: 0.5, unit: 'rem' });
    });

    await t.test('keeps a structured dimension as written', () => {
      const value = { value: 1.5, unit: 'rem' };
      assert.strictEqual(dimensionHandler.normalize?.(value, 'space.md'), value);
    });

    await t.test('refuses, naming the token and the reason', () => {
      assert.throws(() => dimensionHandler.normalize?.('calc(1em + 2px)', 'space.md'), {
        message:
          'Token "space.md": \'calc(1em + 2px)\' cannot be computed: an em is a fraction of the font size, which only the element has.',
      });
      assert.throws(
        () => dimensionHandler.normalize?.('24', 'space.md'),
        /Token "space\.md": a dimension string must be a number and a unit/,
      );
    });

    await t.test('refuses a space-separated list: it is not one dimension (ruling 5a)', () => {
      assert.throws(() => dimensionHandler.normalize?.('8px 13px', 'space.inset'), {
        message:
          'Token "space.inset": \'8px 13px\' cannot be computed: it is a list of values, not one dimension; leave the token untyped to keep it as written.',
      });
    });
  });

  await t.test('Conversions', async (t) => {
    await t.test('toString() should return the correct string', () => {
      const token = new DesignToken({ value: 1.5, unit: 'rem' }, 'dimension');
      const str = dimensionHandler.toString?.call(token);
      assert.strictEqual(str, '1.5rem');
    });

    await t.test('toPx() should correctly convert from all units', () => {
      const pxToken = new DesignToken({ value: 16, unit: 'px' }, 'dimension');
      const remToken = new DesignToken({ value: 1, unit: 'rem' }, 'dimension');
      const ptToken = new DesignToken({ value: 12, unit: 'pt' }, 'dimension');
      const mmToken = new DesignToken({ value: 1, unit: 'mm' }, 'dimension');

      assert.strictEqual(dimensionHandler.toPx?.call(pxToken), 16);
      assert.strictEqual(dimensionHandler.toPx?.call(remToken), 16);
      assert.strictEqual(dimensionHandler.toPx?.call(ptToken), 16);
      assert.ok(Math.abs(dimensionHandler.toPx!.call(mmToken) - 3.78) < 0.01);
    });

    await t.test('toRem() should correctly convert from all units', () => {
      const pxToken = new DesignToken({ value: 16, unit: 'px' }, 'dimension');
      const remToken = new DesignToken({ value: 1, unit: 'rem' }, 'dimension');

      assert.strictEqual(dimensionHandler.toRem?.call(pxToken), 1);
      assert.strictEqual(dimensionHandler.toRem?.call(remToken), 1);
    });

    await t.test('toPt() should correctly convert from all units', () => {
      const pxToken = new DesignToken({ value: 16, unit: 'px' }, 'dimension');
      const ptToken = new DesignToken({ value: 12, unit: 'pt' }, 'dimension');

      assert.strictEqual(dimensionHandler.toPt?.call(pxToken), 12);
      assert.strictEqual(dimensionHandler.toPt?.call(ptToken), 12);
    });

    await t.test('toMm() should correctly convert from all units', () => {
      const pxToken = new DesignToken({ value: 3.78, unit: 'px' }, 'dimension');
      const mmToken = new DesignToken({ value: 1, unit: 'mm' }, 'dimension');

      assert.ok(Math.abs(dimensionHandler.toMm!.call(pxToken) - 1) < 0.01);
      assert.strictEqual(dimensionHandler.toMm?.call(mmToken), 1);
    });
  });
});
