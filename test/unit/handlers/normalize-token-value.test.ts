/**
 * normalizeTokenValue: a literal comes back in lib's stored shape, a reference as written.
 * A chain from Resolver.contextsOf() already carries its steps in that shape.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTokenValue, Resolver } from '../../../src/index.js';
import { computeTokenValue } from '../../../src/handlers/built-in.js';

describe('normalizeTokenValue', () => {
  it("gives a '#aa0000' colour lib's colour shape", () => {
    assert.deepEqual(normalizeTokenValue('color', '#aa0000', 'color.bg'), {
      colorSpace: 'srgb',
      components: [2 / 3, 0, 0],
      hex: '#aa0000',
    });
  });

  it('keeps a {value, unit} dimension as such', () => {
    assert.deepEqual(normalizeTokenValue('dimension', { value: 1.5, unit: 'rem' }, 'space.md'), { value: 1.5, unit: 'rem' });
  });

  it('returns a reference as written', () => {
    assert.equal(normalizeTokenValue('color', '{a.b}', 'color.bg'), '{a.b}');
  });

  it('gives the shape a step of the resolver already has', () => {
    const r = new Resolver({
      version: '2025-11-01',
      resolutionOrder: [
        { type: 'set', name: 'base', sources: [{ color: { bg: { $type: 'color', $value: '#ffffff' } } }] },
        { type: 'modifier', name: 'scheme', default: 'light', contexts: { light: [], dark: [{ color: { bg: { $value: '#aa0000' } } }] } },
      ],
    });
    const step = r.contextsOf('color.bg').chains.$value!.links[0].steps.dark;
    assert.ok('value' in step);
    assert.deepEqual((step.value as any).components, [2 / 3, 0, 0]);
    assert.deepEqual(normalizeTokenValue('color', step.value, 'color.bg'), step.value);
  });
});

describe('computeTokenValue', () => {
  it('computes a value even when it looks like a reference, so a literal brace does not pass the gate', () => {
    assert.throws(() => computeTokenValue('color', '{a.b}', 'color.bg'), /Token "color\.bg": '\{a\.b\}' cannot be computed/);
    assert.equal(normalizeTokenValue('color', '{a.b}', 'color.bg'), '{a.b}');
  });

  it('computes what normalizeTokenValue computes for a literal', () => {
    assert.deepEqual(computeTokenValue('dimension', 'calc(1rem + 2px)', 'space.md'), { value: 1.125, unit: 'rem' });
    assert.deepEqual(computeTokenValue('fontFamily', 'Inter, serif', 'font.body'), ['Inter', 'serif']);
    assert.equal(computeTokenValue('number', 'anything', 'n'), 'anything');
  });
});
