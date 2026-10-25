/// <reference lib="es2020.bigint" />
/**
 * Reads a resolver document whose sources live in other files, and returns one
 * self-contained document that `Resolver` accepts.
 *
 * Lib performs no I/O: the caller supplies `read`, so the same code runs in Node
 * (a wrapper over `readFile`), in a plugin with no filesystem (a lookup among
 * the files a person picked), and in a test (a `Map`).
 */

import { InvalidReferenceError } from './errors.js';
import { isReferenceObject, type ResolverDocument, type TokenSource } from './types.js';
import { resolveJsonPointer } from './resolver.js';

export interface LoadOptions {
  /** The text of the file at `location`. Rejects, or throws, when there is none. */
  read(location: string): Promise<string>;
  /** Token files only: the collection's name. Defaults to the base name of the folder that holds them. */
  name?: string;
  /**
   * A `$ref` as written → the location to read instead, resolved against the
   * document that holds the `$ref`. Keys match whole and exactly, fragment
   * included. Applied in every document `load` reads.
   */
  overrides?: Record<string, string>;
}

export interface LoadResult {
  /** The document with every reference to another file resolved: tokens inlined, sets and modifiers copied in. */
  document: ResolverDocument;
  /** For each token path, the files that define it, in document order. */
  origins: Map<string, string[]>;
  /**
   * Every reference whose resolution reads a file, in the order met: the `$ref`
   * as written, the document it is written in, the file read, and whether the
   * map sent it there. A same-document pointer the map leaves alone reads none.
   */
  reads: Array<{ ref: string; holder: string; location: string; overridden: boolean }>;
  /** Present only when a map was given: its hash, and the keys no reference matched, in the map's order. */
  overrides?: { hash: string; unused: string[] };
  /** Token paths that two sources of one set, or of one modifier context, both give a $value. */
  collisions: Collision[];
}

/**
 * One token path given a `$value` by two sources of one set, or of one modifier
 * context. The standard allows it, and the last source wins; the report is
 * advisory. Never reported across items of `resolutionOrder`, nor between a set
 * and a modifier context. Exactly one of `set`, or `modifier` with `context`, is present.
 */
export interface Collision {
  /** The token path, collection-relative, as in `origins`. */
  path: string;
  /** The set's key in `document.sets`, or an inline set's name. */
  set?: string;
  /** With `context`: the modifier and the context whose sources collide. */
  modifier?: string;
  context?: string;
  /** The file of each source that gives it a `$value`, in merge order; the last wins. A file may repeat. */
  files: string[];
  /** Every one of those `$value`s is equal as written: key order ignored, nothing resolved. */
  redundant: boolean;
}

/**
 * Loads the resolver document at `entry` and returns it with every reference to
 * another file resolved, so that `Resolver` sees same-document pointers only.
 *
 * `entry` takes three forms. A resolver document is recognised by its
 * `resolutionOrder`. Any other file is one token file, and a list is several:
 * they are wrapped in a resolver document with one set, `base`, whose sources
 * are the files in the order given (the last wins). The wrapper is held in
 * memory at `<folder>/<name>.resolver.json`, where the folder is the files'
 * common folder and the name is `options.name` or that folder's base name.
 *
 * A reference is a path relative to the file it is written in, optionally
 * followed by a JSON pointer fragment. What it names decides what happens:
 *
 * - **A token file**, or a group in one (`./color.tokens.json#/color`), is
 *   inlined as a source; a group's members land at the root of the merge.
 * - **A set or modifier of another resolver document**
 *   (`../shared.resolver.json#/sets/base`) is copied into this document and the
 *   reference rewritten to point at the copy. Its own references are followed
 *   the same way, relative to its own file. Copied sets are keyed by file and
 *   name, so they never clash; a modifier keeps its name, since that name is
 *   the input key (`{ theme: 'dark' }`), and two different modifiers with one
 *   name are an error. Another document's `resolutionOrder` is never read.
 *
 * `options.overrides` is the declarative form of `read`: before a reference is
 * resolved, its text as written is looked up in the map, and a match is read
 * from the map's value instead, resolved against the same document. The
 * wrapper's own references are written refs like any other.
 *
 * @throws {InvalidReferenceError} When a reference names a URI with a scheme, a
 *   file that cannot be read or parsed, a pointer that matches nothing, a whole
 *   resolver document, or a set or modifier that refers back to itself; and when
 *   an item of `resolutionOrder` names tokens rather than a set or modifier. The
 *   message names the reference, the file it was written in, and, when the map
 *   sent it elsewhere, the location read. Also when a list of token files is
 *   empty, or has no folder to take a name from and no `options.name`, and when
 *   a value of the map is not a string.
 */
