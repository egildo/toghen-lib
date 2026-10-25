import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeColorToSRGB01 } from '../../../src/utils/normalize-color.js';

const approx = (actual: number, expected: number, epsilon = 0.005): void => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
};

test('normalizeColorToSRGB01', async (t) => {
  await t.test('normalizes hex colors', () => {
    const color = normalizeColorToSRGB01('#336699');
    approx(color.r, 0.2);
    approx(color.g, 0.4);
    approx(color.b, 0.6);
    assert.strictEqual(color.a, 1);
  });

  await t.test('normalizes hex colors with alpha', () => {
    const color = normalizeColorToSRGB01('#33669980');
    approx(color.r, 0.2);
    approx(color.g, 0.4);
    approx(color.b, 0.6);
    approx(color.a, 0.5, 0.01);
  });

  await t.test('normalizes structured srgb colors', () => {
    const color = normalizeColorToSRGB01({ colorSpace: 'srgb', components: [1, 0, 0], alpha: 0.25 });
    assert.deepEqual(color, { r: 1, g: 0, b: 0, a: 0.25 });
  });

  await t.test('normalizes structured hsl colors (percentage channels)', () => {
    const color = normalizeColorToSRGB01({ colorSpace: 'hsl', components: [120, 100, 50] });
    approx(color.r, 0);
    approx(color.g, 1);
    approx(color.b, 0);
  });

  await t.test('reads every colour string the load gate accepts', () => {
    assert.deepEqual(normalizeColorToSRGB01('red'), { r: 1, g: 0, b: 0, a: 1 });
    assert.deepEqual(normalizeColorToSRGB01('Transparent'), { r: 0, g: 0, b: 0, a: 0 });
    const hsl = normalizeColorToSRGB01('hsl(120 100% 50% / 0.5)');
    approx(hsl.r, 0);
    approx(hsl.g, 1);
    approx(hsl.a, 0.5);
  });

  await t.test('computes a color-mix() string, with premultiplied alpha', () => {
    const color = normalizeColorToSRGB01('color-mix(in srgb, #112233 5%, transparent)');
    approx(color.r, 0x11 / 255, 1e-9);
    approx(color.g, 0x22 / 255, 1e-9);
    approx(color.b, 0x33 / 255, 1e-9);
    approx(color.a, 0.05, 1e-9);
  });

  await t.test('throws the gate sentence for a string it cannot compute', () => {
    assert.throws(() => normalizeColorToSRGB01('currentColor'), {
      message: "'currentColor' cannot be computed: currentColor has no value until an element uses it.",
    });
    assert.throws(() => normalizeColorToSRGB01('bogus'), { message: "'bogus' cannot be computed: it is not a CSS colour." });
  });

  await t.test('reads srgb-linear as linear light, not gamma-encoded', () => {
    const color = normalizeColorToSRGB01({ colorSpace: 'srgb-linear', components: [0.5, 0.5, 0.5] });
    approx(color.r, 0.735);
    approx(color.g, 0.735);
    approx(color.b, 0.735);
  });

  await t.test('clamps a structured colour outside sRGB into the gamut', () => {
    const color = normalizeColorToSRGB01({ colorSpace: 'display-p3', components: [1, 0, 0] });
    assert.equal(color.r, 1);
    assert.equal(color.g, 0);
    assert.equal(color.b, 0);
  });

  await t.test('throws for unsupported color spaces', () => {
    assert.throws(() => normalizeColorToSRGB01({ colorSpace: 'foo', components: [0, 0, 0] }), /Color space 'foo' is not supported/);
  });
});
