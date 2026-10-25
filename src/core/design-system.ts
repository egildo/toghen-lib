import { Collection, inheritedAttribute } from './collection.js';
import { DesignToken, CollectionNotFoundError, InvalidTokenError, PathNotFoundError } from './design-token.js';
import { referencesIn, resolveTokenValue, resolveTypeThroughAlias, type TokenReference } from './alias.js';
import { holdsReference } from './alias-syntax.js';
import { computeTokenValue } from '../handlers/built-in.js';

/**
 * The resolved system: its collections, and the answers about a token by its lookup path
 * (`collection.path.to.token`): its value, the token resolved, and the references it makes.
 *
 * @example
 * ```typescript
 * const system = new Resolver(document).resolveContextsToDesignSystem();
 * system.resolveValue('ds.button.backgroundColor', 'theme=dark');
 * system.referencesOf('ds.button.backgroundColor');
 * ```
 */
export class DesignSystem {
  /**
   * Map of collection names to Collection instances.
   * Stores all registered collections in the design system.
   */
  private collections: Map<string, Collection> = new Map();

  /**
   * Adds a token collection to the design system.
   *
   * Collections organize related tokens and provide the hierarchical structure
   * for the design system. Each collection must have a unique name and can
   * contain multiple modes for theming. Once added, tokens within the collection
   * can be referenced from other collections using the format "collectionName.tokenPath".
   *
   * @param collection - The Collection instance to add to the system
   *
   * @throws {Error} When the provided object is not a Collection instance
   *
   * @example
   * ```typescript
   * const designSystem = new DesignSystem();
   *
   * // Create collections
   * const colors = new Collection('colors', ['light', 'dark']);
   * const spacing = new Collection('spacing');
   * const typography = new Collection('typography');
   *
   * // Add collections to the system
   * designSystem.addCollection(colors);
   * designSystem.addCollection(spacing);
   * designSystem.addCollection(typography);
   *
   * // Now tokens can reference across collections
   * designSystem.setToken('colors', 'primary', { $value: '#007bff', $type: 'color' });
   * designSystem.setToken('spacing', 'button.padding', {
   *   $value: '12px',
   *   $type: 'dimension'
   * });
   *
   * // Invalid input (throws error)
   * // designSystem.addCollection({}); // Error: not a Collection instance
   * ```
   */
  public addCollection(collection: Collection): void {
    if (!(collection instanceof Collection)) {
      throw new Error('DesignSystem only accepts Collection instances.');
    }
    // Silently replacing a same-named collection would be invisible and
    // dangerous: token references are resolved against the collection that owns
    // them, so the replacement's tokens would start answering the original's
    // references. Two resolver documents with no `name` both default to
    // 'resolved', which makes this easy to hit by accident.
    if (this.collections.has(collection.name)) {
      throw new Error(
        `Collection '${collection.name}' is already registered. Remove it first, or give the new collection a different name.`,
      );
    }
    this.collections.set(collection.name, collection);
  }

  /**
   * Retrieves a collection by its name.
   *
   * This method provides access to Collection instances that have been added
   * to the design system. It's useful for direct manipulation of collections
   * or for checking collection properties like available modes.
   *
   * @param name - The name of the collection to retrieve
   * @returns The Collection instance, or null if not found
   *
   * @example
   * ```typescript
   * const designSystem = new DesignSystem();
   * const colors = new Collection('colors', ['light', 'dark']);
   * designSystem.addCollection(colors);
   *
   * // Retrieve the collection
   * const retrievedColors = designSystem.getCollection('colors');
   * console.log(retrievedColors?.name); // 'colors'
   * console.log(retrievedColors?.getModes()); // ['light', 'dark']
   *
   * // Non-existent collection
   * const missing = designSystem.getCollection('nonexistent');
   * console.log(missing); // null
   *
   * // Use retrieved collection directly
   * if (retrievedColors) {
   *   const allPaths = retrievedColors.getAllPaths();
   *   console.log('Available color tokens:', allPaths);
   * }
   * ```
   */
  public getCollection(name: string): Collection | null {
    return this.collections.get(name) || null;
  }

