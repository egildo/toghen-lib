/**
 * The component model, asked of the core: a group's children, the tokens under a group, the part a group is,
 * a component's axes in precedence order, the twins, and which token applies under a selection.
 * A synthetic document in the W3C structured shapes, loaded through a resolver.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Collection, DesignToken, InvalidTokenError, Resolver, type ResolverDocument } from '../../../src/index.js';

const srgb = (v: number) => ({ colorSpace: 'srgb', components: [v, v, v] });
const px = (value: number) => ({ value, unit: 'px' });
const color = (v: number) => ({ $type: 'color', $value: srgb(v) });
const VOCABULARY = {
  'com.toghen': {
    css: {
      parts: {
        variant: { primary: "[data-variant='primary']", quiet: "[data-variant='quiet']" },
        state: { hover: ':hover', pressed: ':active' },
        selection: { selected: "[aria-pressed='true']" },
      },
    },
  },
};

/** A chip with a variant and a state, its keys in the document in the order given. */
function chip(order: 'variant first' | 'state first'): ResolverDocument {
  const primary = { primary: { fill: color(0.2), ink: color(1) } };
  const hover = { hover: { fill: color(0.4) } };
  return {
    version: '2025-11-01',
    name: 'ui',
    sets: {
      base: {
        sources: [
          {
            $extensions: VOCABULARY,
            chip: {
              fill: color(0.9),
              ink: color(0),
              gap: { $type: 'dimension', $value: px(4) },
              family: { $type: 'fontFamily', $value: ['Inter', 'system-ui'] },
              icon: { size: { $type: 'dimension', $value: px(16) }, quiet: { size: { $type: 'dimension', $value: px(12) } } },
              ...(order === 'variant first' ? { ...primary, ...hover } : { ...hover, ...primary }),
              selected: { fill: color(0.5), hover: { fill: color(0.6) } },
            },
          },
        ],
      },
    },
    modifiers: { theme: { default: 'light', contexts: { light: [], dark: [{ chip: { pressed: { fill: color(0.1) } } }] } } },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  } as ResolverDocument;
}
const ui = (order: 'variant first' | 'state first' = 'variant first') =>
  new Resolver(chip(order)).resolveContextsToDesignSystem().getCollection('ui')!;

describe('the structure of a collection', () => {
  it('lists a group children, each marked token or group, in document order', () => {
    assert.deepEqual(
      ui()
        .childrenOf('chip')
        .map((c) => `${c.key} ${c.kind}`),
      [
        'fill token',
        'ink token',
        'gap token',
        'family token',
        'icon group',
        'primary group',
        'hover group',
        'selected group',
        'pressed group',
      ],
    );
    assert.deepEqual(ui().childrenOf(''), [{ key: 'chip', path: 'chip', kind: 'group' }]);
    assert.deepEqual(ui().childrenOf('chip.fill'), [], 'a token has no children');
    assert.deepEqual(ui().childrenOf('nothing'), []);
  });

  it('lists a group child only where a token under it has a value, when a mode is asked', () => {
    assert.ok(
      ui()
        .childrenOf('chip', 'theme=dark')
        .some((c) => c.key === 'pressed'),
    );
    assert.ok(
      !ui()
        .childrenOf('chip', 'theme=light')
        .some((c) => c.key === 'pressed'),
    );
  });

  it('gives the tokens under a group, or the token itself', () => {
    assert.deepEqual(ui().getAllPaths('theme=light', 'chip.selected'), ['chip.selected.fill', 'chip.selected.hover.fill']);
    assert.deepEqual(ui().getAllPaths('theme=dark', 'chip.pressed'), ['chip.pressed.fill']);
    assert.deepEqual(ui().getAllPaths('theme=light', 'chip.pressed'), []);
    assert.deepEqual(ui().getAllPaths(undefined, 'chip.family'), ['chip.family']);
    assert.deepEqual(ui().getAllPaths(undefined, 'chip.none'), []);
  });
});

describe('parts, components and twins', () => {
  it('says the component of a part token, its twin along each axis, and its rest', () => {
    const { parts, rest, restExists, component } = ui().partsOf('chip.selected.hover.fill');
    assert.equal(component, 'chip');
    assert.deepEqual(
      parts.map((p) => [p.axis, p.twin, p.twinExists]),
      [
        ['selection', 'chip.hover.fill', true],
        ['state', 'chip.selected.fill', true],
      ],
    );
    assert.equal(rest, 'chip.fill');
    assert.equal(restExists, true);
  });

  it('says when a twin or the rest is not there', () => {
    const { parts, restExists } = ui().partsOf('chip.primary.ink');
    assert.equal(parts[0].twin, 'chip.ink');
    assert.equal(parts[0].twinExists, true);
    assert.equal(restExists, true);
    const lonely = new Collection('c');
    lonely.setGroupAttribute('', '$extensions', VOCABULARY);
    lonely.setToken('chip.hover.glow', new DesignToken(srgb(1), 'color'));
    assert.deepEqual(lonely.partsOf('chip.hover.glow').parts[0].twinExists, false);
    assert.equal(lonely.partsOf('chip.hover.glow').restExists, false);
  });

  it('says whether a group is a part, of which axis and value', () => {
    assert.deepEqual(ui().partAt('chip.selected.hover'), {
      at: 'chip.selected.hover',
      key: 'hover',
      axis: 'state',
      spelling: ':hover',
      twin: 'chip.selected',
      twinExists: true,
    });
    assert.equal(ui().partAt('chip.icon'), null);
    assert.equal(ui().partAt('chip'), null, 'a top-level group is a component, never a part');
  });

  it('gives the axes and values a component uses, in precedence order, whatever the key order', () => {
    const expected = [
      { axis: 'variant', values: ['primary'] },
      { axis: 'state', values: ['hover', 'pressed'] },
      { axis: 'selection', values: ['selected'] },
    ];
    assert.deepEqual(ui('variant first').axesOf('chip'), expected);
    assert.deepEqual(ui('state first').axesOf('chip'), expected);
    assert.deepEqual(ui().axesOf('chip', 'theme=light')[1], { axis: 'state', values: ['hover'] });
    assert.deepEqual(ui().axesOf('chip.selected'), [{ axis: 'state', values: ['hover'] }]);
    assert.deepEqual(ui().axesOf('chip.icon'), [{ axis: 'variant', values: ['quiet'] }], 'a nested component keeps its axes to itself');
  });
});

