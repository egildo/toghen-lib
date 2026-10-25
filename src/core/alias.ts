/**
 * Token reference resolution — the engine behind `DesignSystem.resolveValue()`,
 * and the provenance read behind `DesignSystem.referencesOf()`.
 *
 * Implements alias resolution as defined by the W3C Design Tokens format
 * (§7.2 Reference Resolution, §7.4.6 Path Examples, §9.1 Array aliasing),
 * plus one documented Toghen extension: partial-string interpolation.
 *
 * ### The two namespaces
 *
 * These are different things and conflating them is the mistake this module
 * exists to prevent:
 *
 * - A **lookup path** — what you pass to `DesignSystem.resolveValue()` — is
 *   `collectionName.tokenPath`. It addresses a token across the whole system.
 * - A **reference path** — the text inside a `$value` — is relative to the
 *   *document root*, i.e. the root of the collection that owns the token
 *   containing it. It never carries a collection name.
 *
 * So a token stored at `theme.color.brand` referring to `theme.color.blue`
 * writes `{color.blue}`, not `{theme.color.blue}`. This keeps a token document
 * portable: the same JSON resolves identically whatever the collection ends up
 * being called.
 *
 * ### Four rules this engine holds to
 *
 * 1. **The owning collection is invariant.** A document *is* a collection, so
 *    every reference in a chain resolves against the same one. There is no
 *    cross-collection reference syntax.
 * 2. **Cycle keys are collection-qualified**, and each branch gets its own copy
 *    of the stack. Two collections may legitimately hold the same relative
 *    path, and a diamond (A→B, A→C, B→D, C→D) is not a cycle.
 * 3. **Always go through `Collection.getToken()`**, never the raw token tree.
 *    Mode selection happens inside `getToken()`, so by the time the walk sees
 *    an array it is unambiguously real data — a font stack, a list of shadows —
 *    and never a collection's per-mode value encoding.
 * 4. **Resolve once, never re-scan.** A resolved value comes back fully walked
 *    in its own context. Re-scanning it would misread literal braces in
 *    legitimate content as references.
 *
 * @since 1.0.0
 */

import { type Collection, inheritedAttribute } from './collection.js';
import {
  DesignToken,
  CircularReferenceError,
  InvalidInterpolationError,
  UnresolvableReferenceError,
  type UnresolvableReferenceReason,
} from './design-token.js';
import { referenceScanner, containsReference, extractReferencePaths, isWholeReference, parseReferencePath } from './alias-syntax.js';
import { spellCssColor } from '../utils/css-color.js';
import type { ColorValue } from '../types/composite-values.js';

/**
 * Everything the engine needs to resolve a reference and to describe it well
 * when it fails.
 *
 * @internal
 */
interface AliasContext {
  /** The document root: the collection that owns the token being resolved. */
  readonly collection: Collection;

  /** A concrete mode — never the `'default'` sentinel. */
  readonly mode: string;

  /** Collection-relative path of the token whose value is being walked. */
  readonly originPath: string;

  /** Position inside the value, e.g. `['color']` or `['fontFamily', '[0]']`. */
  readonly valuePath: readonly string[];

  /** Paths traversed to get here, oldest first — for the error message. */
  readonly chain: readonly string[];

  /** Cycle-detection keys for the current branch. */
  readonly onStack: ReadonlySet<string>;
}

/**
 * Builds a cycle-detection key.
 *
 * Qualified by collection name and separated by NUL, which cannot occur in a
 * token path — so two collections holding the same relative path can never
 * collide into a false circular-reference report.
 */
function cycleKey(collectionName: string, tokenPath: string): string {
  return `${collectionName}\u0000${tokenPath}`;
}

/** Renders the position inside a value, e.g. `$value.fontFamily[0]`. */
function formatValuePath(valuePath: readonly string[]): string {
  return valuePath.reduce<string>((acc, part) => (part.startsWith('[') ? `${acc}${part}` : `${acc}.${part}`), '$value');
}

/** Renders the reference chain when it spans more than one hop. */
function formatChain(chain: readonly string[]): string {
  return chain.length > 1 ? ` Reference chain: ${chain.join(' -> ')}.` : '';
}