export async function load(given: string | string[], { read, name, overrides }: LoadOptions): Promise<LoadResult> {
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (typeof value !== 'string') {
      throw new InvalidReferenceError(`the overrides map sends "${key}" to ${JSON.stringify(value)}; a value must be a location.`);
    }
  }
  const used = new Set<string>();
  const reads: LoadResult['reads'] = [];
  const files = new Map<string, Promise<unknown>>();
  const file = (location: string, where: string): Promise<unknown> => {
    if (!files.has(location)) files.set(location, readJson(location, read, where));
    return files.get(location)!;
  };

  let entry: string;
  if (typeof given === 'string' && isResolverDocument(await file(given, `the entry document "${given}"`))) {
    entry = given;
  } else {
    const wrapper = wrap(typeof given === 'string' ? [given] : given, name);
    entry = wrapper.location;
    files.set(entry, Promise.resolve(wrapper.document));
  }

  const root = (await file(entry, `the entry document "${entry}"`)) as ResolverDocument;
  const document: ResolverDocument = { ...root, sets: {}, modifiers: {} };
  const origins = new Map<string, string[]>();
  /** Each token source in `document` → the file it is written in, or was read from. */
  const sourceFile = new Map<object, string>();
  const copied = new Set<string>();
  const modifierFrom = new Map<string, string>();
  const stack: string[] = [];

  /** Copies a set or modifier of the resolver at `location` in, once, and returns the pointer to it. */
  const copy = async (location: string, kind: 'sets' | 'modifiers', name: string, where: string): Promise<string> => {
    const key = `${location}#/${kind}/${name}`;
    const local = location === entry || kind === 'modifiers' ? name : `${location}#${name}`;
    const pointer = `#/${kind}/${local.replace(/~/g, '~0').replace(/\//g, '~1')}`;
    if (copied.has(key)) return pointer;
    if (stack.includes(key)) {
      throw new InvalidReferenceError(`${where} closes a cycle: ${[...stack, key].join(' → ')}.`);
    }
    if (kind === 'modifiers' && modifierFrom.has(name)) {
      throw new InvalidReferenceError(
        `${where}: modifier "${name}" is defined in both ${modifierFrom.get(name)} and ${key}; a modifier's name is its input key, so it must be one modifier.`,
      );
    }

    const item = ((await file(location, where)) as Record<string, any>)[kind]?.[name];
    if (item === undefined) throw new InvalidReferenceError(`${where}: "${location}" has no ${kind.slice(0, -1)} "${name}".`);

    stack.push(key);
    if (kind === 'sets') {
      document.sets![local] = { ...item, sources: await inline(item.sources ?? [], location) };
    } else {
      const contexts: Record<string, TokenSource[]> = {};
      for (const [context, sources] of Object.entries(item.contexts ?? {})) {
        contexts[context] = await inline(sources as TokenSource[], location);
      }
      document.modifiers![local] = { ...item, contexts };
      modifierFrom.set(name, key);
    }
    stack.pop();
    copied.add(key);
    return pointer;
  };

  /** A reference written in `at`: a pointer into this document, or the tokens it names. `inOrder`: an item of `resolutionOrder`. */
  const follow = async (source: { $ref: string }, at: string, inOrder = false): Promise<TokenSource> => {
    const { $ref, ...siblings } = source as { $ref: string; [key: string]: unknown };
    const mapped = overrides && Object.prototype.hasOwnProperty.call(overrides, $ref) ? overrides[$ref] : undefined;
    if (mapped !== undefined) used.add($ref);
    const ref = mapped ?? $ref;
    const written = `$ref "${$ref}" in "${at}"`;
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
      const where = mapped === undefined ? written : `${written} (mapped to "${mapped}")`;
      throw new InvalidReferenceError(`${where} names a URI; only relative and absolute file paths are followed.`);
    }

    const [path, fragment = ''] = ref.split('#');
    const location = path === '' ? at : joinLocation(at, path);
    const where = mapped === undefined ? written : `${written} (mapped to "${location}")`;
    if (mapped !== undefined || !$ref.startsWith('#')) reads.push({ ref: $ref, holder: at, location, overridden: mapped !== undefined });
    const target = await file(location, where);
    const named = /^\/(sets|modifiers)\/([^/]+)$/.exec(fragment);

    if (isResolverDocument(target)) {
      if (!named) {
        // The entry's own odd pointers are Resolver's to judge.
        if (location === entry && fragment) return { ...siblings, $ref: `#${fragment}` };
        throw new InvalidReferenceError(`${where} names a resolver document; point at one of its sets or modifiers.`);
      }
      const name = named[2].replace(/~1/g, '/').replace(/~0/g, '~');
      const pointer = await copy(location, named[1] as 'sets' | 'modifiers', name, where);
      return { ...siblings, $ref: pointer };
    }
    if (inOrder) {
      throw new InvalidReferenceError(
        `${where} is an item of resolutionOrder and names tokens in "${location}"; it must name a set or a modifier.`,
      );
    }

    const tokens = fragment ? resolveJsonPointer(target as Record<string, unknown>, `#${fragment}`) : target;
    if (tokens === null || typeof tokens !== 'object' || Array.isArray(tokens)) {
      throw new InvalidReferenceError(`${where} points to no group of tokens in "${location}".`);
    }
    // A fragment's members land at the root of the merge, as a set's do.
    recordOrigins(tokens as Record<string, unknown>, location, origins);
    const inlined = { ...(tokens as Record<string, unknown>), ...siblings };
    sourceFile.set(inlined, location);
    return inlined;
  };

  // One at a time: the cycle check reads a stack.
  const inline = async (sources: TokenSource[], at: string): Promise<TokenSource[]> => {
    const out: TokenSource[] = [];
    for (const source of sources) {
      if (isReferenceObject(source)) {
        out.push(await follow(source, at));
      } else {
        recordOrigins(source, at, origins);
        sourceFile.set(source, at);
        out.push(source);
      }
    }
    return out;
  };

  for (const name of Object.keys(root.sets ?? {})) await copy(entry, 'sets', name, `set "${name}" in "${entry}"`);
  for (const name of Object.keys(root.modifiers ?? {})) await copy(entry, 'modifiers', name, `modifier "${name}" in "${entry}"`);

  const order: ResolverDocument['resolutionOrder'] = [];
  for (const item of root.resolutionOrder ?? []) {
    if (isReferenceObject(item)) {
      order.push((await follow(item, entry, true)) as typeof item);
    } else if ('contexts' in item && item.contexts) {
      const contexts: Record<string, TokenSource[]> = {};
      for (const [context, sources] of Object.entries(item.contexts)) contexts[context] = await inline(sources as TokenSource[], entry);
      order.push({ ...item, contexts } as typeof item);
    } else {
      order.push({ ...item, sources: await inline((item as { sources?: TokenSource[] }).sources ?? [], entry) } as typeof item);
    }
  }
  document.resolutionOrder = order;

  const collisions: Collision[] = [];
  /** Reports the paths two of `sources` give a `$value`; a pointer to a set counts as that set's sources, in place. */
  const collide = (sources: TokenSource[] | undefined, scope: Pick<Collision, 'set' | 'modifier' | 'context'>): void => {
    const defined = new Map<string, Array<{ file: string; value: string }>>();
    const walk = (sources: TokenSource[] | undefined): void => {
      for (const source of sources ?? []) {
        if (isReferenceObject(source)) {
          // ponytail: sibling keys on a pointer to a set are left out, as rare as they are odd.
          if (/^#\/sets\/[^/]+$/.test(source.$ref)) walk(resolveJsonPointer(document as Record<string, any>, source.$ref)?.sources);
          continue;
        }
        eachToken(source, [], (path, token) => {
          const at = defined.get(path) ?? defined.set(path, []).get(path)!;
          at.push({ file: sourceFile.get(source)!, value: asWritten(token.$value) });
        });
      }
    };
    walk(sources);
    for (const [path, at] of defined) {
      if (at.length < 2) continue;
      collisions.push({ path, ...scope, files: at.map((one) => one.file), redundant: at.every((one) => one.value === at[0].value) });
    }
  };
  // The entry's sets in the order written; a set it refers to may have been copied in first.
  for (const key of new Set([...Object.keys(root.sets ?? {}), ...Object.keys(document.sets!)]))
    collide(document.sets![key].sources, { set: key });
  for (const [modifier, item] of Object.entries(document.modifiers!)) {
    for (const [context, sources] of Object.entries(item.contexts ?? {})) collide(sources, { modifier, context });
  }
  for (const item of order) {
    if (isReferenceObject(item)) continue;
    if ('contexts' in item && item.contexts) {
      for (const [context, sources] of Object.entries(item.contexts)) collide(sources, { modifier: item.name, context });
    } else {
      collide((item as { sources?: TokenSource[] }).sources, { set: item.name });
    }
  }

  if (overrides === undefined) return { document, origins, reads, collisions };
  const keys = Object.keys(overrides);
  const sorted: Record<string, string> = {};
  for (const key of [...keys].sort()) sorted[key] = overrides[key];
  return {
    document,
    origins,
    reads,
    overrides: { hash: fnv1a64(JSON.stringify(sorted)), unused: keys.filter((key) => !used.has(key)) },
    collisions,
  };
}

