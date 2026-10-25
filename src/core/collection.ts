import { DesignToken, InvalidTokenError, InvalidModeError, PathNotFoundError } from './design-token.js';
import type { LeafProperty, NonFactorable, TokenContexts } from '../resolver/chains.js';
import { normalizeTokenValue } from '../handlers/built-in.js';
import type { Resolver } from '../resolver/resolver.js';

/**
 * Defines the structure for a group of tokens, which can contain other groups or tokens.
 * Groups can be nested to create hierarchical organization of design tokens.
 */
type TokenGroup = {
  [key: string]: TokenGroup | DesignToken | any;
};

/**
 * A modifier a collection's modes were built from: its name, its contexts and
 * its default, and its `$extensions`, which adapters read (a context's CSS
 * selector, for one).
 */
export interface ModeModifier {
  name: string;
  contexts: string[];
  default?: string;
  description?: string;
  $extensions?: Record<string, any>;
}

/** A child of a group, as `childrenOf` lists it. */
export interface Child {
  /** The child's own key. */
  key: string;
  /** Its path in the collection. */
  path: string;
  kind: 'token' | 'group';
}

/**
 * A part on a token path: a segment whose key is a value of an axis in the
 * parts vocabulary in force at its parent group. `at` is the path up to and
 * including the segment; `spelling` is the vocabulary's spelling for it.
 */
export interface Part {
  at: string;
  key: string;
  axis: string;
  spelling: string;
  /** The twin along this part's axis: the path with this part's segment removed. */
  twin: string;
  /** Whether the twin is there: a token with a value in the mode asked (in some mode when none is), or a group holding one. */
  twinExists: boolean;
}

/** What `partsOf` says of a path. */
export interface Parts {
  /** The parts the path passes through, outermost first. */
  parts: Part[];
  /** The path with every part removed. */
  rest: string;
  /** Whether the rest is there, as a twin is. */
  restExists: boolean;
  /** The component: the group directly above the first part; null when the path passes through no part. */
  component: string | null;
}

/** An axis a component's parts use, and the values of it they use, in precedence order. */
export interface Axis {
  axis: string;
  values: string[];
}

/** What `check` finds in a collection. */
export interface Check {
  /** Tokens with no value in some mode of the collection. */
  incomplete: Array<{ path: string; missingModes: string[] }>;
  /** Tokens whose chain has combinations of contexts with no value (a collection built from a resolver document). */
  holes: Array<{ path: string; property: LeafProperty; holes: Array<Record<string, string>> }>;
  /** Tokens whose value one context overrides in part, so no chain can say it (a collection built from a resolver document). */
  nonFactorable: NonFactorable[];
}

/**
 * A leaf that holds a different token per mode.
 *
 * Per-mode values used to be encoded as an array `$value`, which made them
 * indistinguishable from a value that is *genuinely* an array — a `fontFamily`
 * stack, a list of shadows, gradient stops. In a two-mode collection a
 * two-family font stack was silently split across the modes, and a
 * three-family one was rejected outright. Holding the per-mode map beside the
 * token instead of inside its `$value` removes the ambiguity entirely: a
 * `$value` is now always the token's own value.
 *
 * A leaf that is a plain `DesignToken` means "the same value in every mode".
 *
 * @internal
 */
/**
 * A group attribute that differs between modes, as a token can. A plain value
 * in the same place is the attribute in every mode.
 */
class ModeAttribute {
  constructor(readonly values: Map<string, unknown>) {}
}

/** A plain token holds its value in every mode; a per-mode leaf only in the modes it was given. */
function hasValueIn(node: DesignToken | ModeValues, mode: string): boolean {
  return node instanceof DesignToken || node.has(mode);
}

/** Whether a node is a token with a value in the mode, or a group holding one; with no mode, a value in any mode counts. */
function holdsValue(node: unknown, mode: string | undefined): boolean {
  if (node instanceof DesignToken || node instanceof ModeValues) return mode === undefined || hasValueIn(node, mode);
  return (
    typeof node === 'object' &&
    node !== null &&
    Object.entries(node).some(([key, child]) => !key.startsWith('$') && holdsValue(child, mode))
  );
}

class ModeValues {
  private readonly byMode = new Map<string, DesignToken>();

  /** Builds a leaf carrying one shared token across the given modes. */
  static shared(token: DesignToken, modes: readonly string[]): ModeValues {
    const values = new ModeValues();
    for (const mode of modes) {
      values.set(mode, token);
    }
    return values;
  }

  public set(mode: string, token: DesignToken): void {
    this.byMode.set(mode, token);
  }

  public get(mode: string): DesignToken | null {
    return this.byMode.get(mode) ?? null;
  }

  public has(mode: string): boolean {
    return this.byMode.has(mode);
  }

  public delete(mode: string): boolean {
    return this.byMode.delete(mode);
  }

  public get size(): number {
    return this.byMode.size;
  }
}

