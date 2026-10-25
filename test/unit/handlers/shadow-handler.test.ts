import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shadowHandler } from '../../../src/handlers/shadow-handler.js';
import { DesignToken } from '../../../src/core/design-token.js';
import type { NormalizedShadow } from '../../../src/types/composite-values.js';

test('Shadow Handler Unit Tests', async (t) => {
  await t.test('Validation', async (t) => {
    await t.test('should not throw for a valid single shadow token', () => {
      const token = new DesignToken(
        {
          color: '#00000080',
          offsetX: '0px',
          offsetY: '4px',
          blur: '12px',
        },
        'shadow',
      );

      assert.doesNotThrow(() => shadowHandler.validate?.(token, 'effects.shadow.md'));
    });

    await t.test('should throw for invalid color', () => {
      const token = new DesignToken(
        {
          color: 'not-a-colour',
          offsetX: '0px',
          offsetY: '4px',
          blur: '12px',
        },
        'shadow',
      );

      assert.throws(
        () => shadowHandler.validate?.(token, 'effects.shadow.invalid'),
        /Token "effects\.shadow\.invalid": color: 'not-a-colour' cannot be computed: it is not a CSS colour/,
      );
    });
  });

  await t.test('getShadows()', () => {
    const token = new DesignToken(
      [
        {
          color: '#00000040',
          offsetX: '0px',
          offsetY: '2px',
          blur: '8px',
          spread: '1px',
          inset: false,
        },
        {
          color: { colorSpace: 'srgb', components: [1, 0, 0], alpha: 0.5 },
          offsetX: { value: 1, unit: 'rem' },
          offsetY: { value: 0, unit: 'px' },
          blur: { value: 0, unit: 'px' },
          inset: true,
        },
      ],
      'shadow',
    );

    const shadows = shadowHandler.getShadows?.call(token);
    assert.ok(shadows);
    assert.strictEqual(shadows!.length, 2);

    assert.strictEqual(shadows![0].offsetY, 2);
    assert.strictEqual(shadows![0].spread, 1);
    assert.strictEqual(shadows![0].inset, false);

    assert.strictEqual(shadows![1].offsetX, 16);
    assert.strictEqual(shadows![1].inset, true);
    assert.strictEqual(shadows![1].color.r, 1);
  });

  await t.test('two layers, every member in the structured shape', () => {
    const layer = (alpha: number, y: number, blur: number, spread: number) => ({
      color: { colorSpace: 'srgb', components: [0, 0, 0], alpha },
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: y, unit: 'px' },
      blur: { value: blur, unit: 'px' },
      spread: { value: spread, unit: 'px' },
    });
    const token = new DesignToken([layer(0.14, 4, 16, 0), layer(0.06, 0, 0, 1)], 'shadow');

    assert.doesNotThrow(() => shadowHandler.validate?.(token, 'shadow.pop'));
    const shadows = shadowHandler.getShadows!.call(token);
    assert.deepStrictEqual(
      shadows.map((s: NormalizedShadow) => [s.offsetY, s.blur, s.spread, s.color.a]),
      [
        [4, 16, 0, 0.14],
        [0, 0, 1, 0.06],
      ],
    );
  });
});

test('shadowHandler.normalize stores every member computed (ruling 3a)', async (t) => {
  const px = (value: number) => ({ value, unit: 'px' });

  await t.test('plain strings become a structured colour and { value, unit } lengths', () => {
    assert.deepEqual(
      shadowHandler.normalize!(
        { color: '#abc', offsetX: '0px', offsetY: '0.25rem', blur: 'calc(2px * 4)', spread: '1px', inset: true },
        'shadow.md',
      ),
      {
        color: { colorSpace: 'srgb', components: [0xaa / 255, 0xbb / 255, 0xcc / 255], hex: '#aabbcc' },
        offsetX: px(0),
        offsetY: { value: 0.25, unit: 'rem' },
        blur: px(8),
        spread: px(1),
        inset: true,
      },
    );
  });

  await t.test('the structured shapes are kept, spread left out when absent', () => {
    const value = { color: { colorSpace: 'oklch', components: [0.5, 0.1, 250], alpha: 0.2 }, offsetX: px(0), offsetY: px(2), blur: px(4) };
    assert.deepEqual(shadowHandler.normalize!(value, 'shadow.md'), value);
  });

  await t.test('computes a color-mix(), takes transparent and named colours, keeps currentColor', () => {
    const at = (color: string) => (shadowHandler.normalize!([{ color, offsetX: px(0), offsetY: px(1), blur: px(2) }], 's') as any)[0].color;
    const mixed = at('color-mix(in srgb, #112233 5%, transparent)');
    assert.equal(mixed.colorSpace, 'srgb');
    assert.ok(Math.abs(mixed.alpha - 0.05) < 1e-9);
    assert.deepEqual(
      mixed.components.map((c: number) => Math.round(c * 255)),
      [0x11, 0x22, 0x33],
    );
    assert.deepEqual(at('transparent'), { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0, hex: '#00000000' });
    assert.deepEqual(at('Navy'), { colorSpace: 'srgb', components: [0, 0, 128 / 255], hex: '#000080' });
    assert.equal(at('currentColor'), 'currentColor');
  });

  await t.test('an error names the member, and its index in an array', () => {
    const ok = { color: '#000', offsetX: '0px', offsetY: '1px', blur: '2px' };
    assert.throws(
      () => shadowHandler.normalize!([ok, { ...ok, blur: '2em' }], 'shadow.md'),
      /Token "shadow\.md": 1\.blur: '2em' cannot be computed: an em is a fraction of the font size/,
    );
    assert.throws(
      () => shadowHandler.normalize!({ ...ok, offsetX: '4' }, 'shadow.md'),
      /Token "shadow\.md": offsetX: a dimension string must be a number and a unit/,
    );
    assert.throws(() => shadowHandler.normalize!([], 'shadow.md'), /a shadow array cannot be empty/);
    assert.throws(() => shadowHandler.normalize!({ ...ok, inset: 'yes' }, 'shadow.md'), /inset must be a boolean/);
  });
});
