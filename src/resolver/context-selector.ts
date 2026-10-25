/**
 * How a modifier's context appears in CSS, read from the modifier's
 * `$extensions["com.toghen"].css`:
 *
 * ```json
 * "$extensions": { "com.toghen": { "css": {
 *   "selector": "[data-density='{context}']",
 *   "contexts": { "dark": { "atRule": "@media (prefers-color-scheme: dark)" } }
 * } } }
 * ```
 *
 * `selector` and `atRule` are patterns, `{context}` replaced by the context's
 * name. An entry under `contexts` replaces the pattern whole for that context.
 * An `atRule` wraps the selector, or stands in for it, when the block then sits
 * under the stylesheet's root selector.
 */

import { ResolverValidationError } from './errors.js';

export interface ContextSelector {
  /** The selector a context's block is written under, e.g. `[data-density='compact']`. */
  selector?: string;
  /** An at-rule the block is wrapped in, e.g. `@media (prefers-color-scheme: dark)`. */
  atRule?: string;
}

/**
 * The CSS spelling of `context`, or `undefined` when the modifier gives none.
 *
 * @param modifier - A modifier from a resolver document, or one a collection
 *   records (`collection.getModifiers()`)
 * @throws {ResolverValidationError} When the extension's `selector` or `atRule` is not a string,
 *   or an `atRule` does not start with `@`
 */
export function getContextSelector(
  modifier: { name?: string; $extensions?: Record<string, any> },
  context: string,
): ContextSelector | undefined {
  const css = modifier.$extensions?.['com.toghen']?.css;
  if (!css) return undefined;

  const spelling = css.contexts?.[context] ?? css;
  const where = `The CSS selector of context '${context}'${modifier.name ? ` of modifier '${modifier.name}'` : ''}`;
  const fill = (key: 'selector' | 'atRule'): string | undefined => {
    const pattern = spelling[key];
    if (pattern === undefined) return undefined;
    if (typeof pattern !== 'string') throw new ResolverValidationError(`${where}: ${key} must be a string.`);
    return pattern.split('{context}').join(context);
  };

  const selector = fill('selector');
  const atRule = fill('atRule');
  if (atRule !== undefined && !atRule.startsWith('@'))
    throw new ResolverValidationError(`${where}: atRule must start with '@', got '${atRule}'.`);
  if (selector === undefined && atRule === undefined) return undefined;
  return {
    ...(selector !== undefined ? { selector } : {}),
    ...(atRule !== undefined ? { atRule } : {}),
  };
}