/** A `$value` as written, as one string: its JSON with every object's keys sorted. */
function asWritten(value: unknown): string {
  return JSON.stringify(value, (_, member) =>
    member !== null && typeof member === 'object' && !Array.isArray(member)
      ? Object.fromEntries(
          Object.keys(member)
            .sort()
            .map((key) => [key, member[key]]),
        )
      : member,
  );
}

/**
 * FNV-1a, 64 bits, over the UTF-8 of `text`, as 16 lowercase hex digits. The
 * map's hash: one number a consumer compares to tell a changed map from changed
 * tokens. Not a security hash.
 */
function fnv1a64(text: string): string {
  const prime = BigInt('0x100000001b3');
  const mask = BigInt('0xffffffffffffffff');
  let hash = BigInt('0xcbf29ce484222325');
  for (const char of text) {
    const c = char.codePointAt(0)!;
    const bytes =
      c < 0x80
        ? [c]
        : c < 0x800
          ? [0xc0 | (c >> 6), 0x80 | (c & 63)]
          : c < 0x10000
            ? [0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)]
            : [0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)];
    for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * A resolver document with one set whose sources are `tokenFiles`, and the
 * location it is held at: in their common folder, named for it or for `name`.
 */
function wrap(tokenFiles: string[], name: string | undefined): { location: string; document: ResolverDocument } {
  if (tokenFiles.length === 0) throw new InvalidReferenceError('load was given an empty list of token files.');
  const paths = tokenFiles.map((file) => joinLocation('', file).split('/'));
  const folder: string[] = paths[0].slice(0, -1);
  for (const path of paths) {
    let i = 0;
    while (i < folder.length && i < path.length - 1 && folder[i] === path[i]) i++;
    folder.length = i;
  }
  const base = folder[folder.length - 1];
  const collection = name ?? (base && base !== '..' ? base : undefined);
  if (collection === undefined) {
    throw new InvalidReferenceError(
      `the token files ${tokenFiles.map((file) => `"${file}"`).join(', ')} share no folder to take a name from; give options.name.`,
    );
  }
  return {
    location: [...folder, `${collection}.resolver.json`].join('/'),
    document: {
      version: '2025-11-01',
      name: collection,
      sets: { base: { sources: paths.map((path) => ({ $ref: path.slice(folder.length).join('/') })) } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as ResolverDocument,
  };
}

/** The spec requires `resolutionOrder`; a token file has no reason to carry one. */
function isResolverDocument(value: unknown): boolean {
  return value !== null && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).resolutionOrder);
}

