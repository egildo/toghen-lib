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

export interface LightDark {
  /** The context that is the first argument of `light-dark()`. */
  light: string;
  /** The context that is the second. */
  dark: string;
}

/**
 * The pair a modifier is written with `light-dark()` from, read from
 * `$extensions["com.toghen"].css.lightDark`, or `undefined` when it has none.
 *
 * @param modifier - A modifier from a resolver document (its `contexts` an object), or one a
 *   collection records (its `contexts` an array of names)
 * @throws {ResolverValidationError} When `lightDark` is not an object with a string `light` and `dark`,
 *   the two are the same, either is not a context, the modifier has not exactly two contexts,
 *   or the same `css` also gives a `selector`, an `atRule` or `contexts`
 */
export function getLightDark(modifier: { name?: string; contexts?: unknown; $extensions?: Record<string, any> }): LightDark | undefined {
  const css = modifier.$extensions?.['com.toghen']?.css;
  if (!css || css.lightDark === undefined) return undefined;

  const where = `The CSS lightDark of modifier '${modifier.name ?? ''}'`;
  const pair = css.lightDark;
  if (typeof pair !== 'object' || pair === null || Array.isArray(pair))
    throw new ResolverValidationError(`${where} must be an object { light, dark }.`);
  for (const key of ['light', 'dark'])
    if (typeof pair[key] !== 'string') throw new ResolverValidationError(`${where}: ${key} must be a string.`);
  const { light, dark } = pair as LightDark;
  if (light === dark) throw new ResolverValidationError(`${where}: light and dark are both '${light}'.`);

  const contexts = Array.isArray(modifier.contexts) ? modifier.contexts : Object.keys(modifier.contexts ?? {});
  for (const key of ['light', 'dark'] as const)
    if (!contexts.includes(pair[key]))
      throw new ResolverValidationError(
        `${where}: ${key} names '${pair[key]}', which is not one of its contexts (${contexts.join(', ')}).`,
      );
  if (contexts.length !== 2) throw new ResolverValidationError(`${where} needs exactly two contexts, has ${contexts.length}.`);
  for (const key of ['selector', 'atRule', 'contexts'])
    if (css[key] !== undefined) throw new ResolverValidationError(`${where} cannot sit beside ${key}: one modifier, one spelling.`);
  return { light, dark };
}
