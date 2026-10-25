import { DesignToken, InvalidTokenError } from '../core/design-token.js';
import type { TokenTypeHandler } from './handler.js';
import { holdsReference } from '../core/alias-syntax.js';
import { borderHandler } from './border-handler.js';
import { colorHandler } from './color-handler.js';
import { fontWeightHandler } from './font-weight-handler.js';
import { dimensionHandler } from './dimension-handler.js';
import { letterSpacingHandler } from './letter-spacing-handler.js';
import { gradientHandler } from './gradient-handler.js';
import { shadowHandler } from './shadow-handler.js';
import { typographyHandler } from './typography-handler.js';
import { fontFamilyNames, isFontFamilyList } from '../utils/font-family.js';

/**
 * The types whose shape lib owns: the W3C ones, and `letterSpacing`, a Toghen extension. They are checked on every path a token
 * enters by, whether or not a system registered a handler for them.
 */
const builtIn: Record<string, TokenTypeHandler> = {
  border: borderHandler,
  color: colorHandler,
  dimension: dimensionHandler,
  fontWeight: fontWeightHandler,
  gradient: gradientHandler,
  letterSpacing: letterSpacingHandler,
  shadow: shadowHandler,
  typography: typographyHandler,
};

/**
 * A token's value in the shape lib stores, or an `InvalidTokenError` naming `path`. A value
 * holding a reference is returned as written: it has no shape until it resolves.
 *
 * Every token goes through it on load. It is exported for an adapter that
 * holds a raw step value from `Resolver.step()`, written as the document
 * writes it, and needs it in the stored shape.
 *
 * @param type - The token's `$type`; a type lib does not own is returned as is
 * @param value - The value as the document writes it
 * @param path - The token's path, for the error message
 */
export function normalizeTokenValue(type: string, value: unknown, path: string): unknown {
  return holdsReference(value) ? value : computeTokenValue(type, value, path);
}

/**
 * A value's computed form for its type, or an `InvalidTokenError` naming `path`: `normalizeTokenValue`
 * without the reference test. The read gate runs it on a resolved value, which holds no reference by
 * definition, so a literal brace left in one does not let it pass unchecked.
 *
 * @internal
 */
export function computeTokenValue(type: string, value: unknown, path: string): unknown {
  if (type === 'fontFamily' && typeof value === 'string' && isFontFamilyList(value)) {
    try {
      return fontFamilyNames(value);
    } catch (e) {
      throw new InvalidTokenError(`Token "${path}": ${(e as Error).message}`);
    }
  }
  const handler = builtIn[type];
  if (!handler) return value;
  // The handlers throw plain errors that already name the token; the class says it is the token that is wrong.
  try {
    if (handler.normalize) return handler.normalize(value, path);
    handler.validate?.(new DesignToken(value, type), path);
  } catch (e) {
    throw new InvalidTokenError((e as Error).message);
  }
  return value;
}