/**
 * A hierarchical collection of design tokens organized in a nested structure with support for multiple modes.
 *
 * Collections provide a way to organize design tokens into logical groups and hierarchies,
 * similar to how files are organized in folders. They support multiple modes (like light/dark themes)
 * and provide methods for managing tokens, groups, and their metadata.
 *
 * Key features:
 * - Hierarchical token organization using dot-notation paths (e.g., "color.primary.blue")
 * - Multi-mode support for themes and variations
 * - Group-level metadata and attributes
 * - Token validation and path management
 * - Immutable token storage with deep cloning
 *
 * @example
 * ```typescript
 * // Create a collection with multiple modes
 * const colors = new Collection('colors', ['light', 'dark']);
 *
 * // Add tokens to the collection
 * const primaryBlue = new DesignToken('#007bff', 'color', 'Primary blue');
 * colors.setToken('primary.blue', primaryBlue);
 *
 * // Add group metadata
 * colors.setGroupAttribute('primary', '$description', 'Primary color palette');
 *
 * // Retrieve tokens
 * const token = colors.getToken('primary.blue');
 * console.log(token?.$value.hex); // '#007bff'
 *
 * // Work with modes
 * colors.setDefaultMode('dark');
 * const allPaths = colors.getAllPaths('light');
 * ```
 *
 * @since 1.0.0
 */
export class Collection {
  /**
   * The unique name identifier for this collection.
   * Used to reference the collection within a design system.
   */
  public readonly name: string;

  /**
   * Array of available mode names for this collection.
   * Modes allow the same token structure to have different values (e.g., light/dark themes).
   */
  private readonly modes: string[];

  /**
   * The default mode used when no specific mode is requested.
   * Defaults to the first mode in the modes array.
   */
  private defaultMode: string;

  /**
   * For a collection built from a resolver document: the contexts each mode
   * stands for, one per modifier, and the modifiers' defaults. It is what lets
   * a mode be named by the contexts that differ from the defaults.
   */
  private contexts?: { modifiers: ModeModifier[]; modes: Map<string, Record<string, string>> };

  /**
   * The resolver that built this collection, so an adapter can put the
   * per-modifier questions (`dependsOn`, `contextsOf`, `step`, `valueAt`) to
   * it. Set by `resolveAllToDesignSystem()` and `resolveContextsToDesignSystem()`;
   * a collection built by hand has none.
   */
  public resolver?: Resolver;

  /**
   * The root of the token hierarchy containing all tokens and groups.
   * Organized as a nested object structure matching the token paths.
   */
  private tokens: TokenGroup;

  /**
   * Creates a new Collection instance with the specified name and modes.
   *
   * @param name - Unique identifier for the collection
   * @param modes - Array of mode names (defaults to ['default'])
   *
   * @example
   * ```typescript
   * // Simple collection with default mode
   * const spacing = new Collection('spacing');
   *
   * // Collection with multiple modes for theming
   * const colors = new Collection('colors', ['light', 'dark', 'high-contrast']);
   *
   * // Collection for responsive design
   * const breakpoints = new Collection('breakpoints', ['mobile', 'tablet', 'desktop']);
   * ```
   */
  constructor(name: string, modes: string[] = ['default']) {
    if (modes.length === 0) {
      throw new InvalidModeError(`Collection '${name}' must declare at least one mode.`);
    }

    const duplicates = modes.filter((mode, index) => modes.indexOf(mode) !== index);
    if (duplicates.length > 0) {
      throw new InvalidModeError(`Collection '${name}' declares duplicate mode(s): ${[...new Set(duplicates)].join(', ')}.`);
    }

    this.name = name;
    this.modes = [...modes];
    this.defaultMode = modes[0];
    this.tokens = {}; // The root of the token hierarchy
  }

  /**
   * Throws unless `mode` is one this collection declares.
   *
   * Guessing here is what made `getToken(path, 'drak')` quietly return the
   * first mode's value — a typo, or asking a single-mode collection for a
   * theme it does not have, would silently produce the wrong value rather than
   * saying so.
   *
   * @private
   */
  /**
   * Records the contexts each mode stands for, so a mode can also be named by
   * `modifier=context` pairs. Called by `Resolver` when it builds a collection.
   *
   * @param modes - For each declared mode, its context for every modifier
   * @param modifiers - The modifiers, in declared order
   */
  public setModeContexts(modes: Record<string, Record<string, string>>, modifiers: ModeModifier[]): void {
    for (const mode of Object.keys(modes)) this.assertMode(mode);
    this.contexts = {
      modifiers: modifiers.map((m) => ({ ...m, contexts: [...m.contexts] })),
      modes: new Map(Object.entries(modes).map(([m, c]) => [m, { ...c }])),
    };
    // The default mode is the one where every modifier is at its declared default, wherever the build put it.
    const defaults = Object.entries(modes).find(([, contexts]) =>
      modifiers.every((m) => m.default === undefined || contexts[m.name] === m.default),
    );
    if (defaults) this.defaultMode = defaults[0];
  }

