/**
 * TypeScript interfaces for the W3C Design Tokens Resolver Module 2025.10.
 *
 * These types mirror the structure of a `.resolver.json` document as defined
 * in the W3C Design Tokens Community Group specification.
 *
 * @see https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/
 */

// ---------------------------------------------------------------------------
// Reference Objects
// ---------------------------------------------------------------------------

/**
 * A JSON Pointer reference object as described in JSON Schema 2020-12 §$ref.
 * The `$ref` value must be a valid JSON Pointer (RFC 6901).
 *
 * Other keys MAY exist alongside `$ref`; those keys are treated as shallow
 * overrides on top of the referenced value.
 *
 * @example
 * // Same-document reference to a named set
 * { "$ref": "#/sets/foundation" }
 *
 * // Same-document reference with an override
 * { "$ref": "#/sets/foundation", "description": "overridden description" }
 */
export interface ReferenceObject {
  $ref: string;
  [key: string]: any;
}

/**
 * Checks whether an arbitrary value is a {@link ReferenceObject}.
 */
export function isReferenceObject(value: unknown): value is ReferenceObject {
  return typeof value === 'object' && value !== null && '$ref' in value;
}

// ---------------------------------------------------------------------------
// Token Sources
// ---------------------------------------------------------------------------

/**
 * A single source of tokens inside a set or modifier context.
 * Can be:
 *  - A {@link ReferenceObject} pointing to a JSON file or an in-document path.
 *  - An inline DTCG-format token object (plain Record<string,any>).
 */
export type TokenSource = ReferenceObject | Record<string, any>;

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------

/**
 * A named collection of design tokens.
 *
 * A set MUST contain a `sources` array whose items are either inline DTCG
 * token objects or {@link ReferenceObject}s pointing to such objects.
 * When multiple sources declare the same token, the last declaration wins.
 */
export interface ResolverSet {
  /**
   * Ordered list of token sources. Later entries override earlier ones on
   * conflict.
   */
  sources: TokenSource[];
  /** Human-readable description of this set's purpose. */
  description?: string;
  /** Vendor-specific metadata. Keys must be vendor-namespaced. */
  $extensions?: Record<string, any>;
}

/**
 * A set declared inline inside the `resolutionOrder` array.
 * Inline sets must add `name` and `type: "set"` to the set structure.
 * They MUST NOT be referenced by any `$ref`.
 */
export interface InlineSet extends ResolverSet {
  /** Unique name within the `resolutionOrder`. */
  name: string;
  /** Must be `"set"`. */
  type: 'set';
}

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

/**
 * A map from context-name to an ordered list of token sources.
 * Each context represents one possible value for the modifier
 * (e.g. `"light"`, `"dark"` for a `theme` modifier).
 */
export type ModifierContexts = Record<string, TokenSource[]>;

/**
 * A named group of contexts that allows conditional token inclusion.
 *
 * A modifier MUST declare at least one context (0 contexts → error).
 * Having exactly one context is allowed but discouraged (equivalent to a set).
 *
 * A modifier MAY reference a named {@link ResolverSet} inside a context, but
 * MUST NOT reference another modifier.
 */
export interface ResolverModifier {
  /**
   * Map of context-name → ordered token sources.
   * Must contain at least one entry.
   */
  contexts: ModifierContexts;
  /**
   * The context name to use when no explicit input is provided.
   * If set, the value MUST exist as a key in `contexts`.
   */
  default?: string;
  /** Human-readable description. */
  description?: string;
  /** Vendor-specific metadata. */
  $extensions?: Record<string, any>;
}

/**
 * A modifier declared inline inside the `resolutionOrder` array.
 * Inline modifiers must add `name` and `type: "modifier"` to the structure.
 * They MUST NOT be referenced by any `$ref`.
 */
export interface InlineModifier extends ResolverModifier {
  /** Unique name within `resolutionOrder`. */
  name: string;
  /** Must be `"modifier"`. */
  type: 'modifier';
}

// ---------------------------------------------------------------------------
// Resolution Order
// ---------------------------------------------------------------------------

/**
 * A single item in the `resolutionOrder` array.
 *
 * Items are either:
 *  - A {@link ReferenceObject} pointing to a named set or modifier
 *    defined in the top-level `sets` / `modifiers` maps.
 *  - An {@link InlineSet} or {@link InlineModifier} declared directly.
 */
export type ResolutionOrderItem = ReferenceObject | InlineSet | InlineModifier;

// ---------------------------------------------------------------------------
// Resolver Document
// ---------------------------------------------------------------------------

/**
 * The root-level structure of a `.resolver.json` document.
 *
 * Only `version` and `resolutionOrder` are required; all other top-level
 * properties are optional.
 *
 * The `version` value MUST be `"2025-11-01"`.
 *
 * A source may name a file (`./foundation.tokens.json`) or a set of another
 * resolver document (`./shared.resolver.json#/sets/base`); `load()` resolves
 * both before the document reaches `Resolver`, which follows `#/…` pointers only.
 *
 * @example
 * ```json
 * {
 *   "version": "2025-11-01",
 *   "name": "My Design System",
 *   "sets": {
 *     "foundation": { "sources": [{ "$ref": "./foundation.tokens.json" }] }
 *   },
 *   "modifiers": {
 *     "theme": {
 *       "contexts": {
 *         "light": [{ "$ref": "#/sets/foundation" }],
 *         "dark":  [{ "$ref": "./dark.tokens.json"  }]
 *       },
 *       "default": "light"
 *     }
 *   },
 *   "resolutionOrder": [
 *     { "$ref": "#/sets/foundation" },
 *     { "$ref": "#/modifiers/theme" }
 *   ]
 * }
 * ```
 */
export interface ResolverDocument {
  /**
   * Version identifier. MUST be `"2025-11-01"`.
   */
  version: string;
  /** Short human-readable name for this document. */
  name?: string;
  /** Additional human-readable context. */
  description?: string;
  /** Named set definitions. */
  sets?: Record<string, ResolverSet>;
  /** Named modifier definitions. */
  modifiers?: Record<string, ResolverModifier>;
  /**
   * Ordered list of sets and modifiers to merge.
   * Later items override earlier ones on conflict. REQUIRED.
   */
  resolutionOrder: ResolutionOrderItem[];
  /**
   * Optional JSON Schema `$defs` structure. Tools MAY support this for
   * defining reusable structures. Tools MUST NOT throw on encountering it
   * and MUST ignore it if unsupported.
   */
  $defs?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * The input provided by a consumer to drive context-selection for every
 * modifier in the resolver document.
 *
 * Keys are modifier names (case-insensitive per spec SHOULD).
 * Values MUST be strings (non-string values → error).
 *
 * @example
 * { "theme": "dark", "size": "mobile" }
 */
export type ResolverInput = Record<string, string>;