  /**

   * Resolves a token's value, expanding every reference it contains.
   *
   * ### Two namespaces, and why they differ
   *
   * The `path` argument is a **lookup path** — `collectionName.tokenPath` — which
   * addresses a token across the whole system. The references written *inside* a
   * token's `$value` are a different namespace: they are relative to the
   * document root, meaning the root of the collection holding that token, with
   * no collection prefix (W3C DTCG §7.4.6).
   *
   * So a token looked up as `'theme.color.brand'` refers to its sibling as
   * `'{color.blue}'`, not `'{theme.color.blue}'`. Keeping these separate is what
   * lets a token document stay portable — the same JSON resolves identically
   * whatever the collection ends up being called.
   *
   * ### Resolution behaviour
   *
   * - **Whole-value reference** — the target's value is returned with its type
   *   intact, including objects and arrays.
   * - **Composite values** — references nested inside an object or array are
   *   resolved in place. An array reference occupies exactly one slot; it is
   *   never flattened or expanded (§9.1).
   * - **Embedded references** — a reference inside a longer string is
   *   interpolated. This is a Toghen extension beyond the W3C format, and the
   *   target must resolve to a scalar.
   * - **Computed after resolution.** A value written with a reference is
   *   computed once it resolves, by its type, as a literal is on load:
   *   `color-mix(in srgb, {ink} 5%, transparent)` typed `color` is a structured
   *   colour, `calc({space.md} * 2)` typed `dimension` is `{ value, unit }`.
   *   The member walk runs on the computed value.
   * - **Failures throw.** A dangling, malformed, or circular reference is an
   *   error, never a warning — the W3C format requires tools to report them
   *   (§7.4.5), and a silently passed-through `{...}` reaches generated CSS and
   *   design tools as literal text.
   * - **Members** — a lookup path may continue past a token into its resolved
   *   value, one own member or array index per segment:
   *   `type.body.fontSize`, `elevation.raised.0.color`, `color.blue.components.0`.
   *   This is the lookup-path form of the W3C JSON Pointer `$ref` (§7, Example 32).
   *   A member is not a token: `resolveToken()` and `queryToken()` do not see it.
   *
   * @param path - Full lookup path (format: "collectionName.tokenPath[.member...]")
   * @param mode - The mode to resolve in (defaults to 'default')
   * @returns The fully resolved value of the token, or of the member the path names
   *
   * @throws {PathNotFoundError} When the path format is invalid, no token is found,
   *   or a member the path names does not exist in the resolved value
   * @throws {CollectionNotFoundError} When the specified collection doesn't exist
   * @throws {UnresolvableReferenceError} When a reference names no token, names a
   *   group, or is malformed
   * @throws {CircularReferenceError} When references form a cycle
   * @throws {InvalidInterpolationError} When a non-scalar is interpolated into a string
   * @throws {InvalidTokenError} When a value written with a reference resolves into one its type
   *   cannot compute (a `dimension` that resolves to `'8px 12px'`, a colour mixing `currentColor`),
   *   naming the token, the mode, the member and the reason
   *
   * @example
   * ```typescript
   * const designSystem = new DesignSystem();
   * designSystem.addCollection(new Collection('colors'));
   *
   * designSystem.setToken('colors', 'primary.blue', { $value: '#007bff', $type: 'color' });
   *
   * // References are document-relative — no 'colors.' prefix
   * designSystem.setToken('colors', 'button.bg', { $value: '{primary.blue}', $type: 'color' });
   * designSystem.setToken('colors', 'shadow', {
   *   $value: { color: 'color-mix(in srgb, {primary.blue} 50%, transparent)', offsetX: '0px', offsetY: '2px', blur: '4px' },
   *   $type: 'shadow'
   * });
   *
   * // Lookups are collection-qualified
   * designSystem.resolveValue('colors.primary.blue');  // { colorSpace: 'srgb', …, hex: '#007bff' }
   * designSystem.resolveValue('colors.button.bg');     // the same colour
   * // A value written with a reference is computed once it resolves, as its type stores it
   * designSystem.resolveValue('colors.shadow.color');  // { colorSpace: 'srgb', components: [0, 0.482…, 1], alpha: 0.5 }
   * designSystem.resolveValue('colors.shadow.offsetY'); // { value: 2, unit: 'px' }
   *
   * // Circular references are reported, not passed through
   * designSystem.setToken('colors', 'circular1', { $value: '{circular2}', $type: 'color' });
   * designSystem.setToken('colors', 'circular2', { $value: '{circular1}', $type: 'color' });
   * // designSystem.resolveValue('colors.circular1'); // Throws CircularReferenceError
   * ```
   */
  public resolveValue(path: string, mode = 'default'): any {
    const { collection, tokenPath, resolveMode } = this.locate(path, mode);

    // A token cannot contain tokens, so the first prefix that is
    // a token owns the path; whatever follows walks into its resolved value.
    const segments = tokenPath.split('.');
    for (let i = 1; i <= segments.length; i++) {
      const ownerPath = segments.slice(0, i).join('.');
      const token = collection.getToken(ownerPath, resolveMode);
      if (token) {
        const value = this.resolveComputed(token, collection, resolveMode, ownerPath);
        return memberOf(value, ownerPath, segments.slice(i));
      }
    }

    throw tokenNotFound(collection, tokenPath, resolveMode);
  }