  /**
   * The declared mode a name stands for. A declared mode name is itself.
   * `modifier=context` pairs, separated by spaces (`density=compact`,
   * `theme=dark density=compact`), name the mode whose contexts are the
   * defaults with those changed; that works only in a collection whose modes
   * have contexts (see {@link setModeContexts}).
   *
   * @throws {InvalidModeError} When the name is neither, names a modifier or
   *   context the collection does not know, or a combination that was not built
   */
  public modeNamed(name: string): string {
    if (this.modes.includes(name) || !name.includes('=')) {
      this.assertMode(name);
      return name;
    }
    if (!this.contexts) {
      throw new InvalidModeError(
        `Mode '${name}' names contexts, but the modes of collection '${this.name}' have none. ` +
          `Declared modes: ${this.modes.join(', ')}.`,
      );
    }

    const { modifiers, modes } = this.contexts;
    // Names match regardless of case, as the resolver's input does; the declared spelling is what is looked up.
    const lower = (s: string) => s.toLowerCase();
    const known = new Map(modifiers.map((m) => [lower(m.name), { name: m.name, contexts: new Map(m.contexts.map((c) => [lower(c), c])) }]));

    const wanted: Record<string, string> = {};
    for (const m of modifiers) if (m.default !== undefined) wanted[m.name] = m.default;
    for (const pair of name.trim().split(/\s+/)) {
      const [modifier, context, extra] = pair.split('=');
      if (extra !== undefined || !modifier || !context) {
        throw new InvalidModeError(`Mode '${name}': '${pair}' is not modifier=context.`);
      }
      const found = known.get(lower(modifier));
      if (!found) {
        throw new InvalidModeError(
          `Mode '${name}': collection '${this.name}' has no modifier '${modifier}'. Modifiers: ${modifiers.map((m) => m.name).join(', ')}.`,
        );
      }
      const declared = found.contexts.get(lower(context));
      if (declared === undefined) {
        throw new InvalidModeError(
          `Mode '${name}': modifier '${found.name}' has no context '${context}'. Contexts: ${[...found.contexts.values()].join(', ')}.`,
        );
      }
      wanted[found.name] = declared;
    }

    for (const [mode, contexts] of modes) {
      const keys = new Set([...Object.keys(contexts), ...Object.keys(wanted)]);
      if ([...keys].every((key) => contexts[key] === wanted[key])) return mode;
    }
    throw new InvalidModeError(
      `Mode '${name}' was not built in collection '${this.name}'. Name it among the combinations when building, ` +
        `or build every combination with resolveAllToDesignSystem().`,
    );
  }

  private assertMode(mode: string): void {
    if (!this.modes.includes(mode)) {
      throw new InvalidModeError(`Mode '${mode}' not found in collection '${this.name}'. ` + `Declared modes: ${this.modes.join(', ')}.`);
    }
  }

  /**
   * Adds or updates a token at a specific path within the collection.
   *
   * This method stores a DesignToken at the specified hierarchical path, creating
   * intermediate groups as needed. The path uses dot notation to represent the
   * hierarchy (e.g., "color.primary.blue" creates a structure: color -> primary -> blue).
   *
   * Omit `mode` and the token applies to every mode. Pass one and only that
   * mode is affected — the others keep whatever they had, so a shared value can
   * be overridden for a single theme:
   *
   * ```typescript
   * const colors = new Collection('colors', ['light', 'dark']);
   * colors.setToken('bg', new DesignToken('#ffffff', 'color'));           // both modes
   * colors.setToken('bg', new DesignToken('#1a1a1a', 'color'), 'dark');   // dark only
   * ```
   *
   * Path validation ensures that:
   * - No path segment starts with '$' (reserved for metadata)
   * - No path segment contains '{', '}', or '.' characters
   *
   * @param path - Dot-separated path to the token (e.g., "color.primary.blue")
   * @param token - The DesignToken instance to store
   * @param mode - Optional mode to scope this value to; omit to apply to all modes
   *
   * @throws {InvalidTokenError} When the path contains invalid characters, or
   *   when it would make one node both a token and a group — either because a
   *   segment along the way already holds a token, or because the leaf already
   *   holds a group. DTCG forbids that shape, and writing it used to lose the
   *   token silently.
   * @throws {InvalidModeError} When `mode` is not declared by this collection
   *
   * @example
   * ```typescript
   * const collection = new Collection('colors');
   *
   * // Add a simple token
   * const primaryBlue = new DesignToken('#007bff', 'color', 'Primary blue color');
   * collection.setToken('primary.blue', primaryBlue);
   *
   * // A value that is genuinely an array stays intact, in any collection
   * collection.setToken('font.sans', new DesignToken(['Inter', 'system-ui'], 'fontFamily'));
   *
   * // Invalid path (throws error)
   * // collection.setToken('invalid.{ref}', token); // Error!
   * // collection.setToken('$metadata.token', token); // Error!
   * ```
   */
  public setToken(path: string, token: DesignToken, mode?: string): void {
    const pathParts = path.split('.');
    for (const part of pathParts) {
      if (part.startsWith('$') || part.includes('{') || part.includes('}') || part.includes('.')) {
        throw new InvalidTokenError(`Invalid token name: ${part}`);
      }
    }

    // Per-mode values used to be packed into an array $value, with DesignToken
    // elements as the explicit form. That encoding is gone; catching it here
    // turns a silent change of meaning into an actionable error.
    if (Array.isArray(token.$value) && token.$value.some((item) => item instanceof DesignToken)) {
      throw new InvalidTokenError(
        `Token '${path}' has an array of DesignToken values, which used to encode one value ` +
          `per mode. Set each mode explicitly instead: setToken(path, token, mode).`,
      );
    }

    if (mode !== undefined) {
      mode = this.modeNamed(mode);
    }

    // Every way a token enters a system ends here, so this is where its value
    // is checked and stored in the one shape adapters read.
    const type = token.$type || inheritedAttribute(this, path, '$type', mode);
    const value = normalizeTokenValue(type ?? '', token.$value, `${this.name}.${path}`);
    if (value !== token.$value) {
      token = new DesignToken(value, token.$type, token.$description, token.$extensions);
    }

    const tokenName = pathParts.pop()!;

    let current: TokenGroup = this.tokens;
    const walked: string[] = [];
    for (const part of pathParts) {
      walked.push(part);
      const node = current[part];

      // A node cannot be both a token and a group (W3C DTCG §5.2). The walk
      // used to step *into* a token found here, so the new token was written as
      // a property of that DesignToken object: it never appeared in
      // `getAllPaths()`, never resolved, and nothing was reported.
      if (node instanceof DesignToken || node instanceof ModeValues) {
        throw new InvalidTokenError(`Cannot add '${path}': '${walked.join('.')}' is already a token, so it cannot also be a group.`);
      }

      if (!node) {
        current[part] = {};
      }
      current = current[part] as TokenGroup;
    }

    const occupant = current[tokenName];
    if (occupant !== undefined && !(occupant instanceof DesignToken) && !(occupant instanceof ModeValues)) {
      throw new InvalidTokenError(
        `Cannot add '${path}': it is already a group containing ` +
          `${Object.keys(occupant as TokenGroup).filter((key) => !key.startsWith('$')).length} ` +
          `token(s), so it cannot also be a token.`,
      );
    }

    if (mode === undefined) {
      current[tokenName] = token;
      return;
    }

    const existing = current[tokenName];
    // Narrowing a value that was shared across modes: seed every mode with it
    // first, so the modes we are not touching keep the value they resolved to.
    const values =
      existing instanceof ModeValues
        ? existing
        : existing instanceof DesignToken
          ? ModeValues.shared(existing, this.modes)
          : new ModeValues();

    values.set(mode, token);
    current[tokenName] = values;
  }

