import { test } from 'node:test';
import assert from 'node:assert';
import { colorHandler } from '../../../src/handlers/color-handler.js';
import { DesignToken } from '../../../src/core/design-token.js';

test('Color Handler Unit Tests', async (t) => {
  await t.test('Validation', async (t) => {
    await t.test('should not throw for a valid token', () => {
      const validToken = new DesignToken({ colorSpace: 'srgb', components: [0, 0, 1] }, 'color');
      assert.doesNotThrow(() => colorHandler.validate?.(validToken, 'test.path'));
    });

    await t.test('should throw for an invalid colorSpace', () => {
      const token = new DesignToken({ colorSpace: 'invalid', components: [0, 0, 1] }, 'color');
      assert.throws(() => colorHandler.validate?.(token, 'test.path'), /colorSpace 'invalid' is invalid or not supported/);
    });

    await t.test('should throw for incorrect component count', () => {
      const token = new DesignToken({ colorSpace: 'srgb', components: [0, 1] }, 'color');
      assert.throws(() => colorHandler.validate?.(token, 'test.path'), /components array must have 3 items/);
    });

    await t.test('should throw for non-numeric component', () => {
      const token = new DesignToken({ colorSpace: 'srgb', components: [0, 'a', 1] }, 'color');
      assert.throws(() => colorHandler.validate?.(token, 'test.path'), /component 1 must be a number or 'none'/);
    });
  });

  await t.test('Conversions', async (t) => {
    await t.test('toHex() should correctly convert sRGB', () => {
      const token = new DesignToken({ colorSpace: 'srgb', components: [1, 0, 0] }, 'color');
      const hex = colorHandler.toHex?.call(token);
      assert.strictEqual(hex, '#ff0000');
    });

    await t.test('toRgbString() should correctly convert LCH', () => {
      const token = new DesignToken({ colorSpace: 'lch', components: [50, 80, 40] }, 'color');
      const rgbString = colorHandler.toRgbString?.call(token);
      assert.strictEqual(rgbString, 'rgb(216, 58, 34)');
    });

    await t.test('toRgbString() should handle out-of-gamut LCH colors', () => {
      const token = new DesignToken({ colorSpace: 'lch', components: [50, 80, 190] }, 'color');
      const rgbString = colorHandler.toRgbString?.call(token);
      assert.strictEqual(rgbString, 'rgb(-121, 148, 141)');
    });

    await t.test('getLchLightness() should return the LCH L channel (0–100)', () => {
      const token = new DesignToken({ colorSpace: 'srgb', components: [1, 0, 0.741] }, 'color');
      const lightness = colorHandler.getLchLightness?.call(token);
      assert.ok(Math.abs(lightness! - 57.4) < 0.1, `LCH lightness should be close to 57.4, got ${lightness}`);
    });

    await t.test('getLuminance() should return WCAG relative luminance (0–1)', () => {
      // Pure white: luminance must be 1
      const white = new DesignToken({ colorSpace: 'srgb', components: [1, 1, 1] }, 'color');
      assert.strictEqual(colorHandler.getLuminance?.call(white), 1);

      // Pure black: luminance must be 0
      const black = new DesignToken({ colorSpace: 'srgb', components: [0, 0, 0] }, 'color');
      assert.strictEqual(colorHandler.getLuminance?.call(black), 0);

      // sRGB(1, 0, 0.741): WCAG luminance ≈ 0.249 (0.2126*1 + 0.0722*B_linear)
      const color = new DesignToken({ colorSpace: 'srgb', components: [1, 0, 0.741] }, 'color');
      const luminance = colorHandler.getLuminance?.call(color);
      assert.ok(luminance! >= 0 && luminance! <= 1, 'WCAG luminance must be in [0, 1]');
      assert.ok(Math.abs(luminance! - 0.249) < 0.01, `WCAG luminance should be close to 0.249, got ${luminance}`);
    });
  });
});

