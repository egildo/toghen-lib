import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InvalidReferenceError, load, Resolver } from '../../../src/index.js';
import { joinLocation } from '../../../src/resolver/load.js';

/** A `read` over files in memory, recording what was asked for. */
function files(entries: Record<string, unknown>) {
  const asked: string[] = [];
  const read = async (location: string) => {
    asked.push(location);
    if (!(location in entries)) throw new Error(`ENOENT ${location}`);
    const content = entries[location];
    return typeof content === 'string' ? content : JSON.stringify(content);
  };
  return { read, asked };
}

const json = (value: unknown) => JSON.stringify(value);

// One file per layer: primitives, semantic roles, a component sheet, and the
// resolver that says how they combine. The sheet's reference only resolves once
// every layer is merged.
const LAYERS = {
  'design/tokens/primitives.tokens.json': {
    color: {
      $type: 'color',
      ink: { $value: { colorSpace: 'srgb', components: [0.1, 0.1, 0.1] } },
      paper: { $value: { colorSpace: 'srgb', components: [1, 1, 1] } },
    },
    space: { $type: 'dimension', md: { $value: { value: 16, unit: 'px' } } },
    font: { stack: { $type: 'fontFamily', $value: ['Alpha', 'sans-serif'] } },
  },
  'design/tokens/light.tokens.json': { surface: { $type: 'color', base: { $value: '{color.paper}' } } },
  'design/tokens/dark.tokens.json': { surface: { $type: 'color', base: { $value: '{color.ink}' } } },
  'design/ui/card/card.tokens.json': {
    card: {
      background: { $type: 'color', $value: '{surface.base}' },
      padding: { $type: 'dimension', $value: '{space.md}' },
    },
  },
  'design/ui/card/card.resolver.json': {
    version: '2025-11-01',
    name: 'ds',
    sets: {
      base: { sources: [{ $ref: '../../tokens/primitives.tokens.json' }, { $ref: './card.tokens.json' }] },
    },
    modifiers: {
      theme: {
        default: 'light',
        contexts: {
          light: [{ $ref: '../../tokens/light.tokens.json' }],
          dark: [{ $ref: '../../tokens/dark.tokens.json' }],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  },
};

describe('load', () => {
  it('joins the layers into one system, references across files included', async () => {
    const { document } = await load('design/ui/card/card.resolver.json', files(LAYERS));
    const system = new Resolver(document).resolveAllToDesignSystem();

    assert.deepEqual(system.resolveValue('ds.card.background', 'light'), { colorSpace: 'srgb', components: [1, 1, 1] });
    assert.deepEqual(system.resolveValue('ds.card.background', 'dark'), { colorSpace: 'srgb', components: [0.1, 0.1, 0.1] });
    assert.deepEqual(system.resolveValue('ds.card.padding'), { value: 16, unit: 'px' });
    assert.deepEqual(system.resolveValue('ds.font.stack'), ['Alpha', 'sans-serif']);
  });

  it('resolves to the same tokens as the files concatenated by hand', async () => {
    const { document } = await load('design/ui/card/card.resolver.json', files(LAYERS));
    const byHand = new Resolver({
      ...LAYERS['design/ui/card/card.resolver.json'],
      sets: { base: { sources: [LAYERS['design/tokens/primitives.tokens.json'], LAYERS['design/ui/card/card.tokens.json']] } },
      modifiers: {
        theme: {
          default: 'light',
          contexts: { light: [LAYERS['design/tokens/light.tokens.json']], dark: [LAYERS['design/tokens/dark.tokens.json']] },
        },
      },
    } as never);
    for (const theme of ['light', 'dark']) {
      assert.deepEqual(new Resolver(document).resolve({ theme }), byHand.resolve({ theme }));
    }
  });

  it('bundles: the loaded document, written out, is a resolver document on its own', async () => {
    const { document } = await load('design/ui/card/card.resolver.json', files(LAYERS));
    const bundled = new Resolver(JSON.parse(JSON.stringify(document)));
    assert.deepEqual(bundled.resolve({ theme: 'dark' }), new Resolver(document).resolve({ theme: 'dark' }));
  });

  it('reads each file once, by the path relative to the file that names it', async () => {
    const fs = files({
      ...LAYERS,
      'design/ui/card/card.resolver.json': {
        ...LAYERS['design/ui/card/card.resolver.json'],
        sets: {
          base: { sources: [{ $ref: '../../tokens/primitives.tokens.json' }] },
          again: { sources: [{ $ref: './../../tokens/primitives.tokens.json' }] },
        },
      },
    });
    await load('design/ui/card/card.resolver.json', fs);
    assert.equal(fs.asked.filter((l) => l === 'design/tokens/primitives.tokens.json').length, 1);
  });

  it('selects part of a file with a fragment, and its members land at the root', async () => {
    const { document } = await load(
      'r.json',
      files({
        'r.json': {
          version: '2025-11-01',
          name: 'ds',
          sets: { s: { sources: [{ $ref: 'p.json#/color' }] } },
          resolutionOrder: [{ $ref: '#/sets/s' }],
        },
        'p.json': { color: { $type: 'color', ink: { $value: '#111111' } }, space: {} },
      }),
    );
    const resolved = new Resolver(document).resolve();
    assert.deepEqual(Object.keys(resolved), ['$type', 'ink']);
  });

  it('follows file references in inline items of the resolution order', async () => {
    const { document } = await load(
      'r.json',
      files({
        'r.json': { version: '2025-11-01', resolutionOrder: [{ type: 'set', name: 'inline', sources: [{ $ref: 'p.json' }] }] },
        'p.json': { a: { $type: 'number', $value: 1 } },
      }),
    );
    assert.equal(new Resolver(document).resolve().a.$value, 1);
  });

  it('says which files define each token', async () => {
    const { origins } = await load('design/ui/card/card.resolver.json', files(LAYERS));
    assert.deepEqual(origins.get('card.background'), ['design/ui/card/card.tokens.json']);
    assert.deepEqual(origins.get('surface.base'), ['design/tokens/light.tokens.json', 'design/tokens/dark.tokens.json']);
    assert.deepEqual(origins.get('space.md'), ['design/tokens/primitives.tokens.json']);
  });

  it('leaves same-document references for the resolver', async () => {
    const doc = LAYERS['design/ui/card/card.resolver.json'];
    const { document } = await load(
      'r.json',
      files({
        'r.json': {
          ...doc,
          sets: { base: { sources: [{ a: { $value: 1 } }] } },
          modifiers: {},
          resolutionOrder: [{ $ref: '#/sets/base' }],
        },
      }),
    );
    assert.deepEqual(document.resolutionOrder, [{ $ref: '#/sets/base' }]);
  });
});

// A UI folder whose resolver builds on a shared one, which builds on a third.
const SHARED = {
  'tokens/primitives.tokens.json': {
    color: { $type: 'color', ink: { $value: '#111111' }, paper: { $value: '#ffffff' } },
    space: { $type: 'dimension', md: { $value: { value: 16, unit: 'px' } } },
  },
  'tokens/core.resolver.json': {
    version: '2025-11-01',
    sets: { primitives: { sources: [{ $ref: './primitives.tokens.json' }] } },
    resolutionOrder: [{ $ref: '#/sets/primitives' }],
  },
  'tokens/shared.resolver.json': {
    version: '2025-11-01',
    sets: {
      // Same-document, in this file: copied along with it.
      base: { sources: [{ $ref: '#/sets/semantic' }] },
      semantic: {
        sources: [{ $ref: './core.resolver.json#/sets/primitives' }, { surface: { $type: 'color', base: { $value: '{color.paper}' } } }],
      },
    },
    modifiers: {
      theme: {
        default: 'light',
        contexts: {
          light: [{ surface: { base: { $value: '{color.paper}' } } }],
          dark: [{ surface: { base: { $value: '{color.ink}' } } }],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  },
  'ui/card/card.resolver.json': {
    version: '2025-11-01',
    name: 'ds',
    sets: {
      // A set of this file with the same name as the shared one: no clash.
      base: { sources: [{ $ref: '../../tokens/shared.resolver.json#/sets/base' }, { $ref: './card.tokens.json' }] },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '../../tokens/shared.resolver.json#/modifiers/theme' }],
  },
  'ui/card/card.tokens.json': { card: { background: { $type: 'color', $value: '{surface.base}' } } },
};

describe('load follows other resolver documents', () => {
  it('copies the sets and modifiers they name, relative to their own files', async () => {
    const { document, origins } = await load('ui/card/card.resolver.json', files(SHARED));
    const system = new Resolver(document).resolveAllToDesignSystem();

    assert.equal(system.resolveValue('ds.card.background', 'light').hex, '#ffffff');
    assert.equal(system.resolveValue('ds.card.background', 'dark').hex, '#111111');
    assert.deepEqual(system.resolveValue('ds.space.md'), { value: 16, unit: 'px' });
    assert.deepEqual(Object.keys(document.modifiers!), ['theme']);
    assert.deepEqual(origins.get('space.md'), ['tokens/primitives.tokens.json']);
  });

  it('bundles to a document with no reference to another file', async () => {
    const { document } = await load('ui/card/card.resolver.json', files(SHARED));
    const refs = JSON.stringify(document).match(/"\$ref":"[^"]*"/g) ?? [];
    assert.ok(refs.length > 0 && refs.every((ref) => ref.startsWith('"$ref":"#')), refs.join(' '));
  });

  it('copies a set reached twice once, and reads each file once', async () => {
    const fs = files({
      ...SHARED,
      'r.json': {
        version: '2025-11-01',
        sets: {
          a: { sources: [{ $ref: 'tokens/core.resolver.json#/sets/primitives' }] },
          b: { sources: [{ $ref: './tokens/core.resolver.json#/sets/primitives' }] },
        },
        resolutionOrder: [{ $ref: '#/sets/a' }, { $ref: '#/sets/b' }],
      },
    });
    const { document } = await load('r.json', fs);
    assert.equal(Object.keys(document.sets!).filter((name) => name.includes('primitives')).length, 1);
    assert.equal(fs.asked.filter((l) => l === 'tokens/core.resolver.json').length, 1);
  });

  it('refuses a cycle, naming every step', async () => {
    const fs = files({
      'a.resolver.json': {
        version: '2025-11-01',
        sets: { a: { sources: [{ $ref: 'b.resolver.json#/sets/b' }] } },
        resolutionOrder: [{ $ref: '#/sets/a' }],
      },
      'b.resolver.json': { version: '2025-11-01', sets: { b: { sources: [{ $ref: 'a.resolver.json#/sets/a' }] } }, resolutionOrder: [] },
    });
    await assert.rejects(load('a.resolver.json', fs), (error: Error) => {
      assert.ok(error instanceof InvalidReferenceError);
      assert.match(
        error.message,
        /closes a cycle: a\.resolver\.json#\/sets\/a → b\.resolver\.json#\/sets\/b → a\.resolver\.json#\/sets\/a/,
      );
      return true;
    });
  });

  it('refuses two different modifiers with one name', async () => {
    const fs = files({
      ...SHARED,
      'r.json': {
        version: '2025-11-01',
        modifiers: { theme: { contexts: { a: [{}], b: [{}] } } },
        resolutionOrder: [{ $ref: 'tokens/shared.resolver.json#/modifiers/theme' }],
      },
    });
    await assert.rejects(
      load('r.json', fs),
      /modifier "theme" is defined in both r\.json#\/modifiers\/theme and tokens\/shared\.resolver\.json#\/modifiers\/theme/,
    );
  });

  it('refuses a whole resolver document, and a set it does not have', async () => {
    const resolver = (source: unknown) => ({
      version: '2025-11-01',
      sets: { s: { sources: [source] } },
      resolutionOrder: [{ $ref: '#/sets/s' }],
    });
    await assert.rejects(
      load('r.json', files({ ...SHARED, 'r.json': resolver({ $ref: 'tokens/core.resolver.json' }) })),
      /names a resolver document; point at one of its sets or modifiers/,
    );
    await assert.rejects(
      load('r.json', files({ ...SHARED, 'r.json': resolver({ $ref: 'tokens/core.resolver.json#/sets/nope' }) })),
      /"tokens\/core\.resolver\.json" has no set "nope"/,
    );
  });
});

describe('load refuses, naming the reference and the file', () => {
  const resolver = (source: unknown) => ({
    version: '2025-11-01',
    sets: { s: { sources: [source] } },
    resolutionOrder: [{ $ref: '#/sets/s' }],
  });

  it('a missing file', async () => {
    await assert.rejects(load('r.json', files({ 'r.json': resolver({ $ref: './gone.json' }) })), (error: Error) => {
      assert.ok(error instanceof InvalidReferenceError);
      assert.match(error.message, /\$ref "\.\/gone\.json" in "r\.json": "gone\.json" could not be read/);
      return true;
    });
  });

  it('a file that is not JSON', async () => {
    await assert.rejects(load('r.json', files({ 'r.json': resolver({ $ref: 'p.json' }), 'p.json': '{ nope' })), /"p\.json" is not JSON/);
  });

  it('a pointer that matches no group', async () => {
    await assert.rejects(
      load('r.json', files({ 'r.json': resolver({ $ref: 'p.json#/missing' }), 'p.json': json({}) })),
      /points to no group of tokens in "p\.json"/,
    );
  });

  it('a URI', async () => {
    await assert.rejects(load('r.json', files({ 'r.json': resolver({ $ref: 'https://example.test/p.json' }) })), /names a URI/);
  });

  it('an entry document that cannot be read', async () => {
    await assert.rejects(load('nowhere.json', files({})), /the entry document "nowhere\.json": "nowhere\.json" could not be read/);
  });
});

// Token files with no resolver document: primitives, and roles that refer to them.
const TOKEN_FILES = {
  'design/tokens/primitives.tokens.json': LAYERS['design/tokens/primitives.tokens.json'],
  'design/tokens/roles.tokens.json': {
    surface: { $type: 'color', base: { $value: '{color.paper}' } },
    gap: { $type: 'dimension', $value: '{space.md}' },
    body: { $type: 'fontFamily', $value: '{font.stack}' },
  },
  'design/tokens/override.tokens.json': {
    color: { paper: { $value: { colorSpace: 'srgb', components: [0.9, 0.9, 0.8] } } },
  },
};

describe('load takes token files', () => {
  it('one token file as a string entry, named for its folder', async () => {
    const { document } = await load('design/tokens/primitives.tokens.json', files(TOKEN_FILES));
    const system = new Resolver(document).resolveContextsToDesignSystem();
    assert.equal(document.name, 'tokens');
    assert.deepEqual(system.resolveValue('tokens.color.ink'), { colorSpace: 'srgb', components: [0.1, 0.1, 0.1] });
    assert.deepEqual(system.resolveValue('tokens.space.md'), { value: 16, unit: 'px' });
    assert.deepEqual(system.resolveValue('tokens.font.stack'), ['Alpha', 'sans-serif']);
  });

  it('a list, merged in the order given, resolving through references across files', async () => {
    const list = ['design/tokens/primitives.tokens.json', 'design/tokens/roles.tokens.json'];
    const { document } = await load(list, files(TOKEN_FILES));
    const system = new Resolver(document).resolveContextsToDesignSystem();
    assert.deepEqual(system.resolveValue('tokens.surface.base'), { colorSpace: 'srgb', components: [1, 1, 1] });
    assert.deepEqual(system.resolveValue('tokens.gap'), { value: 16, unit: 'px' });
    assert.deepEqual(system.resolveValue('tokens.body'), ['Alpha', 'sans-serif']);
  });

  it('the later file wins', async () => {
    const list = ['design/tokens/primitives.tokens.json', 'design/tokens/roles.tokens.json', 'design/tokens/override.tokens.json'];
    const system = new Resolver((await load(list, files(TOKEN_FILES))).document).resolveContextsToDesignSystem();
    assert.deepEqual(system.resolveValue('tokens.surface.base'), { colorSpace: 'srgb', components: [0.9, 0.9, 0.8] });
    const reversed = new Resolver((await load([list[2], list[0], list[1]], files(TOKEN_FILES))).document).resolveContextsToDesignSystem();
    assert.deepEqual(reversed.resolveValue('tokens.surface.base'), { colorSpace: 'srgb', components: [1, 1, 1] });
  });

  it('wraps them in a standard resolver document, never asking read for it', async () => {
    const fs = files(TOKEN_FILES);
    const { document } = await load(['design/tokens/primitives.tokens.json', './design/tokens/roles.tokens.json'], fs);
    assert.equal(document.version, '2025-11-01');
    assert.deepEqual(document.resolutionOrder, [{ $ref: '#/sets/base' }]);
    assert.equal(document.sets!.base.sources.length, 2);
    assert.deepEqual(fs.asked, ['design/tokens/primitives.tokens.json', 'design/tokens/roles.tokens.json']);
  });

  it('takes a given name', async () => {
    const { document } = await load('design/tokens/primitives.tokens.json', { ...files(TOKEN_FILES), name: 'ds' });
    assert.equal(document.name, 'ds');
    assert.deepEqual(new Resolver(document).resolveContextsToDesignSystem().resolveValue('ds.space.md'), { value: 16, unit: 'px' });
  });

  it('files in two subfolders take the name of their parent', async () => {
    const { document } = await load(['design/tokens/primitives.tokens.json', 'design/ui/card/card.tokens.json'], files(LAYERS));
    assert.equal(document.name, 'design');
  });

  it('names the real files in origins', async () => {
    const list = ['design/tokens/primitives.tokens.json', 'design/tokens/roles.tokens.json', 'design/tokens/override.tokens.json'];
    const { origins } = await load(list, files(TOKEN_FILES));
    assert.deepEqual(origins.get('color.paper'), ['design/tokens/primitives.tokens.json', 'design/tokens/override.tokens.json']);
    assert.deepEqual(origins.get('gap'), ['design/tokens/roles.tokens.json']);
  });

  it('bundles: the document, written out, resolves the same', async () => {
    const { document } = await load(['design/tokens/primitives.tokens.json', 'design/tokens/roles.tokens.json'], files(TOKEN_FILES));
    const bundled = new Resolver(JSON.parse(JSON.stringify(document)));
    assert.deepEqual(bundled.resolve(), new Resolver(document).resolve());
    assert.deepEqual(bundled.resolveContextsToDesignSystem().resolveValue('tokens.surface.base'), {
      colorSpace: 'srgb',
      components: [1, 1, 1],
    });
  });

  it('still loads a resolver document given as a string', async () => {
    const { document } = await load('design/ui/card/card.resolver.json', files(LAYERS));
    assert.equal(document.name, 'ds');
    assert.deepEqual(Object.keys(document.modifiers!), ['theme']);
  });

  it('refuses files with no common folder, asking for a name', async () => {
    const fs = files({ 'a.tokens.json': {}, 'b/c.tokens.json': {} });
    await assert.rejects(load(['a.tokens.json', 'b/c.tokens.json'], fs), (error: Error) => {
      assert.ok(error instanceof InvalidReferenceError);
      assert.match(error.message, /give options\.name/);
      return true;
    });
    await assert.rejects(load(['/a.tokens.json'], fs), /give options\.name/);
    const { document } = await load(['a.tokens.json', 'b/c.tokens.json'], { ...fs, name: 'ds' });
    assert.equal(document.name, 'ds');
  });

  it('refuses an empty list', async () => {
    await assert.rejects(load([], files({})), (error: Error) => error instanceof InvalidReferenceError && /empty list/.test(error.message));
  });
});

// A system in one folder, a second palette in another, and a shared resolver beside them.
const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] });
const palette = (accent: [number, number, number], gap: number) => ({
  color: { $type: 'color', accent: { $value: srgb(...accent) } },
  space: { $type: 'dimension', gap: { $value: { value: gap, unit: 'px' } } },
  font: { body: { $type: 'fontFamily', $value: ['Alpha', 'sans-serif'] } },
});
const MAPPED = {
  'ds/ds.resolver.json': {
    version: '2025-11-01',
    name: 'ds',
    sets: { base: { sources: [{ $ref: 'palette.tokens.json' }, { $ref: 'roles.tokens.json#/roles' }] } },
    modifiers: { theme: { default: 'light', contexts: { light: [], dark: [{ $ref: 'dark.tokens.json' }] } } },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  },
  'ds/palette.tokens.json': palette([0.1, 0.4, 0.9], 8),
  'ds/roles.tokens.json': { roles: { surface: { $type: 'color', raised: { $value: '{color.accent}' } } }, other: {} },
  'ds/roles.flat.tokens.json': { roles: { surface: { $type: 'color', raised: { $value: srgb(1, 1, 1) } } } },
  'ds/dark.tokens.json': { color: { accent: { $value: srgb(0.4, 0.6, 1) } } },
  'themes/warm/palette.tokens.json': palette([0.9, 0.4, 0.1], 12),
  'shared/core.resolver.json': {
    version: '2025-11-01',
    sets: { core: { sources: [{ $ref: 'palette.tokens.json' }] } },
    resolutionOrder: [{ $ref: '#/sets/core' }],
  },
  'shared/palette.tokens.json': palette([0.2, 0.7, 0.3], 16),
};
const ENTRY = 'ds/ds.resolver.json';
const mapped = (overrides: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  ...files({ ...MAPPED, ...extra }),
  overrides,
});
const system = (document: Awaited<ReturnType<typeof load>>['document']) => new Resolver(document).resolveContextsToDesignSystem();

describe('load with an overrides map', () => {
  it('swaps a token file: the colour and the dimension change, the rest stays', async () => {
    const { document, origins } = await load(ENTRY, mapped({ 'palette.tokens.json': '../themes/warm/palette.tokens.json' }));
    const ds = system(document);
    assert.deepEqual(ds.resolveValue('ds.color.accent'), srgb(0.9, 0.4, 0.1));
    assert.deepEqual(ds.resolveValue('ds.surface.raised'), srgb(0.9, 0.4, 0.1));
    assert.deepEqual(ds.resolveValue('ds.space.gap'), { value: 12, unit: 'px' });
    assert.deepEqual(ds.resolveValue('ds.font.body'), ['Alpha', 'sans-serif']);
    assert.deepEqual(ds.resolveValue('ds.color.accent', 'theme=dark'), srgb(0.4, 0.6, 1));
    assert.deepEqual(origins.get('space.gap'), ['themes/warm/palette.tokens.json']);
  });

  it('bundles the swapped content, and the bundle reloads to the same values', async () => {
    const { document } = await load(ENTRY, mapped({ 'palette.tokens.json': '../themes/warm/palette.tokens.json' }));
    const text = JSON.stringify(document);
    assert.match(text, /"value":12/);
    assert.doesNotMatch(text, /"value":8/);
    const reloaded = system(JSON.parse(text));
    assert.deepEqual(reloaded.resolveValue('ds.color.accent'), srgb(0.9, 0.4, 0.1));
    assert.deepEqual(reloaded.resolveValue('ds.space.gap'), { value: 12, unit: 'px' });
  });

  it('reports each read: the written reference, its holder, the location, and whether the map sent it', async () => {
    const { reads } = await load(ENTRY, mapped({ 'palette.tokens.json': '../themes/warm/palette.tokens.json' }));
    assert.deepEqual(reads, [
      { ref: 'palette.tokens.json', holder: ENTRY, location: 'themes/warm/palette.tokens.json', overridden: true },
      { ref: 'roles.tokens.json#/roles', holder: ENTRY, location: 'ds/roles.tokens.json', overridden: false },
      { ref: 'dark.tokens.json', holder: ENTRY, location: 'ds/dark.tokens.json', overridden: false },
    ]);
  });

  it('matches a key whole: the fragment is part of it', async () => {
    const { document, overrides } = await load(
      ENTRY,
      mapped({
        'roles.tokens.json#/roles': 'roles.flat.tokens.json#/roles',
        'roles.tokens.json': 'nowhere.tokens.json',
      }),
    );
    assert.deepEqual(system(document).resolveValue('ds.surface.raised'), srgb(1, 1, 1));
    assert.deepEqual(overrides!.unused, ['roles.tokens.json']);
  });

  it('maps a same-document pointer like any other key', async () => {
    const { document, reads } = await load(ENTRY, mapped({ '#/sets/base': '../shared/core.resolver.json#/sets/core' }));
    assert.deepEqual(system(document).resolveValue('ds.space.gap'), { value: 16, unit: 'px' });
    assert.deepEqual(
      reads.filter((read) => read.overridden),
      [{ ref: '#/sets/base', holder: ENTRY, location: 'shared/core.resolver.json', overridden: true }],
    );
  });

  it("sends a token file to another resolver's set, which is copied in", async () => {
    const { document } = await load(
      ENTRY,
      mapped(
        { 'palette.tokens.json': '../shared/core.resolver.json#/sets/core' },
        {
          'shared/core.resolver.json': {
            ...MAPPED['shared/core.resolver.json'],
            sets: { core: { sources: [{ $ref: './palette.tokens.json' }] } },
          },
        },
      ),
    );
    assert.deepEqual(system(document).resolveValue('ds.color.accent'), srgb(0.2, 0.7, 0.3));
    assert.ok('shared/core.resolver.json#core' in document.sets!);
  });

  it('resolves a relative value against each holder, so one key catches the text in every document', async () => {
    const { reads } = await load(
      ENTRY,
      mapped(
        { 'palette.tokens.json': 'warm/palette.tokens.json', '#/sets/base': '../shared/core.resolver.json#/sets/core' },
        {
          'ds/warm/palette.tokens.json': palette([0.9, 0.4, 0.1], 12),
          'shared/warm/palette.tokens.json': palette([0.9, 0.4, 0.1], 12),
        },
      ),
    );
    assert.deepEqual(
      reads.filter((read) => read.ref === 'palette.tokens.json').map(({ holder, location }) => [holder, location]),
      [
        [ENTRY, 'ds/warm/palette.tokens.json'],
        ['shared/core.resolver.json', 'shared/warm/palette.tokens.json'],
      ],
    );
  });

  it('applies to the references of the wrapper around token files', async () => {
    const { document, reads } = await load(
      ['ds/palette.tokens.json'],
      mapped({ 'palette.tokens.json': '../themes/warm/palette.tokens.json' }),
    );
    assert.deepEqual(system(document).resolveValue('ds.space.gap'), { value: 12, unit: 'px' });
    assert.deepEqual(reads, [
      { ref: 'palette.tokens.json', holder: 'ds/ds.resolver.json', location: 'themes/warm/palette.tokens.json', overridden: true },
    ]);
  });

  it("lists the keys no reference matched, in the map's order; an empty map has none", async () => {
    const { overrides } = await load(
      ENTRY,
      mapped({ 'z.tokens.json': 'a.json', 'dark.tokens.json': 'dark.tokens.json', 'a.tokens.json': 'b.json' }),
    );
    assert.deepEqual(overrides!.unused, ['z.tokens.json', 'a.tokens.json']);
    assert.deepEqual((await load(ENTRY, mapped({}))).overrides!.unused, []);
  });

  it('hashes the map: one hash for any key order, another for a changed value', async () => {
    const hash = async (map: Record<string, string>) => (await load(ENTRY, mapped(map))).overrides!.hash;
    const one = await hash({ 'palette.tokens.json': '../themes/warm/palette.tokens.json', 'dark.tokens.json': 'dark.tokens.json' });
    assert.match(one, /^[0-9a-f]{16}$/);
    assert.equal(await hash({ 'dark.tokens.json': 'dark.tokens.json', 'palette.tokens.json': '../themes/warm/palette.tokens.json' }), one);
    assert.notEqual(await hash({ 'dark.tokens.json': 'dark.tokens.json', 'palette.tokens.json': '../shared/palette.tokens.json' }), one);
  });

  it('without a map: no overrides field, and the reads still listed', async () => {
    const result = await load(ENTRY, files(MAPPED));
    assert.equal('overrides' in result, false);
    assert.deepEqual(
      result.reads.map((read) => read.location),
      ['ds/palette.tokens.json', 'ds/roles.tokens.json', 'ds/dark.tokens.json'],
    );
    assert.ok(result.reads.every((read) => !read.overridden));
  });
});

describe('load refuses a mapped reference, naming the written reference, its holder and the location read', () => {
  it('a whole resolver document for a reference with no fragment', async () => {
    await assert.rejects(load(ENTRY, mapped({ 'palette.tokens.json': '../shared/core.resolver.json' })), (error: Error) => {
      assert.ok(error instanceof InvalidReferenceError);
      assert.match(
        error.message,
        /\$ref "palette\.tokens\.json" in "ds\/ds\.resolver\.json" \(mapped to "shared\/core\.resolver\.json"\) names a resolver document/,
      );
      return true;
    });
  });

  it('an item of resolutionOrder sent to a token file', async () => {
    await assert.rejects(load(ENTRY, mapped({ '#/sets/base': 'palette.tokens.json' })), (error: Error) => {
      assert.ok(error instanceof InvalidReferenceError);
      assert.match(
        error.message,
        /\$ref "#\/sets\/base" in "ds\/ds\.resolver\.json" \(mapped to "ds\/palette\.tokens\.json"\) is an item of resolutionOrder and names tokens/,
      );
      return true;
    });
  });

  it('a cycle made through the map', async () => {
    // Written in the shared document too, the same key leads back to the set that holds it.
    await assert.rejects(load(ENTRY, mapped({ 'palette.tokens.json': '../shared/core.resolver.json#/sets/core' })), (error: Error) => {
      assert.ok(error instanceof InvalidReferenceError);
      assert.match(
        error.message,
        /\(mapped to "shared\/core\.resolver\.json"\) closes a cycle: ds\/ds\.resolver\.json#\/sets\/base → shared\/core\.resolver\.json#\/sets\/core → shared\/core\.resolver\.json#\/sets\/core/,
      );
      return true;
    });
  });

  it('a value with a URI scheme', async () => {
    await assert.rejects(
      load(ENTRY, mapped({ 'palette.tokens.json': 'https://example.test/p.json' })),
      /\$ref "palette\.tokens\.json" in "ds\/ds\.resolver\.json" \(mapped to "https:\/\/example\.test\/p\.json"\) names a URI/,
    );
  });

  it('a value that is not a string', async () => {
    await assert.rejects(
      load(ENTRY, mapped({ 'palette.tokens.json': 42 as unknown as string })),
      (error: Error) => error instanceof InvalidReferenceError && /a value must be a location/.test(error.message),
    );
  });
});

describe('joinLocation', () => {
  it('resolves against the directory of the referring file', () => {
    assert.equal(joinLocation('r.json', './p.json'), 'p.json');
    assert.equal(joinLocation('a/b/r.json', '../p.json'), 'a/p.json');
    assert.equal(joinLocation('a/r.json', '../../p.json'), '../p.json');
    assert.equal(joinLocation('/abs/r.json', '../p.json'), '/p.json');
    assert.equal(joinLocation('a/r.json', '/x/p.json'), '/x/p.json');
    assert.equal(joinLocation('./a/r.json', 'b/./p.json'), 'a/b/p.json');
  });
});

// One resolver in one folder, its sets named in resolutionOrder in the order given.
const resolverOf = (sets: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  version: '2025-11-01',
  name: 'ds',
  sets,
  resolutionOrder: Object.keys(sets).map((name) => ({ $ref: `#/sets/${name}` })),
  ...extra,
});
const accent = (value: unknown) => ({ color: { $type: 'color', accent: { $value: value } } });
const twoFiles = { base: { sources: [{ $ref: 'a.tokens.json' }, { $ref: 'b.tokens.json' }] } };
const collisionsOf = async (entries: Record<string, unknown>, overrides?: Record<string, string>) =>
  (await load('c/r.json', { ...files(entries), ...(overrides && { overrides }) })).collisions;

