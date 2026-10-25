/**
 * Chains: one token's property, factored by modifier.
 *
 * A property of a token (`$value`, `$type`, `$description`, `$extensions`) is
 * read by walking `resolutionOrder` from the end. A set that defines it ends
 * the walk (its value is the base); a modifier some of whose contexts define
 * it adds a link; a modifier all of whose contexts define it ends the walk.
 * A link reads only its own modifier's context.
 *
 * The one thing a chain cannot represent is a plain-object `$value` merged
 * onto a plain-object `$value` beneath it, where the result differs from the
 * incoming object alone (a partial composite). Such a property is reported
 * when the resolver would output it: some way through the contexts reaches
 * the end of `resolutionOrder` with no later entry replacing it whole.
 *
 * See specs.md, "Querying one token across contexts".
 */
import { referencesIn } from '../core/alias.js';
import { CircularReferenceError, PathNotFoundError, UnresolvableReferenceError } from '../core/design-token.js';
import { normalizeTokenValue } from '../handlers/built-in.js';
import { InvalidReferenceError } from './errors.js';

type Rec = Record<string, any>;

export type LeafProperty = '$value' | '$type' | '$description' | '$extensions';
export const LEAF_PROPERTIES: LeafProperty[] = ['$value', '$type', '$description', '$extensions'];

/**
 * What one context of one link says. A value is the context's own definition, or, with `base: true`, the base
 * carried into a context that defines nothing, in the last link. A `$value` is in the shape lib stores, for the
 * token's own type in that context; a reference in it stays as written.
 */
export type Step = { value: unknown; base?: true } | { fallThrough: string } | { hole: true };

export interface ChainLink {
  /** The home modifier. */
  modifier: string;
  /** The token that carries this link: the token itself for the first, a generated path for the rest. */
  path: string;
  /** One step per context of the modifier: dense. */
  steps: Record<string, Step>;
}

export interface Chain {
  property: LeafProperty;
  /** Last-winning first. Empty when only sets define the property. */
  links: ChainLink[];
  /** A set's value when every link falls through; `undefined` if no set defines the property. */
  base: unknown;
  /** Combinations of the links' home modifiers in which the property has no value. Empty unless `base` is undefined. */
  holes: Array<Record<string, string>>;
}

export interface NonFactorable {
  path: string;
  property: LeafProperty;
  reason: 'partial-composite';
  /** The sets and modifier contexts that make it so, in `resolutionOrder`. `context` is absent for a set. */
  involved: Array<{ entry: string; context?: string }>;
  detail: string;
}

export interface TokenContexts {
  path: string;
  chains: Partial<Record<LeafProperty, Chain>>;
  generated: Array<{ path: string; of: string; modifier: string }>;
  nonFactorable: NonFactorable[];
}

/** One item of `resolutionOrder`, flattened: a set's merged structure, or a modifier's per context. */
export type Entry =
  | { kind: 'set'; name: string; struct: Rec }
  | { kind: 'modifier'; name: string; contexts: Record<string, Rec>; default?: string };

type Def = { v: unknown } | undefined;
type Analysis = { chain?: Chain; report?: NonFactorable };

const isPlain = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (isPlain(a) && isPlain(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => has(b, k) && same(a[k], b[k]));
  }
  return false;
}

/** The property of the node at `segs`, if that node defines it. */
function get(struct: Rec, segs: string[], prop: string): Def {
  let n: unknown = struct;
  for (const s of segs) n = isPlain(n) && has(n, s) ? n[s] : undefined;
  return isPlain(n) && has(n, prop) ? { v: n[prop] } : undefined;
}

const generatedPath = (path: string, modifier: string) => `${path}~${modifier}`;

function holesOf(links: ChainLink[], hasBase: boolean): Array<Record<string, string>> {
  if (hasBase || !links.length) return [];
  let out: Array<Record<string, string>> = [{}];
  for (const link of links) {
    const falls = Object.entries(link.steps)
      .filter(([, s]) => !('value' in s))
      .map(([c]) => c);
    out = out.flatMap((o) => falls.map((c) => ({ ...o, [link.modifier]: c })));
  }
  return out;
}

