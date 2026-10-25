import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cssPropertyName, cssIdentifier, cssLinkName } from '../../../src/index.js';

test('cssPropertyName', async (t) => {
  await t.test('drops the collection and joins the path with -', () => {
    assert.strictEqual(cssPropertyName('ds.surface.accent'), '--surface-accent');
    assert.strictEqual(cssPropertyName('ds.color.blue-500'), '--color-blue-500');
  });

  await t.test('makes whitespace, legal in a DTCG name, into -', () => {
    assert.strictEqual(cssPropertyName('ds.brand colors.primary'), '--brand-colors-primary');
  });

  await t.test('spells each segment by the CSSOM rule', () => {
    assert.strictEqual(cssPropertyName('ds.button.backgroundColor'), '--button-background-color');
    assert.strictEqual(cssPropertyName('ds.Colors.Primary'), '--colors-primary');
  });
});

test('cssIdentifier', async (t) => {
  await t.test('hyphenates each capital inside a segment', () => {
    assert.strictEqual(cssIdentifier('backgroundColor'), 'background-color');
    assert.strictEqual(cssIdentifier('paddingBlock'), 'padding-block');
    assert.strictEqual(cssIdentifier('textURL'), 'text-u-r-l');
  });

  await t.test('lowercases a capital that starts a segment, with no hyphen', () => {
    assert.strictEqual(cssIdentifier('Colors'), 'colors');
    assert.strictEqual(cssIdentifier('PrimaryColor'), 'primary-color');
  });

  await t.test('keeps a leading hyphen, so a vendor property is spelled with its own', () => {
    assert.strictEqual(cssIdentifier('-webkitLineClamp'), '-webkit-line-clamp');
  });

  await t.test('turns whitespace into a hyphen and leaves lowercase and hyphens alone', () => {
    assert.strictEqual(cssIdentifier('brand colors'), 'brand-colors');
    assert.strictEqual(cssIdentifier('Brand Colors'), 'brand-colors');
    assert.strictEqual(cssIdentifier('blue-500'), 'blue-500');
  });

  await t.test('names a chain link with the modifier as written, so the name reads back to it', () => {
    assert.strictEqual(cssLinkName(cssPropertyName('ds.surface.raised'), 'colorScheme'), '--surface-raised--colorScheme');
    assert.strictEqual(cssLinkName(cssPropertyName('ds.button.backgroundColor'), 'theme'), '--button-background-color--theme');
    assert.strictEqual(cssLinkName('--gap', 'reading mode'), '--gap--reading-mode');
    assert.strictEqual(cssLinkName('--gap', 'a/b'), '--gap--a\\/b');
  });
});
