import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Collection } from '../../../src/core/collection.js';
import {
  DesignToken,
  CircularReferenceError,
  InvalidInterpolationError,
  UnresolvableReferenceError,
} from '../../../src/core/design-token.js';
import { referencesIn, resolveTokenValue, resolveTypeThroughAlias } from '../../../src/core/alias.js';
import { DesignSystem } from '../../../src/core/design-system.js';
import {
  containsReference,
  holdsReference,
  isWholeReference,
  referenceTarget,
  extractReferencePaths,
  literalText,
} from '../../../src/core/alias-syntax.js';

/** Builds a single-mode collection from a flat path → token map. */
function build(name: string, tokens: Record<string, DesignToken>): Collection {
  const collection = new Collection(name);
  for (const [path, token] of Object.entries(tokens)) {
    collection.setToken(path, token);
  }
  return collection;
}

/** Resolves one token of a collection by its collection-relative path. */
function resolve(collection: Collection, path: string): unknown {
  const token = collection.getToken(path);
  assert.ok(token, `fixture is missing token "${path}"`);
  return resolveTokenValue(token, collection, 'default', path);
}

// Real W3C structured shapes, not convenient plain strings.
const BLUE = { colorSpace: 'srgb', components: [0, 0.4, 0.8] };
const INK = { colorSpace: 'srgb', components: [0.1, 0.1, 0.1] };
const PX16 = { value: 16, unit: 'px' };
const STACK = ['Alpha', 'Beta', 'sans-serif'];

describe('alias syntax', () => {
  it('recognises whole and embedded references', () => {
    assert.strictEqual(isWholeReference('{color.blue}'), true);
    assert.strictEqual(isWholeReference('0 2px 4px {color.ink}'), false);
    assert.strictEqual(containsReference('0 2px 4px {color.ink}'), true);
    assert.strictEqual(containsReference('#ff0000'), false);
  });

  it('treats braces with no path between them as ordinary text', () => {
    assert.strictEqual(containsReference('{}'), false);
    assert.strictEqual(containsReference('}{'), false);
    assert.strictEqual(containsReference('{'), false);
  });

  it('extracts every referenced path in order', () => {
    assert.deepStrictEqual(extractReferencePaths('linear-gradient({color.start}, {color.end})'), ['color.start', 'color.end']);
    assert.deepStrictEqual(extractReferencePaths({ not: 'a string' }), []);
  });
});

