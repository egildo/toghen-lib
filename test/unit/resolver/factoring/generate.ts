/** Seeded random legal resolver documents. Synthetic tokens only. */
import type { ResolverDocument } from '../../../../src/resolver/types.js';
import type { Json } from './oracle.js';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Kind = 'color' | 'dimension' | 'font' | 'shadow' | 'string';
const TOKENS: { path: string[]; kind: Kind; type: string }[] = [
  { path: ['color', 'bg'], kind: 'color', type: 'color' },
  { path: ['color', 'fg'], kind: 'color', type: 'color' },
  { path: ['space', 'md'], kind: 'dimension', type: 'dimension' },
  { path: ['space', 'lg'], kind: 'dimension', type: 'dimension' },
  { path: ['font', 'body'], kind: 'font', type: 'fontFamily' },
  { path: ['shadow', 'card'], kind: 'shadow', type: 'shadow' },
  { path: ['label'], kind: 'string', type: 'string' },
];

export interface GenOptions {
  /** a `$value` may be replaced by an alias string: a composite then changes shape */
  aliases?: boolean;
  /** a composite `$value` may be given as a subset of its keys */
  partials?: boolean;
}

export function generate(seed: number, { aliases = true, partials = true }: GenOptions = {}): ResolverDocument {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <T>(xs: T[]) => xs[int(xs.length)];
  const chance = (p: number) => rnd() < p;

  const color = () => ({ colorSpace: pick(['srgb', 'display-p3']), components: [pick([0, 0.2, 0.5, 1]), pick([0, 0.5, 1]), pick([0, 1])] });
  const dim = () => ({ value: pick([4, 8, 16]), unit: pick(['px', 'rem']) });
  const full = (k: Kind): Json =>
    k === 'color'
      ? color()
      : k === 'dimension'
        ? dim()
        : k === 'font'
          ? pick([['Inter', 'sans-serif'], ['Georgia', 'serif'], ['Menlo']])
          : k === 'shadow'
            ? { offsetX: dim(), offsetY: dim(), blur: dim(), color: color() }
            : pick(['a', 'b', 'c']);
  // a random non-empty subset of an object's keys, sometimes recursively
  const partial = (v: Json): Json => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
    const keys = Object.keys(v);
    const keep = keys.filter(() => chance(0.5));
    if (!keep.length) keep.push(pick(keys));
    return Object.fromEntries(keep.map((k) => [k, chance(0.4) ? partial(v[k]) : v[k]]));
  };

  const definition = (t: (typeof TOKENS)[number]) => {
    const node: Record<string, Json> = {};
    if (chance(0.85)) {
      const other = pick(TOKENS).path.join('.');
      const alias = chance(0.1),
        part = chance(0.35);
      node.$value = alias && aliases ? `{${other}}` : part && partials ? partial(full(t.kind)) : full(t.kind);
    }
    if (chance(0.2)) node.$description = pick(['d1', 'd2']);
    if (chance(0.1)) node.$type = t.type;
    if (chance(0.1)) node.$extensions = { 'org.example': { k: pick([1, 2]), j: pick([1, 2]) } };
    if (!Object.keys(node).length) node.$description = pick(['d1', 'd2']);
    return node;
  };

  const source = (p: number) => {
    const out: Record<string, Json> = {};
    for (const t of TOKENS) {
      if (!chance(p)) continue;
      let o = out;
      for (const k of t.path.slice(0, -1)) o = o[k] ??= {};
      o[t.path[t.path.length - 1]] = definition(t);
    }
    return out;
  };

  // sets: some reference an earlier set
  const sets: Record<string, Json> = {};
  for (let i = 0; i < int(4); i++) {
    const sources: Json[] = [];
    for (let j = 0; j < 1 + int(2); j++) sources.push(i > 0 && chance(0.15) ? { $ref: `#/sets/s${int(i)}` } : source(0.45));
    sets[`s${i}`] = { sources };
  }
  const setNames = Object.keys(sets);

  const order: Json[] = [];
  const modifiers: Record<string, Json> = {};
  for (const n of setNames) {
    if (chance(0.5)) order.push({ $ref: `#/sets/${n}` });
    else if (chance(0.8)) order.push({ name: `i-${n}`, type: 'set', sources: structuredClone(sets[n].sources) });
  }
  for (let m = 0, n = 1 + int(4); m < n; m++) {
    const contexts: Record<string, Json[]> = {};
    for (let c = 0, k = 2 + int(2); c < k; c++) {
      const srcs: Json[] = [];
      for (let j = 0; j < 1 + int(2); j++) srcs.push(setNames.length && chance(0.2) ? { $ref: `#/sets/${pick(setNames)}` } : source(0.35));
      contexts[`c${c}`] = srcs;
    }
    const modifier: Json = { contexts };
    if (chance(0.6)) modifier.default = pick(Object.keys(contexts));
    const name = `m${m}`;
    if (chance(0.5)) {
      modifiers[name] = modifier;
      order.push({ $ref: `#/modifiers/${name}` });
    } else order.push({ name, type: 'modifier', ...modifier });
  }
  for (let i = order.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const doc: ResolverDocument = { version: '2025-11-01', resolutionOrder: order };
  if (setNames.length) doc.sets = sets;
  if (Object.keys(modifiers).length) doc.modifiers = modifiers;
  return doc;
}
