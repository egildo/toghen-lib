/**
 * Tests write tokens into a system by hand: into the named collection, as `Collection.setToken` stores them.
 */
import { DesignToken, type DesignSystem } from '../src/index.js';

export interface TokenData {
  $value: any;
  $type?: string;
  $description?: string;
  $extensions?: Record<string, any>;
}

export function put(system: DesignSystem, collection: string, path: string, data: TokenData): void {
  const target = system.getCollection(collection);
  if (!target) throw new Error(`No collection '${collection}' in the test's system.`);
  target.setToken(path, new DesignToken(data.$value, data.$type ?? '', data.$description, data.$extensions ?? null));
}
