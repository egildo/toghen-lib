/**
 * Multi-mode resolution — the bridge from Resolver permutations to a single
 * DesignSystem that can answer for every context at once.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, Collection, DesignSystem, DesignToken, InvalidModeError, type ResolverDocument } from '../../src/index.js';

const WHITE = { colorSpace: 'srgb', components: [1, 1, 1] };
const BLACK = { colorSpace: 'srgb', components: [0, 0, 0] };
const STACK = ['Inter', 'system-ui', 'sans-serif'];

/** A one-layer shadow whose colour differs per theme. */
function raised(color: string) {
  const px = (value: number) => ({ value, unit: 'px' });
  return {
    $type: 'shadow',
    $value: [{ color, offsetX: px(0), offsetY: px(2), blur: px(4), spread: px(0) }],
  };
}

/** A two-theme document whose semantic layer references the primitives. */
function themedDocument(): ResolverDocument {
  return {
    version: '2025-11-01',
    name: 'themed',
    sets: {
      primitives: {
        sources: [
          {
            palette: {
              $type: 'color',
              white: { $value: WHITE },
              black: { $value: BLACK },
            },
            font: {
              stack: { $type: 'fontFamily', $value: STACK },
            },
          },
        ],
      },
    },
    modifiers: {
      theme: {
        contexts: {
          light: [{ semantic: { $type: 'color', bg: { $value: '{palette.white}' }, raised: raised('{palette.white}') } }],
          dark: [{ semantic: { $type: 'color', bg: { $value: '{palette.black}' }, raised: raised('{palette.black}') } }],
        },
        default: 'light',
      },
    },
    resolutionOrder: [{ $ref: '#/sets/primitives' }, { $ref: '#/modifiers/theme' }],
  } as ResolverDocument;
}

describe('Resolver — mode naming', () => {
  it('names a modifier-free document "default"', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: { base: { sources: [{ a: { $value: '1', $type: 'string' } }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as ResolverDocument);

    assert.equal(resolver.getModeName({}), 'default');
    assert.deepEqual(resolver.resolveAllToDesignSystem().getCollection('resolved')?.getModes(), ['default']);
  });

  it('names a single modifier by its context', () => {
    const resolver = new Resolver(themedDocument());

    assert.equal(resolver.getModeName({ theme: 'dark' }), 'dark');
    assert.deepEqual(resolver.resolveAllToDesignSystem().getCollection('themed')?.getModes(), ['light', 'dark']);
  });

  it('joins several modifiers in declaration order, whatever the key order', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: { base: { sources: [{ a: { $value: '1', $type: 'string' } }] } },
      modifiers: {
        theme: { contexts: { light: [], dark: [] }, default: 'light' },
        density: { contexts: { cosy: [], compact: [] }, default: 'cosy' },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as ResolverDocument);

    // Same context, two key orders — one name.
    assert.equal(resolver.getModeName({ theme: 'dark', density: 'compact' }), 'dark/compact');
    assert.equal(resolver.getModeName({ density: 'compact', theme: 'dark' }), 'dark/compact');
  });

  it('fills omitted modifiers with their default so the name names a real mode', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: { base: { sources: [{ a: { $value: '1', $type: 'string' } }] } },
      modifiers: {
        theme: { contexts: { light: [], dark: [] }, default: 'light' },
        density: { contexts: { cosy: [], compact: [] }, default: 'cosy' },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as ResolverDocument);

    // A bare 'dark' would match none of the declared modes.
    assert.equal(resolver.getModeName({ theme: 'dark' }), 'dark/cosy');
    assert.equal(resolver.getModeName({}), 'light/cosy');

    const modes = resolver.resolveAllToDesignSystem().getCollection('resolved')?.getModes();
    assert.ok(modes?.includes(resolver.getModeName({ theme: 'dark' })));
  });

  it('produces one mode per permutation', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: { base: { sources: [{ a: { $value: '1', $type: 'string' } }] } },
      modifiers: {
        theme: { contexts: { light: [], dark: [] }, default: 'light' },
        density: { contexts: { cosy: [], compact: [] }, default: 'cosy' },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as ResolverDocument);

    const modes = resolver.resolveAllToDesignSystem().getCollection('resolved')?.getModes();
    assert.deepEqual(modes, ['light/cosy', 'light/compact', 'dark/cosy', 'dark/compact']);
  });
});