describe('literal braces: a doubled brace is text', () => {
  // [value, the paths it references, its text with the escapes removed]
  const cases: Array<[string, string[], string]> = [
    ['{{a}}', [], '{a}'],
    ['{{{a}}}', ['a'], '{{a}}'],
    ['x {{ y', [], 'x { y'],
    ['}}', [], '}'],
    ['{}', [], '{}'],
  ];

  for (const [value, paths, text] of cases) {
    it(`reads ${JSON.stringify(value)} with every grammar function`, () => {
      const holds = paths.length > 0;
      assert.strictEqual(containsReference(value), holds);
      assert.strictEqual(holdsReference(value), holds);
      assert.strictEqual(holdsReference({ label: [value] }), holds);
      assert.strictEqual(isWholeReference(value), false);
      assert.strictEqual(referenceTarget(value), undefined);
      assert.deepStrictEqual(extractReferencePaths(value), paths);
      assert.deepStrictEqual(
        referencesIn(value).map((r) => r.written),
        paths.map((path) => `{${path}}`),
      );
      assert.strictEqual(literalText(value), text);
    });
  }

  it('keeps a reference next to an escape a reference, whole or not', () => {
    assert.strictEqual(referenceTarget('{a}'), 'a');
    assert.deepStrictEqual(extractReferencePaths('}}{a}{{'), ['a']);
    assert.deepStrictEqual(referencesIn('{{{a}}}'), [{ at: '', to: 'a', interpolated: true, written: '{a}' }]);
  });

  it('resolves a string token written with escapes to its text, never re-scanned', () => {
    const collection = build('theme', {
      'size.sm': new DesignToken(PX16, 'dimension'),
      label: new DesignToken('{{size.sm}}', 'string'),
      plain: new DesignToken('x {{ y }} z', 'string'),
      named: new DesignToken('{label}', 'string'),
    });

    assert.strictEqual(resolve(collection, 'label'), '{size.sm}');
    assert.strictEqual(resolve(collection, 'plain'), 'x { y } z');
    // The text a reference brings back is not read again.
    assert.strictEqual(resolve(collection, 'named'), '{size.sm}');
    // Stored as written.
    assert.strictEqual(collection.getToken('label')!.$value, '{{size.sm}}');
  });

  it('interpolates a real reference beside an escape', () => {
    const collection = build('theme', {
      'space.sm': new DesignToken({ value: 4, unit: 'px' }, 'dimension'),
      note: new DesignToken('{{space.sm}} is {space.sm}', 'string'),
      boxed: new DesignToken('{{{space.sm}}}', 'string'),
    });

    assert.strictEqual(resolve(collection, 'note'), '{space.sm} is 4px');
    assert.strictEqual(resolve(collection, 'boxed'), '{4px}');
  });

  it('resolves a typography fontFamily member written with escapes to its text', () => {
    const collection = build('theme', {
      'type.body': new DesignToken(
        { fontFamily: ['{{x}}', 'sans-serif'], fontSize: PX16, fontWeight: 400, lineHeight: 1.5, letterSpacing: { value: 0, unit: 'px' } },
        'typography',
      ),
    });

    assert.deepStrictEqual((resolve(collection, 'type.body') as { fontFamily: unknown }).fontFamily, ['{x}', 'sans-serif']);
  });

  it('reports no reference for an escape through referencesOf', () => {
    const system = new DesignSystem();
    system.addCollection(
      build('ds', {
        label: new DesignToken('{{size.sm}}', 'string'),
        boxed: new DesignToken('{{{size.sm}}}', 'string'),
      }),
    );

    assert.deepStrictEqual(system.referencesOf('ds.label'), []);
    assert.deepStrictEqual(
      system.referencesOf('ds.boxed').map((r) => r.to),
      ['ds.size.sm'],
    );
  });

  it('reaches literalText through the package entry', async () => {
    const lib = await import('../../../src/index.js');
    assert.strictEqual(lib.literalText('{{size.sm}}'), '{size.sm}');
  });
});

describe('alias resolution — document-relative paths', () => {
  it('resolves a reference relative to the document root', () => {
    const collection = build('theme', {
      'color.blue': new DesignToken(BLUE, 'color'),
      'color.brand': new DesignToken('{color.blue}', 'color'),
    });

    assert.deepStrictEqual(resolve(collection, 'color.brand'), BLUE);
  });

  it('resolves a root-level token with no dot in its path', () => {
    // The old engine required at least two segments, so `{primary}` — the
    // form the W3C format gives for a top-level token — could never resolve.
    const collection = build('theme', {
      primary: new DesignToken(BLUE, 'color'),
      accent: new DesignToken('{primary}', 'color'),
    });

    assert.deepStrictEqual(resolve(collection, 'accent'), BLUE);
  });

  it('follows a multi-hop chain to a structured value', () => {
    const collection = build('theme', {
      'space.base': new DesignToken(PX16, 'dimension'),
      'space.gutter': new DesignToken('{space.base}', 'dimension'),
      'layout.gap': new DesignToken('{space.gutter}', 'dimension'),
    });

    assert.deepStrictEqual(resolve(collection, 'layout.gap'), PX16);
  });

  it('rejects a collection-prefixed reference', () => {
    // Guards against anyone reintroducing the old prefixed form as a
    // fallback: inside collection "theme", `{theme.color.blue}` names the
    // path theme.color.blue, which does not exist.
    const collection = build('theme', {
      'color.blue': new DesignToken(BLUE, 'color'),
      'color.brand': new DesignToken('{theme.color.blue}', 'color'),
    });

    assert.throws(
      () => resolve(collection, 'color.brand'),
      (error: unknown) => {
        assert.ok(error instanceof UnresolvableReferenceError);
        assert.strictEqual(error.reason, 'not-found');
        return true;
      },
    );
  });

  it('keeps collections independent when they share a relative path', () => {
    const one = build('one', {
      'color.blue': new DesignToken(BLUE, 'color'),
      'color.brand': new DesignToken('{color.blue}', 'color'),
    });
    const two = build('two', {
      'color.blue': new DesignToken(INK, 'color'),
      'color.brand': new DesignToken('{color.blue}', 'color'),
    });

    assert.deepStrictEqual(resolve(one, 'color.brand'), BLUE);
    assert.deepStrictEqual(resolve(two, 'color.brand'), INK);
  });
});

