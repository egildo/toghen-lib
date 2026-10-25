/**
 * The running example of the docs, asked what its parts are, and the answers kept as golden files.
 *
 * The example lives in `example/` (read here by `load()`); the answers under
 * `test/example-output/`, one file per snippet. `UPDATE_EXAMPLE=1 pnpm test` rewrites them; read the diff.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load, Resolver } from '../../src/index.js';

const EXAMPLE = fileURLToPath(new URL('../../example/ds.resolver.json', import.meta.url));
const OUTPUT = fileURLToPath(new URL('../example-output/', import.meta.url));
const UPDATE = process.env.UPDATE_EXAMPLE === '1';

const written = new Set<string>();
function golden(name: string, text: string): void {
  written.add(name);
  const body = `${text.replace(/\s+$/, '')}\n`;
  if (UPDATE) {
    mkdirSync(OUTPUT, { recursive: true });
    writeFileSync(`${OUTPUT}${name}`, body);
    return;
  }
  assert.ok(existsSync(`${OUTPUT}${name}`), `${name} does not exist; run with UPDATE_EXAMPLE=1`);
  assert.equal(readFileSync(`${OUTPUT}${name}`, 'utf8'), body, `${name} differs from what the library answers now`);
}
const json = (value: unknown) => JSON.stringify(value, null, 2);

async function collection() {
  const { document } = await load(EXAMPLE, { read: (path) => readFile(path, 'utf8') });
  return new Resolver(document).resolveContextsToDesignSystem().getCollection('ds')!;
}

describe('the running example, asked what its parts are', () => {
  after(() => {
    const stray = readdirSync(OUTPUT).filter((file) => !written.has(file));
    if (UPDATE) for (const file of stray) rmSync(`${OUTPUT}${file}`);
    else assert.deepEqual(stray, [], 'files in example-output/ that no test writes any more');
  });

  it('vocabularyAt: the root holds the vocabulary; a group reads it, and the field overrides one entry', async () => {
    const ds = await collection();
    golden('vocabulary-at-root.json', json(ds.vocabularyAt('')));
    golden('vocabulary-at-button.json', json(ds.vocabularyAt('button')));
    golden('vocabulary-at-field.json', json(ds.vocabularyAt('field')));
    assert.deepEqual(Object.keys(ds.vocabularyAt('button')), ['variant', 'state', 'selection']);
    assert.deepEqual(ds.vocabularyAt('button'), ds.vocabularyAt(''));
    // the field replaces `disabled` and keeps the rest, in the order the root gave
    assert.deepEqual(Object.keys(ds.vocabularyAt('field')), ['variant', 'state', 'selection']);
    assert.equal(ds.vocabularyAt('field').state.disabled, ':has(> input:disabled)');
    assert.equal(ds.vocabularyAt('field').state.hover, ':hover');
  });

  it('partsOf: the parts a path passes through and the path at rest', async () => {
    const ds = await collection();
    golden('parts-of-selected-hover.json', json(ds.partsOf('button.selected.hover.backgroundColor')));
    golden('parts-of-primary.json', json(ds.partsOf('button.primary.backgroundColor')));
    golden('parts-of-icon.json', json(ds.partsOf('button.icon.color')));
    golden('parts-of-field-disabled.json', json(ds.partsOf('field.disabled.opacity')));
    assert.equal(ds.partsOf('button.selected.hover.backgroundColor').rest, 'button.backgroundColor');
    assert.deepEqual(ds.partsOf('button.icon.color').parts, [], 'a child group is no part');
    assert.equal(ds.getToken(ds.partsOf('button.hover.backgroundColor').rest) !== null, true, 'the twin at rest is a token');
  });

  it('partsOf: two values of one axis nested are refused, in these words', async () => {
    const ds = await collection();
    let message = '';
    try {
      ds.partsOf('button.hover.pressed.backgroundColor');
    } catch (error) {
      message = (error as Error).message;
    }
    golden('parts-error-nested.txt', message);
    assert.match(message, /nests two parts of axis 'state'/);
  });
});

describe('the overlay: the base borrowed by reference, and one set of its own', () => {
  const OVERLAY = fileURLToPath(new URL('../../example/ds.warm.resolver.json', import.meta.url));
  const warm = { colorSpace: 'srgb', components: [0.902, 0.4, 0.102], hex: '#e6661a' };
  const darkAccent = { colorSpace: 'srgb', components: [0.3608, 0.6078, 1], hex: '#5c9bff' };

  async function overlay() {
    const { document } = await load(OVERLAY, { read: (path) => readFile(path, 'utf8') });
    return new Resolver(document).resolveContextsToDesignSystem();
  }

  it('takes the warm accent in light; the theme, layered after it, still wins in dark', async () => {
    const system = await overlay();
    assert.deepEqual(system.getCollectionNames(), ['ds']);
    assert.deepEqual(system.resolveValue('ds.surface.accent'), warm);
    assert.deepEqual(system.resolveValue('ds.button.primary.backgroundColor'), warm, 'a reference follows the accent');
    assert.deepEqual(system.resolveValue('ds.surface.accent', 'theme=dark'), darkAccent);
  });

  it('holds every token path the base holds', async () => {
    const paths = (await overlay()).getCollection('ds')!.getAllPaths();
    assert.deepEqual(paths.sort(), (await collection()).getAllPaths().sort());
  });
});

describe('the map: the base read with warm.overrides.json', () => {
  const MAP = fileURLToPath(new URL('../../example/warm.overrides.json', import.meta.url));
  const warm = { colorSpace: 'srgb', components: [0.902, 0.4, 0.102], hex: '#e6661a' };
  const darkAccent = { colorSpace: 'srgb', components: [0.3608, 0.6078, 1], hex: '#5c9bff' };

  it('gives the warm accent by default, and the base dark value under theme=dark', async () => {
    const overrides = JSON.parse(await readFile(MAP, 'utf8'));
    const { document, reads, overrides: map } = await load(EXAMPLE, { read: (path) => readFile(path, 'utf8'), overrides });
    const system = new Resolver(document).resolveContextsToDesignSystem();
    assert.deepEqual(system.resolveValue('ds.surface.accent'), warm);
    assert.deepEqual(system.resolveValue('ds.button.primary.backgroundColor'), warm, 'a reference follows the accent');
    assert.deepEqual(system.resolveValue('ds.surface.accent', 'theme=dark'), darkAccent);
    const swapped = reads.filter((read) => read.overridden);
    assert.deepEqual(
      swapped.map((read) => read.ref),
      ['roles.tokens.json'],
    );
    assert.ok(swapped[0].location.endsWith('example/roles.warm.tokens.json'));
    // FNV-1a, 64 bits, of {"roles.tokens.json":"roles.warm.tokens.json"}, computed outside the library.
    assert.deepEqual(map, { hash: '5784d4a9943c490c', unused: [] });
  });
});