/** Descends one level into a composite value, for error positions. */
function descend(ctx: AliasContext, part: string): AliasContext {
  return { ...ctx, valuePath: [...ctx.valuePath, part] };
}

/**
 * Builds an `UnresolvableReferenceError` that names both the reference and the
 * token containing it — without that, a dangling reference in a large document
 * is close to unfindable.
 */
function unresolvable(
  reference: string,
  ctx: AliasContext,
  reason: UnresolvableReferenceReason,
  detail: string,
): UnresolvableReferenceError {
  const message =
    `Unresolvable reference ${reference} in token ` +
    `"${ctx.collection.name}.${ctx.originPath}" at ${formatValuePath(ctx.valuePath)} ` +
    `(mode "${ctx.mode}"): ${detail}.${formatChain(ctx.chain)}`;

  return new UnresolvableReferenceError(message, {
    reference,
    tokenPath: ctx.originPath,
    collectionName: ctx.collection.name,
    mode: ctx.mode,
    reason,
  });
}

/**
 * Resolves a token's value, expanding every reference it contains.
 *
 * Walks composite values and arrays, so a reference nested inside a shadow's
 * `color` or a typography's `fontFamily` is expanded too (§9). Array elements
 * resolve individually and in place — §9.1 forbids flattening or expanding
 * them.
 *
 * @param token - The token whose `$value` to resolve
 * @param collection - The collection that owns it; the document root for every
 *   reference in the value
 * @param mode - A concrete mode name
 * @param originPath - The token's collection-relative path, used for errors and
 *   cycle detection
 * @returns The fully resolved value
 *
 * @throws {UnresolvableReferenceError} When a reference names no token, names a
 *   group, or is malformed
 * @throws {CircularReferenceError} When references form a cycle
 * @throws {InvalidInterpolationError} When a non-scalar is interpolated into a
 *   string
 */
export function resolveTokenValue(token: DesignToken, collection: Collection, mode: string, originPath: string): unknown {
  return walk(token.$value, {
    collection,
    mode,
    originPath,
    valuePath: [],
    chain: [originPath],
    // The origin is on the stack before the walk starts, so a token
    // referring to itself is caught like any other cycle.
    onStack: new Set([cycleKey(collection.name, originPath)]),
  });
}

/**
 * Recursively resolves references anywhere within a value.
 *
 * @internal
 */
function walk(value: unknown, ctx: AliasContext): unknown {
  if (typeof value === 'string') {
    // `interpolate` also removes the escapes of a string with no reference.
    return isWholeReference(value) ? dereference(value, ctx) : interpolate(value, ctx);
  }

  // A nested DesignToken is Toghen's explicit per-mode encoding, not part of
  // the value's own structure — leave it alone rather than cloning it into a
  // plain object.
  if (value instanceof DesignToken) {
    return value;
  }

  if (Array.isArray(value)) {
    // §9.1: each element resolves to exactly one value. A reference whose
    // target is itself an array occupies one slot; it is never spread.
    return value.map((element, index) => walk(element, descend(ctx, `[${index}]`)));
  }

  if (value !== null && typeof value === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
      resolved[key] = walk(member, descend(ctx, key));
    }
    return resolved;
  }

  return value;
}

/**
 * One reference a token's value makes, as written, before anything resolves.
 */
export interface TokenReference {
  /** Member address inside the value, dotted, `''` for the whole value: `'fontSize'`, `'0.color'`. */
  at: string;
  /** The referenced token as a lookup path, collection-qualified: `'ds.font.size.md'`. First hop only. */
  to: string;
  /** True when the reference is embedded in a longer string (`'0 2px {color.x}'`); nothing can bind to part of a string. */
  interpolated: boolean;
  /** The reference as written, braces included: `'{color.x}'`. Replace it in the string to rewrite the reference. */
  written: string;
}

