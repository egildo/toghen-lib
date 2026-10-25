import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fontWeightHandler } from '../../../src/handlers/font-weight-handler.js';
import { normalizeTokenValue } from '../../../src/index.js';

describe('fontWeightHandler', () => {
  it('turns every W3C keyword into its number, in any case', () => {
    const table: Record<string, number> = {
      thin: 100,
      hairline: 100,
      'extra-light': 200,
      'ultra-light': 200,
      light: 300,
      normal: 400,
      regular: 400,
      book: 400,
      medium: 500,
      'semi-bold': 600,
      'demi-bold': 600,
      bold: 700,
      'extra-bold': 800,
      'ultra-bold': 800,
      black: 900,
      heavy: 900,
      'extra-black': 950,
      'ultra-black': 950,
    };
    for (const [keyword, weight] of Object.entries(table)) {
      assert.equal(fontWeightHandler.normalize!(keyword, 'w'), weight, keyword);
    }
    assert.equal(fontWeightHandler.normalize!('Bold', 'w'), 700);
  });

  it('keeps a number from 1 to 1000, and computes a numeric string', () => {
    assert.equal(fontWeightHandler.normalize!(1, 'w'), 1);
    assert.equal(fontWeightHandler.normalize!(1000, 'w'), 1000);
    assert.equal(fontWeightHandler.normalize!('700', 'w'), 700);
    assert.equal(fontWeightHandler.normalize!('calc(400 + 50)', 'w'), 450);
  });

  it('refuses a weight out of range or not a weight, naming the token', () => {
    for (const bad of [0, 1001, 'bolder', '700px', null]) {
      assert.throws(
        () => fontWeightHandler.normalize!(bad, 'font.weight.x'),
        /Token "font\.weight\.x": a font weight must be a number from 1 to 1000/,
      );
    }
  });

  it('is the gate of a fontWeight token on load', () => {
    assert.equal(normalizeTokenValue('fontWeight', 'semi-bold', 'font.weight.strong'), 600);
    assert.throws(() => normalizeTokenValue('fontWeight', 'bolder', 'font.weight.strong'), /Token "font\.weight\.strong"/);
  });
});
