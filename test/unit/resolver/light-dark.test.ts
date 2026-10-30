import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResolverValidationError, getContextSelector, getLightDark } from '../../../src/index.js';

const modifier = (lightDark: unknown, extra: Record<string, unknown> = {}, contexts: unknown = { day: [], night: [] }) => ({
  name: 'theme',
  contexts,
  $extensions: { 'com.toghen': { css: { lightDark, ...extra } } },
});

const refuses = (fn: () => unknown, message: string) =>
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof ResolverValidationError);
    assert.equal((err as Error).message, message);
    return true;
  });

describe('getLightDark', () => {
  it('reads the pair from a resolver document modifier (contexts an object)', () => {
    assert.deepEqual(getLightDark(modifier({ light: 'day', dark: 'night' })), { light: 'day', dark: 'night' });
  });

  it('reads the pair from a recorded modifier (contexts an array of names)', () => {
    assert.deepEqual(getLightDark(modifier({ light: 'night', dark: 'day' }, {}, ['day', 'night'])), {
      light: 'night',
      dark: 'day',
    });
  });

  it('is undefined without the field', () => {
    assert.equal(getLightDark({ name: 'theme', contexts: ['a', 'b'] }), undefined);
    assert.equal(getLightDark({ name: 'density', $extensions: { 'com.toghen': { css: { selector: '.x' } } } }), undefined);
  });

  it('refuses a lightDark that is not an object', () => {
    refuses(() => getLightDark(modifier('day')), "The CSS lightDark of modifier 'theme' must be an object { light, dark }.");
  });

  it('refuses a light or dark that is missing or not a string', () => {
    refuses(() => getLightDark(modifier({ dark: 'night' })), "The CSS lightDark of modifier 'theme': light must be a string.");
    refuses(() => getLightDark(modifier({ light: 'day', dark: 3 })), "The CSS lightDark of modifier 'theme': dark must be a string.");
  });

  it('refuses light equal to dark', () => {
    refuses(
      () => getLightDark(modifier({ light: 'day', dark: 'day' })),
      "The CSS lightDark of modifier 'theme': light and dark are both 'day'.",
    );
  });

  it('refuses a name that is not a context', () => {
    refuses(
      () => getLightDark(modifier({ light: 'day', dark: 'dusk' })),
      "The CSS lightDark of modifier 'theme': dark names 'dusk', which is not one of its contexts (day, night).",
    );
  });

  it('refuses a modifier without exactly two contexts', () => {
    refuses(
      () => getLightDark(modifier({ light: 'day', dark: 'night' }, {}, { day: [], night: [], dusk: [] })),
      "The CSS lightDark of modifier 'theme' needs exactly two contexts, has 3.",
    );
  });

  it('refuses a second spelling beside it', () => {
    for (const key of ['selector', 'atRule', 'contexts'])
      refuses(
        () => getLightDark(modifier({ light: 'day', dark: 'night' }, { [key]: key === 'contexts' ? {} : '@x' })),
        `The CSS lightDark of modifier 'theme' cannot sit beside ${key}: one modifier, one spelling.`,
      );
  });

  it('leaves getContextSelector without a spelling for it', () => {
    assert.equal(getContextSelector(modifier({ light: 'day', dark: 'night' }), 'day'), undefined);
  });
});