  /**

   * Retrieves a token from a specific path and mode.
   * 
   * This method navigates the hierarchical token structure to find and return
   * the token at the specified path. For multi-mode collections, it handles
   * mode-specific token resolution with fallback to the default mode.
   * 
   * Mode resolution logic:
   * - If token has single value, return that value regardless of mode
   * - If token has multiple values, return value for requested mode
   * - If requested mode not found, fallback to default mode (first in array)
   * 
   * @param path - Dot-separated path to the token (e.g., "primary.blue")
   * @param mode - The desired mode (defaults to collection's default mode)
   * @returns The DesignToken instance, or null if not found
   * 
   * @example
   * ```typescript
   * const collection = new Collection('colors', ['light', 'dark']);
   * 
   * // Add a simple token
   * const primaryBlue = new DesignToken('#007bff', 'color');
   * collection.setToken('primary.blue', primaryBlue);
   * 
   * // Add a token that differs per mode
   * collection.setToken('background', new DesignToken('#ffffff', 'color'), 'light');
   * collection.setToken('background', new DesignToken('#000000', 'color'), 'dark');
   *
   * // Retrieve tokens
   * const blue = collection.getToken('primary.blue'); // Returns the token
   * const lightBg = collection.getToken('background', 'light'); // Returns light mode
   * const darkBg = collection.getToken('background', 'dark'); // Returns dark mode
   * const missing = collection.getToken('nonexistent.token'); // Returns null
   *
   * console.log(blue?.$value.hex); // '#007bff'
   * console.log(lightBg?.$value.hex); // '#ffffff'
   * console.log(darkBg?.$value.hex); // '#000000'
   * ```
   */
  public getToken(path: string, mode: string = this.defaultMode): DesignToken | null {
    mode = this.modeNamed(mode);

    const node = this.navigate(path);

    // A leaf carrying one value per mode.
    if (node instanceof ModeValues) {
      return node.get(mode);
    }

    // A group is not a token. Without this guard a group object was returned
    // as if it were a token, which made `hasToken()` report true for group
    // paths and let a `{group}` alias resolve to `undefined` — W3C DTCG §7.1.1
    // requires a reference to target a token with a `$value`.
    if (!(node instanceof DesignToken)) {
      return null;
    }

    // A plain token applies to every mode. Its $value is its own value, whatever
    // its shape — an array here is a font stack or a list of shadows, never a
    // packed list of per-mode values.
    return node;
  }

  /**
   * Walks the hierarchy to the node stored at `path`, without interpreting it.
   *
   * Returns the raw stored value — a `DesignToken` leaf, a group object, or
   * `undefined` when any segment along the way is missing. Shared by
   * `getToken()` and `getNodeKind()` so both agree on what exists.
   *
   * @param path - Dot-separated path to walk
   * @returns The node at that path, or undefined if the path doesn't exist
   *
   * @private
   */
  private navigate(path: string): TokenGroup | DesignToken | ModeValues | undefined {
    const pathParts = path.split('.');
    const nodeName = pathParts.pop()!;

    let current: TokenGroup = this.tokens;
    for (const part of pathParts) {
      if (!current || typeof current[part] !== 'object') {
        return undefined;
      }
      current = current[part] as TokenGroup;
    }

    return current?.[nodeName];
  }

