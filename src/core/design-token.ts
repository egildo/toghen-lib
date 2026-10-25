/**
 * Error thrown when a design token is invalid or malformed.
 *
 * @example
 * ```typescript
 * throw new InvalidTokenError('Token value cannot be null');
 * ```
 */
export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

/**
 * Error thrown when a token path cannot be found in a collection.
 *
 * @example
 * ```typescript
 * throw new PathNotFoundError('Token "color.primary" not found');
 * ```
 */
export class PathNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathNotFoundError';
  }
}

/**
 * Error thrown when an invalid mode is specified for a collection.
 *
 * @example
 * ```typescript
 * throw new InvalidModeError('Mode "dark" not found in collection');
 * ```
 */
export class InvalidModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidModeError';
  }
}

/**
 * Error thrown when a collection cannot be found in the design system.
 *
 * @example
 * ```typescript
 * throw new CollectionNotFoundError('Collection "colors" not found');
 * ```
 */
export class CollectionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionNotFoundError';
  }
}

/**
 * Error thrown when a circular reference is detected in token resolution.
 *
 * @example
 * ```typescript
 * throw new CircularReferenceError('Circular reference: token1 -> token2 -> token1');
 * ```
 */
export class CircularReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircularReferenceError';
  }
}

/**
 * Why a token reference could not be resolved.
 *
 * - `not-found`  — no node exists at the referenced path
 * - `group`      — the path names a group, not a token (W3C DTCG §7.1.1)
 * - `no-value`   — the target exists but carries no `$value`
 * - `malformed`  — the reference text is not a usable path (empty, `{a..b}`, …)
 */
export type UnresolvableReferenceReason = 'not-found' | 'group' | 'no-value' | 'malformed';

/**
 * Structured details attached to an {@link UnresolvableReferenceError}.
 */
export interface UnresolvableReferenceDetails {
  /** The reference exactly as written, braces included — e.g. `'{color.blue}'`. */
  reference: string;
  /** Collection-relative path of the token that contained the reference. */
  tokenPath: string;
  /** Name of the collection the reference was resolved against. */
  collectionName: string;
  /** Mode the resolution was attempted in. */
  mode: string;
  /** Why it failed. */
  reason: UnresolvableReferenceReason;
}

/**
 * Error thrown when a token reference inside a `$value` cannot be resolved.
 *
 * Extends {@link PathNotFoundError} deliberately: both mean "a path did not
 * resolve", so existing `instanceof PathNotFoundError` handling keeps working.
 * The distinction the subclass adds is *whose* path is wrong —
 * `PathNotFoundError` means the path the caller asked for, whereas this means a
 * reference written inside a token, which is a different thing to go and fix.
 *
 * @example
 * ```typescript
 * try {
 *   system.resolveValue('theme.button.background');
 * } catch (error) {
 *   if (error instanceof UnresolvableReferenceError) {
 *     console.error(error.reason);     // 'not-found'
 *     console.error(error.reference);  // '{color.brand.primary}'
 *     console.error(error.tokenPath);  // 'button.background'
 *   }
 * }
 * ```
 */
export class UnresolvableReferenceError extends PathNotFoundError {
  /** The reference exactly as written, braces included. */
  public readonly reference: string;

  /** Collection-relative path of the token that contained the reference. */
  public readonly tokenPath: string;

  /** Name of the collection the reference was resolved against. */
  public readonly collectionName: string;

  /** Mode the resolution was attempted in. */
  public readonly mode: string;

  /** Why the reference could not be resolved. */
  public readonly reason: UnresolvableReferenceReason;

  constructor(message: string, details: UnresolvableReferenceDetails) {
    super(message);
    this.name = 'UnresolvableReferenceError';
    this.reference = details.reference;
    this.tokenPath = details.tokenPath;
    this.collectionName = details.collectionName;
    this.mode = details.mode;
    this.reason = details.reason;
  }
}

/**
 * Error thrown when a reference resolves successfully but its value cannot be
 * spliced into the surrounding string.
 *
 * Only reachable through partial-string interpolation — a Toghen extension
 * beyond the W3C format (see {@link DesignToken.isReference}). Interpolating an
 * object or array would silently produce `"[object Object]"`, so it is refused.
 *
 * @example
 * ```typescript
 * // '{spacing.md}' resolves to { value: 16, unit: 'px' } — not a scalar,
 * // so this throws rather than emitting "0 2px 4px [object Object]".
 * new DesignToken('0 2px 4px {spacing.md}', 'shadow');
 * ```
 */
