import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Collection,
  DesignToken,
  InvalidTokenError,
  ResolverValidationError,
  getContextSelector,
  normalizeTokenValue,
} from '../../src/index.js';

// Every error a public method throws is a named class, and its message is the one the adapters write word for word.
const refuses = (fn: () => unknown, Class: new (...args: never[]) => Error, message: string) =>
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof Class, `expected ${Class.name}, got ${(err as Error)?.constructor?.name}`);
    assert.equal((err as Error).message, message);
    return true;
  });

const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b], alpha: 1 });
const parts = (vocabulary: unknown) => ({ 'com.toghen': { css: { parts: vocabulary } } });

/** A component group with structured-colour tokens, and the given vocabulary on it. */
function component(vocabulary: unknown): Collection {
  const c = new Collection('ui');
  c.setToken('button.background', new DesignToken(srgb(1, 1, 1), 'color'));
  c.setToken('button.hover.background', new DesignToken(srgb(0.9, 0.9, 0.9), 'color'));
  c.setToken('button.hover.pressed.background', new DesignToken(srgb(0.8, 0.8, 0.8), 'color'));
  c.setGroupAttribute('button', '$extensions', parts(vocabulary));
  return c;
}

describe('the parts errors are InvalidTokenError', () => {
  it('an invalid vocabulary', () => {
    refuses(
      () => component({ state: 'hover' }).vocabularyAt('button'),
      InvalidTokenError,
      "Invalid parts vocabulary on group 'button': expected an object of axes, each an object of value -> spelling string.",
    );
  });

  it('a key that is a value of two axes', () => {
    refuses(
      () => component({ state: { hover: ':hover' }, tone: { hover: '.hover' } }).partsOf('button.hover.background'),
      InvalidTokenError,
      "Key 'hover' is a value of two axes ('state' and 'tone') in the parts vocabulary at group 'button'.",
    );
  });

  it('a path nesting two parts of one axis', () => {
    refuses(
      () => component({ state: { hover: ':hover', pressed: ':active' } }).partsOf('button.hover.pressed.background'),
      InvalidTokenError,
      `Path 'button.hover.pressed.background' nests two parts of axis 'state': 'hover' and 'pressed'. Give the group "com.toghen": { "css": { "parts": false } }, or rename a key.`,
    );
  });

  it('a group attribute whose name does not start with $, set or read', () => {
    const c = new Collection('ui');
    const message = "Invalid group attribute 'type'. Attributes must start with '$'.";
    refuses(() => c.setGroupAttribute('button', 'type', 'color'), InvalidTokenError, message);
    refuses(() => c.getGroupAttribute('button', 'type'), InvalidTokenError, message);
  });
});

describe('the spelling errors are ResolverValidationError', () => {
  it('a spelling that is not a string', () => {
    refuses(
      () => getContextSelector({ name: 'density', $extensions: { 'com.toghen': { css: { selector: 3 } } } }, 'compact'),
      ResolverValidationError,
      "The CSS selector of context 'compact' of modifier 'density': selector must be a string.",
    );
  });

  it('an at-rule that does not start with @', () => {
    refuses(
      () =>
        getContextSelector(
          { name: 'theme', $extensions: { 'com.toghen': { css: { atRule: 'media (prefers-color-scheme: {context})' } } } },
          'dark',
        ),
      ResolverValidationError,
      "The CSS selector of context 'dark' of modifier 'theme': atRule must start with '@', got 'media (prefers-color-scheme: dark)'.",
    );
  });
});

describe('a value its type rejects is InvalidTokenError', () => {
  it('from setToken and normalizeTokenValue, in the structured shapes', () => {
    const c = new Collection('ds');
    refuses(
      () => c.setToken('space.bad', new DesignToken({ value: 4, unit: 'em' }, 'dimension')),
      InvalidTokenError,
      `Token "ds.space.bad": unit must be one of 'px', 'rem', 'pt', or 'mm'.`,
    );
    refuses(
      () => normalizeTokenValue('color', { colorSpace: 'srgb', components: [1, 1] }, 'ds.color.bad'),
      InvalidTokenError,
      `Token "ds.color.bad": components array must have 3 items for colorSpace 'srgb'.`,
    );
    refuses(
      () => c.setToken('font.bad', new DesignToken('Inter,', 'fontFamily')),
      InvalidTokenError,
      'Token "ds.font.bad": fontFamily "Inter," has an empty family name.',
    );
  });
});
