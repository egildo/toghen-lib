/**
 * The oracle: what the resolver says a token is at one point of the product,
 * and a chain evaluator that obeys the links-only discipline (a link reads
 * only its own modifier's context). Synthetic tokens only.
 */
import type { Resolver } from '../../../../src/resolver/resolver.js';
import type { Chain } from '../../../../src/resolver/chains.js';
import type { ResolverInput } from '../../../../src/resolver/types.js';

export type Json = any;

export const isPlainObject = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Flatten a token structure to Map<"a.b.c", token object>; an object with `$value` is a token. */
export function flattenTokens(structure: Record<string, Json>, prefix: string[] = [], out = new Map<string, Json>()) {
  for (const [key, value] of Object.entries(structure)) {
    if (key.startsWith('$') || !isPlainObject(value)) continue;
    if ('$value' in value) out.set([...prefix, key].join('.'), value);
    else flattenTokens(value, [...prefix, key], out);
  }
  return out;
}

export const oracle = (resolver: Resolver, input: ResolverInput) => flattenTokens(resolver.resolve(input));

/** Every token path the resolver produces anywhere in the product. */
export function allTokenPaths(resolver: Resolver): string[] {
  const paths = new Set<string>();
  for (const input of resolver.getPermutations()) for (const p of oracle(resolver, input).keys()) paths.add(p);
  return [...paths];
}

/** Evaluate a chain reading only `input[link.modifier]`, else the modifier's default. */
export function evalChain(resolver: Resolver, chain: Chain | undefined, input: ResolverInput): Json {
  if (!chain) return undefined;
  for (const link of chain.links) {
    const ctx = input[link.modifier] ?? resolver.getModifiers().find((m) => m.name === link.modifier)!.default!;
    const step = link.steps[ctx];
    if ('value' in step) return step.value;
    if ('hole' in step) return undefined;
  }
  return chain.base;
}

/** The value or the name of the error: for comparing two ways of asking. */
export function outcome(fn: () => unknown): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: fn() };
  } catch {
    return { ok: false };
  }
}
