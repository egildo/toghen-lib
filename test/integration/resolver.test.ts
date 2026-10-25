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
              primary: { $value: '#0000ff', $type: 'color' },
              white: { $value: '#ffffff', $type: 'color' },
            },
            spacing: {
              sm: { $value: '4px', $type: 'dimension' },
              md: { $value: '8px', $type: 'dimension' },
              lg: { $value: '16px', $type: 'dimension' },
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
  assert.equal(primary.$value.hex, '#0000ff');
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
              brand: { $value: '#0057ff', $type: 'color' },
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
                background: { $value: '#ffffff', $type: 'color' },
                text: { $value: '#000000', $type: 'color' },
              },
            },
          ],
          dark: [
            {
              colors: {
                background: { $value: '#1a1a1a', $type: 'color' },
                text: { $value: '#f5f5f5', $type: 'color' },
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
  assert.equal(bgLight.$value.hex, '#ffffff');

  const brandLight = dsLight.resolveToken('resolved.colors.brand');
  assert.ok(brandLight, 'brand (from base set) should still be present in light mode');
  assert.equal(brandLight.$value.hex, '#0057ff');

  // --- dark mode ---
  const dsDark = resolver.resolveToDesignSystem({ theme: 'dark' });
  const bgDark = dsDark.resolveToken('resolved.colors.background');
  assert.ok(bgDark);
  assert.equal(bgDark.$value.hex, '#1a1a1a');

  const textDark = dsDark.resolveToken('resolved.colors.text');
  assert.ok(textDark);
  assert.equal(textDark.$value.hex, '#f5f5f5');

  // --- default (no input → uses 'light' default) ---
  const dsDefault = resolver.resolveToDesignSystem();
  const bgDefault = dsDefault.resolveToken('resolved.colors.background');
  assert.equal(bgDefault?.$value.hex, '#ffffff');
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
          light: [{ colors: { bg: { $value: '#fff', $type: 'color' } } }],
          dark: [{ colors: { bg: { $value: '#000', $type: 'color' } } }],
        },
        default: 'light',
      },
      size: {
        contexts: {
          compact: [{ spacing: { base: { $value: '4px', $type: 'dimension' } } }],
          spacious: [{ spacing: { base: { $value: '16px', $type: 'dimension' } } }],
        },
        default: 'compact',
      },
    },
    resolutionOrder: [{ $ref: '#/modifiers/theme' }, { $ref: '#/modifiers/size' }],
  };

  const resolver = new Resolver(doc);

  // All four permutations
  const permutations: Array<[string, string, string, number]> = [
    ['light', 'compact', '#ffffff', 4],
    ['light', 'spacious', '#ffffff', 16],
    ['dark', 'compact', '#000000', 4],
    ['dark', 'spacious', '#000000', 16],
  ];

  for (const [theme, size, expectedBg, expectedSpacing] of permutations) {
    const ds = resolver.resolveToDesignSystem({ theme, size });
    const bg = ds.resolveToken('resolved.colors.bg');
    const spacing = ds.resolveToken('resolved.spacing.base');

    assert.equal(bg?.$value.hex, expectedBg, `theme=${theme}, size=${size}: bg should be ${expectedBg}`);
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
              blue500: { $value: '#0057ff', $type: 'color' },
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
  assert.equal(resolvedCta.$value.hex, '#0057ff', 'alias should resolve to blue500 value');
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
              bg: { $value: '#ffffff', $type: 'color' },
              text: { $value: '#000000', $type: 'color' },
            },
          },
        ],
      },
      darkColors: {
        sources: [
          {
            colors: {
              bg: { $value: '#1a1a1a', $type: 'color' },
              text: { $value: '#f0f0f0', $type: 'color' },
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
  assert.equal(dsLight.resolveToken('resolved.colors.bg')?.$value.hex, '#ffffff');
  assert.equal(dsLight.resolveToken('resolved.colors.text')?.$value.hex, '#000000');

  const dsDark = resolver.resolveToDesignSystem({ theme: 'dark' });
  assert.equal(dsDark.resolveToken('resolved.colors.bg')?.$value.hex, '#1a1a1a');
  assert.equal(dsDark.resolveToken('resolved.colors.text')?.$value.hex, '#f0f0f0');
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
        colors: { primary: { $value: '#0000ff', $type: 'color' } },
      },
    },
    sets: {
      base: {
        sources: [{ spacing: { sm: { $value: '4px', $type: 'dimension' } } }],
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
              button: { $value: '#0057ff', $type: 'color' },
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
  assert.equal(ds.resolveToken('mySystem.ui.button')?.$value.hex, '#0057ff');
  assert.equal(ds.resolveToken('mySystem.ui.link')?.$value.hex, '#0057ff', 'references must survive a renamed collection');

  // The very same document, loaded under the default name, resolves identically.
  const dsDefault = new Resolver(doc).resolveToDesignSystem();
  assert.equal(dsDefault.resolveToken('resolved.ui.link')?.$value.hex, '#0057ff');
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
        sources: [{ colors: { bg: { $value: '#fff', $type: 'color' } } }],
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
  assert.equal(existingDs.resolveToken('tokens.colors.bg')?.$value.hex, '#ffffff');
});
