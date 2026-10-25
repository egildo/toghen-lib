import { test } from 'node:test';
import assert from 'node:assert';
import { put, type TokenData } from '../put.js';
import { DesignSystem, Collection, PathNotFoundError } from '../../src/index.js';
import { colorHandler } from '../../src/handlers/color-handler.js';
import { dimensionHandler } from '../../src/handlers/dimension-handler.js';

test('Design System Integration Tests', async (t) => {
  await t.test('should register a handler and create a token', () => {
    const system = new DesignSystem();

    const colors = new Collection('colors');
    system.addCollection(colors);

    const tokenData: TokenData = {
      $type: 'color',
      $value: { colorSpace: 'srgb', components: [0, 0, 1] },
    };
    put(system, 'colors', 'primary.blue', tokenData);

    const token = system.getCollection('colors')?.getToken('primary.blue');
    assert.ok(token, 'Token should be retrievable');
    assert.strictEqual(token?.$type, 'color');
  });

  await t.test('should resolve a reference within its own collection', () => {
    const system = new DesignSystem();
    system.addCollection(new Collection('colors'));

    const primary = { colorSpace: 'srgb', components: [0, 0.2, 0.8] };
    const primaryTokenData: TokenData = { $type: 'color', $value: primary };
    put(system, 'colors', 'brand.primary', primaryTokenData);

    // Document-relative: no 'colors.' prefix, even though the lookup path has one.
    const aliasTokenData: TokenData = { $type: 'color', $value: '{brand.primary}' };
    put(system, 'colors', 'aliases.cta', aliasTokenData);

    // The stored value keeps the reference verbatim...
    const rawToken = system.getCollection('colors')?.getToken('aliases.cta');
    assert.strictEqual(rawToken?.$value, '{brand.primary}');

    // ...and resolution expands it to the referenced structured value.
    assert.deepStrictEqual(system.resolveValue('colors.aliases.cta'), primary);
  });

  await t.test('should not resolve a reference across collections', () => {
    // References are document-relative, and a document is one collection.
    // Without this test, a reintroduced collection-prefix fallback would go
    // completely unnoticed.
    const system = new DesignSystem();
    system.addCollection(new Collection('primitives'));
    system.addCollection(new Collection('semantic'));

    put(system, 'primitives', 'blue', {
      $type: 'color',
      $value: { colorSpace: 'srgb', components: [0, 0.2, 0.8] },
    });
    put(system, 'semantic', 'cta', { $type: 'color', $value: '{primitives.blue}' });

    assert.throws(() => system.resolveValue('semantic.cta'), PathNotFoundError, 'a reference must not reach into another collection');
  });

  await t.test('should reject a duplicate collection name', () => {
    const system = new DesignSystem();
    system.addCollection(new Collection('colors'));

    assert.throws(() => system.addCollection(new Collection('colors')), /already registered/);
  });

  await t.test('a helper of the colour handler reads a resolved token', () => {
    const system = new DesignSystem();
    const colors = new Collection('colors');
    system.addCollection(colors);

    const successTokenData: TokenData = {
      $type: 'color',
      $value: { colorSpace: 'srgb', components: [0, 0.8, 0.2] },
    };
    put(system, 'colors', 'feedback.success', successTokenData);

    const token = system.resolveToken('colors.feedback.success')!;

    assert.doesNotThrow(() => {
      colorHandler.toHex!.call(token);
    }, 'Should be able to call handler methods on the token');
    assert.strictEqual(colorHandler.toHex!.call(token), '#00cc33');
  });

  await t.test('should handle dimension tokens with the dimension handler', () => {
    const system = new DesignSystem();
    const dimensions = new Collection('dimensions');
    system.addCollection(dimensions);

    const tokenData: TokenData = {
      $type: 'dimension',
      $value: { value: 1, unit: 'rem' },
    };
    put(system, 'dimensions', 'spacing.small', tokenData);

    const token = system.resolveToken('dimensions.spacing.small');

    assert.doesNotThrow(() => {
      dimensionHandler.toPx!.call(token);
    }, 'Should be able to call handler methods on the token');
    assert.strictEqual(dimensionHandler.toPx!.call(token), 16);
  });

  await t.test('should resolve inherited types', () => {
    const system = new DesignSystem();
    const dimensions = new Collection('dimensions');
    dimensions.setGroupAttribute('spacing', '$type', 'dimension');
    system.addCollection(dimensions);

    const tokenData: TokenData = {
      $value: { value: 1, unit: 'rem' },
    };
    put(system, 'dimensions', 'spacing.small', tokenData);

    const token = system.resolveToken('dimensions.spacing.small');

    assert.strictEqual(token?.$type, 'dimension');
    assert.strictEqual(dimensionHandler.toPx!.call(token), 16);
  });

  await t.test('should resolve alias types', () => {
    const system = new DesignSystem();
    const dimensions = new Collection('dimensions');
    system.addCollection(dimensions);

    const tokenData: TokenData = {
      $type: 'dimension',
      $value: { value: 1, unit: 'rem' },
    };
    put(system, 'dimensions', 'spacing.small', tokenData);

    const aliasTokenData: TokenData = {
      $value: '{spacing.small}',
    };
    put(system, 'dimensions', 'spacing.alias', aliasTokenData);

    const token = system.resolveToken('dimensions.spacing.alias');

    assert.strictEqual(token?.$type, 'dimension');
    assert.strictEqual(dimensionHandler.toPx!.call(token), 16);
  });

  await t.test('a lookup path reaches into a resolved value', async (t) => {
    const MD = { value: 1, unit: 'rem' };
    const STACK = ['Inter', 'sans-serif'];
    const INK = { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2 };

    const system = new DesignSystem();
    system.addCollection(new Collection('ds'));
    put(system, 'ds', 'font.size.md', { $type: 'dimension', $value: MD });
    put(system, 'ds', 'font.stack', { $type: 'fontFamily', $value: STACK });
    put(system, 'ds', 'type.body', {
      $type: 'typography',
      $value: {
        fontFamily: '{font.stack}',
        fontSize: '{font.size.md}',
        fontWeight: 400,
        lineHeight: 1.5,
        letterSpacing: { value: 0, unit: 'px' },
      },
    });
    put(system, 'ds', 'ink', { $type: 'color', $value: INK });
    put(system, 'ds', 'elevation.raised', {
      $type: 'shadow',
      $value: [
        {
          color: '{ink}',
          offsetX: { value: 0, unit: 'px' },
          offsetY: { value: 1, unit: 'px' },
          blur: { value: 2, unit: 'px' },
          spread: { value: 0, unit: 'px' },
        },
        {
          color: '{ink}',
          offsetX: { value: 0, unit: 'px' },
          offsetY: { value: 4, unit: 'px' },
          blur: { value: 8, unit: 'px' },
          spread: { value: 0, unit: 'px' },
        },
      ],
    });
    put(system, 'ds', 'space.4', { $type: 'dimension', $value: MD });
    put(system, 'ds', 'color.blue', {
      $type: 'color',
      $value: { colorSpace: 'srgb', components: [0, 0.4, 1] },
    });
    put(system, 'ds', 'legacy', { $type: 'dimension', $value: '4px' });
    put(system, 'ds', 'label', { $type: 'string', $value: 'Body' });

    await t.test('a typography member comes back resolved', () => {
      assert.deepStrictEqual(system.resolveValue('ds.type.body.fontSize'), MD);
      assert.deepStrictEqual(system.resolveValue('ds.type.body.fontFamily'), STACK);
      assert.strictEqual(system.resolveValue('ds.type.body.lineHeight'), 1.5);
    });

    await t.test('a shadow layer is reached by index', () => {
      assert.deepStrictEqual(system.resolveValue('ds.elevation.raised.0.color'), INK);
      assert.deepStrictEqual(system.resolveValue('ds.elevation.raised.1.offsetY'), { value: 4, unit: 'px' });
    });

    await t.test('the rule is uniform: structured scalars have members too', () => {
      assert.strictEqual(system.resolveValue('ds.space.4.value'), 1);
      // W3C DTCG Format §7, Example 32: #/colors/blue/$value/components/0
      assert.strictEqual(system.resolveValue('ds.color.blue.components.0'), 0);
      assert.strictEqual(system.resolveValue('ds.font.stack.1'), 'sans-serif');
    });

    await t.test('a missing member names the members that exist', () => {
      assert.throws(() => system.resolveValue('ds.type.body.fontSze'), {
        name: 'PathNotFoundError',
        message: "'type.body' has no member 'fontSze'. Its members: fontFamily, fontSize, fontWeight, lineHeight, letterSpacing.",
      });
      assert.throws(() => system.resolveValue('ds.type.body.fontSize.px'), {
        name: 'PathNotFoundError',
        message: "'type.body.fontSize' has no member 'px'. Its members: value, unit.",
      });
    });

    await t.test('a missing index says how many entries there are', () => {
      assert.throws(() => system.resolveValue('ds.elevation.raised.3'), {
        name: 'PathNotFoundError',
        message: "'elevation.raised' has no index 3. It has 2 entries.",
      });
      // An array's own `length` is not a member.
      assert.throws(() => system.resolveValue('ds.elevation.raised.length'), PathNotFoundError);
    });

    await t.test('a value with no members says what it is', () => {
      assert.throws(() => system.resolveValue('ds.label.value'), {
        name: 'PathNotFoundError',
        message: "'label' is a string, so it has no member 'value'.",
      });
      // A dimension written as a string is stored structured, so it has members.
      assert.equal(system.resolveValue('ds.legacy.value'), 4);
      assert.throws(() => system.resolveValue('ds.type.body.fontWeight.value'), {
        name: 'PathNotFoundError',
        message: "'type.body.fontWeight' is a number, so it has no member 'value'.",
      });
    });

    await t.test('inherited members are not members', () => {
      assert.throws(() => system.resolveValue('ds.type.body.toString'), PathNotFoundError);
    });

    await t.test('a path with no token prefix keeps the token-not-found error', () => {
      assert.throws(() => system.resolveValue('ds.nothing.here'), {
        name: 'PathNotFoundError',
        message: "Token 'nothing.here' not found in collection 'ds' for mode 'default'.",
      });
    });

    await t.test('a member is not a token', () => {
      assert.strictEqual(system.getCollection('ds')!.getNodeKind('type.body.fontSize'), 'missing');
      assert.strictEqual(system.resolveToken('ds.type.body.fontSize'), null);
    });
  });

  await t.test('a token says what it refers to', async (t) => {
    const px = (value: number) => ({ value, unit: 'px' });

    const system = new DesignSystem();
    system.addCollection(new Collection('ds'));
    put(system, 'ds', 'color.brand', {
      $type: 'color',
      $value: { colorSpace: 'srgb', components: [0, 0.4, 1] },
    });
    put(system, 'ds', 'color.button.bg', { $type: 'color', $value: '{color.brand}' });
    put(system, 'ds', 'font.size.md', { $type: 'dimension', $value: { value: 1, unit: 'rem' } });
    put(system, 'ds', 'font.family.sans', { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] });
    put(system, 'ds', 'type.body', {
      $type: 'typography',
      $value: {
        fontFamily: '{font.family.sans}',
        fontSize: '{font.size.md}',
        fontWeight: 400,
        lineHeight: 1.5,
        letterSpacing: px(0),
      },
    });
    put(system, 'ds', 'elevation.raised', {
      $type: 'shadow',
      $value: [
        { color: '{color.brand}', offsetX: px(0), offsetY: px(1), blur: px(2), spread: px(0) },
        { color: { colorSpace: 'srgb', components: [0, 0, 0] }, offsetX: px(0), offsetY: px(4), blur: px(8), spread: px(0) },
      ],
    });
    put(system, 'ds', 'legacy.shadow', { $type: 'string', $value: '0 2px 4px {color.brand}' });

    await t.test('a whole-value reference is at the empty address', () => {
      assert.deepStrictEqual(system.referencesOf('ds.color.button.bg'), [
        { at: '', to: 'ds.color.brand', interpolated: false, written: '{color.brand}' },
      ]);
    });

    await t.test('a literal makes no references', () => {
      assert.deepStrictEqual(system.referencesOf('ds.color.brand'), []);
      assert.deepStrictEqual(system.referencesOf('ds.font.family.sans'), []);
    });

    await t.test('a typography reference is at its member, in document order', () => {
      assert.deepStrictEqual(system.referencesOf('ds.type.body'), [
        { at: 'fontFamily', to: 'ds.font.family.sans', interpolated: false, written: '{font.family.sans}' },
        { at: 'fontSize', to: 'ds.font.size.md', interpolated: false, written: '{font.size.md}' },
      ]);
      // `at` speaks the lookup path's member grammar.
      assert.deepStrictEqual(system.resolveValue('ds.type.body.fontSize'), { value: 1, unit: 'rem' });
    });

    await t.test('a shadow layer reference is at its index', () => {
      assert.deepStrictEqual(system.referencesOf('ds.elevation.raised'), [
        { at: '0.color', to: 'ds.color.brand', interpolated: false, written: '{color.brand}' },
      ]);
    });

    await t.test('an embedded reference is interpolated', () => {
      assert.deepStrictEqual(system.referencesOf('ds.legacy.shadow'), [
        { at: '', to: 'ds.color.brand', interpolated: true, written: '{color.brand}' },
      ]);
    });

    await t.test('the read is syntactic: a dangling reference is still reported', () => {
      put(system, 'ds', 'broken', { $type: 'color', $value: '{color.nowhere}' });
      assert.deepStrictEqual(system.referencesOf('ds.broken'), [
        { at: '', to: 'ds.color.nowhere', interpolated: false, written: '{color.nowhere}' },
      ]);
    });

    await t.test('a group or a member is not a token', () => {
      assert.throws(() => system.referencesOf('ds.color'), {
        name: 'PathNotFoundError',
        message: "Token 'color' not found in collection 'ds' for mode 'default'.",
      });
      assert.throws(() => system.referencesOf('ds.type.body.fontSize'), {
        name: 'PathNotFoundError',
        message: "Token 'type.body.fontSize' not found in collection 'ds' for mode 'default'.",
      });
    });
  });
});
