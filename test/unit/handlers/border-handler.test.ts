import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { borderHandler } from '../../../src/handlers/border-handler.js';
import { normalizeTokenValue } from '../../../src/index.js';

const ink = { colorSpace: 'srgb', components: [0.1, 0.2, 0.3] };

describe('borderHandler', () => {
  it('computes the colour and the width from strings, keeps a keyword style', () => {
    assert.deepEqual(borderHandler.normalize!({ color: '#fff', width: 'calc(0.5px * 2)', style: 'dashed' }, 'border.x'), {
      color: { colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' },
      width: { value: 1, unit: 'px' },
      style: 'dashed',
    });
  });

  it('keeps the structured shapes, and currentColor', () => {
    const value = { color: ink, width: { value: 0.0625, unit: 'rem' }, style: 'solid' };
    assert.deepEqual(borderHandler.normalize!(value, 'border.x'), value);
    assert.equal((borderHandler.normalize!({ ...value, color: 'currentColor' }, 'border.x') as any).color, 'currentColor');
  });

  it('computes the dashes of the object style, and checks its line cap', () => {
    assert.deepEqual(
      (
        borderHandler.normalize!(
          { color: ink, width: '1px', style: { dashArray: ['0.5rem', { value: 2, unit: 'px' }], lineCap: 'round' } },
          'border.x',
        ) as any
      ).style,
      {
        dashArray: [
          { value: 0.5, unit: 'rem' },
          { value: 2, unit: 'px' },
        ],
        lineCap: 'round',
      },
    );
    assert.throws(
      () => borderHandler.normalize!({ color: ink, width: '1px', style: { dashArray: ['2px'], lineCap: 'pointy' } }, 'border.x'),
      /Token "border\.x": style: lineCap is one of round, butt, square/,
    );
    assert.throws(
      () => borderHandler.normalize!({ color: ink, width: '1px', style: { dashArray: ['2vw'], lineCap: 'butt' } }, 'border.x'),
      /Token "border\.x": style: dashArray\.0: '2vw' cannot be computed/,
    );
  });

  it('refuses a missing member, an unknown style keyword, a wrong colour or width, naming the member', () => {
    assert.throws(() => borderHandler.normalize!({ color: ink, width: '1px' }, 'border.x'), /Token "border\.x": style is required/);
    assert.throws(
      () => borderHandler.normalize!({ color: ink, width: '1px', style: 'wavy' }, 'border.x'),
      /style: a stroke style keyword is one of solid, dashed/,
    );
    assert.throws(
      () => borderHandler.normalize!({ color: 'reddish', width: '1px', style: 'solid' }, 'border.x'),
      /Token "border\.x": color: 'reddish' cannot be computed/,
    );
    assert.throws(
      () => borderHandler.normalize!({ color: ink, width: '50%', style: 'solid' }, 'border.x'),
      /Token "border\.x": width: '50%' cannot be computed/,
    );
  });

  it('is the gate of a border token on load', () => {
    assert.deepEqual(normalizeTokenValue('border', { color: 'black', width: '2px', style: 'solid' }, 'border.x'), {
      color: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' },
      width: { value: 2, unit: 'px' },
      style: 'solid',
    });
  });
});