export class InvalidInterpolationError extends InvalidTokenError {
  /** The reference exactly as written, braces included. */
  public readonly reference: string;

  /** Collection-relative path of the token that contained the reference. */
  public readonly tokenPath: string;

  constructor(message: string, reference: string, tokenPath: string) {
    super(message);
    this.name = 'InvalidInterpolationError';
    this.reference = reference;
    this.tokenPath = tokenPath;
  }
}

/**
 * Represents a single, immutable design token compliant with the W3C Design Tokens specification.
 *
 * Design tokens are the visual design atoms of the design system — specifically, they are named entities
 * that store visual design attributes. This class ensures immutability by deep cloning values and
 * provides methods for safe token manipulation that return new instances rather than modifying existing ones.
 *
 * The class follows the W3C Design Tokens format with core properties:
 * - `$value`: The actual value of the token (color, dimension, etc.)
 * - `$type`: The semantic type of the token (color, dimension, fontFamily, etc.)
 * - `$description`: Human-readable description of the token's purpose
 * - `$extensions`: Vendor-specific extensions and metadata
 *
 * @example
 * ```typescript
 * // Create a simple color token
 * const primaryColor = new DesignToken('#007bff', 'color', 'Primary brand color');
 *
 * // Create a token with extensions
 * const spacing = new DesignToken('16px', 'dimension', 'Base spacing unit', {
 *   figma: { id: 'S:123' },
 *   category: 'spacing'
 * });
 *
 * // Create a reference token
 * const buttonColor = new DesignToken('{color.primary}', 'color', 'Button background color');
 * ```
 *
 * @since 1.0.0
 */
export class DesignToken {
  /**
   * The actual value of the design token. Can be any type including primitives,
   * objects, arrays, or reference strings in the format '{path.to.token}'.
   * This value is deep cloned during construction to ensure immutability.
   */
  public readonly $value: any;

  /**
   * The semantic type of the token (e.g., 'color', 'dimension', 'fontFamily').
   * Used for validation and to determine which type handler should process the token.
   */
  public readonly $type: string;

  /**
   * Human-readable description explaining the purpose and usage of the token.
   */
  public readonly $description: string;

  /**
   * Vendor-specific extensions and additional metadata.
   * Can contain tool-specific information, categories, or other custom properties.
   */
  public readonly $extensions: Record<string, any> | null;

  /**
   * Creates a new immutable DesignToken instance.
   *
   * All values are deep cloned to ensure immutability, except for DesignToken instances
   * which are preserved as-is since they are already immutable.
   *
   * @param $value - The token's value (primitive, object, array, or reference string)
   * @param $type - The semantic type of the token
   * @param $description - Human-readable description (defaults to empty string)
   * @param $extensions - Vendor-specific extensions (defaults to null)
   *
   * @example
   * ```typescript
   * // Simple token
   * const token = new DesignToken('#ff0000', 'color');
   *
   * // Token with full metadata
   * const complexToken = new DesignToken(
   *   { r: 255, g: 0, b: 0 },
   *   'color',
   *   'Error state color',
   *   { category: 'semantic', usage: 'error-states' }
   * );
   *
   * // Reference token
   * const aliasToken = new DesignToken('{color.red.500}', 'color', 'Alias to red-500');
   * ```
   */
  constructor($value: any, $type: string, $description = '', $extensions: Record<string, any> | null = null) {
    this.$value = this.deepClone($value); // Deep clone for immutability
    this.$type = $type;
    this.$description = $description;
    this.$extensions = $extensions;
  }

  /**
   * Deep clones a value while preserving DesignToken instances for immutability.
   *
   * This method recursively clones objects and arrays to ensure that modifications
   * to the original value don't affect the token's stored value. DesignToken instances
   * are preserved as-is since they are already immutable.
   *
   * @param value - The value to clone (can be any type)
   * @returns A deep clone of the value with DesignToken instances preserved
   *
   * @private
   */
  private deepClone(value: any): any {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (value instanceof DesignToken) {
      return value; // DesignTokens are immutable, so we can return the same instance
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.deepClone(item));
    }

    const cloned: any = {};
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(value[key]);
      }
    }
    return cloned;
  }
}
