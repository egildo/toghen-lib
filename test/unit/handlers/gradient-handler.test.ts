import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradientHandler } from '../../../src/handlers/gradient-handler.js';
import { DesignToken } from '../../../src/core/design-token.js';

test('Gradient Handler Unit Tests', async (t) => {
  await t.test('Validation', async (t) => {
    await t.test('should not throw for a valid gradient token', () => {
      const token = new DesignToken(
        {
          type: 'linear',
          angle: '45deg',
          stops: [
            { color: '#ff0000', position: 0 },
            { color: '#0000ff', position: 1 },
          ],
        },
        'gradient',
      );

      assert.doesNotThrow(() => gradientHandler.validate?.(token, 'background.hero.gradient'));
    });

    await t.test('should throw when stop position is outside [0,1]', () => {
      const token = new DesignToken(
        {
          type: 'linear',
          stops: [{ color: '#ff0000', position: 1.2 }],
        },
        'gradient',
      );

      assert.throws(() => gradientHandler.validate?.(token, 'background.invalid.gradient'), /position must be between 0 and 1/);
    });
  });

  await t.test('Accessors', () => {
    const token = new DesignToken(
      {
        type: 'conic',
        angle: 120,
        stops: [
          { color: '#00ff00', position: 0.25 },
          { color: { colorSpace: 'srgb', components: [0, 0, 1], alpha: 0.5 }, position: 0.75 },
        ],
      },
      'gradient',
    );

    assert.strictEqual(gradientHandler.getType?.call(token), 'conic');
    assert.strictEqual(gradientHandler.getAngleDeg?.call(token), 120);

    const stops = gradientHandler.getStops?.call(token);
    assert.ok(stops);
    assert.strictEqual(stops!.length, 2);
    assert.strictEqual(stops![0].position, 0.25);
    assert.strictEqual(stops![1].color.b, 1);
    assert.strictEqual(stops![1].color.a, 0.5);
  });

  await t.test('reads an angle in any of deg, grad, rad and turn, calc() included, in degrees', () => {
    const at = (angle: string | number) =>
      gradientHandler.getAngleDeg?.call(
        new DesignToken(
          {
            type: 'linear',
            angle,
            stops: [
              { color: { colorSpace: 'srgb', components: [1, 0, 0] }, position: 0 },
              { color: { colorSpace: 'srgb', components: [0, 0, 1] }, position: 1 },
            ],
          },
          'gradient',
        ),
      );

    assert.strictEqual(at('0.25turn'), 90);
    assert.strictEqual(at('200grad'), 180);
    assert.strictEqual(at(`${Math.PI / 2}rad`), 90);
    assert.strictEqual(at('calc(90deg + 0.25turn)'), 180);
    assert.strictEqual(at(45), 45);
    assert.throws(() => at('1px'), /Invalid angle: an angle unit must be one of deg, grad, rad, turn, got 'px'/);
  });
});

test('gradientHandler.normalize stores every member computed (ruling 3a)', async (t) => {
  const red = { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' };

  await t.test('the W3C array form: each stop colour computed, kept an array', () => {
    assert.deepEqual(
      gradientHandler.normalize!(
        [
          { color: 'red', position: 0 },
          { color: { colorSpace: 'oklch', components: [0.5, 0.1, 250] }, position: 1 },
        ],
        'g',
      ),
      [
        { color: red, position: 0 },
        { color: { colorSpace: 'oklch', components: [0.5, 0.1, 250] }, position: 1 },
      ],
    );
  });

  await t.test('the object form: stops computed, the angle in degrees', () => {
    const value = gradientHandler.normalize!(
      {
        type: 'linear',
        angle: '0.25turn',
        stops: [
          { color: '#f00', position: 0 },
          { color: 'transparent', position: 1 },
        ],
      },
      'g',
    ) as any;
    assert.equal(value.type, 'linear');
    assert.equal(value.angle, 90);
    assert.deepEqual(value.stops[0].color, red);
    assert.equal(value.stops[1].color.alpha, 0);
    assert.equal((gradientHandler.normalize!({ type: 'radial', stops: [{ color: red, position: 0 }] }, 'g') as any).angle, undefined);
  });

  await t.test('an error names the member', () => {
    assert.throws(
      () =>
        gradientHandler.normalize!(
          [
            { color: '#f00', position: 0 },
            { color: 'reddish', position: 1 },
          ],
          'g',
        ),
      /Token "g": 1\.color: 'reddish' cannot be computed/,
    );
    assert.throws(
      () => gradientHandler.normalize!({ type: 'linear', stops: [{ color: 'var(--x)', position: 0 }] }, 'g'),
      /Token "g": stops\.0\.color: 'var\(--x\)' cannot be computed/,
    );
    assert.throws(
      () => gradientHandler.normalize!({ type: 'linear', angle: '1px', stops: [{ color: red, position: 0 }] }, 'g'),
      /Token "g": angle: Invalid angle/,
    );
  });
});