describe('load reports collisions', () => {
  it('two files of one set giving one path different colours: in merge order, not redundant, the last still wins', async () => {
    const { document, collisions } = await load(
      'c/r.json',
      files({
        'c/r.json': resolverOf(twoFiles),
        'c/a.tokens.json': accent(srgb(1, 0, 0)),
        'c/b.tokens.json': accent(srgb(0, 0, 1)),
      }),
    );
    assert.deepEqual(collisions, [{ path: 'color.accent', set: 'base', files: ['c/a.tokens.json', 'c/b.tokens.json'], redundant: false }]);
    assert.deepEqual(system(document).resolveValue('ds.color.accent'), srgb(0, 0, 1));
  });

  it('the same colour in two files is redundant', async () => {
    const collisions = await collisionsOf({
      'c/r.json': resolverOf(twoFiles),
      'c/a.tokens.json': accent(srgb(0.2, 0.4, 0.6)),
      'c/b.tokens.json': accent(srgb(0.2, 0.4, 0.6)),
    });
    assert.deepEqual(
      collisions.map((collision) => collision.redundant),
      [true],
    );
  });

  it('the same colour written with its keys in another order is still redundant', async () => {
    const collisions = await collisionsOf({
      'c/r.json': resolverOf(twoFiles),
      'c/a.tokens.json': accent(srgb(0.2, 0.4, 0.6)),
      'c/b.tokens.json': accent({ components: [0.2, 0.4, 0.6], colorSpace: 'srgb' }),
    });
    assert.deepEqual(
      collisions.map((collision) => collision.redundant),
      [true],
    );
  });

  it('a hex string against the same colour in components is not redundant: equal as written, not as resolved', async () => {
    const collisions = await collisionsOf({
      'c/r.json': resolverOf(twoFiles),
      'c/a.tokens.json': accent('#ffffff'),
      'c/b.tokens.json': accent(srgb(1, 1, 1)),
    });
    assert.deepEqual(
      collisions.map((collision) => collision.redundant),
      [false],
    );
  });

  it('three files are all named, in merge order', async () => {
    const collisions = await collisionsOf({
      'c/r.json': resolverOf({ base: { sources: [{ $ref: 'a.tokens.json' }, { $ref: 'b.tokens.json' }, { $ref: 'd.tokens.json' }] } }),
      'c/a.tokens.json': accent(srgb(1, 0, 0)),
      'c/b.tokens.json': accent(srgb(0, 1, 0)),
      'c/d.tokens.json': accent(srgb(1, 0, 0)),
    });
    assert.deepEqual(collisions, [
      { path: 'color.accent', set: 'base', files: ['c/a.tokens.json', 'c/b.tokens.json', 'c/d.tokens.json'], redundant: false },
    ]);
  });

  it('a dimension and a font family collide, listed by path as first met; group attributes alone never collide', async () => {
    const collisions = await collisionsOf({
      'c/r.json': resolverOf(twoFiles),
      'c/a.tokens.json': palette([1, 0, 0], 8),
      'c/b.tokens.json': {
        font: { body: { $type: 'fontFamily', $value: ['Alpha', 'sans-serif'] } },
        space: { $type: 'dimension', gap: { $value: { unit: 'px', value: 12 } } },
        color: { $type: 'color', $description: 'The group alone.' },
      },
    });
    assert.deepEqual(
      collisions.map(({ path, redundant }) => [path, redundant]),
      [
        ['space.gap', false],
        ['font.body', true],
      ],
    );
  });

  it("a set whose source points at another set counts that set's sources in place", async () => {
    const collisions = await collisionsOf({
      'c/r.json': resolverOf({
        base: { sources: [{ $ref: '#/sets/core' }, { $ref: 'b.tokens.json' }] },
        core: { sources: [{ $ref: 'a.tokens.json' }] },
      }),
      'c/a.tokens.json': accent(srgb(1, 0, 0)),
      'c/b.tokens.json': accent(srgb(0, 0, 1)),
    });
    assert.deepEqual(collisions, [{ path: 'color.accent', set: 'base', files: ['c/a.tokens.json', 'c/b.tokens.json'], redundant: false }]);
  });

  it('two sources inside one modifier context', async () => {
    const collisions = await collisionsOf({
      'c/r.json': resolverOf(
        { base: { sources: [{ $ref: 'a.tokens.json' }] } },
        {
          modifiers: { theme: { default: 'light', contexts: { light: [], dark: [{ $ref: 'a.tokens.json' }, { $ref: 'b.tokens.json' }] } } },
          resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
        },
      ),
      'c/a.tokens.json': accent(srgb(1, 0, 0)),
      'c/b.tokens.json': accent(srgb(0, 0, 1)),
    });
    assert.deepEqual(collisions, [
      { path: 'color.accent', modifier: 'theme', context: 'dark', files: ['c/a.tokens.json', 'c/b.tokens.json'], redundant: false },
    ]);
  });

  it('none across two items of resolutionOrder', async () => {
    const collisions = await collisionsOf({
      'c/r.json': resolverOf({ base: { sources: [{ $ref: 'a.tokens.json' }] }, brand: { sources: [{ $ref: 'b.tokens.json' }] } }),
      'c/a.tokens.json': accent(srgb(1, 0, 0)),
      'c/b.tokens.json': accent(srgb(0, 0, 1)),
    });
    assert.deepEqual(collisions, []);
  });

  it('none between a set and a modifier context', async () => {
    const collisions = await collisionsOf({
      'c/r.json': resolverOf(
        { base: { sources: [{ $ref: 'a.tokens.json' }] } },
        {
          modifiers: { theme: { default: 'light', contexts: { light: [], dark: [{ $ref: 'b.tokens.json' }] } } },
          resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
        },
      ),
      'c/a.tokens.json': accent(srgb(1, 0, 0)),
      'c/b.tokens.json': accent(srgb(0, 0, 1)),
    });
    assert.deepEqual(collisions, []);
  });

  it('an inline token tree against a file: the inline one names the document it is written in', async () => {
    const collisions = await collisionsOf({
      'c/r.json': resolverOf(
        {},
        { resolutionOrder: [{ type: 'set', name: 'inline', sources: [accent(srgb(1, 0, 0)), { $ref: 'a.tokens.json' }] }] },
      ),
      'c/a.tokens.json': accent(srgb(0, 0, 1)),
    });
    assert.deepEqual(collisions, [{ path: 'color.accent', set: 'inline', files: ['c/r.json', 'c/a.tokens.json'], redundant: false }]);
  });

  it('a file the overrides map swapped in is named by the location read', async () => {
    const collisions = await collisionsOf(
      {
        'c/r.json': resolverOf(twoFiles),
        'c/a.tokens.json': accent(srgb(1, 0, 0)),
        'c/b.tokens.json': { other: { $type: 'number', $value: 1 } },
        'c/warm/b.tokens.json': accent(srgb(0.9, 0.4, 0.1)),
      },
      { 'b.tokens.json': 'warm/b.tokens.json' },
    );
    assert.deepEqual(collisions, [
      { path: 'color.accent', set: 'base', files: ['c/a.tokens.json', 'c/warm/b.tokens.json'], redundant: false },
    ]);
  });

  it('no collision is an empty list', async () => {
    assert.deepEqual((await load('design/ui/card/card.resolver.json', files(LAYERS))).collisions, []);
    assert.deepEqual((await load(ENTRY, files(MAPPED))).collisions, []);
  });
});
