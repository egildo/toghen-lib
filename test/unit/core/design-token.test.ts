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
