import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put } from '../../put.js';
import { typographyHandler } from '../../../src/handlers/typography-handler.js';
import { DesignToken } from '../../../src/core/design-token.js';
import { Collection, DesignSystem } from '../../../src/index.js';

const withFamily = (fontFamily: unknown) =>
  new DesignToken(
    {
      fontFamily,
      fontSize: { value: 1, unit: 'rem' },
      fontWeight: 400,
      lineHeight: 1.5,
    },
    'typography',
  );

test('Typography Handler Unit Tests', async (t) => {
  await t.test('Validation', async (t) => {
    await t.test('should not throw for a valid typography token', () => {
      const token = new DesignToken(
        {
          fontFamily: 'Inter',
          fontSize: { value: 1, unit: 'rem' },
          fontWeight: 600,
          lineHeight: '150%',
        },
        'typography',
      );

      assert.doesNotThrow(() => typographyHandler.validate?.(token, 'typography.heading'));
    });

    await t.test('accepts a lineHeight length in object form', () => {
      const token = new DesignToken(
        {
          fontFamily: 'Inter',
          fontSize: { value: 16, unit: 'px' },
          fontWeight: 400,
          lineHeight: { value: 1.5, unit: 'rem' },
        },
        'typography',
      );

      assert.doesNotThrow(() => typographyHandler.validate?.(token, 'type.body'));
      assert.deepEqual(typographyHandler.getLineHeight?.call(token), { value: 24, unit: 'px' });
    });

    await t.test('should throw for missing fontFamily', () => {
      const token = new DesignToken(
        {
          fontSize: { value: 16, unit: 'px' },
          fontWeight: 400,
          lineHeight: 1.2,
        },
        'typography',
      );

      assert.throws(() => typographyHandler.validate?.(token, 'typography.invalid'), /fontFamily must be a non-empty string/);
    });

    await t.test('accepts a font stack', () => {
      assert.doesNotThrow(() => typographyHandler.validate?.(withFamily(['Inter', 'sans-serif']), 'type.body'));
    });

    await t.test('rejects an empty font stack', () => {
      assert.throws(
        () => typographyHandler.validate?.(withFamily([]), 'type.body'),
        /Token "type\.body": fontFamily must not be an empty array\./,
      );
    });

    await t.test('rejects a font stack with a non-string entry', () => {
      assert.throws(
        () => typographyHandler.validate?.(withFamily(['Inter', 400]), 'type.body'),
        /Token "type\.body": fontFamily\[1\] must be a non-empty string\./,
      );
    });

    await t.test('rejects a font stack with an empty entry', () => {
      assert.throws(
        () => typographyHandler.validate?.(withFamily(['Inter', ' ']), 'type.body'),
        /Token "type\.body": fontFamily\[1\] must be a non-empty string\./,
      );
    });

    await t.test('rejects a fontFamily that is neither a string nor an array', () => {
      assert.throws(
        () => typographyHandler.validate?.(withFamily({ name: 'Inter' }), 'type.body'),
        /Token "type\.body": fontFamily must be a non-empty string or an array of them\./,
      );
    });

    await t.test('a reference to a font stack resolves to the stack', () => {
      const STACK = ['Inter', 'sans-serif'];
      const ds = new DesignSystem();
      ds.addCollection(new Collection('ds'));
      put(ds, 'ds', 'font.sans', { $type: 'fontFamily', $value: STACK });
      put(ds, 'ds', 'type.body', {
        $type: 'typography',
        $value: {
          fontFamily: '{font.sans}',
          fontSize: { value: 1, unit: 'rem' },
          fontWeight: 400,
          lineHeight: 1.5,
        },
      });

      assert.deepEqual(ds.resolveValue('ds.type.body').fontFamily, STACK);
    });
  });

  await t.test('Accessors', async (t) => {
    const token = new DesignToken(
      {
        fontFamily: 'Inter',
        fontSize: '1.5rem',
        fontWeight: 700,
        lineHeight: '24px',
      },
      'typography',
    );

    await t.test('getFontFamily()', () => {
      assert.strictEqual(typographyHandler.getFontFamily?.call(token), 'Inter');
    });

    await t.test('getFontFamily() returns a font stack as written', () => {
      const stack = withFamily(['Inter', 'sans-serif']);
      assert.deepEqual(typographyHandler.getFontFamily?.call(stack), ['Inter', 'sans-serif']);
    });

    await t.test('getFontSizePx()', () => {
      assert.strictEqual(typographyHandler.getFontSizePx?.call(token), 24);
    });

    await t.test('getFontWeight()', () => {
      assert.strictEqual(typographyHandler.getFontWeight?.call(token), 700);
    });

    await t.test('getLineHeight()', () => {
      assert.deepEqual(typographyHandler.getLineHeight?.call(token), { value: 24, unit: 'px' });
    });

    await t.test('getLetterSpacingPx() defaults to 0', () => {
      assert.strictEqual(typographyHandler.getLetterSpacingPx?.call(token), 0);
    });

    await t.test('getFontStyle() defaults to Regular', () => {
      assert.strictEqual(typographyHandler.getFontStyle?.call(token), 'Regular');
    });
  });
});