describe('which token applies under a selection', () => {
  it('is the component own token with nothing selected, and never a token in a plain subgroup', () => {
    assert.deepEqual(ui().applies('chip', {}), { fill: 'chip.fill', ink: 'chip.ink', gap: 'chip.gap', family: 'chip.family' });
  });

  it('is the part token with more parts', () => {
    assert.equal(ui().applies('chip', { selection: 'selected', state: 'hover' }).fill, 'chip.selected.hover.fill');
    assert.equal(ui().applies('chip', { selection: 'selected' }).fill, 'chip.selected.fill');
  });

  it('is, on a tie, the one whose latest differing axis comes later in the vocabulary', () => {
    assert.equal(ui().applies('chip', { variant: 'primary', state: 'hover' }).fill, 'chip.hover.fill');
    assert.equal(ui().applies('chip', { variant: 'primary', state: 'hover' }).ink, 'chip.primary.ink');
  });

  it('does not change when two keys swap places in the document', () => {
    const selections: Record<string, string>[] = [{ variant: 'primary', state: 'hover' }, { variant: 'primary' }, { state: 'hover' }];
    for (const selection of selections) {
      const a = ui('variant first').applies('chip', selection);
      const b = ui('state first').applies('chip', selection);
      for (const key of Object.keys(a)) assert.equal(b[key], a[key], `${key} under ${JSON.stringify(selection)}`);
    }
  });

  it('reads a mode: a part token with no value there is no candidate', () => {
    assert.equal(ui().applies('chip', { state: 'pressed' }, 'theme=dark').fill, 'chip.pressed.fill');
    assert.equal(ui().applies('chip', { state: 'pressed' }, 'theme=light').fill, 'chip.fill');
  });
});

describe('group attributes', () => {
  it('keeps an attribute set to false through the load', () => {
    const doc = chip('variant first');
    (doc.sets!.base.sources[0] as any).chip.$deprecated = false;
    (doc.sets!.base.sources[0] as any).legacy = { $deprecated: true, old: color(0.5) };
    const c = new Resolver(doc).resolveContextsToDesignSystem().getCollection('ui')!;
    assert.equal(c.getGroupAttribute('chip', '$deprecated'), false);
    assert.equal(c.getGroupAttribute('legacy', '$deprecated'), true);
    assert.equal(c.getGroupAttribute('chip.primary', '$deprecated'), null);
  });

  it('refuses an attribute through a token, and leaves the token as it was', () => {
    const c = new Collection('c');
    c.setToken('space.md', new DesignToken(px(8), 'dimension', 'Medium'));
    assert.throws(() => c.setGroupAttribute('space.md', '$description', 'changed'), InvalidTokenError);
    assert.throws(() => c.setGroupAttribute('space.md.x', '$type', 'color'), /'space\.md' is a token/);
    assert.equal(c.getToken('space.md')!.$description, 'Medium');
    assert.deepEqual(c.getToken('space.md')!.$value, px(8));
    assert.equal(c.getGroupAttribute('space.md', '$description'), null, 'a token is not a group');
  });
});

describe('the document-wide check', () => {
  it('lists the holes, the non-factorable tokens and the incomplete tokens in one call', () => {
    const doc: ResolverDocument = {
      version: '2025-11-01',
      name: 'ui',
      sets: {
        base: {
          sources: [
            {
              shadow: { $type: 'shadow', $value: { color: srgb(0), offsetX: px(0), offsetY: px(2), blur: px(4), spread: px(0) } },
              ok: color(1),
            },
          ],
        },
      },
      modifiers: {
        elevation: { default: 'low', contexts: { low: [], high: [{ shadow: { $value: { blur: px(12) } } }] } },
        theme: { default: 'light', contexts: { light: [], dark: [{ night: color(0.1) }] } },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/elevation' }, { $ref: '#/modifiers/theme' }],
    } as ResolverDocument;
    const found = new Resolver(doc).resolveContextsToDesignSystem().getCollection('ui')!.check();
    assert.deepEqual(found.incomplete, [{ path: 'night', missingModes: ['low/light', 'high/light'] }]);
    assert.deepEqual(found.holes, [
      { path: 'night', property: '$value', holes: [{ theme: 'light' }] },
      { path: 'night', property: '$type', holes: [{ theme: 'light' }] },
    ]);
    assert.deepEqual(
      found.nonFactorable.map((n) => [n.path, n.property]),
      [['shadow', '$value']],
    );
  });

  it('lists only the incomplete tokens of a collection built by hand', () => {
    const c = new Collection('c', ['light', 'dark']);
    c.setToken('bg', new DesignToken(srgb(1), 'color'), 'light');
    c.setToken('font', new DesignToken(['Inter'], 'fontFamily'));
    assert.deepEqual(c.check(), { incomplete: [{ path: 'bg', missingModes: ['dark'] }], holes: [], nonFactorable: [] });
  });
});