  /**
   * Reports the references a token's value makes, as written.
   *
   * Resolution erases provenance: after `resolveValue()` nothing can tell that a
   * member was authored as `{font.size.md}`. This reads the same `$value` for
   * what it refers to instead of what it resolves to, so an adapter that can
   * express a reference natively (an alias, a binding, a `var()`) can write one.
   *
   * - `at` is the member address inside the value, in the lookup path's member
   *   grammar (`'fontSize'`, `'0.color'`), or `''` for a whole-value reference.
   * - `to` is the **first hop**, what the author wrote, qualified with the
   *   owning collection's name, since references are document-relative.
   * - The read is **syntactic**: it does not check that a target exists or is a
   *   token. Resolution errors remain `resolveValue()`'s job.
   *
   * Order is document order of members, depth-first. A literal makes none.
   *
   * @param path - Lookup path of a token (format: "collectionName.tokenPath")
   * @param mode - The mode to read (defaults to 'default'), respected exactly as
   *   `resolveValue()` respects it
   * @returns The references, possibly none
   *
   * @throws {PathNotFoundError} When the path is not a token: missing, a group,
   *   or a member path
   * @throws {CollectionNotFoundError} When the specified collection doesn't exist
   *
   * @example
   * ```typescript
   * system.referencesOf('ds.type.body');       // [{ at: 'fontSize', to: 'ds.font.size.md', interpolated: false }, ...]
   * system.referencesOf('ds.color.button.bg'); // [{ at: '', to: 'ds.color.brand', interpolated: false }]
   * system.referencesOf('ds.color.brand');     // []
   * ```
   */
  public referencesOf(path: string, mode = 'default'): TokenReference[] {
    const { collection, tokenPath, resolveMode } = this.locate(path, mode);
    const token = collection.getToken(tokenPath, resolveMode);
    if (!token) {
      throw tokenNotFound(collection, tokenPath, resolveMode);
    }
    return referencesIn(token.$value, collection.name);
  }

