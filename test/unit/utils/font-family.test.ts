import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fontFamilyNames, normalizeTokenValue } from '../../../src/index.js';

test('fontFamilyNames', async (t) => {
  await t.test('splits at commas, trims, and strips one pair of quotes', () => {
    assert.deepEqual(fontFamilyNames('\'Plex Sans\', system-ui, "Noto Sans" , sans-serif'), [
      'Plex Sans',
      'system-ui',
      'Noto Sans',
      'sans-serif',
    ]);
  });

  await t.test('keeps a comma inside quotes', () => {
    assert.deepEqual(fontFamilyNames("'Foo, Bar', serif"), ['Foo, Bar', 'serif']);
  });

  await t.test('a string with no comma is a one-name list; an array is returned as it is', () => {
    assert.deepEqual(fontFamilyNames('Inter'), ['Inter']);
    const list = ['Inter', 'system-ui'];
    assert.equal(fontFamilyNames(list), list);
  });

  await t.test('an empty part is an error naming the value', () => {
    assert.throws(() => fontFamilyNames('Inter,'), /"Inter,"/);
    assert.throws(() => fontFamilyNames(', serif'), /", serif"/);
  });
});

test('normalizeTokenValue on a fontFamily', async (t) => {
  await t.test('converts a string with commas to the array', () => {
    assert.deepEqual(normalizeTokenValue('fontFamily', "'Plex Sans', system-ui", 'type.family'), ['Plex Sans', 'system-ui']);
  });

  await t.test('leaves a single name, a quoted comma, an array and a reference as they are', () => {
    assert.equal(normalizeTokenValue('fontFamily', 'Inter', 'type.family'), 'Inter');
    assert.equal(normalizeTokenValue('fontFamily', "'Foo, Bar'", 'type.family'), "'Foo, Bar'");
    assert.deepEqual(normalizeTokenValue('fontFamily', ['Inter', 'serif'], 'type.family'), ['Inter', 'serif']);
    assert.equal(normalizeTokenValue('fontFamily', '{type.base}', 'type.family'), '{type.base}');
  });

  await t.test('an empty part throws with the token path', () => {
    assert.throws(() => normalizeTokenValue('fontFamily', 'Inter,', 'type.family'), /type\.family.*"Inter,"/);
  });
});
