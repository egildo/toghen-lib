/**
 * W3C Design Tokens Resolver Module — core implementation.
 *
 * Implements the resolution logic defined in:
 * https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/
 *
 * Resolution stages (§6):
 *  1. Input validation   (§6.1)
 *  2. Ordering           (§6.2)
 *  3. Alias resolution   (§6.3 / §6.4) — delegated to DesignSystem
 */

import { DesignSystem } from '../core/design-system.js';
import { Collection, type ModeModifier } from '../core/collection.js';
import { DesignToken } from '../core/design-token.js';
import {
  type ResolverDocument,
  type ResolverInput,
  type ResolverSet,
  type ResolverModifier,
  type ResolutionOrderItem,
  type TokenSource,
  type InlineSet,
  type InlineModifier,
  isReferenceObject,
} from './types.js';
import { ResolverValidationError, InvalidInputError, InvalidReferenceError } from './errors.js';
import { referencesIn } from '../core/alias.js';
import { PathNotFoundError } from '../core/design-token.js';
import { ChainIndex, LEAF_PROPERTIES, type Entry, type LeafProperty, type TokenContexts } from './chains.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Unescape a JSON Pointer segment (RFC 6901: ~1 → '/', ~0 → '~'). */
function unescapePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Walk a JSON Pointer path (e.g. `#/sets/foundation`) inside a document
 * and return the value at that location, or `undefined` if not found.
 */
/** @internal */
export function resolveJsonPointer(doc: Record<string, any>, pointer: string): any {
  // Only same-document pointers are supported (must start with '#/')
  if (!pointer.startsWith('#/') && pointer !== '#') {
    return undefined;
  }
  if (pointer === '#') return doc;

  const path = pointer.slice(2); // strip leading '#/'
  const segments = path.split('/').map(unescapePointerSegment);

  let current: any = doc;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, any>)[segment];
  }
  return current;
}

/**
 * Performs a shallow merge of `override` on top of `base`.
 * Arrays and nested objects are NOT deep-merged — the override wins wholesale
 * (per the spec: "tools MUST flatten these shallowly").
 */
function shallowMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  return { ...base, ...override };
}

/**
 * Deep-merge two plain DTCG token-structure objects.
 *
 * Rules:
 * - If both `base` and `incoming` have an object (group) at the same key,
 *   they are recursively merged.
 * - Otherwise, `incoming` wins (later-in-array always overrides).
 * - A token is a plain object too, so a later definition merges into an
 *   earlier one key by key: a context that sets only `$description` leaves the
 *   earlier `$value`, and a plain-object `$value` merges member by member.
 *   Arrays and scalars (a `components` array, a `fontFamily` stack, an alias
 *   string) are replaced whole.
 */
