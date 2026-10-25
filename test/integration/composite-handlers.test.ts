import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put } from '../put.js';
import { Collection, DesignSystem } from '../../src/index.js';
import { typographyHandler } from '../../src/handlers/typography-handler.js';
import { shadowHandler } from '../../src/handlers/shadow-handler.js';
import { gradientHandler } from '../../src/handlers/gradient-handler.js';

test('Composite handler integration', async (t) => {
  await t.test('typography handler helpers read a token from resolveToken()', () => {
    const ds = new DesignSystem();

    const col = new Collection('tokens');
    ds.addCollection(col);
    put(ds, 'tokens', 'text.heading', {
      $type: 'typography',
      $value: {
        fontFamily: 'Inter',
        fontSize: '2rem',
        fontWeight: 700,
        lineHeight: '120%',
      },
    });

    const token = ds.resolveToken('tokens.text.heading') as any;
    assert.ok(token);
    assert.strictEqual(typographyHandler.getFontFamily!.call(token), 'Inter');
    assert.strictEqual(typographyHandler.getFontSizePx!.call(token), 32);
    assert.deepEqual(typographyHandler.getLineHeight!.call(token), { value: 120, unit: 'percent' });
  });

  await t.test('shadow and gradient the helpers of the shadow and gradient handlers read tokens from resolveToken()', () => {
    const ds = new DesignSystem();

    const col = new Collection('tokens');
    ds.addCollection(col);

    put(ds, 'tokens', 'effects.card', {
      $type: 'shadow',
      $value: {
        color: '#00000080',
        offsetX: '0px',
        offsetY: '2px',
        blur: '8px',
      },
    });

    put(ds, 'tokens', 'background.hero', {
      $type: 'gradient',
      $value: {
        type: 'linear',
        angle: '90deg',
        stops: [
          { color: '#ff0000', position: 0 },
          { color: '#0000ff', position: 1 },
        ],
      },
    });

    const shadow = ds.resolveToken('tokens.effects.card') as any;
    const gradient = ds.resolveToken('tokens.background.hero') as any;

    assert.ok(shadow);
    assert.ok(gradient);

    const shadows = shadowHandler.getShadows!.call(shadow);
    assert.strictEqual(shadows.length, 1);
    assert.strictEqual(shadows[0].offsetY, 2);

    assert.strictEqual(gradientHandler.getType!.call(gradient), 'linear');
    assert.strictEqual(gradientHandler.getAngleDeg!.call(gradient), 90);
    assert.strictEqual(gradientHandler.getStops!.call(gradient).length, 2);
  });
});
