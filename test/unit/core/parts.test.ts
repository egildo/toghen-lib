import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from '../../../src/core/collection.js';
import { Resolver } from '../../../src/resolver/resolver.js';
import type { ResolverDocument } from '../../../src/resolver/types.js';

const parts = (extra: Record<string, unknown>) => ({ 'com.toghen': { css: { parts: extra } } });

const VOCABULARY = {
  variant: { primary: "[data-variant='primary']", quiet: "[data-variant='quiet']" },
  state: { hover: ':hover', pressed: ':active', disabled: ':is(&:disabled, [aria-disabled="true"] &)' },
};

const collectionWithVocabulary = () => {
  const c = new Collection('ui');
  c.setGroupAttribute('ui', '$extensions', parts(VOCABULARY));
  return c;
};

describe('Collection.vocabularyAt', () => {
  it('is inherited by a component two levels down', () => {
    const c = collectionWithVocabulary();
    assert.deepEqual(c.vocabularyAt('ui.form.button'), VOCABULARY);
    assert.deepEqual(c.vocabularyAt('other'), {});
  });

  it('lets a group below override one spelling and keep the rest', () => {
    const c = collectionWithVocabulary();
    c.setGroupAttribute('ui.form.field', '$extensions', parts({ state: { hover: ':is(:hover, :focus-within)' } }));
    const at = c.vocabularyAt('ui.form.field');
    assert.equal(at.state.hover, ':is(:hover, :focus-within)');
    assert.equal(at.state.pressed, ':active');
    assert.deepEqual(at.variant, VOCABULARY.variant);
    assert.equal(c.vocabularyAt('ui.form.button').state.hover, ':hover');
  });

  it('reads the vocabulary per mode', () => {
    const c = new Collection('ui', ['light', 'dark']);
    c.setGroupAttribute('ui', '$extensions', parts({ state: { hover: ':hover' } }), 'light');
    c.setGroupAttribute('ui', '$extensions', parts({ state: { hover: ':focus' } }), 'dark');
    assert.equal(c.vocabularyAt('ui.button', 'light').state.hover, ':hover');
    assert.equal(c.vocabularyAt('ui.button', 'dark').state.hover, ':focus');
  });

  it('lets a group opt out with parts: false, for itself and every group below it', () => {
    const c = collectionWithVocabulary();
    c.setGroupAttribute('ui.hue', '$extensions', { 'com.toghen': { css: { parts: false } } });
    assert.deepEqual(c.vocabularyAt('ui.hue'), {});
    assert.deepEqual(c.vocabularyAt('ui.hue.plain.solid'), {});
    assert.deepEqual(c.vocabularyAt('ui.button'), VOCABULARY, 'a sibling keeps the vocabulary');
    // `plain` and `solid` are two values of one axis: with the opt-out neither is a part, with none it throws
    const lookup = new Collection('ui');
    lookup.setGroupAttribute('ui', '$extensions', parts({ variant: { plain: '[data-variant=plain]', solid: '[data-variant=solid]' } }));
    assert.throws(
      () => lookup.partsOf('ui.hue.plain.solid.bg'),
      /nests two parts of axis 'variant': 'plain' and 'solid'\. Give the group "com.toghen": \{ "css": \{ "parts": false \} \}, or rename a key\./,
    );
    lookup.setGroupAttribute('ui.hue', '$extensions', { 'com.toghen': { css: { parts: false } } });
    assert.deepEqual(lookup.partsOf('ui.hue.plain.solid.bg'), {
      parts: [],
      rest: 'ui.hue.plain.solid.bg',
      restExists: false,
      component: null,
    });
  });

  it('starts again from empty at a group below the opt-out that declares a vocabulary', () => {
    const c = collectionWithVocabulary();
    c.setGroupAttribute('ui.hue', '$extensions', { 'com.toghen': { css: { parts: false } } });
    c.setGroupAttribute('ui.hue.card', '$extensions', parts({ state: { hover: ':hover' } }));
    assert.deepEqual(c.vocabularyAt('ui.hue.card'), { state: { hover: ':hover' } });
    assert.deepEqual(c.vocabularyAt('ui.hue.card.deep'), { state: { hover: ':hover' } });
    assert.deepEqual(c.vocabularyAt('ui.hue'), {});
  });

  it('reads parts: false through a resolver document, per mode', () => {
    const document: ResolverDocument = {
      version: '2025-11-01',
      sets: {
        base: {
          sources: [
            {
              ui: {
                $extensions: parts(VOCABULARY),
                hue: {
                  $extensions: { 'com.toghen': { css: { parts: false } } },
                  plain: { solid: { bg: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 1, 1] } } } },
                },
              },
            },
          ],
        },
      },
      modifiers: {},
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as ResolverDocument;
    const ds = new Resolver(document).resolveContextsToDesignSystem();
    assert.deepEqual(ds.getCollection('resolved')!.vocabularyAt('ui.hue.plain'), {});
  });

  it('refuses anything but an object or false, naming the group', () => {
    const c = new Collection('ui');
    c.setGroupAttribute('ui.card', '$extensions', parts(true as never));
    assert.throws(() => c.vocabularyAt('ui.card.title'), /ui\.card/);
  });

  it('refuses a malformed vocabulary, naming the group', () => {
    for (const bad of [{ state: 'hover' }, { state: { hover: 3 } }, [], { state: ['a'] }]) {
      const c = new Collection('ui');
      c.setGroupAttribute('ui.card', '$extensions', parts(bad as never));
      assert.throws(() => c.vocabularyAt('ui.card.title'), /ui\.card/);
    }
  });
});

