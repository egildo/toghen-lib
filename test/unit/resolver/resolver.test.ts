/**
 * Unit tests for the W3C Design Tokens Resolver Module.
 *
 * Covers:
 *  - Document construction validation
 *  - Input validation (§6.1)
 *  - Ordering / token merging (§6.2)
 *  - $ref resolution (§4.2)
 *  - Error cases for all MUST / MUST NOT rules
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver } from '../../../src/resolver/resolver.js';
import { ResolverValidationError, InvalidInputError, InvalidReferenceError } from '../../../src/resolver/errors.js';
import type { ResolverDocument } from '../../../src/resolver/types.js';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

/** Minimal valid document with no sets or modifiers. */
const minimalDoc = (): ResolverDocument => ({
  version: '2025-11-01',
  resolutionOrder: [],
});

/** Document with one set referenced in resolutionOrder. */
const singleSetDoc = (): ResolverDocument => ({
  version: '2025-11-01',
  sets: {
    base: {
      sources: [
        {
          colors: {
            primary: { $value: '#0000ff', $type: 'color' },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
});

/** Document with a theme modifier (light/dark). */
const themeDoc = (): ResolverDocument => ({
  version: '2025-11-01',
  sets: {
    base: {
      sources: [
        {
          colors: {
            primary: { $value: '#0000ff', $type: 'color' },
          },
        },
      ],
    },
  },
  modifiers: {
    theme: {
      contexts: {
        light: [{ colors: { background: { $value: '#ffffff', $type: 'color' } } }],
        dark: [{ colors: { background: { $value: '#000000', $type: 'color' } } }],
      },
      default: 'light',
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
});

// ---------------------------------------------------------------------------
// 1. Document construction / validation
// ---------------------------------------------------------------------------

describe('Resolver — document validation', () => {
  it('accepts a minimal valid document', () => {
    assert.doesNotThrow(() => new Resolver(minimalDoc()));
  });

  it('throws ResolverValidationError when version is missing', () => {
    assert.throws(
      () => new Resolver({ version: '', resolutionOrder: [] }),
      (e: unknown) => {
        assert.ok(e instanceof ResolverValidationError);
        assert.match(e.message, /version/i);
        return true;
      },
    );
  });

  it('throws ResolverValidationError when version is wrong', () => {
    assert.throws(
      () => new Resolver({ version: '2024-01-01', resolutionOrder: [] }),
      (e: unknown) => {
        assert.ok(e instanceof ResolverValidationError);
        assert.match(e.message, /2025-11-01/);
        return true;
      },
    );
  });

  it('throws ResolverValidationError when resolutionOrder is missing', () => {
    assert.throws(
      () => new Resolver({ version: '2025-11-01' } as any),
      (e: unknown) => {
        assert.ok(e instanceof ResolverValidationError);
        assert.match(e.message, /resolutionOrder/i);
        return true;
      },
    );
  });

  it('throws ResolverValidationError for modifier with 0 contexts', () => {
    assert.throws(
      () =>
        new Resolver({
          version: '2025-11-01',
          modifiers: {
            empty: { contexts: {} },
          },
          resolutionOrder: [],
        }),
      (e: unknown) => {
        assert.ok(e instanceof ResolverValidationError);
        assert.match(e.message, /empty/);
        return true;
      },
    );
  });

  it('throws ResolverValidationError for modifier with exactly 1 context', () => {
    assert.throws(
      () =>
        new Resolver({
          version: '2025-11-01',
          modifiers: {
            singleCtx: {
              contexts: {
                light: [{ colors: { bg: { $value: '#fff', $type: 'color' } } }],
              },
            },
          },
          resolutionOrder: [],
        }),
      (e: unknown) => {
        assert.ok(e instanceof ResolverValidationError);
        assert.match(e.message, /singleCtx/);
        return true;
      },
    );
  });

  it('throws ResolverValidationError when modifier default is not a valid context', () => {
    assert.throws(
      () =>
        new Resolver({
          version: '2025-11-01',
          modifiers: {
            theme: {
              contexts: {
                light: [],
                dark: [],
              },
              default: 'high-contrast', // not in contexts
            },
          },
          resolutionOrder: [],
        }),
      (e: unknown) => {
        assert.ok(e instanceof ResolverValidationError);
        assert.match(e.message, /high-contrast/);
        return true;
      },
    );
  });

  it('throws ResolverValidationError for inline resolutionOrder item missing "name"', () => {
    assert.throws(
      () =>
        new Resolver({
          version: '2025-11-01',
          resolutionOrder: [
            // Missing 'name'
            { type: 'set', sources: [] } as any,
          ],
        }),
      (e: unknown) => {
        assert.ok(e instanceof ResolverValidationError);
        assert.match(e.message, /name/i);
        return true;
      },
    );
  });

  it('throws ResolverValidationError for inline resolutionOrder item missing "type"', () => {
    assert.throws(
      () =>
        new Resolver({
          version: '2025-11-01',
          resolutionOrder: [{ name: 'mySet', sources: [] } as any],
        }),
      (e: unknown) => {
        assert.ok(e instanceof ResolverValidationError);
        assert.match(e.message, /type/i);
        return true;
      },
    );
  });

  it('throws ResolverValidationError for duplicate names in resolutionOrder', () => {
    assert.throws(
      () =>
        new Resolver({
          version: '2025-11-01',
          resolutionOrder: [
            { name: 'base', type: 'set', sources: [] },
            { name: 'base', type: 'set', sources: [] },
          ],
        }),
      (e: unknown) => {
        assert.ok(e instanceof ResolverValidationError);
        assert.match(e.message, /Duplicate name "base"/);
        return true;
      },
    );
  });

  describe('a name counts whether inline or by $ref', () => {
    const contexts = { a: [], b: [] };
    const rejects = (resolutionOrder: ResolverDocument['resolutionOrder'], name: string) =>
      assert.throws(
        () =>
          new Resolver({
            version: '2025-11-01',
            sets: { base: { sources: [] } },
            modifiers: { mode: { contexts, default: 'a' } },
            resolutionOrder,
          }),
        (e: unknown) => e instanceof ResolverValidationError && e.message.includes(`Duplicate name "${name}"`),
      );

    it('rejects a modifier listed twice by $ref', () => {
      rejects([{ $ref: '#/modifiers/mode' }, { $ref: '#/modifiers/mode' }], 'mode');
    });

    it('rejects a set listed twice by $ref', () => {
      rejects([{ $ref: '#/sets/base' }, { $ref: '#/sets/base' }], 'base');
    });

    it('rejects an inline item and a $ref with the same name', () => {
      rejects([{ name: 'base', type: 'set', sources: [] }, { $ref: '#/sets/base' }], 'base');
      rejects([{ $ref: '#/modifiers/mode' }, { name: 'mode', type: 'modifier', contexts, default: 'a' }], 'mode');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Input validation (§6.1)
// ---------------------------------------------------------------------------

describe('Resolver — input validation', () => {
  it('accepts empty input when no modifiers are declared', () => {
    const resolver = new Resolver(singleSetDoc());
    assert.doesNotThrow(() => resolver.resolve({}));
  });

  it('accepts valid input for a theme modifier', () => {
    const resolver = new Resolver(themeDoc());
    assert.doesNotThrow(() => resolver.resolve({ theme: 'dark' }));
  });

  it('is case-insensitive for input keys and values', () => {
    const resolver = new Resolver(themeDoc());
    // Both "Theme"/"DARK" and "theme"/"dark" should work
    assert.doesNotThrow(() => resolver.resolve({ Theme: 'DARK' }));
  });

  it('throws InvalidInputError for an unknown modifier key in input', () => {
    const resolver = new Resolver(themeDoc());
    assert.throws(
      () => resolver.resolve({ unknown: 'dark' }),
      (e: unknown) => {
        assert.ok(e instanceof InvalidInputError);
        assert.match(e.message, /unknown/i);
        return true;
      },
    );
  });

  it('throws InvalidInputError when input value is not a string', () => {
    const resolver = new Resolver(themeDoc());
    assert.throws(
      () => resolver.resolve({ theme: true as any }),
      (e: unknown) => {
        assert.ok(e instanceof InvalidInputError);
        assert.match(e.message, /string/i);
        return true;
      },
    );
  });

  it('throws InvalidInputError for an invalid context value', () => {
    const resolver = new Resolver(themeDoc());
    assert.throws(
      () => resolver.resolve({ theme: 'high-contrast' }),
      (e: unknown) => {
        assert.ok(e instanceof InvalidInputError);
        assert.match(e.message, /high-contrast/i);
        return true;
      },
    );
  });

  it('throws InvalidInputError when a required modifier (no default) has no input', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      modifiers: {
        size: {
          contexts: {
            small: [],
            large: [],
          },
          // No default
        },
      },
      resolutionOrder: [{ $ref: '#/modifiers/size' }],
    });

    assert.throws(
      () => resolver.resolve({}),
      (e: unknown) => {
        assert.ok(e instanceof InvalidInputError);
        assert.match(e.message, /size/i);
        return true;
      },
    );
  });

  it('uses modifier default when no input is provided for that modifier', () => {
    const resolver = new Resolver(themeDoc());
    // theme has default: 'light' — should work with empty input
    assert.doesNotThrow(() => resolver.resolve({}));
  });
});

// ---------------------------------------------------------------------------
// 3. Ordering / token merging (§6.2)
// ---------------------------------------------------------------------------

describe('Resolver — ordering and merging', () => {
  it('returns an empty object for an empty resolutionOrder', () => {
    const resolver = new Resolver(minimalDoc());
    const result = resolver.resolve();
    assert.deepEqual(result, {});
  });

  it('returns tokens from a single set', () => {
    const resolver = new Resolver(singleSetDoc());
    const result = resolver.resolve();

    assert.equal(result.colors.primary.$value, '#0000ff');
    assert.equal(result.colors.primary.$type, 'color');
  });

  it('later sources override earlier ones within a set', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: {
        base: {
          sources: [
            { colors: { primary: { $value: '#0000ff', $type: 'color' } } },
            { colors: { primary: { $value: '#ff0000', $type: 'color' } } }, // override
          ],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });
    const result = resolver.resolve();
    assert.equal(result.colors.primary.$value, '#ff0000');
  });

  it('later sets override earlier sets in resolutionOrder', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: {
        base: { sources: [{ colors: { bg: { $value: '#fff', $type: 'color' } } }] },
        override: { sources: [{ colors: { bg: { $value: '#000', $type: 'color' } } }] },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/sets/override' }],
    });
    const result = resolver.resolve();
    assert.equal(result.colors.bg.$value, '#000');
  });

  it('modifier applies the selected context tokens', () => {
    const resolver = new Resolver(themeDoc());

    const lightResult = resolver.resolve({ theme: 'light' });
    assert.equal(lightResult.colors.background.$value, '#ffffff');

    const darkResult = resolver.resolve({ theme: 'dark' });
    assert.equal(darkResult.colors.background.$value, '#000000');
  });

  it('modifier result overrides base tokens when ordered later', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: {
        base: {
          sources: [{ colors: { background: { $value: '#aaaaaa', $type: 'color' } } }],
        },
      },
      modifiers: {
        theme: {
          contexts: {
            light: [{ colors: { background: { $value: '#ffffff', $type: 'color' } } }],
            dark: [{ colors: { background: { $value: '#000000', $type: 'color' } } }],
          },
          default: 'light',
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    });

    const result = resolver.resolve({ theme: 'dark' });
    // Modifier (later) should win over base set (earlier)
    assert.equal(result.colors.background.$value, '#000000');
  });

  it('groups tokens are deep-merged across sets, not replaced wholesale', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: {
        setA: {
          sources: [
            {
              colors: {
                primary: { $value: '#0000ff', $type: 'color' },
                secondary: { $value: '#00ff00', $type: 'color' },
              },
            },
          ],
        },
        setB: {
          sources: [
            {
              colors: {
                // overrides only primary, secondary must survive
                primary: { $value: '#ff0000', $type: 'color' },
              },
            },
          ],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/setA' }, { $ref: '#/sets/setB' }],
    });

    const result = resolver.resolve();
    assert.equal(result.colors.primary.$value, '#ff0000'); // overridden
    assert.equal(result.colors.secondary.$value, '#00ff00'); // preserved
  });

  it('inline sets work correctly in resolutionOrder', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      resolutionOrder: [
        {
          name: 'inlineBase',
          type: 'set',
          sources: [{ spacing: { sm: { $value: '4px', $type: 'dimension' } } }],
        },
      ],
    });
    const result = resolver.resolve();
    assert.equal(result.spacing.sm.$value, '4px');
  });

  it('inline modifiers work correctly in resolutionOrder', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      resolutionOrder: [
        {
          name: 'theme',
          type: 'modifier',
          contexts: {
            light: [{ colors: { bg: { $value: '#fff', $type: 'color' } } }],
            dark: [{ colors: { bg: { $value: '#000', $type: 'color' } } }],
          },
          default: 'light',
        },
      ],
    });
    const darkResult = resolver.resolve({ theme: 'dark' });
    assert.equal(darkResult.colors.bg.$value, '#000');
  });
});

