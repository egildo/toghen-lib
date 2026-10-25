import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DesignToken, Resolver } from '../../../src/index.js';
import { letterSpacingHandler } from '../../../src/handlers/letter-spacing-handler.js';

const tok = (value: unknown) => new DesignToken(value, 'letterSpacing');

describe('letterSpacingHandler', () => {
  it('normalizes a string and keeps a structured value, em included', () => {
    assert.deepEqual(letterSpacingHandler.normalize!('-0.021em', 'track.tight'), { value: -0.021, unit: 'em' });
    assert.deepEqual(letterSpacingHandler.normalize!({ value: 0.08, unit: 'em' }, 'track.wide'), { value: 0.08, unit: 'em' });
  });

  it('computes calc() over em alone, and refuses em mixed with another unit', () => {
    assert.deepEqual(letterSpacingHandler.normalize!('calc(0.1em - 0.02em)', 'track.wide'), { value: 0.08, unit: 'em' });
    assert.deepEqual(letterSpacingHandler.normalize!('calc(1rem + 2px)', 'track.wide'), { value: 1.125, unit: 'rem' });
    assert.throws(() => letterSpacingHandler.normalize!('calc(0.1em + 1px)', 'track.mixed'), {
      message:
        'Token "track.mixed": \'calc(0.1em + 1px)\' cannot be computed: an em is a fraction of the font size, which only the element has.',
    });
  });

  it('refuses pt, mm and a bare number with the token path', () => {
    assert.throws(() => letterSpacingHandler.validate!(tok({ value: 1, unit: 'pt' }), 'track.pt'), /Token "track\.pt"/);
    assert.throws(() => letterSpacingHandler.validate!(tok('1mm'), 'track.mm'), /Token "track\.mm"/);
    assert.throws(() => letterSpacingHandler.validate!(tok(0.1), 'track.bare'), /Token "track\.bare"/);
  });

  it('writes toString as authored and converts to px against a font size', () => {
    assert.equal(letterSpacingHandler.toString!.call(tok({ value: -0.021, unit: 'em' })), '-0.021em');
    assert.equal(letterSpacingHandler.toPx!.call(tok({ value: 0.1, unit: 'em' })), 1.6);
    assert.equal(letterSpacingHandler.toPx!.call(tok({ value: 0.1, unit: 'em' }), 20), 2);
    assert.equal(letterSpacingHandler.toPx!.call(tok({ value: 2, unit: 'px' }), 20), 2);
    assert.equal(letterSpacingHandler.toPx!.call(tok({ value: 0.5, unit: 'rem' }), 20), 8);
  });
});

describe('a typography member referencing a letterSpacing token', () => {
  const type = (letterSpacing: unknown) => ({
    fontFamily: ['Inter'],
    fontSize: { value: 12, unit: 'px' },
    fontWeight: 500,
    lineHeight: 1.5,
    letterSpacing,
  });
  const resolve = (tracks: Record<string, unknown>, member: unknown) =>
    new Resolver({
      version: '2025-11-01',
      name: 'ds',
      sets: { base: { sources: [{ track: tracks, label: { $type: 'typography', $value: type(member) } }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as never);

  it('resolves to the value as authored, structured, in em and in px', () => {
    const tracks = {
      $type: 'letterSpacing',
      tight: { $value: '-0.021em' },
      wide: { $value: { value: 0.08, unit: 'em' } },
      px: { $value: { value: 1, unit: 'px' } },
    };
    for (const [name, want] of [
      ['tight', { value: -0.021, unit: 'em' }],
      ['wide', { value: 0.08, unit: 'em' }],
      ['px', { value: 1, unit: 'px' }],
    ] as const) {
      const ds = resolve(tracks, `{track.${name}}`).resolveToDesignSystem();
      assert.deepEqual(ds.resolveValue('ds.label').letterSpacing, want);
    }
  });

  it('refuses a bad letterSpacing token on load, whatever references it', () => {
    assert.throws(
      () => resolve({ $type: 'letterSpacing', bad: { $value: { value: 1, unit: 'pt' } } }, '{track.bad}').resolveToDesignSystem(),
      /Token "ds\.track\.bad"/,
    );
  });
});