describe('Resolver keeps group $extensions', () => {
  const doc = (): ResolverDocument => ({
    version: '2025-11-01',
    sets: {
      base: {
        sources: [
          {
            button: {
              $extensions: parts(VOCABULARY),
              background: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 1, 1] } },
              hover: { background: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.9, 0.9, 0.9] } } },
              padding: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
              label: { family: { $type: 'fontFamily', $value: ['Alpha', 'sans-serif'] } },
            },
          },
        ],
      },
    },
    modifiers: {
      theme: {
        default: 'light',
        contexts: {
          light: [],
          dark: [{ button: { hover: { background: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.2, 0.2, 0.2] } } } } }],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  });

  it('carries the vocabulary into every collection mode and reads it back', () => {
    const ds = new Resolver(doc()).resolveContextsToDesignSystem();
    const collection = ds.getCollection('resolved')!;
    assert.deepEqual(collection.vocabularyAt('button'), VOCABULARY);
    assert.deepEqual(collection.vocabularyAt('button', 'theme=dark'), VOCABULARY);
    const { parts: found, rest } = collection.partsOf('button.hover.background');
    assert.deepEqual(
      found.map((p) => p.key),
      ['hover'],
    );
    assert.equal(rest, 'button.background');
  });

  it('also survives the single and the product builds', () => {
    const single = new Resolver(doc()).resolveToDesignSystem({ theme: 'dark' });
    assert.deepEqual(single.getCollection('resolved')!.vocabularyAt('button'), VOCABULARY);
    const all = new Resolver(doc()).resolveAllToDesignSystem();
    assert.deepEqual(all.getCollection('resolved')!.vocabularyAt('button', 'theme=dark'), VOCABULARY);
  });
});

describe('Collection.partsOf', () => {
  const c = collectionWithVocabulary();

  it('finds no part on a path at rest', () => {
    assert.deepEqual(c.partsOf('ui.button.background'), { parts: [], rest: 'ui.button.background', restExists: false, component: null });
  });

  it('finds one part, with its axis and spelling', () => {
    assert.deepEqual(c.partsOf('ui.button.hover.background'), {
      parts: [{ at: 'ui.button.hover', key: 'hover', axis: 'state', spelling: ':hover', twin: 'ui.button.background', twinExists: false }],
      rest: 'ui.button.background',
      restExists: false,
      component: 'ui.button',
    });
  });

  it('finds two parts of different axes, in path order', () => {
    const { parts: found, rest } = c.partsOf('ui.button.primary.hover.background');
    assert.deepEqual(
      found.map((p) => [p.at, p.axis, p.key]),
      [
        ['ui.button.primary', 'variant', 'primary'],
        ['ui.button.primary.hover', 'state', 'hover'],
      ],
    );
    assert.equal(rest, 'ui.button.background');
  });

  it('treats a key in no vocabulary as a plain subgroup, under or over a part', () => {
    assert.deepEqual(c.partsOf('ui.button.icon.hover.color').rest, 'ui.button.icon.color');
    assert.deepEqual(c.partsOf('ui.button.pressed.pin.color').rest, 'ui.button.pin.color');
    assert.deepEqual(c.partsOf('ui.button.icon.color').parts, []);
  });

  it('never reads the last segment, the token itself, as a part', () => {
    assert.deepEqual(c.partsOf('ui.button.hover'), { parts: [], rest: 'ui.button.hover', restExists: false, component: null });
    assert.deepEqual(
      c.partsOf('ui.button.primary.hover').parts.map((p) => p.key),
      ['primary'],
    );
  });

  it('uses the vocabulary of the group the segment sits in', () => {
    const d = collectionWithVocabulary();
    d.setGroupAttribute('ui.card', '$extensions', parts({ density: { hover: '[data-dense]' } }));
    // 'hover' is a second axis at card: two axes claim one key there
    assert.throws(() => d.partsOf('ui.card.hover.padding'), /'hover'.*'state'.*'density'.*'ui\.card'/);
    assert.equal(d.partsOf('ui.button.hover.padding').parts[0].axis, 'state');
  });

  it('refuses two parts of one axis on a path, naming path, axis and keys', () => {
    assert.throws(
      () => c.partsOf('ui.button.primary.quiet.background'),
      /ui\.button\.primary\.quiet\.background.*'variant'.*'primary'.*'quiet'/,
    );
  });
});