/**
 * Lists the references in a raw value, in document order, depth-first: a token's
 * `$value` as written, a chain's step, any value that may hold `{path}` text.
 *
 * It reports what is written and resolves nothing, so a reference that would
 * not resolve is still reported. `at` uses the lookup path's member grammar, so
 * it names the member `resolveValue('<token>.<at>')` names.
 *
 * @param value - A raw value
 * @param collectionName - The owning collection, which makes each `to` a lookup path; omitted, `to` is the reference path as written
 * @param at - The member address of `value` inside the token's value
 * @returns The references, first hop only
 *
 * @example
 * ```typescript
 * referencesIn({ color: '{color.ink}', blur: { value: 4, unit: 'px' } }, 'ds');
 * // [{ at: 'color', to: 'ds.color.ink', interpolated: false, written: '{color.ink}' }]
 * referencesIn('0 2px {space.sm}');
 * // [{ at: '', to: 'space.sm', interpolated: true, written: '{space.sm}' }]
 * ```
 */
export function referencesIn(value: unknown, collectionName?: string, at = ''): TokenReference[] {
  if (typeof value === 'string') {
    const interpolated = !isWholeReference(value) && containsReference(value);
    return extractReferencePaths(value).map((path) => ({
      at,
      to: collectionName === undefined ? path : `${collectionName}.${path}`,
      interpolated,
      written: `{${path}}`,
    }));
  }

  // As in `walk`: a nested DesignToken is the per-mode encoding, not part of
  // the value's own structure, so it holds none of this value's members.
  if (value instanceof DesignToken || value === null || typeof value !== 'object') {
    return [];
  }

  // Object.entries covers arrays too, as indices in order: '0', '1', ...
  return Object.entries(value).flatMap(([key, member]) => referencesIn(member, collectionName, at === '' ? key : `${at}.${key}`));
}

/**
 * Resolves a whole-value reference to the target's fully resolved value.
 *
 * @internal
 */
function dereference(reference: string, ctx: AliasContext): unknown {
  const path = reference.slice(1, -1);

  try {
    parseReferencePath(path);
  } catch (error) {
    throw unresolvable(reference, ctx, 'malformed', (error as Error).message);
  }

  const kind = ctx.collection.getNodeKind(path);
  if (kind === 'missing') {
    throw unresolvable(reference, ctx, 'not-found', `no token at path "${path}" in collection "${ctx.collection.name}"`);
  }
  if (kind === 'group') {
    throw unresolvable(
      reference,
      ctx,
      'group',
      `"${path}" is a group, not a token — a reference must target a token with a $value (W3C DTCG §7.1.1)`,
    );
  }

  const key = cycleKey(ctx.collection.name, path);
  if (ctx.onStack.has(key)) {
    throw new CircularReferenceError(
      `Circular reference detected in collection "${ctx.collection.name}" ` +
        `(mode "${ctx.mode}"): ${[...ctx.chain, path].join(' -> ')}. ` +
        `Reference ${reference} in token "${ctx.collection.name}.${ctx.originPath}" ` +
        `at ${formatValuePath(ctx.valuePath)}.`,
    );
  }

  const target = ctx.collection.getToken(path, ctx.mode);
  if (!target || target.$value === undefined) {
    throw unresolvable(reference, ctx, 'no-value', `token "${path}" has no $value in mode "${ctx.mode}"`);
  }

  // Resolve the target in its own context: the value position resets and the
  // origin becomes the target, so a failure deeper in the chain names the
  // token that actually contains the broken reference. The stack is copied
  // rather than shared, which keeps sibling branches independent — a diamond
  // is not a cycle.
  return walk(target.$value, {
    collection: ctx.collection,
    mode: ctx.mode,
    originPath: path,
    valuePath: [],
    chain: [...ctx.chain, path],
    onStack: new Set([...ctx.onStack, key]),
  });
}

/**
 * Splices resolved references into the surrounding string.
 *
 * A Toghen extension: the W3C format only ever gives a `$value` that is
 * *entirely* one reference. Kept because it is genuinely useful for values with
 * no structured equivalent, and because `isReference()`/`getReferences()` have
 * always reported embedded references.
 *
 * Built by concatenation rather than `String.replace()`, which matters three
 * ways: `$&`, `` $` ``, `$'` and `$1` in a resolved value stay literal; every
 * occurrence is replaced, not just the first; and braces inside a resolved
 * value are never re-scanned as references.
 *
 * Escapes are removed on the way: `{{` becomes `{` and `}}` becomes `}`, in a
 * string with or without references. The `{size.sm}` that `{{size.sm}}`
 * becomes is text from then on, since a resolved value is never re-scanned.
 *
 * @internal
 */