function deepMergeTokenStructures(base: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = { ...base };

  for (const [key, incomingVal] of Object.entries(incoming)) {
    const baseVal = result[key];

    // Both sides are plain objects (i.e. token groups) → recurse
    if (
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal) &&
      incomingVal !== null &&
      typeof incomingVal === 'object' &&
      !Array.isArray(incomingVal)
    ) {
      result[key] = deepMergeTokenStructures(baseVal as Record<string, any>, incomingVal as Record<string, any>);
    } else {
      // Scalar, array, or leaf token — incoming wins
      result[key] = incomingVal;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Implements the W3C Design Tokens Resolver specification.
 *
 * Accepts a resolver document and an input (modifier context selections) and
 * produces a flat, merged DTCG-format token structure.
 *
 * ### Usage
 * ```typescript
 * import { Resolver } from '@toghen/lib';
 *
 * const doc = {
 *   version: '2025-11-01',
 *   sets: {
 *     base: {
 *       sources: [{ colors: { primary: { $value: '#0000ff', $type: 'color' } } }]
 *     }
 *   },
 *   modifiers: {
 *     theme: {
 *       contexts: {
 *         light: [{ colors: { background: { $value: '#ffffff', $type: 'color' } } }],
 *         dark:  [{ colors: { background: { $value: '#000000', $type: 'color' } } }],
 *       },
 *       default: 'light',
 *     }
 *   },
 *   resolutionOrder: [
 *     { $ref: '#/sets/base' },
 *     { $ref: '#/modifiers/theme' },
 *   ]
 * };
 *
 * const resolver = new Resolver(doc);
 *
 * // Returns a flat DTCG token object
 * const tokens = resolver.resolve({ theme: 'dark' });
 *
 * // Or — resolve directly into a ready-to-use DesignSystem
 * const ds = resolver.resolveToDesignSystem({ theme: 'dark' });
 * const bg = ds.resolveToken('resolved.colors.background');
 * ```
 *
 * @since 1.0.0
 */
export class Resolver {
  private readonly doc: ResolverDocument;

  /**
   * Creates a new `Resolver` and validates the document structure.
   *
   * @param document - A resolver document conforming to the W3C spec.
   *
   * @throws {ResolverValidationError} When the document structure is invalid:
   *   - `version` is missing or not `"2025-11-01"`
   *   - An inline `resolutionOrder` item lacks `name` or `type`
   *   - `name` values are duplicated within `resolutionOrder`
   *   - A modifier has zero contexts
   *   - A modifier's `default` does not exist in its `contexts`
   */
  constructor(document: ResolverDocument) {
    this.doc = document;
    this.validateDocument();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Resolves the document with the provided input, returning a flat DTCG
   * token structure as a plain JavaScript object.
   *
   * Token aliases (e.g. `{ $value: '{colors.primary}' }`) are preserved as-is
   * in the returned object.  Use {@link resolveToDesignSystem} if you want
   * alias resolution via the full `DesignSystem` engine.
   *
   * @param input - A map of modifier-name → context-name.
   *   Case-insensitive; values must be strings.
   *   Modifiers with a `default` are optional in the input.
   *
   * @returns A merged DTCG token object ready for further processing.
   *
   * @throws {InvalidInputError} When the input is invalid for this document.
   * @throws {InvalidReferenceError} When a `$ref` cannot be resolved.
   *
   * @example
   * ```typescript
   * const tokens = resolver.resolve({ theme: 'dark' });
   * console.log(tokens.colors.background.$value); // '#000000'
   * ```
   */
  public resolve(input: ResolverInput = {}): Record<string, any> {
    // Stage 1 — input validation
    const normalizedInput = this.validateAndNormalizeInput(input);

    // Stage 2 — ordering (flatten resolutionOrder into one token structure)
    return this.buildOrderedTokens(normalizedInput);
  }

  /**
   * Resolves the document and loads the result into a `DesignSystem`,
   * which handles alias resolution (§6.3) automatically.
   *
   * All tokens are stored in a single collection named `"resolved"` (or the
   * document's `name` field when set). Pass an existing `DesignSystem`
   * instance to add the resolved collection alongside existing ones.
   *
   * @param input - Modifier context selections (same as {@link resolve}).
   * @param system - Optional existing `DesignSystem` to populate.
   *   When omitted, a fresh instance is created.
   * @param collectionName - Name for the new collection.
   *   Defaults to the document's `name` field, or `"resolved"`.
   *
   * @returns The populated `DesignSystem`.
   *
   * @example
   * ```typescript
   * const ds = resolver.resolveToDesignSystem({ theme: 'dark' });
   * const bg = ds.resolveToken('resolved.colors.background');
   * console.log(bg?.$value.hex); // '#000000'
   * ```
   */
  public resolveToDesignSystem(input: ResolverInput = {}, system?: DesignSystem, collectionName?: string): DesignSystem {
    const flatTokens = this.resolve(input);

    const ds = system ?? new DesignSystem();
    const name = collectionName ?? this.doc.name ?? 'resolved';

    const collection = new Collection(name);
    this.loadTokensIntoCollection(flatTokens, collection);
    ds.addCollection(collection);

    return ds;
  }

  /**
   * Resolves *every* permutation into a single multi-mode `DesignSystem`.
   *
   * Where {@link resolveToDesignSystem} collapses the document to one context,
   * this keeps them all: the resulting collection declares one mode per
   * permutation, named by {@link getModeName}, so a single system can answer
   * for every theme at once.
   *
   * That is what makes the mode argument downstream meaningful —
   * `system.resolveValue(path, 'dark')`, `entries('dark')`, or
   * `toghen(path, dark)` in CSS. Against a system built from a single
   * permutation those would quietly return the one context it holds.
   *
   * Documents with no modifiers produce a single mode named `'default'`.
   *
   * @param system - Optional existing `DesignSystem` to populate
   * @param collectionName - Name for the new collection; defaults to the
   *   document's `name`, or `"resolved"`
   *
   * @returns The populated `DesignSystem`
   *
   * @example
   * ```typescript
   * const ds = resolver.resolveAllToDesignSystem();
   *
   * ds.getCollection('my-system')?.getModes();          // ['light', 'dark']
   * ds.resolveValue('my-system.color.bg');              // light — the default mode
   * ds.resolveValue('my-system.color.bg', 'dark');      // dark
   * ```
   */
  public resolveAllToDesignSystem(system?: DesignSystem, collectionName?: string): DesignSystem {
    return this.buildModes(this.getPermutations(), system, collectionName);
  }

  /**
   * Resolves the defaults, and each context of each modifier on its own, into
   * one multi-mode `DesignSystem`: the **sum** of the contexts, where
   * {@link resolveAllToDesignSystem} builds their product.
   *
   * It is the build for modifiers that are switched independently, each by its
   * own attribute or class, and combined at runtime by the cascade. Four
   * modifiers with 2, 3, 3 and 6 contexts make 11 modes here and 108 there.
   *
   * Modes are named by {@link getModeName}, as in the full build, so the same
   * combination has the same name in both. Each mode can also be named by the
   * contexts that differ from the defaults: `density=compact`. A combination
   * is built only when it is named in `combinations`.
   *
   * @param combinations - Further selections to build, e.g. `[{ theme: 'dark', density: 'compact' }]`
   * @param system - Optional existing `DesignSystem` to populate
   * @param collectionName - Name for the new collection; defaults to the
   *   document's `name`, or `"resolved"`
   *
   * @example
   * ```typescript
   * const ds = resolver.resolveContextsToDesignSystem();
   * ds.resolveValue('ds.color.bg', 'theme=dark');
   * ds.resolveValue('ds.space.md', 'density=compact');
   * ```
   */
  public resolveContextsToDesignSystem(combinations: ResolverInput[] = [], system?: DesignSystem, collectionName?: string): DesignSystem {
    const inputs: ResolverInput[] = [{}];
    for (const [modifierName, modifier] of this.collectEffectiveModifiers()) {
      for (const context of Object.keys(modifier.contexts)) {
        if (context !== modifier.default) inputs.push({ [modifierName]: context });
      }
    }
    inputs.push(...combinations);

    const byName = new Map<string, ResolverInput>();
    for (const input of inputs) {
      const name = this.getModeName(input);
      if (!byName.has(name)) byName.set(name, input);
    }
    return this.buildModes([...byName.values()], system, collectionName);
  }

  /** One collection with a mode per input, each recording the contexts it stands for. */
  private buildModes(inputs: ResolverInput[], system?: DesignSystem, collectionName?: string): DesignSystem {
    const modeNames = inputs.map((input) => this.getModeName(input));

    const ds = system ?? new DesignSystem();
    const name = collectionName ?? this.doc.name ?? 'resolved';

    const collection = new Collection(name, modeNames);

    inputs.forEach((input, index) => {
      this.loadTokensIntoCollection(this.resolve(input), collection, [], modeNames[index]);
    });

    const contextsOf = (input: ResolverInput): Record<string, string> => {
      const contexts: Record<string, string> = {};
      for (const [modifierName, modifier] of this.collectEffectiveModifiers()) {
        const context = input[modifierName] ?? modifier.default;
        if (context !== undefined) contexts[modifierName] = context;
      }
      return contexts;
    };
    collection.setModeContexts(
      Object.fromEntries(inputs.map((input, index) => [modeNames[index], contextsOf(input)])),
      this.getModifiers(),
    );

    collection.resolver = this;
    ds.addCollection(collection);
    return ds;
  }

  /**
   * The canonical mode name for a set of modifier selections.
   *
   * Context values are joined in the order the modifiers are declared, so the
   * name is stable regardless of the key order of the input object — two calls
   * describing the same context always agree.
   *
   * A modifier the input omits contributes its `default`, matching how
   * {@link resolve} treats a partial input. That keeps the name pointing at a
   * context that actually exists: naming `{ theme: 'dark' }` on a document that
   * also has a `density` modifier gives `'dark/cosy'`, not a bare `'dark'` that
   * would match no mode of a system built by
   * {@link resolveAllToDesignSystem}.
   *
   * A document with no modifiers has exactly one context, named `'default'`.
   *
   * @param input - Modifier context selections; omitted modifiers use their default
   * @returns A stable mode name, e.g. `'dark'` or `'dark/compact'`
   *
   * @example
   * ```typescript
   * // A document with modifiers `theme` (default 'light') and `density` (default 'cosy')
   * resolver.getModeName({ theme: 'dark' });                     // 'dark/cosy'
   * resolver.getModeName({ density: 'compact', theme: 'dark' }); // 'dark/compact'
   * resolver.getModeName({});                                    // 'light/cosy'
   * ```
   */
  public getModeName(input: ResolverInput): string {
    const modifiers = this.collectEffectiveModifiers();

    const parts = Array.from(modifiers.entries())
      .map(([modifierName, modifier]) => input[modifierName] ?? modifier.default)
      .filter((context): context is string => context !== undefined);

    return parts.length === 0 ? 'default' : parts.join('/');
  }

  /** Document name, if set. */
  public get name(): string | undefined {
    return this.doc.name;
  }

  /**
   * Document description, if set.
   *
   * §2 of the Resolver spec: *"The document MAY provide a `description` at the
   * root level. This may be used to add additional explanation or context not
   * present in name."* A consumer showing a design system to a person wants
   * both — `name` alone is usually a slug.
   */
  public get description(): string | undefined {
    return this.doc.description;
  }

  /**
   * The version the design system declares for *itself*, if it declares one.
   *
   * Not to be confused with the document's `version`, which §4.1.2 fixes at
   * `"2025-11-01"` and reserves for breaking changes to the format. That field
   * is identical in every conforming document and says nothing about the system
   * described by it.
   *
   * The spec provides no root-level place for a system's own version. It does
   * provide `$extensions`, and §4.3 is specific about where: *"An `$extensions`
   * object MAY be added to any set, modifier, or inline set/modifier"* — the
   * root is not among them. So a system that wants to version itself hangs the
   * value off a set or a modifier under a vendor namespace, which is exactly
   * what `$extensions` is for.
   *
   * ```json
   * { "sets": { "base": {
   *     "$extensions": { "com.toghen": { "version": "1.4.0" } },
   *     "sources": [ ... ] } } }
   * ```
   *
   * Optional, and absent from most documents. A tool showing several documents
   * to a person can use it to tell two revisions of one system apart; nothing
   * in resolution depends on it.
   *
   * Sets are searched in declaration order, then modifiers, and the first
   * declaration wins. Several parts of one document disagreeing about the
   * version of the whole is a contradiction the document has to settle, not
   * something to resolve by merging.
   *
   * @param namespace - Vendor namespace to read. Defaults to `com.toghen`.
   * @returns The declared version, or `undefined`.
   */
  public getDeclaredVersion(namespace = 'com.toghen'): string | undefined {
    const carriers = [
      ...Object.values(this.doc.sets ?? {}),
      ...Object.values(this.doc.modifiers ?? {}),
      // Inline sets and modifiers may carry `$extensions` too, and §4.3 names
      // them explicitly alongside the declared kind.
      ...this.doc.resolutionOrder.filter(
        (item): item is Extract<ResolutionOrderItem, { $extensions?: unknown }> =>
          typeof item === 'object' && item !== null && '$extensions' in item,
      ),
    ];

    for (const carrier of carriers) {
      const vendor = carrier.$extensions?.[namespace] as unknown;
      if (typeof vendor !== 'object' || vendor === null) continue;

      const version = (vendor as { version?: unknown }).version;
      if (typeof version === 'string' && version.trim() !== '') {
        return version.trim();
      }
    }

    return undefined;
  }

  /**
   * The document's modifiers, each with its contexts, its default and its `$extensions`.
   *
   * In the order the document declares them (top-level modifiers first, then inline ones in `resolutionOrder`):
   * the contract, and the order a mode name joins contexts in. Asked for `'precedence'`, in the order they win
   * instead: the order `resolutionOrder` applies them, a later one winning, with any it never names last. An
   * adapter that writes one block or layer per modifier needs that order for the cascade to agree with the resolver.
   */
  public getModifiers(order: 'declared' | 'precedence' = 'declared'): ModeModifier[] {
    const modifiers = this.collectEffectiveModifiers();
    const names = [...modifiers.keys()];
    if (order === 'precedence') {
      const applied: string[] = [];
      for (const item of this.doc.resolutionOrder) {
        const name = isReferenceObject(item)
          ? item.$ref.startsWith('#/modifiers/')
            ? item.$ref.slice('#/modifiers/'.length).split('/')[0].replace(/~1/g, '/').replace(/~0/g, '~')
            : undefined
          : (item as Partial<InlineModifier>).type === 'modifier'
            ? (item as InlineModifier).name
            : undefined;
        if (name !== undefined && modifiers.has(name) && !applied.includes(name)) applied.push(name);
      }
      names.sort(
        (x, y) => (applied.includes(x) ? applied.indexOf(x) : applied.length) - (applied.includes(y) ? applied.indexOf(y) : applied.length),
      );
    }
    return names
      .map((name) => [name, modifiers.get(name)!] as const)
      .map(([name, modifier]) => ({
        name,
        contexts: Object.keys(modifier.contexts),
        ...(modifier.default !== undefined ? { default: modifier.default } : {}),
        ...(modifier.description !== undefined ? { description: modifier.description } : {}),
        ...(modifier.$extensions ? { $extensions: modifier.$extensions } : {}),
      }));
  }

  /**
   * Returns every possible permutation of modifier context selections.
   *
   * For documents without modifiers, returns `[{}]`.
   */
  public getPermutations(): ResolverInput[] {
    const modifiers = Array.from(this.collectEffectiveModifiers().entries());

    if (modifiers.length === 0) {
      return [{}];
    }

    const permutations: ResolverInput[] = [];

    const walk = (index: number, current: ResolverInput): void => {
      if (index >= modifiers.length) {
        permutations.push({ ...current });
        return;
      }

      const [modifierName, modifier] = modifiers[index];
      for (const contextName of Object.keys(modifier.contexts)) {
        current[modifierName] = contextName;
        walk(index + 1, current);
      }
      delete current[modifierName];
    };

    walk(0, {});
    return permutations;
  }

  // -------------------------------------------------------------------------
  // Querying one token across contexts (see specs.md)
  // -------------------------------------------------------------------------

  private chainIndexCache?: ChainIndex;

  /** The document flattened per `resolutionOrder` entry, and chains built over it on demand. */
  private chainIndex(): ChainIndex {
    if (this.chainIndexCache) return this.chainIndexCache;
    const modifiers = this.collectEffectiveModifiers();
    const entries: Entry[] = this.doc.resolutionOrder.map((item) => {
      const ref = isReferenceObject(item) ? item.$ref : undefined;
      const name = ref ? ref.split('/')[2].replace(/~1/g, '/').replace(/~0/g, '~') : (item as InlineSet | InlineModifier).name!;
      const isModifier = ref ? ref.startsWith('#/modifiers/') : (item as InlineModifier).type === 'modifier';
      if (!isModifier) return { kind: 'set', name, struct: this.resolveOrderItem(item, {}) ?? {} };
      const contexts: Record<string, Record<string, any>> = {};
      const mod = modifiers.get(name)!;
      for (const c of Object.keys(mod.contexts)) contexts[c] = this.resolveOrderItem(item, { [name]: c.toLowerCase() }) ?? {};
      const fallback = Object.keys(mod.contexts).find((c) => c.toLowerCase() === mod.default?.toLowerCase());
      return { kind: 'modifier', name, contexts, default: fallback };
    });
    return (this.chainIndexCache = new ChainIndex(entries, deepMergeTokenStructures, {
      collection: this.doc.name ?? 'resolved',
      mode: (contexts) => this.getModeName(contexts),
    }));
  }

  /** The context of each modifier under `input`; an omitted modifier takes its default. */
  private contextReader(input: ResolverInput, requireAll: boolean): (modifier: string) => string {
    const normalised = this.validateAndNormalizeInput(input, requireAll);
    const modifiers = this.collectEffectiveModifiers();
    return (modifier) => {
      const mod = modifiers.get(modifier)!;
      const want = normalised[modifier] ?? mod.default?.toLowerCase();
      if (want === undefined) throw new InvalidInputError(`Modifier "${modifier}" has no default and no input was provided for it.`);
      return Object.keys(mod.contexts).find((k) => k.toLowerCase() === want)!;
    };
  }

  /** Which modifiers a token depends on: `direct` (a context defines it) and `through` (its references). */
  public dependsOn(path: string): { direct: string[]; through: string[] } {
    return this.chainIndex().dependsOn(path);
  }

  /** What each modifier's context says about a token, as chains per leaf property. */
  public contextsOf(path: string): TokenContexts {
    return this.chainIndex().contextsOf(path);
  }

  /** The final value of a token under `input`, every reference followed late, as `DesignSystem.resolveValue()` gives it. */
  public valueAt(path: string, input: ResolverInput = {}): unknown {
    const ctx = this.contextReader(input, true);
    const ix = this.chainIndex();
    let early: Record<string, any> | undefined;
    const earlyRead = (p: string, prop: LeafProperty) => {
      early ??= this.resolve(input);
      const node = p.split('.').reduce((o: any, k) => o?.[k], early);
      return node && Object.prototype.hasOwnProperty.call(node, prop) ? { v: node[prop] } : undefined;
    };

    // The tokens the answer needs, each with the properties it has under `input`, nested as a document.
    const struct: Record<string, any> = {};
    const todo: Array<[string, string, number]> = [[path, ...(Object.values(ix.locate(path)) as [string, number])]];
    const seen = new Set<string>();
    while (todo.length) {
      const [key, token, from] = todo.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      const value = ix.evalProp(token, from, '$value', ctx, earlyRead);
      if (!value) {
        if (key === path) throw new PathNotFoundError(`"${path}" has no value under ${JSON.stringify(input)}: no entry defines it there.`);
        continue;
      }
      const node: Record<string, any> = { $value: value.v };
      for (const prop of LEAF_PROPERTIES.slice(1)) {
        const p = ix.evalProp(token, 0, prop, ctx, earlyRead);
        if (p) node[prop] = p.v;
      }
      let at = struct;
      const segs = key.split('.');
      segs.forEach((seg, i) => {
        if (i === segs.length - 1) {
          at[seg] = node;
          return;
        }
        at = at[seg] ??= {};
        for (const prop of ['$type', '$description'] as const) {
          const g = ix.evalProp(segs.slice(0, i + 1).join('.'), 0, prop, ctx, earlyRead);
          if (g) at[prop] = g.v;
        }
      });
      for (const r of referencesIn(value.v, '_')) {
        const owner = ix.ownerOf(r.to.slice(2));
        if (owner) todo.push([owner, owner, 0]);
      }
    }

    const collection = new Collection('resolved');
    this.loadTokensIntoCollection(struct, collection);
    const ds = new DesignSystem();
    ds.addCollection(collection);
    return ds.resolveValue(`resolved.${path}`);
  }

  // -------------------------------------------------------------------------
  // Stage 1 — Input validation
  // -------------------------------------------------------------------------

  /**
   * Validates and normalises the input object.
   *
   * Normalisation: all keys and values are lower-cased so that matching is
   * case-insensitive as required by the spec (SHOULD).
   *
   * Accounts for both top-level named modifiers AND inline modifiers declared
   * directly inside `resolutionOrder`.
   *
   * @returns A normalised copy of the input.
   */
  private validateAndNormalizeInput(input: ResolverInput, requireAll = true): Record<string, string> {
    // Collect all effective modifiers: top-level + inline in resolutionOrder
    const allModifiers = this.collectEffectiveModifiers();

    if (allModifiers.size === 0) {
      return {};
    }

    // Build a lower-case key → original-key index for all modifiers
    const modifierIndex = new Map<string, string>(Array.from(allModifiers.keys()).map((k) => [k.toLowerCase(), k]));

    // Validate input keys and values
    const normalised: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(input)) {
      // Values MUST be strings
      if (typeof rawValue !== 'string') {
        throw new InvalidInputError(`Input value for key "${rawKey}" must be a string, ` + `got ${typeof rawValue}.`);
      }

      const lowerKey = rawKey.toLowerCase();
      const modifierKey = modifierIndex.get(lowerKey);
      if (!modifierKey) {
        throw new InvalidInputError(`Input key "${rawKey}" does not correspond to any declared modifier.`);
      }

      const modifier = allModifiers.get(modifierKey)!;
      const allowedContexts = Object.keys(modifier.contexts).map((c) => c.toLowerCase());
      const lowerValue = rawValue.toLowerCase();

      if (!allowedContexts.includes(lowerValue)) {
        throw new InvalidInputError(
          `Input value "${rawValue}" for modifier "${modifierKey}" is not a ` +
            `valid context. Allowed values: ${Object.keys(modifier.contexts).join(', ')}.`,
        );
      }

      normalised[modifierKey] = lowerValue;
    }

    // Every modifier without a default MUST have an input key
    for (const [modName, mod] of allModifiers.entries()) {
      if (requireAll && mod.default === undefined && normalised[modName] === undefined) {
        throw new InvalidInputError(`Modifier "${modName}" has no default and no input was provided for it.`);
      }
    }

    return normalised;
  }

  /**
   * Collects all effective modifiers available to the resolver.
   * Includes top-level `doc.modifiers` and inline modifiers declared in
   * `resolutionOrder`.
   */
  private collectEffectiveModifiers(): Map<string, ResolverModifier> {
    const modifiers = new Map<string, ResolverModifier>();

    for (const [name, mod] of Object.entries(this.doc.modifiers ?? {})) {
      modifiers.set(name, mod);
    }

    for (const item of this.doc.resolutionOrder) {
      if (!isReferenceObject(item) && (item as Partial<InlineModifier>).type === 'modifier' && (item as Partial<InlineModifier>).name) {
        const inline = item as InlineModifier;
        modifiers.set(inline.name, inline);
      }
    }

    return modifiers;
  }

  // -------------------------------------------------------------------------
  // Stage 2 — Ordering
  // -------------------------------------------------------------------------

  /**
   * Iterates `resolutionOrder` and deep-merges all token sources into a
   * single flat token structure.  Later items override earlier ones.
   */
  private buildOrderedTokens(normalizedInput: Record<string, string>): Record<string, any> {
    let accumulated: Record<string, any> = {};

    for (const item of this.doc.resolutionOrder) {
      const resolved = this.resolveOrderItem(item, normalizedInput);
      if (resolved) {
        accumulated = deepMergeTokenStructures(accumulated, resolved);
      }
    }

    return accumulated;
  }

  /**
   * Resolves a single `resolutionOrder` item to a merged token structure.
   *
   * The item can be:
   * - A `$ref` to a named set or modifier
   * - An inline set
   * - An inline modifier
   */
  private resolveOrderItem(item: ResolutionOrderItem, normalizedInput: Record<string, string>): Record<string, any> | null {
    if (isReferenceObject(item)) {
      return this.resolveReferenceInOrder(item, normalizedInput);
    }

    // Inline item — type was already validated in validateDocument()
    const typed = item as InlineSet | InlineModifier;
    if (typed.type === 'set') {
      return this.flattenSet(typed as InlineSet);
    } else {
      return this.flattenModifier(typed as InlineModifier, normalizedInput, typed.name);
    }
  }

  /**
   * Dereferences a `$ref` in the `resolutionOrder` array.
   *
   * Valid targets: `#/sets/<name>` or `#/modifiers/<name>`.
   * Invalid targets: `#/resolutionOrder/…` → throws.
   * External URIs → throws (not supported in this implementation).
   */
  private resolveReferenceInOrder(
    ref: { $ref: string; [k: string]: any },
    normalizedInput: Record<string, string>,
  ): Record<string, any> | null {
    const pointer = ref.$ref;

    this.assertSameDocumentPointer(pointer);
    this.assertNotResolutionOrderPointer(pointer);

    const docAny = this.doc as Record<string, any>;
    let target = resolveJsonPointer(docAny, pointer);

    if (target === undefined) {
      throw new InvalidReferenceError(`$ref "${pointer}" could not be resolved within the document.`);
    }

    // Apply shallow overrides from extra keys on the ref object
    const overrides: Record<string, any> = {};
    for (const [k, v] of Object.entries(ref)) {
      if (k !== '$ref') overrides[k] = v;
    }
    if (Object.keys(overrides).length > 0) {
      target = shallowMerge(target as Record<string, any>, overrides);
    }

    // Determine whether the target is a set or modifier by path
    if (pointer.startsWith('#/sets/')) {
      const setName = pointer.slice('#/sets/'.length).split('/')[0];
      return this.flattenSet(target as ResolverSet & { name?: string }, setName);
    }

    if (pointer.startsWith('#/modifiers/')) {
      const modName = pointer.slice('#/modifiers/'.length).split('/')[0];
      this.assertNoModifierInModifier(pointer, target as ResolverModifier);
      return this.flattenModifier(target as ResolverModifier, normalizedInput, modName);
    }

    throw new InvalidReferenceError(`$ref "${pointer}" does not point to a set or modifier.`);
  }

  // -------------------------------------------------------------------------
  // Set & Modifier flattening
  // -------------------------------------------------------------------------

  /**
   * Merges all `sources` of a set in array order (last wins) into a single
   * token structure.
   */
  private flattenSet(set: ResolverSet & { name?: string }, _setName?: string): Record<string, any> {
    let result: Record<string, any> = {};

    for (const source of set.sources) {
      const tokens = this.resolveTokenSource(source, 'set');
      result = deepMergeTokenStructures(result, tokens);
    }

    return result;
  }

  /**
   * Selects the correct context from a modifier based on the input,
   * then merges all its sources in array order.
   */
  private flattenModifier(modifier: ResolverModifier, normalizedInput: Record<string, string>, modifierName: string): Record<string, any> {
    // Determine which context to use
    const contextValue = normalizedInput[modifierName] ?? (modifier.default ? modifier.default.toLowerCase() : undefined);

    if (contextValue === undefined) {
      throw new InvalidInputError(`No input and no default for modifier "${modifierName}".`);
    }

    // Find the matching context key (case-insensitive)
    const contextKey = Object.keys(modifier.contexts).find((k) => k.toLowerCase() === contextValue);

    if (!contextKey) {
      throw new InvalidInputError(`Modifier "${modifierName}" has no context matching "${contextValue}".`);
    }

    const sources = modifier.contexts[contextKey]!;
    let result: Record<string, any> = {};

    for (const source of sources) {
      const tokens = this.resolveTokenSource(source, 'modifier', modifierName);
      result = deepMergeTokenStructures(result, tokens);
    }

    return result;
  }

  /**
   * Resolves a single `TokenSource` — either a `$ref` to an in-document set,
   * or an inline DTCG token object.
   *
   * @param source - The token source to resolve.
   * @param sourceKind - `'set'` or `'modifier'` (for error messages).
   * @param modifierName - Name of the enclosing modifier (for error messages).
   */
  private resolveTokenSource(source: TokenSource, sourceKind: 'set' | 'modifier', modifierName?: string): Record<string, any> {
    if (!isReferenceObject(source)) {
      // Inline DTCG token object — use as-is
      return source as Record<string, any>;
    }

    const pointer = source.$ref;
    this.assertSameDocumentPointer(pointer);
    this.assertNotResolutionOrderPointer(pointer);

    // Modifiers MUST NOT reference other modifiers from within a context
    if (pointer.startsWith('#/modifiers/')) {
      const refModName = pointer.slice('#/modifiers/'.length).split('/')[0];
      throw new InvalidReferenceError(
        `${sourceKind === 'modifier' ? `Modifier "${modifierName}"` : 'A set'} ` +
          `references modifier "${refModName}" via $ref "${pointer}". ` +
          `Modifiers MUST NOT reference other modifiers.`,
      );
    }

    // Must point to a set
    if (!pointer.startsWith('#/sets/')) {
      throw new InvalidReferenceError(`$ref "${pointer}" in a token source must point to a named set (#/sets/<name>).`);
    }

    const docAny = this.doc as Record<string, any>;
    let target = resolveJsonPointer(docAny, pointer);

    if (target === undefined) {
      throw new InvalidReferenceError(`$ref "${pointer}" could not be resolved within the document.`);
    }

    // Apply shallow overrides
    const overrides: Record<string, any> = {};
    for (const [k, v] of Object.entries(source)) {
      if (k !== '$ref') overrides[k] = v;
    }
    if (Object.keys(overrides).length > 0) {
      target = shallowMerge(target as Record<string, any>, overrides);
    }

    // Recursively flatten the referenced set
    return this.flattenSet(target as ResolverSet);
  }

  // -------------------------------------------------------------------------
  // Helpers — DesignSystem loading
  // -------------------------------------------------------------------------

  /**
   * Recursively walks the flat token structure and loads all leaf tokens into
   * the provided collection.
   *
   * @param mode - When given, tokens are stored against that mode only, so the
   *   same collection can be filled once per permutation.
   */
  private loadTokensIntoCollection(obj: Record<string, any>, collection: Collection, pathParts: string[] = [], mode?: string): void {
    // The root of a source may carry `$extensions` (a parts vocabulary for every group below), as a group does.
    if (pathParts.length === 0 && obj.$extensions) collection.setGroupAttribute('', '$extensions', obj.$extensions, mode);

    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('$')) continue; // skip DTCG meta-keys at group level

      const currentPath = [...pathParts, key];

      if (this.isDtcgToken(value)) {
        // Leaf token — create a DesignToken and store it
        const token = new DesignToken(value.$value, value.$type ?? '', value.$description ?? '', value.$extensions ?? null);
        collection.setToken(currentPath.join('.'), token, mode);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Group — recurse
        // Propagate group-level attributes so they survive resolution
        for (const attribute of ['$type', '$description', '$extensions', '$deprecated']) {
          // A falsy attribute is an attribute: `$deprecated: false` says the group is not deprecated.
          if (value[attribute] !== undefined) {
            collection.setGroupAttribute(currentPath.join('.'), attribute, value[attribute], mode);
          }
        }
        this.loadTokensIntoCollection(value, collection, currentPath, mode);
      }
    }
  }

  /**
   * Heuristic: an object is a DTCG leaf token if it has a `$value` key.
   */
  private isDtcgToken(value: unknown): value is { $value: any; [k: string]: any } {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && '$value' in value;
  }

  // -------------------------------------------------------------------------
  // Stage 1 (construction) — Document validation
  // -------------------------------------------------------------------------

  private validateDocument(): void {
    // version is REQUIRED and must be '2025-11-01'
    if (!this.doc.version) {
      throw new ResolverValidationError('Resolver document must declare a "version" field.');
    }
    if (this.doc.version !== '2025-11-01') {
      throw new ResolverValidationError(`Resolver document version must be "2025-11-01", got "${this.doc.version}".`);
    }

    // resolutionOrder is REQUIRED
    if (!Array.isArray(this.doc.resolutionOrder)) {
      throw new ResolverValidationError('Resolver document must declare a "resolutionOrder" array.');
    }

    // Validate modifiers
    for (const [name, modifier] of Object.entries(this.doc.modifiers ?? {})) {
      this.validateModifier(name, modifier);
    }

    // Validate resolutionOrder items
    this.validateResolutionOrder();
  }

  private validateModifier(name: string, modifier: ResolverModifier): void {
    const contextCount = Object.keys(modifier.contexts).length;

    if (contextCount === 0) {
      throw new ResolverValidationError(`Modifier "${name}" must have at least one context.`);
    }

    // 1-context modifier: the spec says tools MUST throw
    if (contextCount === 1) {
      throw new ResolverValidationError(
        `Modifier "${name}" has only one context, which is equivalent to a set. Use a set instead, or add more contexts.`,
      );
    }

    if (modifier.default !== undefined && !(modifier.default in modifier.contexts)) {
      throw new ResolverValidationError(
        `Modifier "${name}" declares default "${modifier.default}" which is not ` +
          `a valid context. Valid contexts: ${Object.keys(modifier.contexts).join(', ')}.`,
      );
    }
  }

  private validateResolutionOrder(): void {
    const seenNames = new Set<string>();

    for (const item of this.doc.resolutionOrder) {
      if (isReferenceObject(item)) {
        // A $ref names its set or modifier; that name counts as an inline one does.
        // Other pointers are refused when resolved.
        const m = /^#\/(sets|modifiers)\/([^/]+)/.exec(item.$ref);
        if (!m) continue;
        const name = m[2].replace(/~1/g, '/').replace(/~0/g, '~');
        if (seenNames.has(name)) {
          throw new ResolverValidationError(`Duplicate name "${name}" in resolutionOrder.`);
        }
        seenNames.add(name);
        continue;
      }

      const typed = item as Partial<InlineSet | InlineModifier>;

      // Inline items MUST have name and type
      if (!typed.name) {
        throw new ResolverValidationError('An inline resolutionOrder item is missing the required "name" field.');
      }
      if (!typed.type || (typed.type !== 'set' && typed.type !== 'modifier')) {
        throw new ResolverValidationError(
          `Inline resolutionOrder item "${typed.name}" has an invalid or missing "type" field. Must be "set" or "modifier".`,
        );
      }

      // Names must be unique
      if (seenNames.has(typed.name)) {
        throw new ResolverValidationError(`Duplicate name "${typed.name}" in resolutionOrder.`);
      }
      seenNames.add(typed.name);

      // If inline modifier, validate it too
      if (typed.type === 'modifier') {
        this.validateModifier(typed.name, typed as InlineModifier);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Guards / assertions
  // -------------------------------------------------------------------------

  private assertSameDocumentPointer(pointer: string): void {
    if (!pointer.startsWith('#')) {
      throw new InvalidReferenceError(
        `External $ref "${pointer}" is not supported. Only same-document JSON Pointers starting with "#" are supported.`,
      );
    }
  }

  private assertNotResolutionOrderPointer(pointer: string): void {
    if (pointer.startsWith('#/resolutionOrder')) {
      throw new InvalidReferenceError(
        `$ref "${pointer}" targets the resolutionOrder array, which is forbidden by the W3C Resolver specification.`,
      );
    }
  }

  private assertNoModifierInModifier(pointer: string, target: ResolverModifier): void {
    // Check that none of the context sources reference another modifier
    for (const [ctxName, sources] of Object.entries(target.contexts)) {
      for (const source of sources) {
        if (isReferenceObject(source) && source.$ref.startsWith('#/modifiers/')) {
          throw new InvalidReferenceError(
            `Modifier referenced by "${pointer}" has context "${ctxName}" ` +
              `that references another modifier via $ref "${source.$ref}". ` +
              `Modifiers MUST NOT reference other modifiers.`,
          );
        }
      }
    }
  }
}
