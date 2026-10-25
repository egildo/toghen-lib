/**
 * Token reference grammar — the single source of truth for what a reference
 * looks like and how its path is spelled.
 *
 * This module is deliberately pure: no imports, no lookups, no resolution. It
 * answers only "is this text a reference, and what path does it name?", so both
 * `DesignToken` (which reports references without resolving them) and the
 * resolution engine can share one definition. Before it existed, four call
 * sites each had their own predicate and they disagreed with each other about
 * embedded references.
 *
 * ### Reference syntax
 *
 * A reference is a dot-separated path wrapped in curly braces — `{color.blue}`.
 * The path is relative to the **document root**, per the W3C Design Tokens
 * format (§7.4.6): a token at the top level is simply `{primary}`, and no
 * prefix or namespace is ever part of the path.
 *
 * Braces do not nest, and `{`/`}`/`.` may not appear inside a name (§5.1.1), so
 * the grammar is unambiguous. Whitespace *is* legal inside a name — §7.4.6
 * gives `{brand colors.primary}` as valid — which is why nothing here trims.
 *
 * ### Literal braces
 *
 * A Toghen extension (W3C defines no escape): in any string, `{{` is the text
 * `{` and `}}` the text `}`. So `'{{size.sm}}'` is the text `{size.sm}` and holds
 * no reference, while `'{{{size.sm}}}'` is a brace, the value of `size.sm`, and
 * a brace. The string is read left to right; a reference is a `{path}` whose
 * braces are not part of an escape. A lone brace that is neither stays text, as
 * does `{}`.
 *
 * @since 1.0.0
 */

/**
 * Matches, left to right, an escape (`{{` or `}}`) or a reference, capturing a
 * reference's inner path. Escapes come first, so `{{a}}` is two escapes and no
 * reference.
 *
 * `[^{}]+` requires at least one character, so `{}` is not a reference — it is
 * ordinary text that happens to contain braces.
 */
const TOKEN = /\{\{|\}\}|\{([^{}]+)\}/;

/** Matches a value that is *entirely* one reference, with nothing around it. A doubled brace never matches. */
const WHOLE_REFERENCE = /^\{[^{}]+\}$/;

/**
 * Returns a fresh global scanner for walking a string's escapes and references.
 *
 * Always a new instance, never a shared module-level constant: a `/g` regex
 * carries `lastIndex` between calls, and the resolution engine is recursive, so
 * a shared scanner would be silently corrupted by a nested scan mid-iteration.
 *
 * @returns A new global `RegExp`; capture group 1 is a reference's path, and is
 *   `undefined` when the match is an escape (`{{` or `}}`)
 */
export function referenceScanner(): RegExp {
  return new RegExp(TOKEN.source, 'g');
}

/**
 * A string's text with its escapes removed: `{{` becomes `{` and `}}` becomes
 * `}`. References are left as written. For a raw string read outside
 * resolution; a resolved value has its escapes removed already.
 *
 * @example
 * ```typescript
 * literalText('{{size.sm}}');     // '{size.sm}'
 * literalText('{{{size.sm}}}');   // '{{size.sm}}': the reference stays, its escapes go
 * literalText('x {{ y');          // 'x { y'
 * literalText('{}');              // '{}'
 * ```
 */
export function literalText(value: string): string {
  return value.replace(referenceScanner(), (match, path) => (path === undefined ? match[0] : match));
}

/**
 * Checks whether a value is a string containing at least one reference.
 *
 * True for both a whole-value reference and a reference embedded in a larger
 * string (partial interpolation — a Toghen extension beyond the W3C format).
 *
 * @param value - Any value; non-strings are never references
 * @returns True if the value contains at least one well-formed reference
 *
 * @example
 * ```typescript
 * containsReference('{color.blue}');          // true
 * containsReference('0 2px 4px {color.ink}'); // true
 * containsReference('#ff0000');               // false
 * containsReference('{}');                    // false — no path between the braces
 * containsReference('{{color.blue}}');        // false — the braces are escapes
 * ```
 */
export function containsReference(value: unknown): boolean {
  return extractReferencePaths(value).length > 0;
}