function interpolate(value: string, ctx: AliasContext): string {
  const scanner = referenceScanner();
  const resolved = new Map<string, string>();

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = scanner.exec(value)) !== null) {
    const reference = match[0];

    if (match[1] === undefined) {
      // An escape: `{{` or `}}` is its one brace, as text.
      result += value.slice(lastIndex, match.index) + reference[0];
      lastIndex = match.index + reference.length;
      continue;
    }

    let text = resolved.get(reference);
    if (text === undefined) {
      text = toInterpolable(dereference(reference, ctx), reference, ctx);
      resolved.set(reference, text);
    }

    result += value.slice(lastIndex, match.index) + text;
    lastIndex = match.index + reference.length;
  }

  return result + value.slice(lastIndex);
}

/**
 * Narrows a resolved value to something that can appear inside a string.
 *
 * A dimension is written back as `${value}${unit}`; a structured colour of any
 * space by `spellCssColor` (its `hex` when it has one, else CSS Color 4 syntax). Other objects and arrays are refused rather than stringified — letting them through
 * is what produced `"[object Object]"` in generated CSS.
 *
 * @internal
 */
function toInterpolable(value: unknown, reference: string, ctx: AliasContext): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // A dimension or colour is stored structured; it interpolates as CSS lib's
  // own colour and length readers read back.
  if (value !== null && typeof value === 'object') {
    const v = value as { value?: unknown; unit?: unknown; colorSpace?: unknown; components?: unknown };
    if (typeof v.value === 'number' && typeof v.unit === 'string') {
      return `${v.value}${v.unit}`;
    }
    if (typeof v.colorSpace === 'string' && Array.isArray(v.components)) {
      return spellCssColor(value as ColorValue);
    }
  }

  const shape = Array.isArray(value) ? 'an array' : `a ${value === null ? 'null' : typeof value}`;

  throw new InvalidInterpolationError(
    `Reference ${reference} inside the string value of token ` +
      `"${ctx.collection.name}.${ctx.originPath}" at ${formatValuePath(ctx.valuePath)} ` +
      `(mode "${ctx.mode}") resolved to ${shape}, which cannot be interpolated into a ` +
      `string. Use the reference as the entire $value instead.`,
    reference,
    `${ctx.collection.name}.${ctx.originPath}`,
  );
}

/**
 * Determines the type a token inherits through a whole-value reference.
 *
 * W3C DTCG §5.2.2 orders type resolution as: the token's own `$type`, else the
 * resolved type of the token it references, else the nearest parent group's
 * `$type`. This covers the middle rung, following a chain of references until
 * one of them settles the type.
 *
 * Returns `null` rather than throwing on a broken or circular chain: the value
 * resolution that follows reports those with far better context, and raising
 * two errors for one fault would only obscure it.
 *
 * @param value - The token's raw `$value`
 * @param collection - The collection that owns the token
 * @param mode - A concrete mode name
 * @param originPath - The token's collection-relative path
 * @returns The inherited type, or `null` if none can be determined this way
 */
export function resolveTypeThroughAlias(value: unknown, collection: Collection, mode: string, originPath: string): string | null {
  const seen = new Set<string>([cycleKey(collection.name, originPath)]);
  let current = value;

  while (isWholeReference(current)) {
    const path = (current as string).slice(1, -1);

    try {
      parseReferencePath(path);
    } catch {
      return null;
    }

    const key = cycleKey(collection.name, path);
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);

    const target = collection.getToken(path, mode);
    if (!target) {
      return null;
    }

    if (target.$type) {
      return target.$type;
    }

    // The target has no explicit type either. If it is itself a reference,
    // keep following; otherwise fall back to its own group inheritance.
    if (!isWholeReference(target.$value)) {
      return inheritedAttribute(collection, path, '$type', mode) ?? null;
    }

    current = target.$value;
  }

  return null;
}