// ---------------------------------------------------------------------------
// 4. $ref resolution (§4.2)
// ---------------------------------------------------------------------------

describe('Resolver — $ref resolution', () => {
  it('resolves a $ref to a named set', () => {
    const resolver = new Resolver(singleSetDoc());
    const result = resolver.resolve();
    assert.ok(result.colors);
    assert.equal(result.colors.primary.$value, '#0000ff');
  });

  it('resolves a $ref to a named modifier', () => {
    const resolver = new Resolver(themeDoc());
    const result = resolver.resolve({ theme: 'dark' });
    assert.equal(result.colors.background.$value, '#000000');
  });

  it('applies $ref overrides shallowly', () => {
    // The spec: local keys on a ref object override the referenced value shallowly
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: {
        base: {
          sources: [{ spacing: { sm: { $value: '4px', $type: 'dimension' } } }],
          description: 'original description',
        },
      },
      resolutionOrder: [
        {
          $ref: '#/sets/base',
          description: 'overridden description',
        },
      ],
    });
    // Should not throw; we simply verify no runtime error occurs
    // (description is a set-level property, not token-level)
    assert.doesNotThrow(() => resolver.resolve());
  });

  it('resolves a $ref inside a modifier context source to a set', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: {
        lightTokens: {
          sources: [{ colors: { bg: { $value: '#fff', $type: 'color' } } }],
        },
        darkTokens: {
          sources: [{ colors: { bg: { $value: '#000', $type: 'color' } } }],
        },
      },
      modifiers: {
        theme: {
          contexts: {
            light: [{ $ref: '#/sets/lightTokens' }],
            dark: [{ $ref: '#/sets/darkTokens' }],
          },
          default: 'light',
        },
      },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    });

    const light = resolver.resolve({ theme: 'light' });
    assert.equal(light.colors.bg.$value, '#fff');

    const dark = resolver.resolve({ theme: 'dark' });
    assert.equal(dark.colors.bg.$value, '#000');
  });

  it('throws InvalidReferenceError for external (non-same-document) $ref', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      resolutionOrder: [{ $ref: 'http://example.com/tokens.json' }],
    });
    assert.throws(
      () => resolver.resolve(),
      (e: unknown) => {
        assert.ok(e instanceof InvalidReferenceError);
        assert.match(e.message, /not supported/i);
        return true;
      },
    );
  });

  it('throws InvalidReferenceError when $ref points to resolutionOrder', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      resolutionOrder: [{ $ref: '#/resolutionOrder/0' }],
    });
    assert.throws(
      () => resolver.resolve(),
      (e: unknown) => {
        assert.ok(e instanceof InvalidReferenceError);
        assert.match(e.message, /resolutionOrder/i);
        return true;
      },
    );
  });

  it('throws InvalidReferenceError when $ref cannot be resolved', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      resolutionOrder: [{ $ref: '#/sets/nonexistent' }],
    });
    assert.throws(
      () => resolver.resolve(),
      (e: unknown) => {
        assert.ok(e instanceof InvalidReferenceError);
        assert.match(e.message, /nonexistent/);
        return true;
      },
    );
  });

  it('throws InvalidReferenceError when a modifier context references another modifier', () => {
    // A modifier MUST NOT reference another modifier from within a context
    const resolver = new Resolver({
      version: '2025-11-01',
      modifiers: {
        size: {
          contexts: {
            small: [],
            large: [],
          },
        },
        theme: {
          contexts: {
            light: [{ $ref: '#/modifiers/size' }], // FORBIDDEN
            dark: [],
          },
          default: 'light',
        },
      },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    });

    assert.throws(
      () => resolver.resolve({ theme: 'light', size: 'small' }),
      (e: unknown) => {
        assert.ok(e instanceof InvalidReferenceError);
        assert.match(e.message, /modifier/i);
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Alias preservation (tokens with $value references remain as-is)
// ---------------------------------------------------------------------------

describe('Resolver — alias tokens', () => {
  it('preserves alias $value strings in the flat output', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: {
        base: {
          sources: [
            {
              colors: {
                primary: { $value: '#0000ff', $type: 'color' },
                cta: { $value: '{colors.primary}', $type: 'color' },
              },
            },
          ],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });

    const result = resolver.resolve();
    // The alias must NOT be resolved at this level — just preserved
    assert.equal(result.colors.cta.$value, '{colors.primary}');
  });
});

// ---------------------------------------------------------------------------
// 6. Public accessors (plugin prerequisites)
// ---------------------------------------------------------------------------

describe('Resolver — public accessors', () => {
  it('exposes document name through the name getter', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      name: 'My DS',
      resolutionOrder: [],
    });

    assert.equal(resolver.name, 'My DS');
  });

  it('returns modifier names and contexts for top-level and inline modifiers', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      modifiers: {
        theme: {
          contexts: {
            light: [],
            dark: [],
          },
          default: 'light',
        },
      },
      resolutionOrder: [
        {
          name: 'density',
          type: 'modifier',
          contexts: {
            compact: [],
            spacious: [],
          },
          default: 'compact',
        },
      ],
    });

    assert.deepEqual(resolver.getModifiers(), [
      { name: 'theme', contexts: ['light', 'dark'], default: 'light' },
      { name: 'density', contexts: ['compact', 'spacious'], default: 'compact' },
    ]);
  });

  it('returns one empty permutation when no modifiers are declared', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      resolutionOrder: [],
    });

    assert.deepEqual(resolver.getPermutations(), [{}]);
  });

  it('returns Cartesian-product permutations for multiple modifiers', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      modifiers: {
        theme: {
          contexts: { light: [], dark: [] },
          default: 'light',
        },
        density: {
          contexts: { compact: [], spacious: [] },
          default: 'compact',
        },
      },
      resolutionOrder: [],
    });

    assert.deepEqual(resolver.getPermutations(), [
      { theme: 'light', density: 'compact' },
      { theme: 'light', density: 'spacious' },
      { theme: 'dark', density: 'compact' },
      { theme: 'dark', density: 'spacious' },
    ]);
  });
});

