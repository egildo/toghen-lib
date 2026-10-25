/**
 * Fixed cases for Resolver.dependsOn / contextsOf / valueAt, in the W3C
 * structured shapes ({colorSpace,components}, {value,unit}, fontFamily arrays).
 * Expected values are written by hand, not recomputed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver } from '../../../../src/resolver/resolver.js';
import { InvalidInputError, InvalidReferenceError } from '../../../../src/resolver/errors.js';
import { CircularReferenceError, PathNotFoundError, UnresolvableReferenceError } from '../../../../src/core/design-token.js';
import { doc, mod, px, set, srgb, tok } from './fixtures.js';

describe('description-only override', () => {
  const r = new Resolver(
    doc([
      set('base', tok('color.bg', { $value: srgb(1, 1, 1), $type: 'color' })),
      mod('scheme', { light: [{}], dark: [tok('color.bg', { $description: 'on dark' })] }, 'light'),
    ]),
  );
  it('leaves $value without links and gives $description its own chain', () => {
    const c = r.contextsOf('color.bg');
    assert.deepEqual(c.nonFactorable, []);
    assert.deepEqual(c.chains.$value, { property: '$value', links: [], base: srgb(1, 1, 1), holes: [] });
    assert.deepEqual(c.chains.$description?.links, [
      { modifier: 'scheme', path: 'color.bg', steps: { light: { hole: true }, dark: { value: 'on dark' } } },
    ]);
    assert.deepEqual(c.generated, []);
  });
  it('keeps the value in the dark context', () => {
    assert.deepEqual(r.valueAt('color.bg', { scheme: 'dark' }), srgb(1, 1, 1));
  });
});

describe('partial composite override', () => {
  const r = new Resolver(
    doc([
      set('base', tok('space.md', { $value: px(16), $type: 'dimension' })),
      mod('density', { regular: [{}], rem: [tok('space.md', { $value: { unit: 'rem' } })] }, 'regular'),
    ]),
  );
  it('is reported, not factored', () => {
    const c = r.contextsOf('space.md');
    assert.equal(c.chains.$value, undefined);
    assert.equal(c.nonFactorable.length, 1);
    assert.deepEqual(
      { ...c.nonFactorable[0], detail: '' },
      {
        path: 'space.md',
        property: '$value',
        reason: 'partial-composite',
        involved: [{ entry: 'base' }, { entry: 'density', context: 'rem' }],
        detail: '',
      },
    );
    assert.ok(c.nonFactorable[0].detail.length > 0);
  });
  it('valueAt answers early-bound', () => {
    assert.deepEqual(r.valueAt('space.md', { density: 'rem' }), { value: 16, unit: 'rem' });
    assert.deepEqual(r.valueAt('space.md'), { value: 16, unit: 'px' });
  });
  it('reports a shadow member overridden alone, with a nested object', () => {
    const s = new Resolver(
      doc([
        set('base', tok('shadow.card', { $value: { offsetX: px(0), offsetY: px(2), blur: px(4), color: srgb(0, 0, 0) } })),
        mod('elevation', { low: [{}], high: [tok('shadow.card', { $value: { blur: { value: 12 } } })] }, 'low'),
      ]),
    );
    assert.equal(s.contextsOf('shadow.card').nonFactorable[0].reason, 'partial-composite');
    assert.equal((s.valueAt('shadow.card', { elevation: 'high' }) as any).blur.value, 12);
  });
});

describe('a partial composite a later modifier hides', () => {
  const partialUnder = (later: Record<string, object[]>) =>
    new Resolver(
      doc([
        set('base', tok('space.md', { $value: px(16), $type: 'dimension' })),
        mod('a', { x: [{}], y: [tok('space.md', { $value: { unit: 'rem' } })] }, 'x'),
        mod('b', later, 'p'),
      ]),
    );
  const resolved = (r: Resolver, input: Record<string, string>) => (r.resolve(input) as any).space.md.$value;

  it('is not reported when the later modifier defines it whole in every context: the chain stops there', () => {
    const r = partialUnder({ p: [tok('space.md', { $value: px(20) })], q: [tok('space.md', { $value: px(1, 'rem') })] });
    const c = r.contextsOf('space.md');
    assert.deepEqual(c.nonFactorable, []);
    assert.deepEqual(c.chains.$value?.links, [
      { modifier: 'b', path: 'space.md', steps: { p: { value: px(20) }, q: { value: px(1, 'rem') } } },
    ]);
    assert.deepEqual(r.dependsOn('space.md'), { direct: ['b'], through: [] });
    for (const a of ['x', 'y']) for (const b of ['p', 'q']) assert.deepEqual(r.valueAt('space.md', { a, b }), resolved(r, { a, b }));
  });

  it('is reported when the later modifier defines it in one context only', () => {
    const r = partialUnder({ p: [tok('space.md', { $value: px(20) })], q: [{}] });
    const c = r.contextsOf('space.md');
    assert.equal(c.nonFactorable.length, 1);
    assert.deepEqual(c.nonFactorable[0].involved, [{ entry: 'base' }, { entry: 'a', context: 'y' }]);
    assert.deepEqual(r.dependsOn('space.md'), { direct: ['a', 'b'], through: [] });
    assert.deepEqual(r.valueAt('space.md', { a: 'y', b: 'q' }), px(16, 'rem'));
    for (const a of ['x', 'y']) for (const b of ['p', 'q']) assert.deepEqual(r.valueAt('space.md', { a, b }), resolved(r, { a, b }));
  });
});

describe('token on two modifiers', () => {
  const r = new Resolver(
    doc([
      set('base', tok('color.bg', { $value: srgb(1, 1, 1) })),
      mod('scheme', { light: [{}], dark: [tok('color.bg', { $value: srgb(0, 0, 0) })] }, 'light'),
      mod('tone', { neutral: [{}], loud: [tok('color.bg', { $value: srgb(1, 0, 0) })] }, 'neutral'),
    ]),
  );
  it('chains the last modifier first and generates one token', () => {
    const c = r.contextsOf('color.bg');
    assert.deepEqual(c.chains.$value, {
      property: '$value',
      links: [
        { modifier: 'tone', path: 'color.bg', steps: { neutral: { fallThrough: 'color.bg~scheme' }, loud: { value: srgb(1, 0, 0) } } },
        {
          modifier: 'scheme',
          path: 'color.bg~scheme',
          steps: { light: { value: srgb(1, 1, 1), base: true }, dark: { value: srgb(0, 0, 0) } },
        },
      ],
      base: srgb(1, 1, 1),
      holes: [],
    });
    assert.deepEqual(c.generated, [{ path: 'color.bg~scheme', of: 'color.bg', modifier: 'scheme' }]);
    assert.deepEqual(r.dependsOn('color.bg'), { direct: ['scheme', 'tone'], through: [] });
  });
  it('valueAt follows the links, each reading its own modifier', () => {
    assert.deepEqual(r.valueAt('color.bg', { scheme: 'dark', tone: 'neutral' }), srgb(0, 0, 0));
    assert.deepEqual(r.valueAt('color.bg', { scheme: 'dark', tone: 'loud' }), srgb(1, 0, 0));
  });
  it('a generated path is accepted wherever a path is', () => {
    assert.deepEqual(r.dependsOn('color.bg~scheme'), { direct: ['scheme'], through: [] });
    const g = r.contextsOf('color.bg~scheme');
    assert.equal(g.path, 'color.bg~scheme');
    assert.equal(g.chains.$value?.links[0].path, 'color.bg~scheme');
    assert.deepEqual(r.valueAt('color.bg~scheme', { scheme: 'dark' }), srgb(0, 0, 0));
    assert.throws(() => r.contextsOf('color.bg~tone'), PathNotFoundError);
    assert.throws(() => r.contextsOf('color.nope'), PathNotFoundError);
  });
  it('valueAt needs a context for every modifier, a default or one given', () => {
    const q = new Resolver(
      doc([
        set('base', tok('color.bg', { $value: srgb(1, 1, 1) })),
        mod('scheme', { light: [{}], dark: [tok('color.bg', { $value: srgb(0, 0, 0) })] }, 'light'),
        mod('other', { a: [{}], b: [{}] }),
      ]),
    );
    assert.deepEqual(q.valueAt('color.bg', { scheme: 'dark', other: 'a' }), srgb(0, 0, 0));
    assert.throws(() => q.valueAt('color.bg', { scheme: 'dark' }), InvalidInputError);
    assert.throws(() => q.valueAt('color.bg', { nope: 'x', other: 'a' }), InvalidInputError);
    assert.throws(() => q.valueAt('color.bg', { scheme: 'nope', other: 'a' }), InvalidInputError);
    const noDefault = new Resolver(
      doc([
        set('base', tok('color.bg', { $value: srgb(1, 1, 1) })),
        mod('scheme', { light: [{}], dark: [tok('color.bg', { $value: srgb(0, 0, 0) })] }),
      ]),
    );
    assert.throws(() => noDefault.valueAt('color.bg'), InvalidInputError);
  });
});

describe('a set between two modifiers', () => {
  const r = new Resolver(
    doc([
      mod('a', { x: [tok('space.md', { $value: px(1) })], y: [tok('space.md', { $value: px(2) })] }, 'x'),
      set('mid', tok('space.md', { $value: px(3) })),
      mod('b', { x: [{}], y: [tok('space.md', { $value: px(4) })] }, 'x'),
    ]),
  );
  it('ends the walk at the set: the earlier modifier is unreachable', () => {
    const c = r.contextsOf('space.md').chains.$value!;
    assert.deepEqual(
      c.links.map((l) => l.modifier),
      ['b'],
    );
    assert.deepEqual(c.base, px(3));
    assert.deepEqual(r.dependsOn('space.md'), { direct: ['b'], through: [] });
    assert.deepEqual(r.valueAt('space.md', { a: 'y', b: 'x' }), { value: 3, unit: 'px' });
    assert.deepEqual(r.valueAt('space.md', { a: 'y', b: 'y' }), { value: 4, unit: 'px' });
  });
});

describe('a hole', () => {
  const r = new Resolver(
    doc([
      mod('scheme', { light: [tok('color.fg', { $value: srgb(0, 0, 0) })], dark: [{}] }, 'light'),
      mod('tone', { a: [{}], b: [tok('color.fg', { $value: srgb(1, 0, 0) })] }, 'a'),
    ]),
  );
  it('is reported as a combination of home modifiers, and not filled', () => {
    const c = r.contextsOf('color.fg').chains.$value!;
    assert.deepEqual(c.holes, [{ tone: 'a', scheme: 'dark' }]);
    assert.equal(c.base, undefined);
    assert.deepEqual(c.links[1].steps.dark, { hole: true });
  });
  it('valueAt refuses it, as the resolver has no token there', () => {
    assert.equal(r.resolve({ scheme: 'dark', tone: 'a' }).color, undefined);
    assert.throws(() => r.valueAt('color.fg', { scheme: 'dark', tone: 'a' }), PathNotFoundError);
    assert.deepEqual(r.valueAt('color.fg', { scheme: 'dark', tone: 'b' }), srgb(1, 0, 0));
  });
});

describe('an alias in one context and a literal in another', () => {
  const r = new Resolver(
    doc([
      set('base', tok('space.md', { $value: px(16) }), tok('space.lg', { $value: px(24) })),
      mod('a', { x: [{}], y: [tok('space.md', { $value: '{space.lg}' })] }, 'x'),
      mod('b', { x: [{}], y: [tok('space.lg', { $value: px(32) })] }, 'x'),
    ]),
  );
  it('is factorable and keeps the reference as a reference', () => {
    assert.deepEqual(r.contextsOf('space.md').nonFactorable, []);
    assert.deepEqual(r.contextsOf('space.md').chains.$value!.links[0].steps, {
      x: { value: px(16), base: true },
      y: { value: '{space.lg}' },
    });
  });
  it('depends on the modifiers of what it references', () => {
    assert.deepEqual(r.dependsOn('space.md'), { direct: ['a'], through: ['b'] });
    assert.deepEqual(r.dependsOn('space.lg'), { direct: ['b'], through: [] });
  });
  it('valueAt binds late: the reference sees another modifier', () => {
    assert.deepEqual(r.valueAt('space.md', { a: 'y', b: 'y' }), { value: 32, unit: 'px' });
    assert.deepEqual(r.valueAt('space.md', { a: 'y', b: 'x' }), { value: 24, unit: 'px' });
    assert.deepEqual(r.valueAt('space.md', { a: 'x', b: 'y' }), { value: 16, unit: 'px' });
  });
  it('a cycle throws as resolution does', () => {
    const c = new Resolver(doc([set('base', tok('t.a', { $value: '{t.b}' }), tok('t.b', { $value: '{t.a}' }))]));
    assert.throws(() => c.dependsOn('t.a'), CircularReferenceError);
    assert.throws(() => c.valueAt('t.a'), CircularReferenceError);
  });
});

describe('a modifier never named in resolutionOrder', () => {
  const r = new Resolver(
    doc(
      [
        set('base', tok('color.bg', { $value: srgb(1, 1, 1) })),
        mod('scheme', { light: [{}], dark: [tok('color.bg', { $value: srgb(0, 0, 0) })] }, 'light'),
      ],
      { modifiers: { extra: { default: 'p', contexts: { p: [tok('color.bg', { $value: srgb(1, 0, 0) })], q: [{}] } } } },
    ),
  );
  it('is accepted in input, depends on nothing, and does not change the value', () => {
    assert.deepEqual(r.dependsOn('color.bg'), { direct: ['scheme'], through: [] });
    assert.deepEqual(r.valueAt('color.bg', { extra: 'q' }), srgb(1, 1, 1));
    assert.deepEqual(r.valueAt('color.bg', { extra: 'p' }), srgb(1, 1, 1));
  });
});

describe('fontFamily arrays', () => {
  it('are replaced whole and factor', () => {
    const r = new Resolver(
      doc([
        set('base', tok('font.body', { $value: ['Inter', 'sans-serif'], $type: 'fontFamily' })),
        mod('script', { latin: [{}], serif: [tok('font.body', { $value: ['Georgia'] })] }, 'latin'),
      ]),
    );
    assert.deepEqual(r.contextsOf('font.body').nonFactorable, []);
    assert.deepEqual(r.contextsOf('font.body').chains.$value!.links[0].steps, {
      latin: { value: ['Inter', 'sans-serif'], base: true },
      serif: { value: ['Georgia'] },
    });
    assert.deepEqual(r.valueAt('font.body', { script: 'serif' }), ['Georgia']);
    assert.deepEqual(r.valueAt('font.body'), ['Inter', 'sans-serif']);
  });
});

describe('a name collision on a generated path', () => {
  it('is an error at the query, not a silent overwrite', () => {
    const r = new Resolver(
      doc([
        set('base', tok('color.bg', { $value: srgb(1, 1, 1) }), tok('color.bg~scheme', { $value: srgb(0, 0, 0) })),
        mod('scheme', { light: [{}], dark: [tok('color.bg', { $value: srgb(0, 0, 0) })] }, 'light'),
        mod('tone', { n: [{}], l: [tok('color.bg', { $value: srgb(1, 0, 0) })] }, 'n'),
      ]),
    );
    assert.throws(() => r.contextsOf('color.bg'), InvalidReferenceError);
  });
});

describe('a reference dependsOn cannot follow', () => {
  it('names the document, the mode and the reference it was written in', () => {
    const r = new Resolver(
      doc(
        [
          set('base', tok('space.md', { $value: px(16), $type: 'dimension' })),
          mod('density', { regular: [{}], compact: [tok('space.md', { $value: '{space.missing}' })] }, 'regular'),
        ],
        { name: 'ui' },
      ),
    );
    assert.throws(
      () => r.dependsOn('space.md'),
      (e: unknown) => {
        assert.ok(e instanceof UnresolvableReferenceError);
        assert.deepEqual(
          { reference: e.reference, tokenPath: e.tokenPath, collectionName: e.collectionName, mode: e.mode, reason: e.reason },
          { reference: '{space.missing}', tokenPath: 'space.md', collectionName: 'ui', mode: 'compact', reason: 'not-found' },
        );
        return true;
      },
    );
  });
});

describe("a chain's values in the shape lib stores", () => {
  const hex = (h: string, ...components: number[]) => ({ colorSpace: 'srgb', components, hex: h });
  const r = new Resolver(
    doc([
      set(
        'base',
        tok('color', { $type: 'color', ink: { $value: '#000000' }, bg: { $value: '#ffffff' } }),
        tok('space.md', { $type: 'dimension', $value: '16px' }),
        tok('font.body', { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] }),
        tok('shadow.card', { $type: 'shadow', $value: { color: srgb(0, 0, 0), offsetX: px(0), offsetY: px(2), blur: px(4) } }),
        tok('label', { $value: '#ffffff' }),
      ),
      mod(
        'scheme',
        {
          light: [{}],
          dark: [
            tok('color.bg', { $value: '#000000' }),
            tok('space.md', { $value: '1.5rem' }),
            tok('font.body', { $value: "'Plex Sans', serif" }),
            tok('shadow.card', { $value: { color: '{color.ink}', offsetX: '0px', offsetY: '4px', blur: '8px' } }),
            tok('label', { $value: '{color.bg}' }),
          ],
          dim: [tok('color.bg', { $value: '{color.ink}' }), tok('label', { $type: 'color', $value: '#000000' })],
        },
        'light',
      ),
    ]),
  );
  const steps = (path: string) => r.contextsOf(path).chains.$value!.links[0].steps;

  it('gives a colour a context writes as a hex string the structured shape, base and base step too', () => {
    assert.deepEqual(steps('color.bg'), {
      light: { value: hex('#ffffff', 1, 1, 1), base: true },
      dark: { value: hex('#000000', 0, 0, 0) },
      dim: { value: '{color.ink}' },
    });
    assert.deepEqual(r.contextsOf('color.bg').chains.$value!.base, hex('#ffffff', 1, 1, 1));
  });
  it('gives a dimension string the {value, unit} shape', () => {
    assert.deepEqual(steps('space.md').dark, { value: px(1.5, 'rem') });
    assert.deepEqual(r.contextsOf('space.md').chains.$value!.base, px(16));
  });
  it('gives a fontFamily string with commas the array lib stores', () => {
    assert.deepEqual(steps('font.body').dark, { value: ['Plex Sans', 'serif'] });
  });
  it('keeps a composite with a member reference as written, the reference in its member', () => {
    assert.deepEqual(steps('shadow.card').dark, { value: { color: '{color.ink}', offsetX: '0px', offsetY: '4px', blur: '8px' } });
  });
  it("keeps a whole reference a string, and reads the token's own type in each context, never one reached through a reference", () => {
    assert.deepEqual(steps('label'), {
      light: { value: '#ffffff', base: true },
      dark: { value: '{color.bg}' },
      dim: { value: hex('#000000', 0, 0, 0) },
    });
    assert.equal(r.contextsOf('label').chains.$value!.base, '#ffffff');
  });
});

describe('a literal brace in a document', () => {
  // The shape a data file has: a $type-less string token and a typed one.
  const r = new Resolver(
    doc([
      set(
        'base',
        tok('label', { $value: '{{no.such}}' }),
        tok('caption', { $type: 'string', $value: '{{size.sm}} is {size.sm}' }),
        tok('size.sm', { $type: 'dimension', $value: px(4) }),
      ),
    ]),
  );
  it('resolves to the literal text through resolveToDesignSystem', () => {
    const ds = r.resolveToDesignSystem();
    assert.equal(ds.resolveValue('resolved.label'), '{no.such}');
    assert.equal(ds.resolveValue('resolved.caption'), '{size.sm} is 4px');
    assert.deepEqual(ds.referencesOf('resolved.label'), []);
  });
  it('resolves to the literal text through valueAt', () => {
    assert.equal(r.valueAt('label'), '{no.such}');
    assert.equal(r.valueAt('caption'), '{size.sm} is 4px');
  });
  it('keeps the escape as written in contextsOf, and follows no reference from it', () => {
    assert.equal(r.contextsOf('label').chains.$value!.base, '{{no.such}}');
    assert.deepEqual(r.dependsOn('label'), { direct: [], through: [] });
  });
});
