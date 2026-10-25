/**
 * Property test: for seeded random legal documents, every token the report
 * does not name agrees with `resolve()` at every point of `getPermutations()`,
 * property by property, and `step`, `valueAt` and `dependsOn` agree with the
 * resolver and the DesignSystem. Corpora from the factoring spike.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver } from '../../../../src/resolver/resolver.js';
import type { LeafProperty } from '../../../../src/resolver/chains.js';
import { generate, type GenOptions } from './generate.js';
import { allTokenPaths, evalChain, oracle, outcome } from './oracle.js';
import { InvalidTokenError, PathNotFoundError } from '../../../../src/core/design-token.js';
import { fourModifierFixture } from './fixtures.js';

const SEEDS = 500;
// biome-ignore lint/correctness/noUnusedVariables: `checked` is only ever written, never read, so the count of compared cells is never asserted; reported for a later round
let checked = 0; // cells where valueAt was compared with the DesignSystem
const PROPS: LeafProperty[] = ['$value', '$type', '$description', '$extensions'];

const CORPORA: { name: string; opts: GenOptions; partialsPossible: boolean }[] = [
  { name: 'all', opts: {}, partialsPossible: true },
  { name: 'no aliases', opts: { aliases: false }, partialsPossible: true },
  { name: 'no partials', opts: { partials: false }, partialsPossible: false },
  { name: 'no aliases, no partials', opts: { aliases: false, partials: false }, partialsPossible: false },
];

/**
 * The `$value` the resolver has at a token with whole-value aliases followed, and nothing else:
 * no type, no handler. That is what `dependsOn` speaks of, so it is what the dependency check compares.
 */
function rawValue(resolver: Resolver, path: string, input: Record<string, string>, depth = 0): unknown {
  const v = oracle(resolver, input).get(path)?.$value;
  const target = typeof v === 'string' && /^\{([^{}]+)\}$/.exec(v)?.[1];
  return target ? (depth > 20 ? 'cycle' : rawValue(resolver, target, input, depth + 1)) : v;
}

/** Check one document; returns how many tokens the report named. */
function checkDocument(doc: Parameters<typeof generate>[0] extends number ? ReturnType<typeof generate> : never, where: string): number {
  const resolver = new Resolver(doc);
  const perms = resolver.getPermutations();
  let reported = 0;
  for (const path of allTokenPaths(resolver)) {
    // A chain's values come in the stored shape; a value its type rejects (a partial with nothing beneath it) is refused.
    let ctxs: ReturnType<Resolver['contextsOf']>;
    try {
      ctxs = resolver.contextsOf(path);
    } catch (error) {
      assert.ok(error instanceof InvalidTokenError, `${where} ${path}: ${error}`);
      continue;
    }
    const flagged = new Set(ctxs.nonFactorable.map((n) => n.property));
    if (flagged.size) reported++;
    for (const n of ctxs.nonFactorable) assert.equal(n.path, path);
    // a reference that cannot be followed in some cell throws, as resolution does
    const deps = outcome(() => resolver.dependsOn(path));
    const cells = new Map<string, unknown>();

    for (const input of perms) {
      const want = oracle(resolver, input).get(path);
      const at = `${where} ${path} ${JSON.stringify(input)}`;

      // chains reproduce the resolver, property by property, reading links only
      if (!flagged.has('$value')) assert.deepEqual(evalChain(resolver, ctxs.chains.$value, input), want?.$value, `${at} $value`);
      if (want)
        for (const p of PROPS.slice(1) as LeafProperty[])
          if (!flagged.has(p)) assert.deepEqual(evalChain(resolver, ctxs.chains[p], input), want[p], `${at} ${p}`);

      // a step that carries the base says so, only in the last link, and holds the base
      const links = ctxs.chains.$value?.links ?? [];
      links.forEach((link, i) => {
        for (const s of Object.values(link.steps))
          if ('base' in s) {
            assert.equal(i, links.length - 1, `${at} a base step before the last link`);
            assert.deepEqual(s.value, ctxs.chains.$value!.base, `${at} base step`);
          }
      });

      // valueAt is what the DesignSystem says. The DesignSystem of the whole document also refuses a
      // document with some other malformed token, which valueAt never loads, so a refusal proves nothing.
      const got = outcome(() => resolver.valueAt(path, input));
      if (!want) assert.throws(() => resolver.valueAt(path, input), PathNotFoundError, `${at} hole`);
      else {
        const expected = outcome(() => resolver.resolveToDesignSystem(input).resolveValue(`resolved.${path}`));
        if (expected.ok) assert.deepEqual(got, expected, `${at} valueAt`);
        else checked--;
        checked++;
      }
      cells.set(JSON.stringify(input), rawValue(resolver, path, input));
    }

    // a modifier outside direct and through never changes the value
    if (!deps.ok) continue;
    const { direct, through } = deps.value as { direct: string[]; through: string[] };
    const named = new Set([...direct, ...through]);
    for (const { name: m, contexts } of resolver.getModifiers())
      if (!named.has(m))
        for (const input of perms)
          for (const c of contexts)
            assert.deepEqual(
              cells.get(JSON.stringify({ ...input, [m]: c })),
              cells.get(JSON.stringify(input)),
              `${where} ${path} ${m} is not a dependency`,
            );
  }
  return reported;
}

describe('factoring: seeded random documents', () => {
  for (const corpus of CORPORA)
    it(`${SEEDS} seeds, corpus "${corpus.name}"`, () => {
      let reported = 0;
      for (let seed = 1; seed <= SEEDS; seed++) reported += checkDocument(generate(seed, corpus.opts), `seed ${seed}`);
      // the report is not vacuous, and it is silent when no composite is partial
      if (corpus.partialsPossible) assert.ok(reported > 0, 'the corpus never produced a partial composite');
      else assert.equal(reported, 0, 'a document without partial composites was reported');
    });
});

describe('factoring: four-modifier fixture', () => {
  it('reports only the shadow, and everything else agrees', () => {
    const doc = fourModifierFixture();
    assert.equal(checkDocument(doc, 'fixture'), 1);
    assert.deepEqual(
      new Resolver(doc).contextsOf('shadow.card').nonFactorable.map((n) => n.path),
      ['shadow.card'],
    );
  });
});
