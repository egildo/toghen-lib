/**
 * A token's value is checked however it enters: through `Collection.setToken`,
 * or a resolver document. The same value gets the same
 * answer on every path — stored structured, or refused with the token's path.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Collection, DesignToken } from '../../src/index.js';
import { Resolver } from '../../src/resolver/resolver.js';

type Entry = (type: string, value: unknown) => unknown;

/** Each path a token enters by, returning the stored `$value` of `ds.t`. */
const paths: Record<string, Entry> = {
  'Collection.setToken': (type, value) => {
    const collection = new Collection('ds');
    collection.setToken('t', new DesignToken(value, type));
    return collection.getToken('t')!.$value;
  },
  Resolver: (type, value) => {
    const resolver = new Resolver({
      version: '2025-11-01',
      name: 'ds',
      sets: { base: { sources: [{ t: { $type: type, $value: value } }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as never);
    return resolver.resolveToDesignSystem().getCollection('ds')!.getToken('t')!.$value;
  },
};

for (const [name, enter] of Object.entries(paths)) {
  describe(`a token entering by ${name}`, () => {
    it('keeps a structured colour as written', () => {
      const ink = { colorSpace: 'oklch', components: [0.5, 0.1, 250] };
      assert.deepEqual(enter('color', ink), ink);
    });

    it('stores a hex colour structured, keeping the hex', () => {
      assert.deepEqual(enter('color', '#ff0000'), { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' });
      assert.deepEqual(enter('color', '#00000080'), {
        colorSpace: 'srgb',
        components: [0, 0, 0],
        alpha: 128 / 255,
        hex: '#000000',
      });
    });

    it('stores transparent structured, as black at alpha 0, whatever its case', () => {
      const clear = { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0, hex: '#00000000' };
      assert.deepEqual(enter('color', 'transparent'), clear);
      assert.deepEqual(enter('color', 'Transparent'), clear);
    });

    it('stores currentColor as the string, whatever its case', () => {
      assert.equal(enter('color', 'currentColor'), 'currentColor');
      assert.equal(enter('color', 'currentcolor'), 'currentColor');
    });

    it('stores a named colour structured, keeping its hex, whatever its case', () => {
      const red = { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' };
      assert.deepEqual(enter('color', 'red'), red);
      assert.deepEqual(enter('color', 'RED'), red);
    });

    it('refuses the cascade keywords, with the reason', () => {
      for (const word of ['inherit', 'initial']) {
        assert.throws(
          () => enter('color', word),
          new RegExp(`Token "ds\\.t": '${word}' cannot be computed: '${word}' is a CSS-wide keyword`),
        );
      }
    });

    it('stores a letter spacing in em structured, from either form', () => {
      const type = (letterSpacing: unknown) => ({
        fontFamily: ['Inter'],
        fontSize: { value: 12, unit: 'px' },
        fontWeight: 500,
        lineHeight: 1.5,
        letterSpacing,
      });
      const em = { value: 0.08, unit: 'em' };
      assert.deepEqual((enter('typography', type('0.08em')) as any).letterSpacing, em);
      assert.deepEqual((enter('typography', type({ value: 0.08, unit: 'em' })) as any).letterSpacing, em);
      assert.deepEqual((enter('typography', type({ value: 1, unit: 'px' })) as any).letterSpacing, { value: 1, unit: 'px' });
    });

    it('carries any further typography member as written', () => {
      const value = {
        fontFamily: ['Inter'],
        fontSize: { value: 12, unit: 'px' },
        fontWeight: 500,
        lineHeight: 1.5,
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum" 1',
        tabSize: 4,
      };
      assert.deepEqual(enter('typography', value), value);
      assert.throws(
        () => enter('typography', { ...value, fontVariantNumeric: ['tabular-nums'] }),
        /Token "ds\.t": fontVariantNumeric must be a string or a number/,
      );
    });

    it('stores a dimension string structured', () => {
      assert.deepEqual(enter('dimension', '24px'), { value: 24, unit: 'px' });
      assert.deepEqual(enter('dimension', '1.5rem'), { value: 1.5, unit: 'rem' });
      assert.deepEqual(enter('dimension', { value: 4, unit: 'px' }), { value: 4, unit: 'px' });
    });

    it('stores a letterSpacing structured, from a string or the structured form, in px rem or em', () => {
      assert.deepEqual(enter('letterSpacing', '-0.021em'), { value: -0.021, unit: 'em' });
      assert.deepEqual(enter('letterSpacing', '1px'), { value: 1, unit: 'px' });
      assert.deepEqual(enter('letterSpacing', '0.05rem'), { value: 0.05, unit: 'rem' });
      for (const unit of ['px', 'rem', 'em']) {
        assert.deepEqual(enter('letterSpacing', { value: 0.5, unit }), { value: 0.5, unit });
      }
    });

    it('refuses a letterSpacing in pt or mm, or a bare number, naming the token', () => {
      for (const bad of ['1pt', '1mm', { value: 1, unit: 'pt' }, { value: 1, unit: 'mm' }]) {
        assert.throws(() => enter('letterSpacing', bad), /Token "ds\.t": a letter spacing (string must be|unit must be one of)/);
      }
      assert.throws(() => enter('letterSpacing', 0.05), /Token "ds\.t": \$value must be a structured letter spacing/);
      assert.throws(() => enter('letterSpacing', '0.05'), /Token "ds\.t": a letter spacing string must be/);
      assert.throws(() => enter('letterSpacing', { value: '1', unit: 'em' }), /Token "ds\.t": value must be a finite number/);
    });

    it('stores every composite member computed, plain forms included', () => {
      assert.deepEqual(enter('shadow', { color: '#abc', offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' }), {
        color: { colorSpace: 'srgb', components: [0xaa / 255, 0xbb / 255, 0xcc / 255], hex: '#aabbcc' },
        offsetX: { value: 0, unit: 'px' },
        offsetY: { value: 1, unit: 'px' },
        blur: { value: 2, unit: 'px' },
        spread: { value: 0, unit: 'px' },
      });
      const type = enter('typography', {
        fontFamily: 'Inter, sans-serif',
        fontSize: '16px',
        fontWeight: 'bold',
        lineHeight: '150%',
      }) as any;
      assert.deepEqual(type, {
        fontFamily: ['Inter', 'sans-serif'],
        fontSize: { value: 16, unit: 'px' },
        fontWeight: 700,
        lineHeight: '150%',
      });
      assert.deepEqual(enter('gradient', [{ color: 'red', position: 0 }]), [
        { color: { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' }, position: 0 },
      ]);
    });

    it('stores a fontWeight keyword as its number, and a border computed', () => {
      assert.equal(enter('fontWeight', 'extra-black'), 950);
      assert.deepEqual(enter('border', { color: 'white', width: '1px', style: 'solid' }), {
        color: { colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' },
        width: { value: 1, unit: 'px' },
        style: 'solid',
      });
    });

    it('leaves a reference alone until it resolves', () => {
      assert.equal(enter('color', '{ds.other}'), '{ds.other}');
      assert.deepEqual(enter('dimension', { $ref: '#/other' }), { $ref: '#/other' });
      assert.equal(enter('letterSpacing', '{ds.other}'), '{ds.other}');
    });

    it('refuses a value of the wrong shape, naming the token', () => {
      assert.throws(() => enter('color', 'reddish'), /Token "ds\.t": 'reddish' cannot be computed: it is not a CSS colour\./);
      assert.throws(() => enter('dimension', '24'), /Token "ds\.t": a dimension string must be a number and a unit/);
      assert.throws(() => enter('dimension', { value: '24', unit: 'px' }), /Token "ds\.t": value must be a finite number/);
      assert.throws(() => enter('shadow', { color: '#000' }), /Token "ds\.t"/);
    });
  });
}

describe('a token typed by its group', () => {
  it('is checked against the group type', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      name: 'ds',
      sets: { base: { sources: [{ space: { $type: 'dimension', sm: { $value: '4px' }, bad: { $value: 'wide' } } }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as never);
    assert.throws(() => resolver.resolveToDesignSystem(), /Token "ds\.space\.bad"/);
  });
});
