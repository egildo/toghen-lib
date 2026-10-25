import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DesignSystem, referencePath } from '../../../src/core/design-system.js';
import { Collection } from '../../../src/core/collection.js';
import { DesignToken, CollectionNotFoundError, InvalidTokenError } from '../../../src/core/design-token.js';
import { Resolver } from '../../../src/resolver/resolver.js';

const ink = { colorSpace: 'srgb', components: [0.1, 0.1, 0.1], hex: '#1a1a1a' };
const space = { value: 8, unit: 'px' };

function oneCollection(name = 'ds'): DesignSystem {
  const ds = new DesignSystem();
  const collection = new Collection(name);
  collection.setToken('color.ink', new DesignToken(ink, 'color'));
  collection.setToken('space.sm', new DesignToken(space, 'dimension'));
  collection.setToken('font.body', new DesignToken(['Inter', 'system-ui'], 'fontFamily'));
  collection.setToken('button.color', new DesignToken('{color.ink}', 'color', '', { 'com.example': { id: 'v1' } }));
  ds.addCollection(collection);
  return ds;
}

describe('DesignSystem: lookup paths and reference paths', () => {
  it('keeps a token $extensions through resolveToken', () => {
    const token = oneCollection().resolveToken('ds.button.color');
    assert.ok(token);
    assert.deepEqual(token.$extensions, { 'com.example': { id: 'v1' } });
    assert.deepEqual(token.$value, ink);
  });

  it('gives the lookup path of a reference path when there is one collection', () => {
    const ds = oneCollection();
    assert.equal(ds.lookupPath('space.sm'), 'ds.space.sm');
    assert.equal(ds.lookupPath('ds.space.sm'), 'ds.space.sm');
    assert.equal(ds.lookupPath(''), 'ds');
  });

  it('accepts a path without its collection when there is one: the one-collection shorthand', () => {
    const ds = oneCollection();
    assert.deepEqual(ds.resolveValue('space.sm'), space);
    assert.deepEqual(ds.resolveValue('font.body'), ['Inter', 'system-ui']);
    assert.deepEqual(ds.resolveValue('button.color'), ink);
    assert.deepEqual(ds.referencesOf('button.color'), [{ at: '', to: 'ds.color.ink', interpolated: false, written: '{color.ink}' }]);
    assert.equal(ds.resolveToken('color.ink')?.$type, 'color');
  });

  it('reads a first segment that names a collection as the collection, so a group named like it loses', () => {
    const ds = new DesignSystem();
    const collection = new Collection('ds');
    collection.setToken('ds.gap', new DesignToken(space, 'dimension'));
    collection.setToken('gap', new DesignToken({ value: 2, unit: 'rem' }, 'dimension'));
    ds.addCollection(collection);
    assert.deepEqual(ds.resolveValue('ds.gap'), { value: 2, unit: 'rem' });
    assert.deepEqual(ds.resolveValue('ds.ds.gap'), space);
  });

  it('refuses a path without its collection when there are two', () => {
    const ds = oneCollection('a');
    ds.addCollection(new Collection('b'));
    assert.throws(() => ds.lookupPath('space.sm'), CollectionNotFoundError);
    assert.throws(() => ds.resolveValue('space.sm'), /Collection 'space' not found/);
    assert.equal(ds.resolveToken('space.sm'), null);
  });

  it('gives the reference path of a lookup path', () => {
    assert.equal(referencePath('ds.button.backgroundColor'), 'button.backgroundColor');
    assert.equal(referencePath('ds'), '');
  });
});

// The read gate: a value written with a reference is computed once it resolves.
const INK = { colorSpace: 'oklch', components: [0.4, 0.1, 250] };
const VEIL = 'color-mix(in srgb, {shadow.ink} 5%, transparent)';
/** INK in sRGB, at alpha 0.05: what the mix of INK at 5% with transparent computes to. */
const VEIL_SRGB = [0.0713288828, 0.2888845282, 0.4819708251];

function assertVeil(value: any): void {
  assert.equal(value.colorSpace, 'srgb');
  assert.equal(value.hex, undefined);
  value.components.forEach((c: number, i: number) => {
    assert.ok(Math.abs(c - VEIL_SRGB[i]) < 1e-6, `component ${i}: ${c}`);
  });
  assert.ok(Math.abs(value.alpha - 0.05) < 1e-9, `alpha ${value.alpha}`);
}

