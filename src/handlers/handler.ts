import type { DesignToken } from '../core/design-token.js';

/**
 * What the core knows about one token type: how to check a value of it, and its canonical form.
 * The built-in handlers are the core's own. They are not exported: the core runs them when a token is stored.
 */
export interface TokenTypeHandler {
  /** Throws when the token is not a valid value of the type. */
  validate?(token: DesignToken, path: string): void;

  /**
   * The canonical form of a value of this type, or an error naming `path`, so every token is stored in the one
   * shape adapters read, whichever way it was written (`'#ff0000'` becomes a structured colour). Never called on a
   * value that holds a reference.
   */
  normalize?(value: unknown, path: string): unknown;

  /** Helpers of the type, used by the handler's own code and tests. */
  [methodName: string]: ((...args: any[]) => any) | undefined;
}