describe('a vocabulary at the root of the document', () => {
  const color = (r: number, g: number, b: number) => ({ $type: 'color', $value: { colorSpace: 'srgb', components: [r, g, b] } });
  const rooted = (): ResolverDocument => ({
    version: '2025-11-01',
    sets: {
      base: {
        sources: [
          // two sources each hold part of the root vocabulary; they merge key by key
          {
            $extensions: parts({ state: { hover: ':hover', pressed: ':active' } }),
            button: { background: color(1, 1, 1), hover: { background: color(0.9, 0.9, 0.9) } },
          },
          { $extensions: parts({ variant: { primary: "[data-variant='primary']" }, state: { pressed: ':active:not(:disabled)' } }) },
          // a group overrides one entry and keeps the rest
          {
            field: {
              $extensions: parts({ state: { disabled: ':has(> input:disabled)' } }),
              background: color(1, 1, 1),
              disabled: { background: color(0.5, 0.5, 0.5) },
            },
          },
        ],
      },
    },
    modifiers: {
      theme: { default: 'light', contexts: { light: [], dark: [{ button: { hover: { background: color(0.2, 0.2, 0.2) } } }] } },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  });

  it('is read first, merged across sources, in every mode', () => {
    const c = new Resolver(rooted()).resolveContextsToDesignSystem().getCollection('resolved')!;
    const expected = { state: { hover: ':hover', pressed: ':active:not(:disabled)' }, variant: { primary: "[data-variant='primary']" } };
    assert.deepEqual(c.vocabularyAt(''), expected);
    assert.deepEqual(c.vocabularyAt('button'), expected);
    assert.deepEqual(c.vocabularyAt('button', 'theme=dark'), expected);
    assert.deepEqual(c.vocabularyAt('button.hover.x'), expected);
  });

  it('lets a group below override one entry and keep the rest', () => {
    const c = new Resolver(rooted()).resolveContextsToDesignSystem().getCollection('resolved')!;
    assert.deepEqual(c.vocabularyAt('field'), {
      state: { hover: ':hover', pressed: ':active:not(:disabled)', disabled: ':has(> input:disabled)' },
      variant: { primary: "[data-variant='primary']" },
    });
  });

  it('makes parts of the second segment on, and never of the first: a top-level group is a component', () => {
    const c = new Resolver(rooted()).resolveContextsToDesignSystem().getCollection('resolved')!;
    assert.deepEqual(c.partsOf('button.hover.background'), {
      parts: [{ at: 'button.hover', key: 'hover', axis: 'state', spelling: ':hover', twin: 'button.background', twinExists: true }],
      rest: 'button.background',
      restExists: true,
      component: 'button',
    });
    assert.deepEqual(c.partsOf('hover.background'), { parts: [], rest: 'hover.background', restExists: false, component: null });
    assert.deepEqual(
      c.partsOf('field.disabled.background').parts.map((p) => p.spelling),
      [':has(> input:disabled)'],
    );
  });

  it('names the root when its vocabulary is malformed', () => {
    const c = new Collection('ui');
    c.setGroupAttribute('', '$extensions', parts({ state: 'hover' }));
    assert.throws(() => c.vocabularyAt('button'), /document root/);
  });
});