/**
 * Checks whether a value holds a reference anywhere: a `{path}` in any string,
 * or a `$ref` object, at any depth. Such a value cannot be checked against its
 * type until it resolves.
 *
 * @example
 * ```typescript
 * holdsReference({ color: '{color.ink}', offsetX: { value: 0, unit: 'px' } }); // true
 * holdsReference({ colorSpace: 'srgb', components: [0, 0, 0] });            // false
 * ```
 */
export function holdsReference(value: unknown): boolean {
  if (typeof value === 'string') return containsReference(value);
  if (Array.isArray(value)) return value.some(holdsReference);
  if (value !== null && typeof value === 'object') {
    return '$ref' in value || Object.values(value).some(holdsReference);
  }
  return false;
}

/**
 * Checks whether a value is exactly one reference and nothing else.
 *
 * This is the distinction that decides how a value resolves: a whole-value
 * reference takes on the target's value with its type intact (object, array,
 * number), while an embedded one is interpolated into the surrounding string
 * and therefore must resolve to a scalar.
 *
 * @param value - Any value; non-strings are never references
 * @returns True if the entire value is a single reference
 *
 * @example
 * ```typescript
 * isWholeReference('{color.blue}');          // true
 * isWholeReference(' {color.blue}');         // false — text around the reference
 * isWholeReference('0 2px 4px {color.ink}'); // false
 * isWholeReference('{{color.blue}}');        // false — the text `{color.blue}`
 * ```
 */
export function isWholeReference(value: unknown): boolean {
  return typeof value === 'string' && WHOLE_REFERENCE.test(value);
}

/**
 * The path a value names when it is exactly one reference and nothing else, without the braces; otherwise
 * `undefined`. The path is as written and not checked: `parseReferencePath` checks it.
 *
 * @example
 * ```typescript
 * referenceTarget('{color.blue}');          // 'color.blue'
 * referenceTarget('0 2px 4px {color.ink}'); // undefined: an embedded reference is part of a string
 * referenceTarget({ value: 4, unit: 'px' }); // undefined
 * ```
 */
export function referenceTarget(value: unknown): string | undefined {
  return isWholeReference(value) ? (value as string).slice(1, -1) : undefined;
}

/**
 * Extracts the path of every reference in a value, in order of appearance.
 *
 * Paths are returned exactly as written, without the braces and without any
 * validation — this reports what a value *mentions*, which is useful for
 * dependency analysis even when a path turns out not to resolve. Escaped
 * braces (`{{`, `}}`) mention nothing.
 *
 * @param value - Any value; non-strings yield an empty array
 * @returns The referenced paths, in order, possibly with duplicates
 *
 * @example
 * ```typescript
 * extractReferencePaths('{color.blue}');
 * // ['color.blue']
 *
 * extractReferencePaths('linear-gradient({color.start}, {color.end})');
 * // ['color.start', 'color.end']
 *
 * extractReferencePaths('{{{color.blue}}}');
 * // ['color.blue'] — a brace, the reference, a brace
 * ```
 */
export function extractReferencePaths(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  return [...value.matchAll(referenceScanner())].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
}

/**
 * Splits a reference path into segments, rejecting shapes that can never name
 * a token.
 *
 * Catching these here turns a baffling "no token at that path" into a precise
 * "that path is malformed". Rejected: empty segments (`{a..b}`, `{.}`) and
 * segments beginning with `$`, which `Collection.setToken()` refuses and the
 * W3C format reserves (§5.1.1).
 *
 * Whitespace is *not* trimmed — a space is a legal character inside a name.
 *
 * @param path - The inner text of a reference, without braces
 * @returns The path segments
 *
 * @throws {Error} When the path contains an empty or `$`-prefixed segment
 */
export function parseReferencePath(path: string): string[] {
  const segments = path.split('.');

  for (const segment of segments) {
    if (segment === '') {
      throw new Error(`empty path segment in "${path}"`);
    }
    if (segment.startsWith('$')) {
      throw new Error(`path segment "${segment}" starts with "$", which is reserved`);
    }
  }

  return segments;
}