  /**
   * Classifies what lives at a path without resolving it.
   *
   * `getToken()` collapses "no such path" and "that path is a group" into the
   * same `null`, but the two need different diagnostics: a reference to a group
   * is a specific error under W3C DTCG §7.1.1, not a missing token.
   *
   * @param path - Dot-separated path to classify
   * @returns `'token'`, `'group'`, or `'missing'`
   *
   * @example
   * ```typescript
   * const collection = new Collection('colors');
   * collection.setToken('primary.blue', new DesignToken('#007bff', 'color'));
   *
   * collection.getNodeKind('primary.blue'); // 'token'
   * collection.getNodeKind('primary');      // 'group'
   * collection.getNodeKind('secondary');    // 'missing'
   * ```
   */
  public getNodeKind(path: string): 'token' | 'group' | 'missing' {
    const node = this.navigate(path);

    if (node instanceof DesignToken || node instanceof ModeValues) return 'token';
    if (node !== null && typeof node === 'object') return 'group';
    return 'missing';
  }

  /**
   * Sets a metadata attribute on a token group.
   *
   * Group attributes are metadata properties that apply to entire groups of tokens.
   * They must start with '$' to distinguish them from token names and follow the
   * W3C Design Tokens specification for group-level properties.
   *
   * Common group attributes include:
   * - $description: Human-readable description of the group's purpose
   * - $type: Default type for tokens in the group
   * - $extensions: Custom metadata for the group
   *
   * @param path - Dot-separated path to the group (e.g., "color.primary")
   * @param attribute - The attribute name (must start with '$')
   * @param value - The value to set for the attribute
   * @param mode - The one mode to set it in; omitted, every mode
   *
   * @throws {InvalidTokenError} When attribute name doesn't start with '$'
   * @throws {InvalidModeError} When `mode` is not one of the collection's
   *
   * @example
   * ```typescript
   * const collection = new Collection('colors');
   *
   * // Set group descriptions
   * collection.setGroupAttribute('primary', '$description', 'Primary brand colors');
   * collection.setGroupAttribute('semantic', '$description', 'Semantic color meanings');
   *
   * // Set default type for a group
   * collection.setGroupAttribute('spacing', '$type', 'dimension');
   *
   * // Set custom extensions
   * collection.setGroupAttribute('colors', '$extensions', {
   *   figma: { nodeId: 'colors-frame' },
   *   category: 'foundation'
   * });
   *
   * // Invalid attribute (throws error)
   * // collection.setGroupAttribute('colors', 'invalidAttr', 'value'); // Error!
   * ```
   */
  public setGroupAttribute(path: string, attribute: string, value: any, mode?: string): void {
    if (!attribute.startsWith('$')) {
      throw new InvalidTokenError(`Invalid group attribute '${attribute}'. Attributes must start with '$'.`);
    }

    const pathParts = path === '' ? [] : path.split('.'); // the empty path is the root of the collection

    let current: TokenGroup = this.tokens;
    for (const [i, part] of pathParts.entries()) {
      if (current[part] instanceof DesignToken || current[part] instanceof ModeValues) {
        throw new InvalidTokenError(
          `Cannot set '${attribute}' on '${path}': '${pathParts.slice(0, i + 1).join('.')}' is a token, and a group attribute belongs to a group.`,
        );
      }
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part] as TokenGroup;
    }

