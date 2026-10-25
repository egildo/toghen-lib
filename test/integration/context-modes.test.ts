/**
 * A mode can name one modifier's context: `density=compact` is the defaults
 * with that one modifier changed. It names a mode in both builds, the product
 * of every context and the sum of them.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InvalidModeError, Resolver, type ResolverDocument } from '../../src/index.js';

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (v: number) => ({ colorSpace: 'srgb', components: [v, v, v] });

// Three independent modifiers: 2 × 3 × 4 = 24 combinations; the defaults and 1 + 2 + 3 = 6 single changes.
const doc: ResolverDocument = {
  version: '2025-11-01',
  name: 'ds',
  sets: {
    base: {
      sources: [
        {
          bg: { $type: 'color', $value: srgb(1) },
          gap: { $type: 'dimension', $value: px(8) },
          radius: { $type: 'dimension', $value: px(4) },
        },
      ],
    },
  },
  modifiers: {
    theme: { default: 'light', contexts: { light: [], dark: [{ bg: { $value: srgb(0) } }] } },
    density: { default: 'cosy', contexts: { cosy: [], compact: [{ gap: { $value: px(4) } }], spacious: [{ gap: { $value: px(16) } }] } },
    shape: {
      default: 'soft',
      contexts: {
        soft: [],
        sharp: [{ radius: { $value: px(0) } }],
        round: [{ radius: { $value: px(12) } }],
        pill: [{ radius: { $value: px(999) } }],
      },
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }, { $ref: '#/modifiers/density' }, { $ref: '#/modifiers/shape' }],
};

describe('resolveContextsToDesignSystem', () => {
  const system = new Resolver(doc).resolveContextsToDesignSystem([{ theme: 'dark', density: 'compact' }]);
  const modes = system.getCollection('ds')!.getModes();

  it('builds the defaults, each context on its own, and the combinations named', () => {
    assert.equal(modes.length, 1 + 6 + 1);
    assert.equal(modes[0], 'light/cosy/soft');
    assert.ok(modes.includes('dark/cosy/soft') && modes.includes('dark/compact/soft'));
    assert.equal(new Resolver(doc).resolveAllToDesignSystem().getCollection('ds')!.getModes().length, 24);
  });

  it('names one context as modifier=context', () => {
    assert.deepEqual(system.resolveValue('ds.gap', 'density=compact'), px(4));
    assert.deepEqual(system.resolveValue('ds.bg', 'density=compact'), srgb(1), 'the other modifiers stay at their defaults');
    assert.deepEqual(system.resolveValue('ds.radius', 'shape=pill'), px(999));
  });

  it('names a combination, in any order, and by its full name', () => {
    assert.deepEqual(system.resolveValue('ds.bg', 'density=compact theme=dark'), srgb(0));
    assert.deepEqual(system.resolveValue('ds.gap', 'theme=dark density=compact'), px(4));
    assert.deepEqual(system.resolveValue('ds.gap', 'dark/compact/soft'), px(4));
    assert.deepEqual(system.resolveValue('ds.gap', 'theme=light'), px(8), 'naming a default is the default mode');
  });

  it('refuses an unknown modifier, an unknown context, and a combination not built', () => {
    assert.throws(
      () => system.resolveValue('ds.gap', 'size=large'),
      (e: Error) => e instanceof InvalidModeError && /has no modifier 'size'\. Modifiers: theme, density, shape/.test(e.message),
    );
    assert.throws(
      () => system.resolveValue('ds.gap', 'density=tight'),
      /modifier 'density' has no context 'tight'\. Contexts: cosy, compact, spacious/,
    );
    assert.throws(() => system.resolveValue('ds.gap', 'theme=dark shape=pill'), /was not built/);
    assert.throws(() => system.resolveValue('ds.gap', 'density='), /'density=' is not modifier=context/);
  });
});

describe('modifier=context in the full build', () => {
  it('names the same mode as the full name', () => {
    const system = new Resolver(doc).resolveAllToDesignSystem();
    assert.deepEqual(
      system.resolveValue('ds.radius', 'shape=round density=spacious'),
      system.resolveValue('ds.radius', 'light/spacious/round'),
    );
    assert.deepEqual(system.getCollection('ds')!.getAllPaths('theme=dark'), system.getCollection('ds')!.getAllPaths('dark/cosy/soft'));
  });

  it('is refused by a collection whose modes have no contexts', async () => {
    const { Collection } = await import('../../src/index.js');
    assert.throws(() => new Collection('plain', ['light', 'dark']).getToken('x', 'theme=dark'), /have none/);
  });
});

describe('a modifier says how its contexts appear in CSS', async () => {
  const { getContextSelector } = await import('../../src/index.js');
  const theme = {
    name: 'theme',
    $extensions: {
      'com.toghen': {
        css: {
          selector: "[data-theme='{context}']",
          contexts: { dark: { atRule: '@media (prefers-color-scheme: dark)' }, contrast: { selector: '.hc', atRule: '@media print' } },
        },
      },
    },
  };

  it('fills the pattern, or takes a context of its own whole', () => {
    assert.deepEqual(getContextSelector(theme, 'dim'), { selector: "[data-theme='dim']" });
    assert.deepEqual(getContextSelector(theme, 'dark'), { atRule: '@media (prefers-color-scheme: dark)' });
    assert.deepEqual(getContextSelector(theme, 'contrast'), { selector: '.hc', atRule: '@media print' });
  });

  it('says nothing for a modifier with no spelling, and refuses a malformed one', () => {
    assert.equal(getContextSelector({}, 'dark'), undefined);
    assert.throws(
      () => getContextSelector({ name: 'm', $extensions: { 'com.toghen': { css: { atRule: 'media x' } } } }, 'a'),
      /atRule must start with '@'/,
    );
    assert.throws(() => getContextSelector({ $extensions: { 'com.toghen': { css: { selector: 3 } } } }, 'a'), /selector must be a string/);
  });

  it('ignores an inherits key left in a document', () => {
    const state = { name: 'state', $extensions: { 'com.toghen': { css: { selector: ':{context}', inherits: false } } } };
    assert.deepEqual(getContextSelector(state, 'hover'), { selector: ':hover' });
  });

  it('is given by the resolver, with the modifiers in declared order, which mode names follow too', () => {
    const reordered = {
      ...doc,
      modifiers: { shape: doc.modifiers!.shape, theme: { ...doc.modifiers!.theme, ...theme }, density: doc.modifiers!.density },
    };
    const resolver = new Resolver(reordered as ResolverDocument);
    const modifiers = resolver.getModifiers();
    assert.deepEqual(
      modifiers.map((m) => m.name),
      ['shape', 'theme', 'density'],
    );
    assert.deepEqual(getContextSelector(modifiers[1], 'dark'), { atRule: '@media (prefers-color-scheme: dark)' });
    assert.deepEqual(modifiers[2], { name: 'density', contexts: ['cosy', 'compact', 'spacious'], default: 'cosy' });
    assert.equal(resolver.getModeName({ theme: 'dark' }), 'soft/dark/cosy');
    assert.deepEqual(
      resolver.getModifiers('precedence').map((m) => m.name),
      ['theme', 'density', 'shape'],
      'the order they win in',
    );
    assert.equal(resolver.resolveContextsToDesignSystem().getCollection('ds')!.getModes()[0], 'soft/light/cosy');
  });
});

describe("a group's attributes are kept per mode", () => {
  const grouped: ResolverDocument = {
    version: '2025-11-01',
    name: 'ds',
    sets: { base: { sources: [{ space: { $description: 'Spacing scale.', $type: 'dimension', md: { $value: '8px' } } }] } },
    modifiers: {
      density: {
        default: 'cosy',
        contexts: {
          cosy: [],
          compact: [{ space: { $description: 'Tighter scale.', md: { $value: '4px' } } }],
          named: [{ space: { $type: 'string', md: { $value: 'medium' } } }],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/density' }],
  };

  it('reads each mode its own description and type', () => {
    const system = new Resolver(grouped).resolveContextsToDesignSystem();
    const collection = system.getCollection('ds')!;
    assert.equal(collection.getGroupAttribute('space', '$description'), 'Spacing scale.');
    assert.equal(collection.getGroupAttribute('space', '$description', 'density=compact'), 'Tighter scale.');
    assert.equal(system.resolveToken('ds.space.md')!.$type, 'dimension');
    assert.deepEqual(system.resolveValue('ds.space.md'), { value: 8, unit: 'px' }, 'a later mode did not retype the default');
    assert.equal(system.resolveToken('ds.space.md', 'density=named')!.$type, 'string');
    assert.equal(system.resolveValue('ds.space.md', 'density=named'), 'medium', 'checked as the type of its own mode');
  });

  it('sets one mode, or every mode when none is named', async () => {
    const { Collection } = await import('../../src/index.js');
    const collection = new Collection('c', ['a', 'b']);
    collection.setGroupAttribute('g', '$description', 'both');
    collection.setGroupAttribute('g', '$description', 'only b', 'b');
    assert.equal(collection.getGroupAttribute('g', '$description', 'a'), 'both');
    assert.equal(collection.getGroupAttribute('g', '$description', 'b'), 'only b');
  });
});

describe('the resolver that built a collection', () => {
  it('is kept by both builds; a collection built by hand has none', async () => {
    const { Collection } = await import('../../src/index.js');
    const resolver = new Resolver(doc);
    assert.equal(resolver.resolveAllToDesignSystem().getCollection('ds')!.resolver, resolver);
    assert.equal(resolver.resolveContextsToDesignSystem().getCollection('ds')!.resolver, resolver);
    assert.equal(new Collection('c', ['a', 'b']).resolver, undefined);
  });
});

describe('a mode named by its contexts matches regardless of case', () => {
  it('finds the mode, and refuses an unknown name with the declared spelling', () => {
    const collection = new Resolver(doc).resolveAllToDesignSystem().getCollection('ds')!;
    assert.equal(collection.modeNamed('Density=Compact'), collection.modeNamed('density=compact'));
    assert.equal(collection.modeNamed('THEME=DARK density=Spacious'), collection.modeNamed('theme=dark density=spacious'));
    assert.throws(
      () => collection.modeNamed('Density=tight'),
      (e: Error) => e instanceof InvalidModeError && /modifier 'density' has no context 'tight'/.test(e.message),
    );
  });
});

describe('a token defined in one context only', () => {
  // `pin` is in the `pressed` context's source and in no base set.
  const only: ResolverDocument = {
    version: '2025-11-01',
    name: 'ds',
    sets: { base: { sources: [{ ink: { $type: 'color', $value: srgb(1) } }] } },
    modifiers: {
      state: {
        default: 'rest',
        contexts: {
          rest: [],
          pressed: [{ pin: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 0, 0] } } }],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/state' }],
  };
  const system = new Resolver(only).resolveContextsToDesignSystem();
  const collection = system.getCollection('ds')!;

  it('is found in the context that defines it', () => {
    assert.deepEqual(system.resolveValue('ds.pin', 'state=pressed'), { colorSpace: 'srgb', components: [1, 0, 0] });
    assert.ok(collection.getToken('pin', 'pressed'));
  });

  it('is absent in the other modes, the default included', () => {
    assert.equal(collection.getDefaultMode(), 'rest');
    assert.equal(collection.getToken('pin'), null);
    assert.equal(system.resolveToken('ds.pin', 'rest'), null);
    assert.deepEqual(collection.getAllPaths('rest'), ['ink']);
    assert.throws(() => system.resolveValue('ds.pin', 'rest'), /not found/);
  });
});