describe('alias resolution — failures are loud', () => {
  it('names both the reference and the token containing it', () => {
    const collection = build('theme', {
      'color.brand': new DesignToken('{color.missing}', 'color'),
    });

    assert.throws(
      () => resolve(collection, 'color.brand'),
      (error: unknown) => {
        assert.ok(error instanceof UnresolvableReferenceError);
        assert.strictEqual(error.reason, 'not-found');
        assert.strictEqual(error.reference, '{color.missing}');
        assert.strictEqual(error.tokenPath, 'color.brand');
        assert.strictEqual(error.collectionName, 'theme');
        assert.match(error.message, /\{color\.missing\}/);
        assert.match(error.message, /theme\.color\.brand/);
        return true;
      },
    );
  });

  it('reports a reference to a group distinctly from a missing one', () => {
    const collection = build('theme', {
      'color.blue': new DesignToken(BLUE, 'color'),
      'color.brand': new DesignToken('{color}', 'color'),
    });

    assert.throws(
      () => resolve(collection, 'color.brand'),
      (error: unknown) => {
        assert.ok(error instanceof UnresolvableReferenceError);
        assert.strictEqual(error.reason, 'group');
        assert.match(error.message, /is a group, not a token/);
        return true;
      },
    );
  });

  it('reports malformed reference paths', () => {
    for (const reference of ['{a..b}', '{.}', '{$type}']) {
      const collection = build('theme', {
        broken: new DesignToken(reference, 'color'),
      });

      assert.throws(
        () => resolve(collection, 'broken'),
        (error: unknown) => {
          assert.ok(error instanceof UnresolvableReferenceError, `for ${reference}`);
          assert.strictEqual(error.reason, 'malformed', `for ${reference}`);
          return true;
        },
      );
    }
  });

  it('detects a two-token cycle', () => {
    const collection = build('theme', {
      a: new DesignToken('{b}', 'color'),
      b: new DesignToken('{a}', 'color'),
    });

    assert.throws(
      () => resolve(collection, 'a'),
      (error: unknown) => {
        assert.ok(error instanceof CircularReferenceError);
        assert.match(error.message, /a -> b -> a/);
        return true;
      },
    );
  });

  it('detects a three-token cycle', () => {
    const collection = build('theme', {
      a: new DesignToken('{b}', 'color'),
      b: new DesignToken('{c}', 'color'),
      c: new DesignToken('{a}', 'color'),
    });

    assert.throws(
      () => resolve(collection, 'a'),
      (error: unknown) => {
        assert.ok(error instanceof CircularReferenceError);
        assert.match(error.message, /a -> b -> c -> a/);
        return true;
      },
    );
  });

  it('detects a token referring to itself', () => {
    const collection = build('theme', {
      a: new DesignToken('{a}', 'color'),
    });

    assert.throws(() => resolve(collection, 'a'), CircularReferenceError);
  });

  it('detects a cycle that runs through a composite value', () => {
    const collection = build('theme', {
      'shadow.x': new DesignToken({ color: '{shadow.y}', offsetX: PX16, offsetY: PX16, blur: PX16 }, 'shadow'),
      'shadow.y': new DesignToken('{shadow.x}', 'shadow'),
    });

    assert.throws(
      () => resolve(collection, 'shadow.x'),
      (error: unknown) => {
        assert.ok(error instanceof CircularReferenceError);
        assert.match(error.message, /shadow\.x -> shadow\.y -> shadow\.x/);
        return true;
      },
    );
  });

  it('does not warn to the console instead of failing', () => {
    const collection = build('theme', {
      dangling: new DesignToken('{nope}', 'color'),
      selfish: new DesignToken('{selfish}', 'color'),
    });

    const original = console.warn;
    let warnings = 0;
    console.warn = () => {
      warnings += 1;
    };

    try {
      assert.throws(() => resolve(collection, 'dangling'));
      assert.throws(() => resolve(collection, 'selfish'));
    } finally {
      console.warn = original;
    }

    assert.strictEqual(warnings, 0, 'resolution must throw, not warn and degrade');
  });

  it('treats a diamond as legitimate, not circular', () => {
    // a -> b -> d and a -> c -> d is not a cycle; only a path back to an
    // ancestor is. Sibling branches must not see each other's cycle keys.
    const collection = build('theme', {
      d: new DesignToken('#dd', 'string'),
      b: new DesignToken('{d}', 'string'),
      c: new DesignToken('{d}', 'string'),
      a: new DesignToken('{b} {c}', 'string'),
    });

    assert.strictEqual(resolve(collection, 'a'), '#dd #dd');
  });
});