describe('Resolver document metadata', () => {
  it('exposes the root description the spec allows', () => {
    // §2: "The document MAY provide a `description` at the root level. This
    // may be used to add additional explanation or context not present in
    // name." A consumer showing a system to a person wants both — `name`
    // alone is usually a slug.
    const resolver = new Resolver({
      version: '2025-11-01',
      name: 'demo',
      description: 'Starter design system — every token type, both themes.',
      sets: { base: { sources: [{ a: { $type: 'color', $value: '#000000' } }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });

    assert.strictEqual(resolver.name, 'demo');
    assert.strictEqual(resolver.description, 'Starter design system — every token type, both themes.');
  });

  it('leaves both undefined when the document omits them', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: { base: { sources: [{ a: { $type: 'color', $value: '#000000' } }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });

    assert.strictEqual(resolver.name, undefined);
    assert.strictEqual(resolver.description, undefined);
  });
});

describe('Resolver — a design system versioning itself', () => {
  /** A document whose `base` set carries whatever `$extensions` is passed. */
  const withSetExtensions = (extensions: Record<string, unknown>): Resolver =>
    new Resolver({
      version: '2025-11-01',
      name: 'demo',
      sets: {
        base: {
          $extensions: extensions,
          sources: [{ a: { $type: 'color', $value: '#000000' } }],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as ResolverDocument);

  it('reads a version a set declares under the vendor namespace', () => {
    // §4.3: "An `$extensions` object MAY be added to any set, modifier, or
    // inline set/modifier" — the root is not among them, so a system that
    // wants to version itself hangs the value off a set.
    const resolver = withSetExtensions({ 'com.toghen': { version: '1.4.0' } });

    assert.strictEqual(resolver.getDeclaredVersion(), '1.4.0');
  });

  it('never returns the document format version', () => {
    // §4.1.2 fixes `version` at "2025-11-01" and reserves it for breaking
    // changes to the format. It is identical in every conforming document
    // and says nothing about the system described by it — so a document
    // declaring nothing of its own has no version to show.
    const resolver = new Resolver({
      version: '2025-11-01',
      name: 'demo',
      sets: { base: { sources: [{ a: { $type: 'color', $value: '#000000' } }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });

    assert.strictEqual(resolver.getDeclaredVersion(), undefined);
  });

  it('reads a version a modifier declares', () => {
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: { base: { sources: [{ a: { $type: 'color', $value: '#000000' } }] } },
      modifiers: {
        theme: {
          $extensions: { 'com.toghen': { version: '2.0.0-rc.1' } },
          contexts: {
            light: [{ b: { $type: 'color', $value: '#ffffff' } }],
            dark: [{ b: { $type: 'color', $value: '#111111' } }],
          },
          default: 'light',
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    } as ResolverDocument);

    assert.strictEqual(resolver.getDeclaredVersion(), '2.0.0-rc.1');
  });

  it('reads a version an inline set declares in resolutionOrder', () => {
    // §4.3 names inline sets and modifiers explicitly alongside the
    // declared kind, so a document written entirely inline is not excluded.
    const resolver = new Resolver({
      version: '2025-11-01',
      resolutionOrder: [
        {
          name: 'base',
          type: 'set',
          $extensions: { 'com.toghen': { version: '0.9.0' } },
          sources: [{ a: { $type: 'color', $value: '#000000' } }],
        },
      ],
    } as unknown as ResolverDocument);

    assert.strictEqual(resolver.getDeclaredVersion(), '0.9.0');
  });

  it('takes the first declaration when parts of one document disagree', () => {
    // A document contradicting itself about the version of the whole is a
    // contradiction to settle in the document, not to resolve by merging.
    const resolver = new Resolver({
      version: '2025-11-01',
      sets: {
        base: {
          $extensions: { 'com.toghen': { version: '1.0.0' } },
          sources: [{ a: { $type: 'color', $value: '#000000' } }],
        },
        extra: {
          $extensions: { 'com.toghen': { version: '9.9.9' } },
          sources: [{ b: { $type: 'color', $value: '#ffffff' } }],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/sets/extra' }],
    } as ResolverDocument);

    assert.strictEqual(resolver.getDeclaredVersion(), '1.0.0');
  });

  it('ignores another vendor namespace', () => {
    // §4.3: "the keys being vendor-specific namespaces. This allows multiple
    // tools to use this metadata without conflict." Reading someone else's
    // key is exactly the conflict namespacing exists to prevent.
    const resolver = withSetExtensions({ 'com.example.other': { version: '3.1.4' } });

    assert.strictEqual(resolver.getDeclaredVersion(), undefined);
    assert.strictEqual(resolver.getDeclaredVersion('com.example.other'), '3.1.4');
  });

  it('ignores a version that is not a non-empty string', () => {
    assert.strictEqual(
      withSetExtensions({ 'com.toghen': { version: 3 } }).getDeclaredVersion(),
      undefined,
      'a number is not a version string',
    );
    assert.strictEqual(
      withSetExtensions({ 'com.toghen': { version: '   ' } }).getDeclaredVersion(),
      undefined,
      'whitespace is not a version',
    );
    assert.strictEqual(
      withSetExtensions({ 'com.toghen': {} }).getDeclaredVersion(),
      undefined,
      'a namespace without a version declares nothing',
    );
  });

  it('trims surrounding whitespace', () => {
    assert.strictEqual(withSetExtensions({ 'com.toghen': { version: '  1.4.0\n' } }).getDeclaredVersion(), '1.4.0');
  });
});