test('Colour keywords', async (t) => {
  await t.test('transparent normalises to black at alpha 0 and validates', () => {
    const value = colorHandler.normalize!('transparent', 'ds.t');
    assert.deepEqual(value, { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0, hex: '#00000000' });
    assert.doesNotThrow(() => colorHandler.validate?.(new DesignToken(value, 'color'), 'ds.t'));
  });

  await t.test('currentColor is kept as written and has no value to convert', () => {
    assert.equal(colorHandler.normalize!(' CURRENTCOLOR ', 'ds.t'), 'currentColor');
    assert.throws(() => colorHandler.toHex?.call(new DesignToken('currentColor', 'color')), /has no value until an element uses it/);
  });
});

test('Colour strings', async (t) => {
  await t.test('a hex or a named colour, in any case, is stored in sRGB with its hex', () => {
    assert.deepStrictEqual(colorHandler.normalize!('#336699', 'ds.t'), { colorSpace: 'srgb', components: [0.2, 0.4, 0.6], hex: '#336699' });
    for (const name of ['red', 'Red', 'RED']) {
      assert.deepStrictEqual(colorHandler.normalize!(name, 'ds.t'), { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' });
    }
  });

  await t.test('any other colour string is stored computed, in its own space, without a hex', () => {
    assert.deepStrictEqual(colorHandler.normalize!('oklch(0.7 0.1 200)', 'ds.t'), { colorSpace: 'oklch', components: [0.7, 0.1, 200] });
    assert.deepStrictEqual(colorHandler.normalize!('hsl(120 50% 50% / 0.5)', 'ds.t'), {
      colorSpace: 'hsl',
      components: [120, 50, 50],
      alpha: 0.5,
    });
    assert.deepStrictEqual(colorHandler.normalize!('rgb(255 0 0)', 'ds.t'), { colorSpace: 'srgb', components: [1, 0, 0] });
    const mixed = colorHandler.normalize!('color-mix(in oklch, red, blue)', 'ds.t') as { colorSpace: string; hex?: string };
    assert.equal(mixed.colorSpace, 'oklch');
    assert.equal(mixed.hex, undefined);
  });

  await t.test('a string it cannot compute is refused, naming the token and the reason', () => {
    assert.throws(() => colorHandler.normalize!('color-mix(in srgb, currentColor 5%, transparent)', 'ds.shadow.ink'), {
      message:
        'Token "ds.shadow.ink": \'color-mix(in srgb, currentColor 5%, transparent)\' cannot be computed: currentColor has no value until an element uses it.',
    });
    assert.throws(() => colorHandler.normalize!('reddish', 'ds.t'), {
      message: 'Token "ds.t": \'reddish\' cannot be computed: it is not a CSS colour.',
    });
  });

  await t.test('a computed value is canonical: checking it again never warns', () => {
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      for (const text of [
        'color-mix(in oklch, red, blue)',
        'color-mix(in oklch longer hue, red, blue)',
        'color-mix(in oklch, white, black)',
        'color-mix(in lch, white, #336699)',
        'color-mix(in srgb, #112233 5%, transparent)',
        'color-mix(in srgb, #ffffff 30%, #ffffff 30%)',
        'color-mix(in hsl, red, blue)',
        'oklch(0.7 0.1 -20)',
        'white',
      ]) {
        const value = colorHandler.normalize!(text, 'ds.t');
        colorHandler.normalize!(value, 'ds.t');
      }
    } finally {
      console.warn = warn;
    }
    assert.deepStrictEqual(warnings, []);
  });

  await t.test('the helpers read hsl channels from 0–100', () => {
    const green = new DesignToken({ colorSpace: 'hsl', components: [120, 100, 50] }, 'color');
    assert.strictEqual(colorHandler.toHex?.call(green), '#00ff00');
    assert.strictEqual(colorHandler.toRgbString?.call(green), 'rgb(0, 255, 0)');
  });
});