    if (mode === undefined) {
      current[attribute] = value;
      return;
    }
    mode = this.modeNamed(mode);
    const existing = current[attribute];
    const values =
      existing instanceof ModeAttribute ? existing.values : new Map(existing === undefined ? [] : this.modes.map((m) => [m, existing]));
    values.set(mode, value);
    current[attribute] = new ModeAttribute(values);
  }

  /**
   * Retrieves a metadata attribute from a token group.
   *
   * This method fetches group-level metadata that was previously set using
   * setGroupAttribute. It navigates the hierarchical structure to find the
   * specified group and returns the requested attribute value.
   *
   * @param path - Dot-separated path to the group (e.g., "color.primary")
   * @param attribute - The attribute name to retrieve (must start with '$')
   * @param mode - The mode to read it in; defaults to the collection's default
   * @returns The attribute's value, or null if not found
   *
   * @throws {InvalidTokenError} When attribute name doesn't start with '$'
   *
   * @example
   * ```typescript
   * const collection = new Collection('colors');
   *
   * // Set and retrieve group attributes
   * collection.setGroupAttribute('primary', '$description', 'Primary brand colors');
   * collection.setGroupAttribute('primary', '$type', 'color');
   *
   * const description = collection.getGroupAttribute('primary', '$description');
   * console.log(description); // 'Primary brand colors'
   *
   * const type = collection.getGroupAttribute('primary', '$type');
   * console.log(type); // 'color'
   *
   * // Non-existent attribute
   * const missing = collection.getGroupAttribute('primary', '$nonexistent');
   * console.log(missing); // null
   *
   * // Invalid attribute name (throws error)
   * // collection.getGroupAttribute('primary', 'invalidAttr'); // Error!
   * ```
   */
  public getGroupAttribute(path: string, attribute: string, mode: string = this.defaultMode): any | null {
    if (!attribute.startsWith('$')) {
      throw new InvalidTokenError(`Invalid group attribute '${attribute}'. Attributes must start with '$'.`);
    }

    const pathParts = path === '' ? [] : path.split('.'); // the empty path is the root of the collection

    let current: TokenGroup = this.tokens;
    for (const part of pathParts) {
      if (!current[part] || current[part] instanceof DesignToken || current[part] instanceof ModeValues) {
        return null;
      }
      current = current[part] as TokenGroup;
    }

    // A falsy value is a value: `$deprecated: false` reads false.
    const value = current[attribute];
    if (value instanceof ModeAttribute) return value.values.get(this.modeNamed(mode)) ?? null;
    return value ?? null;
  }

  /**
   * The parts vocabulary in force at a group: `$extensions["com.toghen"].css.parts`
   * read on every group from the root down to `groupPath` inclusive, merged so a
   * group below overrides one entry (axis + value) and keeps the rest. The root
   * of the collection (the empty path) is read first: it may hold the vocabulary
   * of every group. `parts: false` on a group clears the vocabulary in force
   * there and below it, until a group lower down declares one of its own.
   *
   * @returns axis -> value -> spelling
   * @throws {InvalidTokenError} When a vocabulary is not an object of objects of strings
   */
  public vocabularyAt(groupPath: string, mode?: string): Record<string, Record<string, string>> {
    const vocabulary: Record<string, Record<string, string>> = {};
    const segments = groupPath === '' ? [] : groupPath.split('.');
    for (let i = 0; i <= segments.length; i++) {
      const at = segments.slice(0, i).join('.');
      const parts = this.getGroupAttribute(at, '$extensions', mode)?.['com.toghen']?.css?.parts;
      if (parts === undefined) continue;
      // `parts: false` clears the vocabulary in force here: no key under this group is a part, unless a group lower down declares its own.
      if (parts === false) {
        for (const axis of Object.keys(vocabulary)) delete vocabulary[axis];
        continue;
      }
      const isObject = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
      if (
        !isObject(parts) ||
        !Object.values(parts).every((values) => isObject(values) && Object.values(values as object).every((s) => typeof s === 'string'))
      ) {
        throw new InvalidTokenError(
          `Invalid parts vocabulary on ${at === '' ? 'the document root' : `group '${at}'`}: expected an object of axes, each an object of value -> spelling string.`,
        );
      }
      for (const [axis, values] of Object.entries(parts as Record<string, Record<string, string>>)) {
        vocabulary[axis] = { ...vocabulary[axis], ...values };
      }
    }
    return vocabulary;
  }

  /**
   * The parts a path passes through, the component they belong to, and the twins.
   *
   * A segment is a part when its key is a value of some axis in the vocabulary in force at its parent group. Any
   * other segment is a plain subgroup. The first segment is never a part, nor is the last, which is the token itself.
   * The twin along an axis is the path with that axis's part removed; the rest is the path with every part removed.
   * Each says whether it is there: a token with a value in `mode`, or in some mode when `mode` is omitted.
   *
   * @param path - Collection-relative, dot-separated
   * @throws {InvalidTokenError} When a key is a value of two axes in one vocabulary, or two
   *   parts of the same axis nest in one path
   */
  public partsOf(path: string, mode?: string): Parts {
    const { segments, parts } = this.splitParts(path, mode, false);
    const at = new Set(parts.map((part) => part.at.split('.').length - 1));
    const rest = segments.filter((_, i) => !at.has(i)).join('.');
    return {
      parts,
      rest,
      restExists: this.isThere(rest, mode),
      component: parts.length === 0 ? null : parts[0].at.slice(0, parts[0].at.lastIndexOf('.')),
    };
  }

  /**
   * The part a group is, or null: a group is a part when its own key is a value of an axis in the vocabulary in
   * force at its parent. Its twin is the group's path with that segment removed.
   *
   * @throws {InvalidTokenError} As `partsOf` does, for the path down to the group
   */
  public partAt(group: string, mode?: string): Part | null {
    const { parts } = this.splitParts(group, mode, true);
    const last = parts[parts.length - 1];
    return last?.at === group ? last : null;
  }

  /**
   * The axes the parts below a group use, and the values of each, in precedence order: the axes as the vocabulary
   * in force at the group declares them, the values of an axis as it declares them. Between two parts that both
   * match, the later one wins. The order of the keys in the document carries no meaning.
   *
   * The parts read are those of the group's own tokens: tokens whose component is the group or a group above it.
   * A component nested in the group (`button.icon` under `button`) keeps its axes to itself. For a component, these
   * are the axes it varies along; for a part group, the parts below it.
   */
  public axesOf(group: string, mode?: string): Axis[] {
    const vocabulary = this.vocabularyAt(group, mode);
    const used = new Map<string, Set<string>>();
    for (const path of this.tokenPaths(group, mode === undefined ? undefined : this.modeNamed(mode))) {
      const { parts, component } = this.partsOf(path, mode);
      if (component === null || (component !== group && !group.startsWith(`${component}.`))) continue;
      for (const part of parts) {
        if (!part.at.startsWith(`${group}.`)) continue;
        (used.get(part.axis) ?? used.set(part.axis, new Set()).get(part.axis)!).add(part.key);
      }
    }
    return Object.keys(vocabulary)
      .filter((axis) => used.has(axis))
      .map((axis) => ({ axis, values: Object.keys(vocabulary[axis]).filter((value) => used.get(axis)!.has(value)) }));
  }

  /**
   * Under a selection of part values, the token that supplies each key of a component.
   *
   * The candidates for a key are the component's own token of that name and the part tokens of that name whose
   * every segment between the component and the key is a part the selection selects. The candidate with more parts
   * wins. On a tie, the one whose latest differing axis comes later in the vocabulary wins. The order of the keys
   * in the document never matters. A token in a plain subgroup is not a key of the component.
   *
   * @param component - The component's group
   * @param selection - A value for each axis selected: `{ variant: 'primary', state: 'hover' }`
   * @returns Each key, in the order the document first gives it, and the path of the token that supplies it
   */
  public applies(component: string, selection: Record<string, string>, mode?: string): Record<string, string> {
    const axes = Object.keys(this.vocabularyAt(component, mode));
    const best = new Map<string, { path: string; ranks: number[] }>();
    // More parts wins; then the latest axis that differs, the later in the vocabulary winning.
    const beats = (a: number[], b: number[]) => {
      if (a.length !== b.length) return a.length > b.length;
      const i = a.findIndex((rank, j) => rank !== b[j]);
      return i >= 0 && a[i] > b[i];
    };
    for (const path of this.tokenPaths(component, mode === undefined ? undefined : this.modeNamed(mode))) {
      if (!path.startsWith(`${component}.`)) continue;
      const between = path.slice(component.length + 1).split('.');
      const key = between.pop()!;
      const parts = this.partsOf(path, mode).parts.filter((part) => part.at.startsWith(`${component}.`));
      if (parts.length !== between.length || !parts.every((part) => selection[part.axis] === part.key)) continue;
      const ranks = parts.map((part) => axes.indexOf(part.axis)).sort((a, b) => b - a);
      const held = best.get(key);
      if (!held || beats(ranks, held.ranks)) best.set(key, { path, ranks });
    }
    return Object.fromEntries([...best].map(([key, { path }]) => [key, path]));
  }

  /** The parts of a path, with their twins; the last segment is a part only for a group (`lastIsPart`). */
  private splitParts(path: string, mode: string | undefined, lastIsPart: boolean): { segments: string[]; parts: Part[] } {
    const segments = path.split('.');
    const parts: Part[] = [];
    segments.forEach((key, i) => {
      // the first segment is the group's own name, never a part; the last is the token itself
      if (i === 0 || (i === segments.length - 1 && !lastIsPart)) return;
      const group = segments.slice(0, i).join('.');
      const vocabulary = this.vocabularyAt(group, mode);
      const axes = Object.keys(vocabulary).filter((axis) => key in vocabulary[axis]);
      if (axes.length === 0) return;
      if (axes.length > 1) {
        throw new InvalidTokenError(
          `Key '${key}' is a value of two axes ('${axes[0]}' and '${axes[1]}') in the parts vocabulary at group '${group}'.`,
        );
      }
      const axis = axes[0];
      const earlier = parts.find((p) => p.axis === axis);
      if (earlier) {
        throw new InvalidTokenError(
          `Path '${path}' nests two parts of axis '${axis}': '${earlier.key}' and '${key}'. Give the group "com.toghen": { "css": { "parts": false } }, or rename a key.`,
        );
      }
      const twin = segments.filter((_, j) => j !== i).join('.');
      parts.push({
        at: segments.slice(0, i + 1).join('.'),
        key,
        axis,
        spelling: vocabulary[axis][key],
        twin,
        twinExists: this.isThere(twin, mode),
      });
    });
    return { segments, parts };
  }

  /** Whether a path is a token with a value in the mode, or a group holding one; with no mode, in any mode. */
  private isThere(path: string, mode?: string): boolean {
    return holdsValue(path === '' ? this.tokens : this.navigate(path), mode === undefined ? undefined : this.modeNamed(mode));
  }

  /**
   * What is wrong with the collection's tokens, in one call: the tokens with no value in some mode and, for a
   * collection built from a resolver document, the holes of every chain and every non-factorable token.
   */
  public check(): Check {
    const incomplete: Check['incomplete'] = [];
    const holes: Check['holes'] = [];
    const nonFactorable: NonFactorable[] = [];
    for (const path of this.tokenPaths('', undefined)) {
      const missingModes = this.modes.filter((mode) => !holdsValue(this.navigate(path), mode));
      if (missingModes.length > 0) incomplete.push({ path, missingModes });
      if (!this.resolver) continue;
      let about: TokenContexts;
      try {
        about = this.resolver.contextsOf(path);
      } catch (error) {
        // A token added by hand is not in the resolver's document, which has nothing to say of it.
        if (error instanceof PathNotFoundError) continue;
        throw error;
      }
      nonFactorable.push(...about.nonFactorable);
      for (const [property, chain] of Object.entries(about.chains)) {
        if (chain && chain.holes.length > 0) holes.push({ path, property: property as LeafProperty, holes: chain.holes });
      }
    }
    return { incomplete, holes, nonFactorable };
  }

  /**
   * The token paths with a value in a mode, in document order: every one, or those under a path.
   *
   * Under a group, the tokens anywhere below it. Under a token, the token itself. Under a path that is
   * neither, none.
   *
   * @param mode - The mode (defaults to the collection's default); a declared name or `modifier=context` pairs
   * @param under - A collection-relative path; omitted or empty, the whole collection
   * @example
   * ```typescript
   * collection.getAllPaths();                       // ['color.bg', 'button.backgroundColor', 'button.hover.backgroundColor']
   * collection.getAllPaths('theme=dark', 'button'); // ['button.backgroundColor', 'button.hover.backgroundColor']
   * ```
   */
  public getAllPaths(mode: string = this.defaultMode, under = ''): string[] {
    return this.tokenPaths(under, this.modeNamed(mode));
  }

  /** The token paths under a path with a value in the mode, or in any mode when none is given. */
  private tokenPaths(under: string, mode: string | undefined): string[] {
    const start = under === '' ? this.tokens : this.navigate(under);
    if (start instanceof DesignToken || start instanceof ModeValues) return holdsValue(start, mode) ? [under] : [];
    if (typeof start !== 'object' || start === null) return [];
    const paths: string[] = [];
    const traverse = (group: TokenGroup, at: string) => {
      for (const [key, node] of Object.entries(group)) {
        // Group metadata ($description, $type, …) is not a token.
        if (key.startsWith('$')) continue;
        const path = at ? `${at}.${key}` : key;
        if (node instanceof DesignToken || node instanceof ModeValues) {
          if (holdsValue(node, mode)) paths.push(path);
        } else if (typeof node === 'object' && node !== null) {
          traverse(node as TokenGroup, path);
        }
      }
    };
    traverse(start as TokenGroup, under);
    return paths;
  }

  /**
   * The children of a group, in document order, each marked token or group.
   *
   * A child token is listed when it has a value in the mode; a child group when some token under it has. With no
   * mode, a value in any mode counts. The root is the empty path. A path that is a token, or nothing, has no
   * children: `getNodeKind` says which.
   *
   * @example
   * ```typescript
   * collection.childrenOf('button');
   * // [{ key: 'backgroundColor', path: 'button.backgroundColor', kind: 'token' },
   * //  { key: 'hover', path: 'button.hover', kind: 'group' }]
   * ```
   */
  public childrenOf(group: string, mode?: string): Child[] {
    const at = mode === undefined ? undefined : this.modeNamed(mode);
    const start = group === '' ? this.tokens : this.navigate(group);
    if (typeof start !== 'object' || start === null || start instanceof DesignToken || start instanceof ModeValues) return [];
    const children: Child[] = [];
    for (const [key, node] of Object.entries(start as TokenGroup)) {
      if (key.startsWith('$') || !holdsValue(node, at)) continue;
      const kind = node instanceof DesignToken || node instanceof ModeValues ? 'token' : 'group';
      children.push({ key, path: group === '' ? key : `${group}.${key}`, kind });
    }
    return children;
  }

  /**
   * Gets the list of available modes in the collection.
   *
   * This method returns a copy of the modes array to prevent external
   * modification while allowing inspection of available modes.
   *
   * @returns An array of mode names available in this collection
   *
   * @example
   * ```typescript
   * // Single mode collection
   * const singleMode = new Collection('spacing');
   * console.log(singleMode.getModes()); // ['default']
   *
   * // Multi-mode collection
   * const multiMode = new Collection('colors', ['light', 'dark', 'high-contrast']);
   * console.log(multiMode.getModes()); // ['light', 'dark', 'high-contrast']
   *
   * // Use modes for iteration
   * const modes = multiMode.getModes();
   * modes.forEach(mode => {
   *   console.log(`Tokens in ${mode} mode:`, multiMode.getAllPaths(mode));
   * });
   * ```
   */
  public getModes(): string[] {
    return [...this.modes];
  }

  /**
   * Gets the mode used when a call omits one.
   *
   * The first declared mode unless `setDefaultMode()` changed it. Callers that
   * resolve a `'default'` sentinel must read this rather than `getModes()[0]`,
   * or the two disagree the moment the default is changed.
   *
   * @returns The current default mode name
   */
  public getDefaultMode(): string {
    return this.defaultMode;
  }
}

/**
 * The attribute a token inherits: the nearest group above `path` that declares it, the root excluded. The core
 * reads a token's `$type` this way; a consumer asks `DesignSystem.resolveToken(path).$type`, and a group's own
 * attribute with `getGroupAttribute`.
 *
 * @internal
 */
export function inheritedAttribute(collection: Collection, path: string, attribute: string, mode?: string): any | null {
  const segments = path.split('.');
  for (let i = segments.length - 1; i > 0; i--) {
    const value = collection.getGroupAttribute(segments.slice(0, i).join('.'), attribute, mode);
    if (value !== null) return value;
  }
  return null;
}
