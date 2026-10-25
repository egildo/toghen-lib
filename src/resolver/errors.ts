/**
 * Error types for the W3C Design Tokens Resolver Module.
 *
 * These are distinct from the core `design-token.ts` errors so callers can
 * `instanceof`-check and handle resolver-specific failures separately.
 */

/**
 * Thrown when the structure of a resolver document violates the W3C
 * Resolver specification.
 *
 * Common causes:
 * - `version` field is missing or not `"2025-11-01"`
 * - An inline `resolutionOrder` item is missing its `name` or `type` field
 * - Duplicate `name` values within `resolutionOrder`
 * - A modifier's `default` value does not match any of its context keys
 * - A modifier declares zero contexts
 * - A modifier's CSS spelling (`getContextSelector`) is not a string, or its
 *   `atRule` does not start with `@`
 *
 * @example
 * ```typescript
 * try {
 *   new Resolver(doc);
 * } catch (e) {
 *   if (e instanceof ResolverValidationError) {
 *     console.error('Resolver document is invalid:', e.message);
 *   }
 * }
 * ```
 */
export class ResolverValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolverValidationError';
  }
}

/**
 * Thrown when the input object passed to {@link Resolver.resolve} is invalid.
 *
 * Common causes:
 * - An input key does not correspond to any declared modifier
 * - An input value is not a string (e.g. a boolean or number)
 * - An input value is not one of the modifier's allowed context names
 * - A required modifier (no `default`) has no matching key in the input
 *
 * @example
 * ```typescript
 * try {
 *   resolver.resolve({ theme: 'unknown-mode' });
 * } catch (e) {
 *   if (e instanceof InvalidInputError) {
 *     console.error('Bad resolver input:', e.message);
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

/**
 * Thrown when a `$ref` pointer inside a resolver document is invalid or
 * points to a location that the specification explicitly forbids.
 *
 * Common causes:
 * - A pointer resolves to nothing within the document
 * - A pointer targets `#/resolutionOrder/…` (forbidden by spec)
 * - A modifier context references another modifier (forbidden by spec)
 * - A `$ref` within `resolutionOrder` points to an inline item (forbidden)
 * - An unsupported external URI scheme is used (e.g. `http://…` or a file path)
 *
 * @example
 * ```typescript
 * try {
 *   resolver.resolve(input);
 * } catch (e) {
 *   if (e instanceof InvalidReferenceError) {
 *     console.error('Bad $ref in resolver document:', e.message);
 *   }
 * }
 * ```
 */
export class InvalidReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReferenceError';
  }
}