async function readJson(location: string, read: LoadOptions['read'], where: string): Promise<unknown> {
  let text: string;
  try {
    text = await read(location);
  } catch (error) {
    throw new InvalidReferenceError(`${where}: "${location}" could not be read. ${(error as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new InvalidReferenceError(`${where}: "${location}" is not JSON. ${(error as Error).message}`);
  }
}

/**
 * `ref` resolved against the directory of `from`, with `.` and `..` folded so
 * the same file always has the same location. Paths use `/`.
 *
 * @internal
 */
export function joinLocation(from: string, ref: string): string {
  const path = ref.startsWith('/') ? ref : from.slice(0, from.lastIndexOf('/') + 1) + ref;
  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '.') continue;
    const last = out[out.length - 1];
    if (segment === '..' && last !== undefined && last !== '..' && last !== '') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
}

function recordOrigins(group: Record<string, unknown>, file: string, origins: Map<string, string[]>): void {
  eachToken(group, [], (path) => origins.set(path, [...(origins.get(path) ?? []), file]));
}

/** Calls `visit` for each token under `group`, a leaf with a `$value`, with its dotted path. */
function eachToken(group: Record<string, unknown>, path: string[], visit: (path: string, token: Record<string, unknown>) => void): void {
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$') || value === null || typeof value !== 'object') continue;
    const at = [...path, key];
    if ('$value' in value) visit(at.join('.'), value as Record<string, unknown>);
    else eachToken(value as Record<string, unknown>, at, visit);
  }
}