  /**
   * Splits a lookup path into its collection and token parts, and resolves the
   * mode sentinel to a concrete mode.
   *
   * A lookup path is `collectionName.tokenPath` — this is the *lookup*
   * namespace, distinct from the document-relative paths written inside a
   * token's `$value`. See `resolveValue()` for why the two differ.
   *
   * @param path - Full lookup path
   * @param mode - Requested mode, or `'default'` for the collection's own default
   * @returns The collection, the path within it, and a concrete mode
   *
   * @throws {PathNotFoundError} When the path has no collection segment
   * @throws {CollectionNotFoundError} When the named collection isn't registered
   *
   * @private
   */
  /**
   * The lookup path a path stands for. A path whose first segment names a collection is a lookup path already.
   * Otherwise, in a system of one collection, it is a reference path, and that collection's name goes in front.
   * So a group named like the collection is read as the collection.
   *
   * @throws {CollectionNotFoundError} When the first segment names no collection and the system has more than one
   * @example
   * ```typescript
   * system.lookupPath('button.backgroundColor');    // 'ds.button.backgroundColor'
   * system.lookupPath('ds.button.backgroundColor'); // 'ds.button.backgroundColor'
   * ```
   */
  public lookupPath(path: string): string {
    const [first] = path.split('.');
    if (this.collections.has(first)) return path;
    if (this.collections.size === 1) {
      const [only] = this.collections.keys();
      return path === '' ? only : `${only}.${path}`;
    }
    throw new CollectionNotFoundError(`Collection '${first}' not found.`);
  }

  private locate(path: string, mode: string): { collection: Collection; tokenPath: string; resolveMode: string } {
    const parts = this.lookupPath(path).split('.');
    if (parts.length < 2) {
      // Adjusted for collection.token format
      throw new PathNotFoundError(`Invalid path '${path}'. Expected format: CollectionName.tokenName`);
    }

    const [collectionName, ...tokenPathParts] = parts;
    const tokenPath = tokenPathParts.join('.');

    const collection = this.getCollection(collectionName);
    if (!collection) {
      throw new CollectionNotFoundError(`Collection '${collectionName}' not found.`);
    }

    const resolveMode = mode === 'default' ? collection.getDefaultMode() : mode;
    return { collection, tokenPath, resolveMode };
  }

  /**
   * A token with its value fully resolved, and its type: its own, else the type of the token it refers to,
   * else the nearest group's (W3C DTCG §5.2.2).
   *
   * @param path - A lookup path, `collectionName.tokenPath`
   * @param mode - The mode to resolve in (defaults to the collection's default)
   * @returns The resolved token, its value computed as `resolveValue()` computes it, or null when the
   *   collection or the token is not there
   * @throws {InvalidTokenError} When the resolved value cannot be computed for its type
   */
  public resolveToken(path: string, mode = 'default'): DesignToken | null {
    // Only a *lookup* miss yields null — that is what the `| null` return type
    // has always meant. Resolution failures (a dangling or circular reference,
    // an uninterpolatable value) are deliberately allowed to propagate: folding
    // them into null would make a broken token indistinguishable from an absent
    // one, and callers that skip nulls would silently drop it.
    let located: { collection: Collection; tokenPath: string; resolveMode: string };
    try {
      located = this.locate(path, mode);
    } catch {
      return null;
    }

    const { collection, tokenPath, resolveMode } = located;
    const tokenData = collection.getToken(tokenPath, resolveMode);
    if (!tokenData) return null;

    const type = this.typeOf(tokenData, collection, resolveMode, tokenPath);
    const resolvedValue = this.resolveComputed(tokenData, collection, resolveMode, tokenPath);
    const token = new DesignToken(resolvedValue, type, tokenData.$description, tokenData.$extensions);

    return token;
  }

  /**
   * W3C DTCG §5.2.2 type precedence: the token's own `$type`, else the resolved type of the token
   * it references, else the nearest parent group's `$type`; `''` when none says.
   */
  private typeOf(token: DesignToken, collection: Collection, mode: string, tokenPath: string): string {
    return (
      token.$type ||
      resolveTypeThroughAlias(token.$value, collection, mode, tokenPath) ||
      inheritedAttribute(collection, tokenPath, '$type', mode) ||
      ''
    );
  }