describe('alias resolution — composite values and arrays (§9, §9.1)', () => {
  it('resolves a reference nested in a shadow colour, leaving siblings alone', () => {
    const collection = build('theme', {
      'color.ink': new DesignToken(INK, 'color'),
      'effect.card': new DesignToken(
        {
          color: '{color.ink}',
          offsetX: { value: 0, unit: 'px' },
          offsetY: PX16,
          blur: { value: 4, unit: 'px' },
          inset: false,
        },
        'shadow',
      ),
    });

    assert.deepStrictEqual(resolve(collection, 'effect.card'), {
      color: INK,
      offsetX: { value: 0, unit: 'px' },
      offsetY: PX16,
      blur: { value: 4, unit: 'px' },
      inset: false,
    });
  });

  it('resolves a fontFamily reference to the whole stack, not its first entry', () => {
    const collection = build('theme', {
      'font.stack': new DesignToken(STACK, 'fontFamily'),
      'typo.body': new DesignToken({ fontFamily: '{font.stack}', fontSize: PX16, fontWeight: 400 }, 'typography'),
    });

    const resolved = resolve(collection, 'typo.body') as Record<string, unknown>;
    assert.deepStrictEqual(resolved.fontFamily, STACK);
  });

  it('resolves an array element in place without flattening', () => {
    const collection = build('theme', {
      'font.primary': new DesignToken('Alpha', 'fontFamily'),
      'font.stack': new DesignToken(['{font.primary}', 'sans-serif'], 'fontFamily'),
    });

    const resolved = resolve(collection, 'font.stack') as unknown[];
    assert.deepStrictEqual(resolved, ['Alpha', 'sans-serif']);
    assert.strictEqual(resolved.length, 2, 'the reference must occupy exactly one slot');
  });

  it('keeps an array-valued target as a single element', () => {
    // §9.1: referencing an array does not splice it into the outer array.
    const collection = build('theme', {
      'font.stack': new DesignToken(STACK, 'fontFamily'),
      'font.nested': new DesignToken(['{font.stack}', 'monospace'], 'fontFamily'),
    });

    const resolved = resolve(collection, 'font.nested') as unknown[];
    assert.strictEqual(resolved.length, 2);
    assert.deepStrictEqual(resolved[0], STACK);
    assert.strictEqual(resolved[1], 'monospace');
  });

  it('resolves references inside gradient stops', () => {
    const collection = build('theme', {
      'color.blue': new DesignToken(BLUE, 'color'),
      'color.ink': new DesignToken(INK, 'color'),
      'gradient.hero': new DesignToken(
        [
          { color: '{color.blue}', position: 0 },
          { color: '{color.ink}', position: 1 },
        ],
        'gradient',
      ),
    });

    assert.deepStrictEqual(resolve(collection, 'gradient.hero'), [
      { color: BLUE, position: 0 },
      { color: INK, position: 1 },
    ]);
  });

  it('resolves a reference whose target is itself a composite with references', () => {
    const collection = build('theme', {
      'font.stack': new DesignToken(STACK, 'fontFamily'),
      'typo.base': new DesignToken({ fontFamily: '{font.stack}', fontSize: PX16 }, 'typography'),
      'typo.body': new DesignToken('{typo.base}', 'typography'),
    });

    assert.deepStrictEqual(resolve(collection, 'typo.body'), {
      fontFamily: STACK,
      fontSize: PX16,
    });
  });
});