describe('Resolver — resolveAllToDesignSystem', () => {
  it('answers for every context from one system', () => {
    const ds = new Resolver(themedDocument()).resolveAllToDesignSystem();

    assert.deepEqual(ds.resolveValue('themed.semantic.bg'), WHITE);
    assert.deepEqual(ds.resolveValue('themed.semantic.bg', 'light'), WHITE);
    assert.deepEqual(ds.resolveValue('themed.semantic.bg', 'dark'), BLACK);
  });

  it('resolves references per mode', () => {
    // semantic.bg is a reference, and it points at a different primitive in
    // each context — mode has to thread all the way through the chain.
    const ds = new Resolver(themedDocument()).resolveAllToDesignSystem();
    const raw = ds.getCollection('themed')?.getToken('semantic.bg', 'dark');

    assert.equal(raw?.$value, '{palette.black}', 'the stored value stays a reference');
    assert.deepEqual(ds.resolveToken('themed.semantic.bg', 'dark')?.$value, BLACK);
  });

  it('reaches a member through the mode', () => {
    const ds = new Resolver(themedDocument()).resolveAllToDesignSystem();

    assert.equal(ds.resolveValue('themed.semantic.raised.0.color.components.0', 'light'), 1);
    assert.deepEqual(ds.resolveValue('themed.semantic.raised.0.color', 'dark'), BLACK);
    assert.deepEqual(ds.resolveValue('themed.semantic.raised.0.offsetY', 'dark'), { value: 2, unit: 'px' });
  });

  it('keeps a value that is genuinely an array intact in every mode', () => {
    const ds = new Resolver(themedDocument()).resolveAllToDesignSystem();

    assert.deepEqual(ds.resolveValue('themed.font.stack', 'light'), STACK);
    assert.deepEqual(ds.resolveValue('themed.font.stack', 'dark'), STACK);
  });

  it('rejects an undeclared mode rather than returning the default one', () => {
    // The bug this whole rebuild exists for: asking a single-context system
    // for 'dark' used to hand back the light value without a word.
    const ds = new Resolver(themedDocument()).resolveAllToDesignSystem();

    assert.throws(() => ds.resolveValue('themed.semantic.bg', 'sepia'), InvalidModeError);
  });

  it('is complete — every token defined in every mode', () => {
    const ds = new Resolver(themedDocument()).resolveAllToDesignSystem();
    const collection = ds.getCollection('themed');

    assert.deepEqual(collection?.check(), { incomplete: [], holes: [], nonFactorable: [] });
    assert.deepEqual(collection?.getAllPaths('light'), collection?.getAllPaths('dark'));
  });

  it('keeps the reference namespace independent of the collection name', () => {
    const ds = new Resolver(themedDocument()).resolveAllToDesignSystem(undefined, 'renamed');

    assert.deepEqual(ds.resolveValue('renamed.semantic.bg', 'dark'), BLACK);
  });

  it('populates an existing DesignSystem alongside other collections', () => {
    const ds = new DesignSystem();
    const manual = new Collection('manual');
    manual.setToken('brand', new DesignToken('Acme', 'string'));
    ds.addCollection(manual);

    new Resolver(themedDocument()).resolveAllToDesignSystem(ds);

    assert.ok(ds.getCollection('manual'));
    assert.deepEqual(ds.resolveValue('themed.semantic.bg', 'dark'), BLACK);
  });

  it('stores each mode as written', () => {
    const ds = new Resolver(themedDocument()).resolveAllToDesignSystem();

    const valueFor = (mode: string) => ds.getCollection('themed')!.getToken('semantic.bg', mode)?.$value;

    assert.equal(valueFor('light'), '{palette.white}');
    assert.equal(valueFor('dark'), '{palette.black}');
  });

  it('reports references per mode', () => {
    // semantic.ink is a reference in light and a literal in dark.
    const doc = themedDocument();
    doc.modifiers!.theme.contexts.light.push({ semantic: { ink: { $type: 'color', $value: '{palette.black}' } } });
    doc.modifiers!.theme.contexts.dark.push({ semantic: { ink: { $type: 'color', $value: WHITE } } });
    const ds = new Resolver(doc).resolveAllToDesignSystem();

    assert.deepEqual(ds.referencesOf('themed.semantic.ink', 'light'), [
      { at: '', to: 'themed.palette.black', interpolated: false, written: '{palette.black}' },
    ]);
    assert.deepEqual(ds.referencesOf('themed.semantic.ink', 'dark'), []);
    assert.deepEqual(ds.referencesOf('themed.semantic.raised', 'dark'), [
      { at: '0.color', to: 'themed.palette.black', interpolated: false, written: '{palette.black}' },
    ]);
  });
});

describe('the default mode of a build', () => {
  // A theme that declares dark before light, its default, and a density that declares compact before cosy, its default.
  const doc = (): ResolverDocument =>
    ({
      version: '2025-11-01',
      name: 'ds',
      sets: {
        base: {
          sources: [
            {
              bg: { $type: 'color', $value: WHITE },
              gap: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
              font: { $type: 'fontFamily', $value: STACK },
            },
          ],
        },
      },
      modifiers: {
        theme: { contexts: { dark: [{ bg: { $value: BLACK } }], light: [] }, default: 'light' },
        density: { contexts: { compact: [{ gap: { $value: { value: 4, unit: 'px' } } }], cosy: [] }, default: 'cosy' },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }, { $ref: '#/modifiers/density' }],
    }) as ResolverDocument;

  it('is every modifier at its declared default in the product build, wherever the combination falls', () => {
    const ds = new Resolver(doc()).resolveAllToDesignSystem();
    const collection = ds.getCollection('ds')!;
    assert.equal(collection.getModes()[0], 'dark/compact', 'the modes keep the order of the combinations');
    assert.equal(collection.getDefaultMode(), 'light/cosy');
    assert.deepEqual(ds.resolveValue('ds.bg'), WHITE);
    assert.deepEqual(ds.resolveValue('ds.gap'), { value: 8, unit: 'px' });
    assert.deepEqual(ds.resolveValue('ds.font'), STACK);
  });

  it('is the same mode in the sum build', () => {
    const ds = new Resolver(doc()).resolveContextsToDesignSystem();
    assert.equal(ds.getCollection('ds')!.getDefaultMode(), 'light/cosy');
    assert.deepEqual(ds.resolveValue('ds.bg'), WHITE);
  });

  it('is the first declared mode in a collection built by hand', () => {
    const collection = new Collection('c', ['light', 'dark']);
    collection.setToken('bg', new DesignToken(WHITE, 'color'), 'light');
    collection.setToken('bg', new DesignToken(BLACK, 'color'), 'dark');
    const ds = new DesignSystem();
    ds.addCollection(collection);
    assert.equal(collection.getDefaultMode(), 'light');
    assert.deepEqual(ds.resolveValue('c.bg'), WHITE);
  });
});