export class ChainIndex {
  /** Every path at which some entry defines a `$value`. */
  readonly tokenPaths = new Set<string>();
  private readonly cache = new Map<string, Analysis>();
  private readonly reaching = new Map<string, Set<string>>();

  /**
   * @param merge the resolver's own merge, so a partial composite is judged by what the resolver does
   * @param where the collection a build of the document is named, and the mode it names a combination; an error names them
   */
  constructor(
    private readonly entries: Entry[],
    private readonly merge: (a: Rec, b: Rec) => Rec,
    private readonly where: { collection: string; mode: (contexts: Record<string, string>) => string } = {
      collection: 'resolved',
      mode: () => 'default',
    },
  ) {
    const collect = (node: Rec, prefix: string[]) => {
      for (const [k, v] of Object.entries(node)) {
        if (k.startsWith('$') || !isPlain(v)) continue;
        if (has(v, '$value')) this.tokenPaths.add([...prefix, k].join('.'));
        collect(v, [...prefix, k]);
      }
    };
    for (const e of entries) for (const s of e.kind === 'set' ? [e.struct] : Object.values(e.contexts)) collect(s, []);
  }

  /** The token a path names, and the link it starts at: a generated path starts at its link. */
  locate(path: string): { token: string; from: number } {
    if (this.tokenPaths.has(path)) return { token: path, from: 0 };
    for (let i = path.indexOf('~'); i > 0; i = path.indexOf('~', i + 1)) {
      const token = path.slice(0, i);
      if (!this.tokenPaths.has(token)) continue;
      const from = this.analyse(token, '$value').chain?.links.findIndex((l) => l.path === path) ?? -1;
      if (from > 0) return { token, from };
    }
    throw new PathNotFoundError(`No token "${path}" in the resolver document, and no generated token of that name.`);
  }

  /** The token that owns a reference path (the reference may name a member of it). */
  ownerOf(refPath: string): string | undefined {
    const segs = refPath.split('.');
    for (let i = 1; i <= segs.length; i++) if (this.tokenPaths.has(segs.slice(0, i).join('.'))) return segs.slice(0, i).join('.');
    return undefined;
  }

  analyse(path: string, prop: LeafProperty): Analysis {
    const key = `${prop}\0${path}`;
    let a = this.cache.get(key);
    if (!a) this.cache.set(key, (a = this.build(path, prop)));
    return a;
  }