describe('alias resolution — partial-string interpolation', () => {
  it('splices a scalar into the surrounding string', () => {
    const collection = build('theme', {
      'color.ink': new DesignToken('#111111', 'color'),
      'effect.text': new DesignToken('0 2px 4px {color.ink}', 'string'),
    });

    assert.strictEqual(resolve(collection, 'effect.text'), '0 2px 4px #111111');
  });

  it('keeps $ sequences in a resolved value literal', () => {
    // String.replace() reads $&, $`, $' and $1 in the replacement as
    // patterns; building the result by concatenation does not.
    const collection = build('theme', {
      weird: new DesignToken("a$&b$'c$1d", 'string'),
      used: new DesignToken('x {weird} y', 'string'),
    });

    assert.strictEqual(resolve(collection, 'used'), "x a$&b$'c$1d y");
  });

  it('replaces every occurrence of a repeated reference', () => {
    const collection = build('theme', {
      gap: new DesignToken('4px', 'string'),
      box: new DesignToken('{gap} 0 {gap} 0', 'string'),
    });

    assert.strictEqual(resolve(collection, 'box'), '4px 0 4px 0');
  });

  it('handles references at the very start, end, and adjacent to each other', () => {
    const collection = build('theme', {
      a: new DesignToken('A', 'string'),
      b: new DesignToken('B', 'string'),
      joined: new DesignToken('{a}{b}', 'string'),
      edges: new DesignToken('{a}-middle-{b}', 'string'),
    });

    assert.strictEqual(resolve(collection, 'joined'), 'AB');
    assert.strictEqual(resolve(collection, 'edges'), 'A-middle-B');
  });

  it('does not re-scan text it just spliced in', () => {
    const collection = build('theme', {
      open: new DesignToken('{', 'string'),
      close: new DesignToken('}', 'string'),
      assembled: new DesignToken('{open}oops{close}', 'string'),
    });

    // If the injected braces were rescanned, "{oops}" would be treated as a
    // reference and fail to resolve.
    assert.strictEqual(resolve(collection, 'assembled'), '{oops}');
  });

  it('refuses to interpolate a non-scalar instead of emitting [object Object]', () => {
    const collection = build('theme', {
      'shadow.raised': new DesignToken({ color: INK, offsetX: PX16, offsetY: PX16, blur: PX16 }, 'shadow'),
      broken: new DesignToken('0 2px 4px {shadow.raised}', 'string'),
    });

    assert.throws(
      () => resolve(collection, 'broken'),
      (error: unknown) => {
        assert.ok(error instanceof InvalidInterpolationError);
        assert.doesNotMatch(error.message, /\[object Object\]/);
        assert.match(error.message, /cannot be interpolated/);
        return true;
      },
    );
  });

  it('interpolates a dimension, and a colour carrying its hex, as the string they could be written as', () => {
    const collection = build('theme', {
      'space.md': new DesignToken(PX16, 'dimension'),
      'color.veil': new DesignToken('#11223380', 'color'),
      text: new DesignToken('0 {space.md} {color.veil}', 'string'),
    });

    assert.strictEqual(resolve(collection, 'text'), '0 16px #11223380');
  });

  it('interpolates a structured colour of any space as CSS, so it can enter a color-mix()', () => {
    const collection = build('theme', {
      'color.ink': new DesignToken({ colorSpace: 'oklch', components: [0.4, 0.1, 250] }, 'color'),
      'color.p3': new DesignToken({ colorSpace: 'display-p3', components: [1, 0, 0], alpha: 0.5 }, 'color'),
      text: new DesignToken('color-mix(in srgb, {color.ink} 5%, {color.p3})', 'string'),
    });

    assert.strictEqual(resolve(collection, 'text'), 'color-mix(in srgb, oklch(0.4 0.1 250) 5%, color(display-p3 1 0 0 / 0.5))');
  });

  it('interpolates transparent as #00000000, not #0000000000', () => {
    const collection = build('theme', {
      'color.clear': new DesignToken('transparent', 'color'),
      'color.half': new DesignToken('#11223380', 'color'),
      text: new DesignToken('color-mix(in srgb, {color.clear} 50%, {color.half})', 'string'),
    });

    assert.strictEqual(resolve(collection, 'text'), 'color-mix(in srgb, #00000000 50%, #11223380)');
  });

  it('interpolates numbers and booleans', () => {
    const collection = build('theme', {
      weight: new DesignToken(600, 'number'),
      flag: new DesignToken(true, 'boolean'),
      text: new DesignToken('w{weight}/{flag}', 'string'),
    });

    assert.strictEqual(resolve(collection, 'text'), 'w600/true');
  });

  it('survives interpolation nested through several tokens', () => {
    // A shared regex would carry lastIndex between these nested scans.
    const collection = build('theme', {
      leaf: new DesignToken('L', 'string'),
      middle: new DesignToken('<{leaf}|{leaf}>', 'string'),
      outer: new DesignToken('[{middle}#{middle}]', 'string'),
    });

    assert.strictEqual(resolve(collection, 'outer'), '[<L|L>#<L|L>]');
  });
});

