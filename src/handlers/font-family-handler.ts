import type { DesignToken } from '../core/design-token.js';
import type { TokenTypeHandler } from './handler.js';
import { fontFamilyNames, isFontFamilyList } from '../utils/font-family.js';

/**
 * A handler for `fontFamily` tokens, also the gate of a typography's `fontFamily` member.
 * A family is stored as a non-empty name, or a non-empty list of them.
 */
export const fontFamilyHandler: TokenTypeHandler = {
  validate: (token: DesignToken, path: string) => {
    fontFamilyHandler.normalize!(token.$value, path);
  },

  /**
   * A font family computed. A string with a comma outside quotes is a list (`"'Plex Sans', system-ui"` becomes
   * `['Plex Sans', 'system-ui']`); any other string is one name and must not be empty. A list must not be empty, and
   * a stack inside it, which a reference to a stack puts there (`['{font.base}', 'serif']`), is spread into it; then
   * every name must be a non-empty string.
   */
  normalize: (value: unknown, path: string): string | string[] => {
    if (typeof value === 'string') {
      if (value.trim() === '') throw new Error(`Token "${path}": fontFamily must not be an empty name.`);
      if (!isFontFamilyList(value)) return value;
      try {
        return fontFamilyNames(value);
      } catch (error) {
        throw new Error(`Token "${path}": ${(error as Error).message}`);
      }
    }
    if (!Array.isArray(value)) throw new Error(`Token "${path}": fontFamily must be a non-empty string or an array of them.`);
    if (value.length === 0) throw new Error(`Token "${path}": fontFamily must not be an empty array.`);
    const names: unknown[] = [];
    const spread = (entry: unknown) => (Array.isArray(entry) ? entry.forEach(spread) : names.push(entry));
    value.forEach(spread);
    names.forEach((name, index) => {
      if (typeof name !== 'string' || name.trim() === '') {
        throw new Error(`Token "${path}": fontFamily[${index}] must be a non-empty string.`);
      }
    });
    return names as string[];
  },
};