  private build(path: string, prop: LeafProperty): Analysis {
    const segs = path.split('.');
    let base: Def;
    const raw: Array<{ modifier: string; values: Record<string, Def> }> = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.kind === 'set') {
        base = get(e.struct, segs, prop);
        if (base) break;
        continue;
      }
      const values = Object.fromEntries(Object.entries(e.contexts).map(([c, s]) => [c, get(s, segs, prop)]));
      const n = Object.values(values).filter(Boolean).length;
      if (!n) continue;
      raw.push({ modifier: e.name, values });
      if (n === Object.keys(values).length) break;
    }
    if (!raw.length && !base) return {};

    const links: ChainLink[] = raw.map((r, j) => ({
      modifier: r.modifier,
      path: j === 0 ? path : generatedPath(path, r.modifier),
      steps: Object.fromEntries(
        Object.entries(r.values).map(([c, d]): [string, Step] => [
          c,
          d
            ? { value: d.v }
            : j < raw.length - 1
              ? { fallThrough: generatedPath(path, raw[j + 1].modifier) }
              : base
                ? { value: base.v, base: true }
                : { hole: true },
        ]),
      ),
    }));
    if (prop === '$value')
      for (const l of links.slice(1))
        if (this.tokenPaths.has(l.path))
          throw new InvalidReferenceError(
            `The document already holds a token at "${l.path}", the generated path of "${path}" for modifier "${l.modifier}".`,
          );

    return { chain: { property: prop, links, base: base?.v, holes: holesOf(links, !!base) }, report: this.partial(path, prop, segs) };
  }

  /** A `$value` chain in the shape lib stores, each value for the token's own type where it is read; a reference stays as written. */
  private stored(token: string, chain: Chain): Chain {
    const segs = token.split('.');
    const norm = (v: unknown, modifier?: string, context?: string) =>
      normalizeTokenValue(this.typeAt(segs, modifier, context) ?? '', v, `${this.where.collection}.${token}`);
    return {
      ...chain,
      links: chain.links.map((l) => ({
        ...l,
        steps: Object.fromEntries(
          Object.entries(l.steps).map(([c, s]) => [c, 'value' in s ? { ...s, value: norm(s.value, l.modifier, c) } : s]),
        ),
      })),
      base: chain.base === undefined ? undefined : norm(chain.base),
    };
  }

  /**
   * The token's own type, its `$type` or else its nearest group's, where `modifier` is at `context` and every other
   * modifier at its default; a modifier with no default defines nothing here. A type reached through a reference is
   * not the token's own.
   */
  private typeAt(segs: string[], modifier?: string, context?: string): string | undefined {
    for (let n = segs.length; n > 0; n--)
      for (let i = this.entries.length - 1; i >= 0; i--) {
        const e = this.entries[i];
        const at = e.kind === 'set' ? e.struct : e.contexts[(e.name === modifier ? context : e.default) ?? ''];
        const d = at && get(at, segs.slice(0, n), '$type');
        if (d) return d.v as string;
      }
    return undefined;
  }

  /**
   * A partial composite: some way through the contexts merges a plain object onto a plain object, the
   * result is not the incoming object, and no later entry on that way replaces it whole before the end.
   */
  private partial(path: string, prop: LeafProperty, segs: string[]): NonFactorable | undefined {
    type Who = { i: number; entry: string; context?: string };
    const involved = new Map<string, Who>();
    // `partialBy`: the entries that made the value on this way a partial, while it still is one
    const walk = (i: number, acc: unknown, seen: boolean, who: Who[], partialBy?: Who[]) => {
      if (i === this.entries.length) {
        for (const w of partialBy ?? []) involved.set(`${w.i}\0${w.context ?? ''}`, w);
        return;
      }
      const e = this.entries[i];
      const options: Array<[string | undefined, Def]> =
        e.kind === 'set' ? [[undefined, get(e.struct, segs, prop)]] : Object.entries(e.contexts).map(([c, s]) => [c, get(s, segs, prop)]);
      let skipped = false;
      for (const [c, d] of options) {
        if (!d) {
          if (!skipped) walk(i + 1, acc, seen, who, partialBy);
          skipped = true;
          continue;
        }
        const me = c === undefined ? { i, entry: e.name } : { i, entry: e.name, context: c };
        if (seen && isPlain(acc) && isPlain(d.v)) {
          const merged = this.merge(acc, d.v);
          const all = [...who, me];
          walk(i + 1, merged, true, all, same(merged, d.v) ? undefined : all);
        } else walk(i + 1, d.v, true, [me]);
      }
    };
    walk(0, undefined, false, []);
    if (!involved.size) return undefined;
    return {
      path,
      property: prop,
      reason: 'partial-composite',
      involved: [...involved.values()]
        .sort((a, b) => a.i - b.i)
        .map(({ entry, context }) => (context === undefined ? { entry } : { entry, context })),
      detail: `${prop} of "${path}" is overridden in part: an object merged onto the object beneath it differs from the incoming object alone.`,
    };
  }

  contextsOf(path: string): TokenContexts {
    const { token, from } = this.locate(path);
    const out: TokenContexts = { path, chains: {}, generated: [], nonFactorable: [] };
    for (const prop of from ? (['$value'] as const) : LEAF_PROPERTIES) {
      const { chain, report } = this.analyse(token, prop);
      if (report) out.nonFactorable.push(report);
      else if (chain) {
        const c = from
          ? { ...chain, links: chain.links.slice(from), holes: holesOf(chain.links.slice(from), chain.base !== undefined) }
          : chain;
        out.chains[prop] = prop === '$value' ? this.stored(token, c) : c;
      }
    }
    out.generated = (out.chains.$value?.links ?? []).slice(1).map((l) => ({ path: l.path, of: token, modifier: l.modifier }));
    return out;
  }

  /** A property under a choice of contexts; `early` answers for a property that is not factorable. */
  evalProp(
    token: string,
    from: number,
    prop: LeafProperty,
    ctxOf: (modifier: string) => string,
    early: (token: string, prop: LeafProperty) => Def,
  ): Def {
    const { chain, report } = this.analyse(token, prop);
    if (report) return early(token, prop);
    if (!chain) return undefined;
    for (const link of chain.links.slice(from)) {
      const s = link.steps[ctxOf(link.modifier)];
      if ('value' in s) return { v: s.value };
      if ('hole' in s) return undefined;
    }
    return chain.base === undefined ? undefined : { v: chain.base };
  }

  dependsOn(path: string): { direct: string[]; through: string[] } {
    const { token, from } = this.locate(path);
    const direct = new Set(this.directOf(token, from));
    const all = this.reach(token, from, []);
    const order = this.entries.filter((e) => e.kind === 'modifier').map((e) => e.name);
    const sorted = (s: Iterable<string>) => [...s].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return { direct: sorted(direct), through: sorted([...all].filter((m) => !direct.has(m))) };
  }

  private directOf(token: string, from: number): string[] {
    const { chain, report } = this.analyse(token, '$value');
    // a partial composite lets an earlier modifier show through, so the chain's stopping point proves nothing
    if (report) {
      const segs = token.split('.');
      return this.entries.flatMap((e) =>
        e.kind === 'modifier' && Object.values(e.contexts).some((s) => get(s, segs, '$value')) ? [e.name] : [],
      );
    }
    return (chain?.links ?? []).slice(from).map((l) => l.modifier);
  }

  /** Every modifier a token's value depends on: its own, and those of everything it references, in any cell. */
  private reach(token: string, from: number, stack: string[]): Set<string> {
    if (!from && this.reaching.has(token)) return this.reaching.get(token)!;
    if (stack.includes(token)) throw new CircularReferenceError(`Circular reference: ${[...stack, token].join(' -> ')}`);
    const mods = new Set(this.directOf(token, from));
    const chain = this.analyse(token, '$value').chain;
    // Each value the token can take, with the contexts it is written in: a link's own, or the defaults for the base.
    const values: Array<[unknown, Record<string, string>]> = chain
      ? [
          ...chain.links
            .slice(from)
            .flatMap((l) =>
              Object.entries(l.steps).flatMap(
                ([context, s]): Array<[unknown, Record<string, string>]> =>
                  'value' in s && !s.base ? [[s.value, { [l.modifier]: context }]] : [],
              ),
            ),
          [chain.base, {}],
        ]
      : [];
    for (const [v, contexts] of values)
      for (const r of referencesIn(v)) {
        const ref = r.to;
        const owner = this.ownerOf(ref);
        if (!owner) {
          const group = [...this.tokenPaths].some((p) => p.startsWith(`${ref}.`));
          throw new UnresolvableReferenceError(`${token}: reference {${ref}} ${group ? 'names a group' : 'names no token'}.`, {
            reference: `{${ref}}`,
            tokenPath: token,
            collectionName: this.where.collection,
            mode: this.where.mode(contexts),
            reason: group ? 'group' : 'not-found',
          });
        }
        for (const m of this.reach(owner, 0, [...stack, token])) mods.add(m);
      }
    if (!from) this.reaching.set(token, mods);
    return mods;
  }
}