function gated(): DesignSystem {
  const ds = new DesignSystem();
  const collection = new Collection('ds', ['light', 'dark']);
  collection.setToken('shadow.ink', new DesignToken(INK, 'color'));
  collection.setToken('color.veil', new DesignToken(VEIL, 'color'));
  collection.setToken('color.veiled', new DesignToken('{color.veil}', ''));
  // Issue #123's shape, one layer and two.
  const layer = { color: VEIL, offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' };
  collection.setToken('shadow.raised', new DesignToken([layer], 'shadow'));
  collection.setToken('shadow.flat', new DesignToken(layer, 'shadow'));
  collection.setToken('space.md', new DesignToken({ value: 1, unit: 'rem' }, 'dimension'));
  collection.setToken('space.lg', new DesignToken('calc({space.md} * 2)', 'dimension'));
  collection.setToken('space.pad', new DesignToken('{space.md} {space.md}', 'dimension'));
  collection.setToken('space.loose', new DesignToken('{space.md} {space.md}', ''));
  collection.setToken('shadow.lit', new DesignToken({ ...layer, color: 'color-mix(in srgb, currentColor 5%, {shadow.ink})' }, 'shadow'));
  ds.addCollection(collection);
  return ds;
}

describe('DesignSystem: the read gate', () => {
  it('computes a color-mix() over a structured oklch colour through resolveValue and resolveToken', () => {
    const ds = gated();
    assertVeil(ds.resolveValue('ds.color.veil'));
    const token = ds.resolveToken('ds.color.veil');
    assert.equal(token?.$type, 'color');
    assertVeil(token?.$value);
  });

  it('computes through a whole reference, typed through the alias', () => {
    assertVeil(gated().resolveValue('ds.color.veiled'));
    assertVeil(gated().resolveToken('ds.color.veiled')?.$value);
  });

  it('computes a shadow whose colour is a color-mix() (issue #123), and walks members of the computed value', () => {
    const ds = gated();
    const [raised] = ds.resolveValue('ds.shadow.raised');
    assertVeil(raised.color);
    assert.deepEqual(
      [raised.offsetX, raised.offsetY, raised.blur, raised.spread],
      [
        { value: 0, unit: 'px' },
        { value: 1, unit: 'px' },
        { value: 2, unit: 'px' },
        { value: 0, unit: 'px' },
      ],
    );
    assertVeil(ds.resolveValue('ds.shadow.raised.0.color'));
    assertVeil(ds.resolveValue('ds.shadow.flat.color'));
    assert.deepEqual(ds.resolveValue('ds.shadow.flat.offsetY'), { value: 1, unit: 'px' });
    assertVeil((ds.resolveToken('ds.shadow.raised')!.$value as any)[0].color);
  });

  it('computes calc() over a referenced rem dimension', () => {
    assert.deepEqual(gated().resolveValue('ds.space.lg'), { value: 2, unit: 'rem' });
    assert.deepEqual(gated().resolveToken('ds.space.lg')?.$value, { value: 2, unit: 'rem' });
  });

  it('refuses a typed dimension that resolves to a list, saying to leave it untyped; an untyped one stays as written', () => {
    assert.throws(
      () => gated().resolveValue('ds.space.pad'),
      /Token "ds\.space\.pad" \(mode "[^"]+"\): '1rem 1rem' cannot be computed: it is a list of values, not one dimension; leave the token untyped/,
    );
    assert.equal(gated().resolveValue('ds.space.loose'), '1rem 1rem');
  });

  it('refuses at read with the token, the mode, the member and the reason', () => {
    const expected =
      /Token "ds\.shadow\.lit" \(mode "dark"\): color: 'color-mix\(in srgb, currentColor 5%, oklch\(0\.4 0\.1 250\)\)' cannot be computed: currentColor has no value until an element uses it\.$/;
    assert.throws(
      () => gated().resolveValue('ds.shadow.lit', 'dark'),
      (error: unknown) => {
        assert.ok(error instanceof InvalidTokenError);
        assert.match((error as Error).message, expected);
        return true;
      },
    );
    assert.throws(() => gated().resolveToken('ds.shadow.lit', 'dark'), expected);
    assert.throws(() => gated().resolveValue('ds.shadow.lit.offsetX', 'dark'), expected);
  });
});

describe('Resolver: the read gate through valueAt, and contextsOf as written', () => {
  const resolver = () =>
    new Resolver({
      version: '2025-11-01',
      resolutionOrder: [
        {
          type: 'set',
          name: 'base',
          sources: [
            {
              shadow: {
                ink: { $type: 'color', $value: INK },
                raised: { $type: 'shadow', $value: [{ color: VEIL, offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' }] },
              },
              color: { veil: { $type: 'color', $value: VEIL } },
            },
          ],
        },
        {
          type: 'modifier',
          name: 'scheme',
          default: 'light',
          contexts: { light: [], dark: [{ color: { veil: { $value: 'color-mix(in srgb, {shadow.ink} 50%, transparent)' } } }] },
        },
      ],
    } as never);

  it('gives the computed colour and shadow', () => {
    assertVeil(resolver().valueAt('color.veil'));
    assertVeil((resolver().valueAt('shadow.raised') as any)[0].color);
    assert.equal((resolver().valueAt('color.veil', { scheme: 'dark' }) as any).alpha, 0.5);
  });

  it('keeps a step holding a reference as written in contextsOf()', () => {
    const steps = resolver().contextsOf('color.veil').chains.$value!.links[0].steps;
    assert.deepEqual(steps.dark, { value: 'color-mix(in srgb, {shadow.ink} 50%, transparent)' });
  });
});
