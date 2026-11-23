/**
 * Integration tests for the Resolver → DesignSystem pipeline.
 *
 * These tests validate the full end-to-end flow:
 *  Resolver.resolve()              → flat DTCG object
 *  Resolver.resolveToDesignSystem() → DesignSystem with alias resolution
 *
 * Scenarios:
 *  1. Single-mode design system from a plain set
 *  2. Light / dark theme switching via a modifier
 *  3. Multi-modifier orthogonal scenario (theme × size)
 *  4. Alias / reference resolution through DesignSystem
 *  5. Modifier context using $ref to named sets
 *  6. $defs key is silently ignored
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver } from '../../src/resolver/resolver.js';
import type { ResolverDocument } from '../../src/resolver/types.js';

// The W3C structured shapes, as the format writes them: a colour as { colorSpace, components }, a dimension as
// { value, unit }. Plain strings alone once hid a serialisation bug.
const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] });
const px = (value: number) => ({ value, unit: 'px' });

// ---------------------------------------------------------------------------
// Test 1 — plain set → DesignSystem
// ---------------------------------------------------------------------------

test('Resolver integration: plain set resolves into DesignSystem', () => {
  const doc: ResolverDocument = {
    version: '2025-11-01',
    name: 'foundation',
    sets: {
      base: {
        sources: [
          {
            colors: {
              primary: { $value: srgb(0, 0, 1), $type: 'color' },
              white: { $value: srgb(1, 1, 1), $type: 'color' },
            },
            spacing: {
              sm: { $value: px(4), $type: 'dimension' },
              md: { $value: px(8), $type: 'dimension' },
              lg: { $value: px(16), $type: 'dimension' },
            },
          },
        ],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  };

  const resolver = new Resolver(doc);
  const ds = resolver.resolveToDesignSystem();

  // Collection should be named after document name
  const col = ds.getCollection('foundation');
  assert.ok(col, 'collection "foundation" should exist');

  // Tokens should be accessible
  const primary = ds.resolveToken('foundation.colors.primary');
  assert.ok(primary, 'primary token should resolve');
  assert.deepEqual(primary.$value, srgb(0, 0, 1));
  assert.equal(primary.$type, 'color');

  const spacingMd = ds.resolveToken('foundation.spacing.md');
  assert.ok(spacingMd);
  assert.deepEqual(spacingMd.$value, { value: 8, unit: 'px' });
});

// ---------------------------------------------------------------------------
// Test 2 — Light / dark theme via modifier
// ---------------------------------------------------------------------------

test('Resolver integration: light/dark theme modifier', () => {
  const doc: ResolverDocument = {
    version: '2025-11-01',
    sets: {
      base: {
        sources: [
          {
            colors: {
              brand: { $value: srgb(0, 0.341, 1), $type: 'color' },
            },
          },
        ],
      },
    },
    modifiers: {
      theme: {
        contexts: {
          light: [
            {
              colors: {
                background: { $value: srgb(1, 1, 1), $type: 'color' },
                text: { $value: srgb(0, 0, 0), $type: 'color' },
              },
            },
          ],
          dark: [
            {
              colors: {
                background: { $value: srgb(0.102, 0.102, 0.102), $type: 'color' },
                text: { $value: srgb(0.961, 0.961, 0.961), $type: 'color' },
              },
            },
          ],
        },
        default: 'light',
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  };

  const resolver = new Resolver(doc);

  // --- light mode ---
  const dsLight = resolver.resolveToDesignSystem({ theme: 'light' });
  const bgLight = dsLight.resolveToken('resolved.colors.background');
  assert.ok(bgLight);
  assert.deepEqual(bgLight.$value, srgb(1, 1, 1));

  const brandLight = dsLight.resolveToken('resolved.colors.brand');
  assert.ok(brandLight, 'brand (from base set) should still be present in light mode');
  assert.deepEqual(brandLight.$value, srgb(0, 0.341, 1));

  // --- dark mode ---
  const dsDark = resolver.resolveToDesignSystem({ theme: 'dark' });
  const bgDark = dsDark.resolveToken('resolved.colors.background');
  assert.ok(bgDark);
  assert.deepEqual(bgDark.$value, srgb(0.102, 0.102, 0.102));

  const textDark = dsDark.resolveToken('resolved.colors.text');
  assert.ok(textDark);
  assert.deepEqual(textDark.$value, srgb(0.961, 0.961, 0.961));

  // --- default (no input → uses 'light' default) ---
  const dsDefault = resolver.resolveToDesignSystem();
  const bgDefault = dsDefault.resolveToken('resolved.colors.background');
  assert.deepEqual(bgDefault?.$value, srgb(1, 1, 1));
});

// ---------------------------------------------------------------------------
// Test 3 — Multi-modifier (theme × size)
// ---------------------------------------------------------------------------

test('Resolver integration: orthogonal theme × size modifiers', () => {
  const doc: ResolverDocument = {
    version: '2025-11-01',
    modifiers: {
      theme: {
        contexts: {
          light: [{ colors: { bg: { $value: srgb(1, 1, 1), $type: 'color' } } }],
          dark: [{ colors: { bg: { $value: srgb(0, 0, 0), $type: 'color' } } }],
        },
        default: 'light',
      },
      size: {
        contexts: {
          compact: [{ spacing: { base: { $value: px(4), $type: 'dimension' } } }],
          spacious: [{ spacing: { base: { $value: px(16), $type: 'dimension' } } }],
        },
        default: 'compact',
      },
    },
    resolutionOrder: [{ $ref: '#/modifiers/theme' }, { $ref: '#/modifiers/size' }],
  };

  const resolver = new Resolver(doc);

  // All four permutations
  const permutations: Array<[string, string, ReturnType<typeof srgb>, number]> = [
    ['light', 'compact', srgb(1, 1, 1), 4],
    ['light', 'spacious', srgb(1, 1, 1), 16],
    ['dark', 'compact', srgb(0, 0, 0), 4],
    ['dark', 'spacious', srgb(0, 0, 0), 16],
  ];

  for (const [theme, size, expectedBg, expectedSpacing] of permutations) {
    const ds = resolver.resolveToDesignSystem({ theme, size });
    const bg = ds.resolveToken('resolved.colors.bg');
    const spacing = ds.resolveToken('resolved.spacing.base');

    assert.deepEqual(bg?.$value, expectedBg, `theme=${theme}, size=${size}: bg should be ${JSON.stringify(expectedBg)}`);
    assert.deepEqual(
      spacing?.$value,
      { value: expectedSpacing, unit: 'px' },
      `theme=${theme}, size=${size}: spacing should be ${expectedSpacing}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Test 4 — Alias resolution through DesignSystem
// ---------------------------------------------------------------------------

test('Resolver integration: aliases are resolved in DesignSystem', () => {
  const doc: ResolverDocument = {
    version: '2025-11-01',
    sets: {
      base: {
        sources: [
          {
            colors: {
              blue500: { $value: srgb(0, 0.341, 1), $type: 'color' },
              // 'cta' references 'blue500' — must be resolved by DesignSystem.
              // The path is document-relative: it carries no collection name,
              // so it keeps working whatever the collection ends up called.
              cta: { $value: '{colors.blue500}', $type: 'color' },
            },
          },
        ],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  };

  const resolver = new Resolver(doc);
  const ds = resolver.resolveToDesignSystem();

  // Raw token (before resolution) still holds the alias string
  const rawCta = ds.getCollection('resolved')?.getToken('colors.cta');
  assert.ok(rawCta);
  assert.equal(rawCta.$value, '{colors.blue500}');

  // resolveToken() follows the alias through DesignSystem
  const resolvedCta = ds.resolveToken('resolved.colors.cta');
  assert.ok(resolvedCta, 'resolved CTA token should not be null');
  assert.deepEqual(resolvedCta.$value, srgb(0, 0.341, 1), 'alias should resolve to blue500 value');
});

// ---------------------------------------------------------------------------
// Test 5 — Modifier contexts that reference named sets via $ref
// ---------------------------------------------------------------------------

test('Resolver integration: modifier context sources that $ref named sets', () => {
  const doc: ResolverDocument = {
    version: '2025-11-01',
    sets: {
      lightColors: {
        sources: [
          {
            colors: {
              bg: { $value: srgb(1, 1, 1), $type: 'color' },
              text: { $value: srgb(0, 0, 0), $type: 'color' },
            },
          },
        ],
      },
      darkColors: {
        sources: [
          {
            colors: {
              bg: { $value: srgb(0.102, 0.102, 0.102), $type: 'color' },
              text: { $value: srgb(0.941, 0.941, 0.941), $type: 'color' },
            },
          },
        ],
      },
    },
    modifiers: {
      theme: {
        contexts: {
          light: [{ $ref: '#/sets/lightColors' }],
          dark: [{ $ref: '#/sets/darkColors' }],
        },
        default: 'light',
      },
    },
    resolutionOrder: [{ $ref: '#/modifiers/theme' }],
  };

  const resolver = new Resolver(doc);

  const dsLight = resolver.resolveToDesignSystem({ theme: 'light' });
  assert.deepEqual(dsLight.resolveToken('resolved.colors.bg')?.$value, srgb(1, 1, 1));
  assert.deepEqual(dsLight.resolveToken('resolved.colors.text')?.$value, srgb(0, 0, 0));

  const dsDark = resolver.resolveToDesignSystem({ theme: 'dark' });
  assert.deepEqual(dsDark.resolveToken('resolved.colors.bg')?.$value, srgb(0.102, 0.102, 0.102));
  assert.deepEqual(dsDark.resolveToken('resolved.colors.text')?.$value, srgb(0.941, 0.941, 0.941));
});

// ---------------------------------------------------------------------------
// Test 6 — $defs key is silently ignored
// ---------------------------------------------------------------------------

test('Resolver integration: $defs key is silently ignored', () => {
  const doc: ResolverDocument = {
    version: '2025-11-01',
    $defs: {
      // Some tools use this for bundling; we must not throw on it
      mySharedTokens: {
        colors: { primary: { $value: srgb(0, 0, 1), $type: 'color' } },
      },
    },
    sets: {
      base: {
        sources: [{ spacing: { sm: { $value: px(4), $type: 'dimension' } } }],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  };

  const resolver = new Resolver(doc);
  assert.doesNotThrow(() => resolver.resolve());

  const ds = resolver.resolveToDesignSystem();
  // $defs should NOT have been loaded as tokens
  const col = ds.getCollection('resolved');
  const allPaths = col?.getAllPaths() ?? [];
  assert.ok(!allPaths.some((p) => p.startsWith('$defs')), '$defs should not appear as token paths');

  // Regular set tokens should still be present
  const sm = ds.resolveToken('resolved.spacing.sm');
  assert.deepEqual(sm?.$value, { value: 4, unit: 'px' });
});

// ---------------------------------------------------------------------------
// Test 7 — Custom collection name
// ---------------------------------------------------------------------------

test('Resolver integration: custom collection name', () => {
  const doc: ResolverDocument = {
    version: '2025-11-01',
    sets: {
      base: {
        sources: [
          {
            ui: {
              button: { $value: srgb(0, 0.341, 1), $type: 'color' },
              // Document-relative, so the same document resolves under any
              // collection name. A prefixed form could only ever match one.
              link: { $value: '{ui.button}', $type: 'color' },
            },
          },
        ],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  };

  const resolver = new Resolver(doc);
  const ds = resolver.resolveToDesignSystem({}, undefined, 'mySystem');

  assert.ok(ds.getCollection('mySystem'), 'custom collection name should be used');
  assert.deepEqual(ds.resolveToken('mySystem.ui.button')?.$value, srgb(0, 0.341, 1));
  assert.deepEqual(ds.resolveToken('mySystem.ui.link')?.$value, srgb(0, 0.341, 1), 'references must survive a renamed collection');

  // The very same document, loaded under the default name, resolves identically.
  const dsDefault = new Resolver(doc).resolveToDesignSystem();
  assert.deepEqual(dsDefault.resolveToken('resolved.ui.link')?.$value, srgb(0, 0.341, 1));
});

// ---------------------------------------------------------------------------
// Test 8 — Adding resolver collection into an existing DesignSystem
// ---------------------------------------------------------------------------

test('Resolver integration: populates an existing DesignSystem', async () => {
  const { DesignSystem, Collection, DesignToken } = await import('../../src/index.js');

  // Pre-existing system with a manual collection
  const existingDs = new DesignSystem();
  const manual = new Collection('manual');
  manual.setToken('brand.name', new DesignToken('Acme Corp', 'string'));
  existingDs.addCollection(manual);

  const doc: ResolverDocument = {
    version: '2025-11-01',
    sets: {
      base: {
        sources: [{ colors: { bg: { $value: srgb(1, 1, 1), $type: 'color' } } }],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  };

  const resolver = new Resolver(doc);
  // Inject into the existing system
  resolver.resolveToDesignSystem({}, existingDs, 'tokens');

  // Both collections should be available
  assert.ok(existingDs.getCollection('manual'), 'manual collection should still exist');
  assert.ok(existingDs.getCollection('tokens'), 'resolver collection should be added');

  assert.equal(existingDs.resolveToken('manual.brand.name')?.$value, 'Acme Corp');
  assert.deepEqual(existingDs.resolveToken('tokens.colors.bg')?.$value, srgb(1, 1, 1));
});