  /**
   * A token's value resolved, then computed: the read gate. A value written with a reference has no
   * shape until it resolves, so once resolved it goes through its type's gate (`color-mix(in srgb,
   * {ink} 5%, transparent)` becomes a structured colour). A literal was computed on load and is
   * returned as stored.
   *
   * @throws {InvalidTokenError} When the resolved value cannot be computed for its type, naming the
   *   token, the mode, the member and the reason
   */
  private resolveComputed(token: DesignToken, collection: Collection, mode: string, tokenPath: string): unknown {
    const value = resolveTokenValue(token, collection, mode, tokenPath);
    if (!holdsReference(token.$value)) return value;
    const path = `${collection.name}.${tokenPath}`;
    try {
      return computeTokenValue(this.typeOf(token, collection, mode, tokenPath), value, path);
    } catch (error) {
      const message = (error as Error).message;
      const prefix = `Token "${path}"`;
      throw new InvalidTokenError(
        message.startsWith(prefix) ? `${prefix} (mode "${mode}")${message.slice(prefix.length)}` : `${prefix} (mode "${mode}"): ${message}`,
      );
    }
  }

  /**
   * Gets the names of all registered collections in the design system.
   *
   * This method returns an array of collection names that have been added
   * to the design system. It's useful for iteration, validation, and
   * providing users with available collections.
   *
   * @returns An array of collection names currently registered in the system
   *
   * @example
   * ```typescript
   * const designSystem = new DesignSystem();
   *
   * // Initially empty
   * console.log(designSystem.getCollectionNames()); // []
   *
   * // Add collections
   * designSystem.addCollection(new Collection('colors'));
   * designSystem.addCollection(new Collection('spacing'));
   * designSystem.addCollection(new Collection('typography'));
   *
   * // Get all collection names
   * const collections = designSystem.getCollectionNames();
   * console.log(collections); // ['colors', 'spacing', 'typography']
   *
   * // Use for iteration
   * collections.forEach(name => {
   *   const collection = designSystem.getCollection(name);
   *   console.log(`Collection ${name} has modes:`, collection?.getModes());
   * });
   *
   * // Use for validation
   * function isValidCollectionReference(path: string): boolean {
   *   const collectionName = path.split('.')[0];
   *   return designSystem.getCollectionNames().includes(collectionName);
   * }
   *
   * console.log(isValidCollectionReference('colors.primary.blue')); // true
   * console.log(isValidCollectionReference('invalid.token')); // false
   * ```
   */
  public getCollectionNames(): string[] {
    return Array.from(this.collections.keys());
  }
}

function tokenNotFound(collection: Collection, tokenPath: string, mode: string): PathNotFoundError {
  return new PathNotFoundError(`Token '${tokenPath}' not found in collection '${collection.name}' for mode '${mode}'.`);
}

/**
 * Walks `members` into a resolved value, one own member or array index per
 * segment. A miss names what does exist, so a typo is fixed from the message.
 */
function memberOf(value: unknown, ownerPath: string, members: string[]): unknown {
  for (const member of members) {
    if (typeof value !== 'object' || value === null) {
      throw new PathNotFoundError(`'${ownerPath}' is a ${typeof value}, so it has no member '${member}'.`);
    }
    const own = Object.prototype.hasOwnProperty.call(value, member);
    if (Array.isArray(value)) {
      if (!own || member === 'length') {
        throw new PathNotFoundError(`'${ownerPath}' has no index ${member}. It has ${value.length} entries.`);
      }
    } else if (!own) {
      throw new PathNotFoundError(`'${ownerPath}' has no member '${member}'. Its members: ${Object.keys(value).join(', ')}.`);
    }
    value = (value as Record<string, unknown>)[member];
    ownerPath = `${ownerPath}.${member}`;
  }
  return value;
}

/**
 * The reference path of a lookup path: the path without its collection segment, as a reference inside a token
 * writes it. `ds.button.backgroundColor` gives `button.backgroundColor`. Its inverse is `DesignSystem.lookupPath`.
 */
export function referencePath(lookupPath: string): string {
  const dot = lookupPath.indexOf('.');
  return dot < 0 ? '' : lookupPath.slice(dot + 1);
}
