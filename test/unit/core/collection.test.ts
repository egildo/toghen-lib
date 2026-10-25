import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Collection } from '../../../src/core/collection.js';
import { DesignToken, InvalidModeError } from '../../../src/core/design-token.js';

describe('Collection', () => {
  it('should correctly set and get a token', () => {
    const collection = new Collection('test');
    const token = new DesignToken('value', 'type');
    collection.setToken('group.token', token);

    const retrievedToken = collection.getToken('group.token');
    assert.deepStrictEqual(retrievedToken, token);
  });

  it('should validate token names', () => {
    const collection = new Collection('test');
    const token = new DesignToken('value', 'type');

    assert.throws(() => collection.setToken('$group.token', token), /Invalid token name/);
    assert.throws(() => collection.setToken('group.token{', token), /Invalid token name/);
  });

  it('should handle multi-mode tokens', () => {
    const collection = new Collection('test', ['light', 'dark']);
    const lightToken = new DesignToken('light-value', 'type');
    const darkToken = new DesignToken('dark-value', 'type');

    collection.setToken('group.token', lightToken, 'light');
    collection.setToken('group.token', darkToken, 'dark');

    assert.deepStrictEqual(collection.getToken('group.token', 'light'), lightToken);
    assert.deepStrictEqual(collection.getToken('group.token', 'dark'), darkToken);
  });

  it('should handle single token for all modes', () => {
    const collection = new Collection('test', ['light', 'dark']);
    const token = new DesignToken('value', 'type');

    collection.setToken('group.token', token);

    assert.deepStrictEqual(collection.getToken('group.token', 'light'), token);
    assert.deepStrictEqual(collection.getToken('group.token', 'dark'), token);
  });

  it('should reject the old array-of-tokens mode encoding', () => {
    const collection = new Collection('test', ['light', 'dark']);
    const packed = new DesignToken([new DesignToken('light-value', 'type'), new DesignToken('dark-value', 'type')], 'type');

    assert.throws(() => collection.setToken('group.token', packed), /one value per mode/);
  });

  it('should not treat a real array value as per-mode values', () => {
    // The collision this rebuild removes: in a two-mode collection a
    // two-family stack used to be split, one family per mode.
    const collection = new Collection('test', ['light', 'dark']);
    const stack = ['Alpha', 'Beta'];
    collection.setToken('font.sans', new DesignToken(stack, 'fontFamily'));

    assert.deepStrictEqual(collection.getToken('font.sans', 'light')?.$value, stack);
    assert.deepStrictEqual(collection.getToken('font.sans', 'dark')?.$value, stack);
  });

  it('should accept an array longer than the mode count', () => {
    // Used to throw "Invalid number of mode values".
    const collection = new Collection('test', ['light', 'dark']);
    const stack = ['Alpha', 'Beta', 'Gamma', 'sans-serif'];

    assert.doesNotThrow(() => collection.setToken('font.sans', new DesignToken(stack, 'fontFamily')));
    assert.deepStrictEqual(collection.getToken('font.sans', 'dark')?.$value, stack);
  });

  it('should reject an undeclared mode instead of guessing', () => {
    const collection = new Collection('test', ['light', 'dark']);
    collection.setToken('bg', new DesignToken('#fff', 'color'), 'light');

    assert.throws(() => collection.getToken('bg', 'drak'), InvalidModeError);
    assert.throws(() => collection.getAllPaths('drak'), InvalidModeError);
    assert.throws(() => collection.setToken('bg', new DesignToken('x', 'color'), 'drak'), InvalidModeError);
  });

  it('should override a shared value for one mode only', () => {
    const collection = new Collection('test', ['light', 'dark']);
    collection.setToken('bg', new DesignToken('#ffffff', 'color'));
    collection.setToken('bg', new DesignToken('#1a1a1a', 'color'), 'dark');

    assert.strictEqual(collection.getToken('bg', 'light')?.$value.hex, '#ffffff');
    assert.strictEqual(collection.getToken('bg', 'dark')?.$value.hex, '#1a1a1a');
  });

  it('should list paths per mode', () => {
    const collection = new Collection('test', ['light', 'dark']);
    collection.setToken('shared', new DesignToken('x', 'string'));
    collection.setToken('lightOnly', new DesignToken('y', 'string'), 'light');

    assert.deepStrictEqual(collection.getAllPaths('light').sort(), ['lightOnly', 'shared']);
    assert.deepStrictEqual(collection.getAllPaths('dark'), ['shared']);
  });

  it('should report tokens missing a mode', () => {
    const collection = new Collection('test', ['light', 'dark']);
    collection.setToken('complete', new DesignToken('x', 'string'));
    collection.setToken('partial', new DesignToken('y', 'string'), 'light');

    assert.deepStrictEqual(collection.check().incomplete, [{ path: 'partial', missingModes: ['dark'] }]);
  });

  it('should validate declared modes', () => {
    assert.throws(() => new Collection('test', []), InvalidModeError);
    assert.throws(() => new Collection('test', ['light', 'light']), /duplicate mode/);
  });

  it('should not return a group as if it were a token', () => {
    const collection = new Collection('test');
    collection.setToken('group.token', new DesignToken('value', 'type'));

    // A group used to be returned verbatim, which
    // let a `{group}` alias resolve to undefined (W3C DTCG §7.1.1).
    assert.strictEqual(collection.getToken('group'), null);
  });

  it('should classify paths with getNodeKind', () => {
    const collection = new Collection('test');
    collection.setToken('group.token', new DesignToken('value', 'type'));

    assert.strictEqual(collection.getNodeKind('group.token'), 'token');
    assert.strictEqual(collection.getNodeKind('group'), 'group');
    assert.strictEqual(collection.getNodeKind('group.missing'), 'missing');
    assert.strictEqual(collection.getNodeKind('nowhere.at.all'), 'missing');
  });

  it('should refuse to nest a token underneath another token', () => {
    // DTCG (§5.2) forbids a node that is both. The walk used to step *into*
    // the token it found and write the new one as a property of that
    // DesignToken object — so it never appeared in getAllPaths(), never
    // resolved, and nothing was reported.
    const collection = new Collection('test');
    collection.setToken('color', new DesignToken('#0055cc', 'color'));

    assert.throws(() => collection.setToken('color.primary', new DesignToken('#0066dd', 'color')), /already a token/);
    assert.deepStrictEqual(collection.getAllPaths(), ['color']);
  });

  it('should refuse to replace a group with a token', () => {
    const collection = new Collection('test');
    collection.setToken('color.primary', new DesignToken('#0055cc', 'color'));

    assert.throws(() => collection.setToken('color', new DesignToken('#0066dd', 'color')), /already a group/);
    assert.deepStrictEqual(collection.getAllPaths(), ['color.primary']);
  });

  it('should keep an array $value intact in a single-mode collection', () => {
    // Guards the font-stack truncation regression: an array is real data
    // here, not a list of per-mode values.
    const collection = new Collection('test');
    const stack = ['Alpha', 'Beta', 'sans-serif'];
    collection.setToken('font.sans', new DesignToken(stack, 'fontFamily'));

    assert.deepStrictEqual(collection.getToken('font.sans')?.$value, stack);
  });
});