test('Typography letter spacing in em', async (t) => {
  const withSpacing = (letterSpacing: unknown) =>
    new DesignToken(
      { fontFamily: 'Inter', fontSize: { value: 20, unit: 'px' }, fontWeight: 400, lineHeight: 1.5, letterSpacing },
      'typography',
    );

  await t.test('accepts em in both forms and rejects a bad one', () => {
    assert.doesNotThrow(() => typographyHandler.validate?.(withSpacing('0.08em'), 'type.tag'));
    assert.doesNotThrow(() => typographyHandler.validate?.(withSpacing({ value: 0.08, unit: 'em' }), 'type.tag'));
    assert.throws(() => typographyHandler.validate?.(withSpacing('wide'), 'type.tag'), /letterSpacing/);
  });

  await t.test('getLetterSpacingPx is em times the font size', () => {
    assert.equal(typographyHandler.getLetterSpacingPx?.call(withSpacing({ value: 0.1, unit: 'em' })), 2);
    assert.equal(typographyHandler.getLetterSpacingPx?.call(withSpacing('0.1em')), 2);
  });
});

test('typographyHandler.normalize stores every member computed (ruling 3a)', async (t) => {
  const base = { fontFamily: ['Inter'], fontSize: { value: 1, unit: 'rem' }, fontWeight: 400, lineHeight: 1.5 };
  const at = (member: string, value: unknown) => (typographyHandler.normalize!({ ...base, [member]: value }, 'type.body') as any)[member];

  await t.test('fontSize from a string or calc() into { value, unit }', () => {
    assert.deepEqual(at('fontSize', '16px'), { value: 16, unit: 'px' });
    assert.deepEqual(at('fontSize', 'calc(1rem + 2px)'), { value: 1.125, unit: 'rem' });
    assert.deepEqual(at('fontSize', { value: 14, unit: 'px' }), { value: 14, unit: 'px' });
  });

  await t.test('fontWeight keywords become numbers', () => {
    assert.equal(at('fontWeight', 'bold'), 700);
    assert.equal(at('fontWeight', 'semi-bold'), 600);
    assert.equal(at('fontWeight', 450), 450);
    assert.throws(
      () => at('fontWeight', 'heavier'),
      /Token "type\.body": fontWeight: a font weight must be a number from 1 to 1000 or a W3C keyword/,
    );
  });

  await t.test('lineHeight: a number, a length { value, unit }, a percentage kept as its string', () => {
    assert.equal(at('lineHeight', 'calc(1.25 * 1.2)'), 1.5);
    assert.equal(at('lineHeight', 1.4), 1.4);
    assert.deepEqual(at('lineHeight', '24px'), { value: 24, unit: 'px' });
    assert.deepEqual(at('lineHeight', { value: 1.5, unit: 'rem' }), { value: 1.5, unit: 'rem' });
    assert.equal(at('lineHeight', 'calc(100% + 50%)'), '150%');
    assert.throws(() => at('lineHeight', '2vh'), /Token "type\.body": lineHeight: '2vh' cannot be computed/);
  });

  await t.test('letterSpacing through the letter spacing gate', () => {
    assert.deepEqual(at('letterSpacing', '0.08em'), { value: 0.08, unit: 'em' });
    assert.deepEqual(at('letterSpacing', 'calc(0.1em - 0.02em)'), { value: 0.08, unit: 'em' });
    assert.deepEqual(at('letterSpacing', '1px'), { value: 1, unit: 'px' });
    assert.throws(() => at('letterSpacing', '1pt'), /Token "type\.body": letterSpacing: /);
  });

  await t.test('fontFamily: a list string becomes the list, an array and a single name are kept', () => {
    assert.deepEqual(at('fontFamily', "'Plex Sans', system-ui, sans-serif"), ['Plex Sans', 'system-ui', 'sans-serif']);
    assert.equal(at('fontFamily', 'Inter'), 'Inter');
    assert.deepEqual(at('fontFamily', ['Inter', 'serif']), ['Inter', 'serif']);
  });

  await t.test('further CSS members are kept as written', () => {
    assert.equal(at('fontVariantNumeric', 'tabular-nums'), 'tabular-nums');
    assert.equal(at('fontStyle', 'italic'), 'italic');
  });
});