describe('type resolution through a reference (§5.2.2)', () => {
  it('takes the type of the referenced token', () => {
    const collection = build('theme', {
      'space.md': new DesignToken(PX16, 'dimension'),
      alias: new DesignToken('{space.md}', ''),
    });

    assert.strictEqual(resolveTypeThroughAlias('{space.md}', collection, 'default', 'alias'), 'dimension');
  });

  it('follows a chain until a type is declared', () => {
    const collection = build('theme', {
      'space.md': new DesignToken(PX16, 'dimension'),
      hop: new DesignToken('{space.md}', ''),
      alias: new DesignToken('{hop}', ''),
    });

    assert.strictEqual(resolveTypeThroughAlias('{hop}', collection, 'default', 'alias'), 'dimension');
  });

  it('falls back to the target group type when the target declares none', () => {
    const collection = new Collection('theme');
    collection.setGroupAttribute('space', '$type', 'dimension');
    collection.setToken('space.md', new DesignToken(PX16, ''));
    collection.setToken('alias', new DesignToken('{space.md}', ''));

    assert.strictEqual(resolveTypeThroughAlias('{space.md}', collection, 'default', 'alias'), 'dimension');
  });

  it('derives no type from a partially interpolated string', () => {
    const collection = build('theme', {
      'space.md': new DesignToken(PX16, 'dimension'),
      alias: new DesignToken('0 {space.md}', ''),
    });

    assert.strictEqual(resolveTypeThroughAlias('0 {space.md}', collection, 'default', 'alias'), null);
  });

  it('returns null on a broken or circular chain rather than throwing', () => {
    const collection = build('theme', {
      dangling: new DesignToken('{nope}', ''),
      a: new DesignToken('{b}', ''),
      b: new DesignToken('{a}', ''),
    });

    assert.strictEqual(resolveTypeThroughAlias('{nope}', collection, 'default', 'dangling'), null);
    assert.strictEqual(resolveTypeThroughAlias('{b}', collection, 'default', 'a'), null);
  });
});

describe('the reference grammar is public', () => {
  it('reaches a reader through the package entry', async () => {
    const lib = await import('../../../src/index.js');
    assert.strictEqual(lib.referenceTarget('{space.md}'), 'space.md');
    assert.strictEqual(lib.referenceTarget('0 2px {color.shade}'), undefined);
    assert.strictEqual(lib.referenceTarget(BLUE), undefined);
    assert.deepStrictEqual(lib.parseReferencePath('brand colors.primary'), ['brand colors', 'primary']);
    assert.throws(() => lib.parseReferencePath('a..b'), /empty path segment/);
  });

  it('says whether a raw value holds a reference anywhere, a structured one included', async () => {
    const lib = await import('../../../src/index.js');
    const shadow = [{ color: '{color.ink}', offsetX: PX16, offsetY: PX16, blur: PX16, spread: { value: 0, unit: 'px' } }];
    assert.strictEqual(lib.holdsReference(shadow), true);
    assert.strictEqual(lib.holdsReference({ fontFamily: STACK, fontSize: PX16 }), false);
    assert.strictEqual(lib.holdsReference(BLUE), false);
    assert.strictEqual(lib.holdsReference({ $ref: '#/a' }), true);
  });

  it('lists the references in a raw value, member by member, as written', async () => {
    const lib = await import('../../../src/index.js');
    const typography = { fontFamily: '{font.body}', fontSize: PX16, lineHeight: 1.5, letterSpacing: '{track.wide}' };
    assert.deepStrictEqual(lib.referencesIn(typography, 'ds'), [
      { at: 'fontFamily', to: 'ds.font.body', interpolated: false, written: '{font.body}' },
      { at: 'letterSpacing', to: 'ds.track.wide', interpolated: false, written: '{track.wide}' },
    ]);
    assert.deepStrictEqual(lib.referencesIn('0 2px {space.sm} {color.ink}'), [
      { at: '', to: 'space.sm', interpolated: true, written: '{space.sm}' },
      { at: '', to: 'color.ink', interpolated: true, written: '{color.ink}' },
    ]);
    assert.deepStrictEqual(lib.referencesIn(STACK), []);
  });
});
