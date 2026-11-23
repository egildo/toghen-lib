import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DesignToken } from '../../../src/core/design-token.js';

describe('DesignToken', () => {
  it('should create a deeply immutable token', () => {
    const value = { a: 1, b: { c: 2 } };
    const token = new DesignToken(value, 'custom');

    assert.deepStrictEqual(token.$value, value);

    value.b.c = 3;
    assert.strictEqual(token.$value.b.c, 2, 'Original value mutation should not affect token');
  });
});

describe('DesignToken: safe sharing', () => {
  /** Changes a value in place; a frozen one refuses, which is as safe as a copy. */
  const tryToChange = (change: () => void) => {
    try {
      change();
    } catch {
      // refused: the value cannot be changed in place
    }
  };

  it('keeps neither its $value nor its $extensions by reference', () => {
    const value = { colorSpace: 'srgb', components: [1, 0, 0] };
    const extensions = { 'org.example': { note: 'kept' } };
    const token = new DesignToken(value, 'color', '', extensions);

    value.components[0] = 0;
    extensions['org.example'].note = 'changed';
    assert.deepStrictEqual(token.$value, { colorSpace: 'srgb', components: [1, 0, 0] });
    assert.deepStrictEqual(token.$extensions, { 'org.example': { note: 'kept' } });
  });

  it('cannot be changed through what it gives out', () => {
    const token = new DesignToken({ colorSpace: 'srgb', components: [1, 0, 0] }, 'color', '', { 'org.example': { note: 'kept' } });

    tryToChange(() => {
      token.$value.components[0] = 0;
    });
    tryToChange(() => {
      token.$extensions!['org.example'].note = 'changed';
    });
    assert.deepStrictEqual(token.$value, { colorSpace: 'srgb', components: [1, 0, 0] });
    assert.deepStrictEqual(token.$extensions, { 'org.example': { note: 'kept' } });
  });
});
