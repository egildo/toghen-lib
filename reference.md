# @toghen/lib — API reference

> **Audience:** developers and AI coding agents.
> For the user manual and examples, see [guide.md](./guide.md).
> For architecture and internals, see [specs.md](./specs.md).

---

## Named exports

Every export answers a question of the core's question set ([specs.md](./specs.md#the-questions-the-core-answers)),
is the shape of such an answer, or is the error it gives. The exports removed on 21 October 2026 are listed at the
end, under [Removed exports](#removed-exports), each with what to ask instead.

The package also ships its running example: `@toghen/lib/example/*` names a file of the `example/` folder, for instance `import.meta.resolve('@toghen/lib/example/ds.resolver.json')`.

```typescript
import {
  DesignToken,
  Collection,
  DesignSystem,
  Resolver,
  load,
  // Errors
  InvalidTokenError,
  PathNotFoundError,
  UnresolvableReferenceError,
  InvalidInterpolationError,
  InvalidModeError,
  CollectionNotFoundError,
  CircularReferenceError,
  ResolverValidationError,
  InvalidInputError,
  InvalidReferenceError,
  // Paths
  referencePath,
  // Reference grammar
  referencesIn,
  holdsReference,
  referenceTarget,
  parseReferencePath,
  literalText,
  // Token values
  normalizeTokenValue,
  normalizeColorToSRGB01,
  normalizeDimensionToPx,
  normalizeLineHeight,
  normalizeGradient,
  fontFamilyNames,
  // Names two adapters share
  cssPropertyName,
  cssIdentifier,
  cssLinkName,
  getContextSelector,
} from '@toghen/lib';

import type {
  // Tokens, collections and the component model
  TokenReference, ModeModifier, Child, Part, Parts, Axis, Check,
  UnresolvableReferenceReason, UnresolvableReferenceDetails,
  // Composite values
  TypographyValue, ShadowValue, BorderValue, StrokeStyleValue, GradientValue, GradientStopValue, GradientKind,
  GradientStopsValue, GradientObjectValue, DimensionValue, DimensionUnit, ColorValue,
  LetterSpacingValue, LetterSpacingUnit, LetterSpacingEmValue,
  NormalizedColorValue, NormalizedGradient, NormalizedLineHeight, NormalizedShadow,
  // Resolver documents
  ResolverDocument, ResolverInput, ResolverSet, ResolverModifier,
  ModifierContexts, InlineSet, InlineModifier, ResolutionOrderItem, ReferenceObject, TokenSource,
  // Per-modifier queries
  LeafProperty, Step, Chain, ChainLink, NonFactorable, TokenContexts,
  // CSS spelling of a context, and loading
  ContextSelector, LoadOptions, LoadResult,
} from '@toghen/lib';
```

- `normalizeGradient` reads a gradient in either of its two shapes (see [`GradientValue`](#gradientvalue)).

---

## DesignToken

Fundamental immutable data unit for design token values.

### DesignToken constructor

```typescript
new DesignToken(
  $value: any,
  $type: string,
  $description?: string,
  $extensions?: Record<string, any> | null
)
```

### Properties

| Property | Type | Description |
|---|---|---|
| `$value` | `any` | Token value: literal or `{path}` reference |
| `$type` | `string` | Token type (`color`, `dimension`, `number`, `string`, `typography`, `shadow`, `gradient`, etc.) |
| `$description` | `string` | Human-readable description; `''` when none was given |
| `$extensions` | `Record<string, any> \| null` | W3C extension data |

A token has no methods. It is immutable: a change is a new `DesignToken`. What a token refers to is
[`referencesOf()`](#referencesofpath-mode-tokenreference) for a stored token, and
[`referencesIn()`](#referencesinvalue-collectionname-tokenreference) for any value.

---

## Collection

Named container for tokens organized by dot-notation paths, with multi-mode support.

### Collection constructor

```typescript
new Collection(name: string, modes?: string[])
```

Default mode is `'default'`. Pass an array of mode names (e.g., `['light', 'dark']`) for multi-mode collections.

### Token methods

#### `setToken(path, token, mode?): void`

Stores a token at the specified path, creating intermediate groups as needed.
Omit `mode` and the token applies to every mode; pass one and only that mode is
affected, leaving the others as they were.

```typescript
collection.setToken('primary.blue', blueToken);                  // all modes
collection.setToken('ui.background', darkToken, 'dark');         // dark only
```

Throws `InvalidModeError` if `mode` is not declared by the collection.

Checks the value against its type and stores it in the type's structured shape.
See [Token values](#token-values). The type is the token's own `$type`, else the
nearest group's. A value its type rejects throws `InvalidTokenError` naming the
token (`Token "ds.space.bad": …`).

Throws `InvalidTokenError` when the path would make one node both a token and a
group: either a segment along the way already holds a token, or the leaf already holds a group. DTCG forbids that shape (§5.2). The walk used to step *into* the token it found and write the new one as a property of that `DesignToken` object, so the token never appeared in `getAllPaths()`, never resolved, and the library reported nothing:

```typescript
collection.setToken('color', new DesignToken('#0055cc', 'color'));
collection.setToken('color.primary', new DesignToken('#0066dd', 'color'));
// InvalidTokenError: Cannot add 'color.primary': 'color' is already a token…
```

An array `$value` is always the token's own value, such as a font stack or a list of shadows. Passing an array of `DesignToken` instances throws: that used to encode
one value per mode, and silently reinterpreting it would change what the token
means.

#### `getToken(path, mode?): DesignToken | null`

Retrieves a token by path and mode. Returns `null` when the path is missing, when
it names a **group** (which is not a token), or when the token has no value in
that mode.

Throws `InvalidModeError` for a mode the collection does not declare, rather
than returning another mode's value.

```typescript
const token = collection.getToken('primary.blue');
const darkToken = collection.getToken('ui.background', 'dark');
collection.getToken('primary');           // null — 'primary' is a group
collection.getToken('primary.blue', 'sepia'); // InvalidModeError
```

#### `getNodeKind(path): 'token' | 'group' | 'missing'`

Classifies what lives at a path without resolving it. This is the distinction `getToken()` collapses into `null`.

```typescript
collection.getNodeKind('primary.blue'); // 'token'
collection.getNodeKind('primary');      // 'group'
collection.getNodeKind('secondary');    // 'missing'
```

### Group attribute methods

A group's attributes are kept per mode, as tokens are: a context may describe
or type a group differently from the defaults. The resolver carries four
attributes: `$type`, `$description`, `$extensions` and `$deprecated`. Every
resolver build keeps all four in each mode (`resolveToDesignSystem()`,
`resolveAllToDesignSystem()` and `resolveContextsToDesignSystem()`), so a
group's `$extensions`, such as its parts vocabulary, and its `$deprecated` reach
the collection. A source's root may carry `$extensions` too, and the root's
parts vocabulary applies to every group. Several sources may each hold part of
the root's vocabulary; they merge key by key. Pass `''` as the path to read or
set the collection's root.

#### `setGroupAttribute(path, attribute, value, mode?): void`

Sets group-level metadata (e.g., `$description`, `$type`, `$extensions`) at a
path. Omit `mode` and it applies to every mode; pass one and only that mode is
set. The resolver loads each mode's attributes into that mode.

```typescript
collection.setGroupAttribute('primary', '$description', 'Primary brand colors');
collection.setGroupAttribute('space', '$description', 'Tighter scale.', 'density=compact');
```

Throws `InvalidTokenError` when the path is a token, or passes through one: a group attribute belongs to a group,
and the token is left as it was. It throws `InvalidTokenError` too when `attribute` does not start with `$`
(`Invalid group attribute 'type'. Attributes must start with '$'.`), and so does `getGroupAttribute()`.

```text
Cannot set '$description' on 'space.md': 'space.md' is a token, and a group attribute belongs to a group.
```

#### `getGroupAttribute(path, attribute, mode?): any`

Gets group-level metadata in `mode`, the collection's default when omitted; `null` when the group does not
declare it, or the path is not a group. A value that is falsy is a value: a group's `$deprecated: false` reads
`false`, through every build.

```typescript
const desc = collection.getGroupAttribute('primary', '$description');
collection.getGroupAttribute('legacy', '$deprecated'); // false, as the document writes it
```

What a token inherits is not asked here: a token's type, its own or its group's, is
[`resolveToken()`](#resolvetokenpath-mode-designtoken--null)`.$type`.

### Parts

A component's parts come from its parts vocabulary: the `css.parts` entry of
`$extensions["com.toghen"]`. A vocabulary holder is the root of the collection
or any group. The vocabulary in force at a group merges every holder from the
root down to that group, inclusive. A holder lower down overrides one entry (an
axis and a value) and keeps the rest. For what the vocabulary means, see
[the vocabulary](./model.md#the-vocabulary).

The shape, from the running example's root source (`vocabulary.tokens.json`):

```json
{
  "$extensions": { "com.toghen": { "css": { "parts": {
    "variant": { "primary": "[data-variant='primary']" },
    "state": {
      "hover": ":hover",
      "pressed": ":active",
      "disabled": ":is(:disabled, [aria-disabled='true'])"
    },
    "selection": { "selected": "[aria-pressed='true']" }
  } } } }
}
```

Each axis maps values to spellings, and each spelling is a string.

A group that is no component opts out with `"parts": false`. The vocabulary in force there, and in every group below it, is empty, until a group lower down declares a vocabulary of its own, which starts again from it:

```json
{ "hue": { "$extensions": { "com.toghen": { "css": { "parts": false } } } } }
```

#### `vocabularyAt(groupPath, mode?): Record<string, Record<string, string>>`

The vocabulary in force at a group: axis, then value, then spelling. Pass `''`
to read the vocabulary of the collection's root. Axes appear in the order the
holders declare them, root first. `mode` defaults to the collection's default
mode.

```typescript
collection.vocabularyAt('button');
```

```json
{
  "variant": {
    "primary": "[data-variant='primary']"
  },
  "state": {
    "hover": ":hover",
    "pressed": ":active",
    "disabled": ":is(:disabled, [aria-disabled='true'])"
  },
  "selection": {
    "selected": "[aria-pressed='true']"
  }
}
```

Every group reads the root's vocabulary, so `button` and the root return the same
object. The `field` group holds its own `disabled` spelling. It keeps the other
entries, and the axes stay in the root's order:

```typescript
collection.vocabularyAt('field');
```

```json
{
  "variant": {
    "primary": "[data-variant='primary']"
  },
  "state": {
    "hover": ":hover",
    "pressed": ":active",
    "disabled": ":has(> input:disabled)"
  },
  "selection": {
    "selected": "[aria-pressed='true']"
  }
}
```

Throws an `Error` when a holder's `css.parts` is not an object of axes, each an
object of string spellings. The message names the holder, or the document root
when the root is the holder:

```text
Invalid parts vocabulary on group 'ui.card': expected an object of axes, each an object of value -> spelling string.
Invalid parts vocabulary on the document root: expected an object of axes, each an object of value -> spelling string.
```

#### `partsOf(path, mode?): Parts`

The parts a token path passes through, the component they belong to, the twin along each axis, and the rest.
`path` is collection-relative. `mode` defaults to the collection's default mode.

- A segment is a part when its key is a value of an axis in the vocabulary in
  force at its parent group. Any other segment is a plain subgroup and stays in
  `rest`.
- The first segment is never a part, even under a root vocabulary: a top-level
  group is a component. The last segment is the token itself, so it is never a
  part either.
- `parts` lists the parts in the order the path passes them. The vocabulary's
  order does not apply here. It decides which part wins where two match at
  once (see [`applies()`](#appliescomponent-selection-mode-recordstring-string)).
- Each part's `twin` is the path with that part removed: the twin along its axis. `rest` is the path with every
  part removed. See [the twin](./model.md#glossary).
- `twinExists` and `restExists` say whether that path is a token with a value in `mode`, or, when `mode` is
  omitted, in some mode.
- `component` is the group directly above the first part, `null` when the path passes through none.

```typescript
collection.partsOf('button.selected.hover.backgroundColor');
```

```json
{
  "parts": [
    {
      "at": "button.selected",
      "key": "selected",
      "axis": "selection",
      "spelling": "[aria-pressed='true']",
      "twin": "button.hover.backgroundColor",
      "twinExists": true
    },
    {
      "at": "button.selected.hover",
      "key": "hover",
      "axis": "state",
      "spelling": ":hover",
      "twin": "button.selected.backgroundColor",
      "twinExists": true
    }
  ],
  "rest": "button.backgroundColor",
  "restExists": true,
  "component": "button"
}
```

A child group is no part. `collection.partsOf('button.icon.color')` returns
`{ "parts": [], "rest": "button.icon.color", "restExists": true, "component": null }`.

#### `partAt(group, mode?): Part | null`

The part a group is, or `null`. A group is a part when its own key is a value of an axis in the vocabulary in
force at its parent; its `twin` is the group's path with that segment removed. A top-level group is never one.

```typescript
collection.partAt('button.selected');
// { at: 'button.selected', key: 'selected', axis: 'selection', spelling: "[aria-pressed='true']",
//   twin: 'button', twinExists: true }
collection.partAt('button.icon'); // null
```

#### `axesOf(group, mode?): Axis[]`

The axes the parts below a group use, and the values of each, in **precedence order**: the axes as the vocabulary
in force at the group declares them, the values of an axis as it declares them. The order of the keys in the
document carries no meaning. The parts read are those of the group's own tokens, whose component is the group or a
group above it; a component nested in the group keeps its axes to itself.

```typescript
collection.axesOf('button');
// [{ axis: 'variant', values: ['primary'] },
//  { axis: 'state', values: ['hover', 'pressed', 'disabled'] },
//  { axis: 'selection', values: ['selected'] }]
collection.axesOf('button.selected'); // [{ axis: 'state', values: ['hover'] }]
```

With a `mode`, only tokens with a value in it count; without, a value in any mode counts.

#### `applies(component, selection, mode?): Record<string, string>`

Under a selection of part values, the token that supplies each key of a component: key, then the token's path.

- The candidates for a key are the component's own token of that name, and the part tokens of that name whose
  every segment between the component and the key is a part the selection selects. A token in a plain subgroup
  (`button.icon.color`) is no key of the component.
- The candidate with **more parts** wins.
- On a tie, the one whose **latest differing axis** comes later in the vocabulary wins.
- The order of the keys in the document never matters. Keys come in the order the document first gives them.

```typescript
collection.applies('button', { variant: 'primary', state: 'hover' });
// { backgroundColor: 'button.hover.backgroundColor', color: 'button.primary.color',
//   paddingBlock: 'button.paddingBlock', borderRadius: 'button.borderRadius', font: 'button.font' }
```

`button.primary.backgroundColor` and `button.hover.backgroundColor` have one part each; `state` comes after
`variant`, so the hover background applies.

#### The `Part`, `Parts` and `Axis` types

```typescript
interface Part {
  at: string;          // the path up to and including the segment: 'button.selected'
  key: string;         // the segment: 'selected'
  axis: string;        // the axis the key is a value of: 'selection'
  spelling: string;    // the vocabulary's spelling for it: "[aria-pressed='true']"
  twin: string;        // the path with this part removed: the twin along its axis
  twinExists: boolean; // whether the twin is a token with a value in the mode asked (in some mode when none is)
}

interface Parts {
  parts: Part[];
  rest: string;             // the path with every part removed
  restExists: boolean;
  component: string | null; // the group directly above the first part
}

interface Axis {
  axis: string;
  values: string[];         // in the vocabulary's order
}
```

All three are exported from `@toghen/lib` as types.

#### Errors from the parts methods

Each is an `InvalidTokenError`.

| Thrown by | Message | Cause |
|---|---|---|
| `vocabularyAt()`, and the other parts methods for a path that passes the holder | `Invalid parts vocabulary on group '<group>': expected an object of axes, each an object of value -> spelling string.`, or `... on the document root: ...` for the root | A holder's `css.parts` has the wrong shape (`false` is the only other value). The message names the holder |
| `partsOf()`, `partAt()`, `axesOf()`, `applies()` | `Key '<key>' is a value of two axes ('<first axis>' and '<second axis>') in the parts vocabulary at group '<group>'.` | One key is a value of two axes in one vocabulary |
| `partsOf()`, `partAt()`, `axesOf()`, `applies()` | `Path '<path>' nests two parts of axis '<axis>': '<first key>' and '<second key>'. Give the group "com.toghen": { "css": { "parts": false } }, or rename a key.` | Two values of one axis nest in one path |

For the nested case, the running example gives:

```text
Path 'button.hover.pressed.backgroundColor' nests two parts of axis 'state': 'hover' and 'pressed'. Give the group "com.toghen": { "css": { "parts": false } }, or rename a key.
```

### Utility methods

#### `getAllPaths(mode?, under?): string[]`

The token paths that have a value in `mode`, in document order: every one, or those under a path. A token shared
across modes appears in every mode; a per-mode token appears only where it is defined. Under a group, the tokens
anywhere below it; under a token, the token itself; under a path that is neither, none.

```typescript
const paths = collection.getAllPaths();                       // default mode
const darkPaths = collection.getAllPaths('dark');
collection.getAllPaths('theme=dark', 'button.selected');      // ['button.selected.backgroundColor', 'button.selected.hover.backgroundColor']
```

#### `childrenOf(group, mode?): Child[]`

The children of a group, in document order, each marked token or group. The root is `''`. A child token is listed
when it has a value in `mode`; a child group when some token under it has. With no mode, a value in any mode
counts. A token, or a path that is nothing, has no children: [`getNodeKind()`](#getnodekindpath-token--group--missing) says which.

```typescript
collection.childrenOf('button');
// [{ key: 'backgroundColor', path: 'button.backgroundColor', kind: 'token' }, …,
//  { key: 'icon', path: 'button.icon', kind: 'group' }, { key: 'primary', path: 'button.primary', kind: 'group' }, …]
```

```typescript
interface Child {
  key: string;
  path: string;
  kind: 'token' | 'group';
}
```

#### `getModes(): string[]`

Returns the list of available modes.

```typescript
const modes = collection.getModes(); // ['light', 'dark']
```

#### `getDefaultMode(): string`

The mode used when a call omits one. For a collection a resolver built, it is the mode where every modifier is at its declared default, in the product build as in the sum, wherever the build placed that combination. For a collection built by hand, it is the first declared mode. Callers resolving a `'default'` sentinel read this rather than `getModes()[0]`, which differ in the product build when a modifier declares another context before its default.

```typescript
collection.getDefaultMode(); // 'light'
```

#### `modeNamed(name): string`

The declared mode `name` stands for: a declared mode name is itself, and
`modifier=context` pairs name the mode whose contexts are the defaults with
those changed (see [Naming a mode by its contexts](#naming-a-mode-by-its-contexts)).
Modifier and context names in a pair match regardless of case, as a
`Resolver` input does; a declared mode name matches as declared. Every method
here that takes a mode accepts either spelling through it. Throws
`InvalidModeError` otherwise.

#### `setModeContexts(modes, modifiers): void`

Records, for each mode, the context it stands for under every modifier, and the
modifiers themselves in declared order. `Resolver` calls it when it builds a
collection; it is what makes `modeNamed()` understand `modifier=context`, and what makes the mode of the declared
defaults the default mode.

#### `resolver?: Resolver`

The `Resolver` that built the collection, set by `resolveAllToDesignSystem()`
and `resolveContextsToDesignSystem()`; `undefined` for a collection built by
hand. An adapter that needs the per-modifier questions
([`dependsOn`, `contextsOf`, `valueAt`](#querying-one-token-across-contexts)), or the modifiers
([`getModifiers`](#getmodifiersorder-modemodifier)), asks the collection for its resolver rather than taking one as an option.

#### `check(): Check`

What is wrong with the collection's tokens, in one call: the tokens with no value in some mode and, for a
collection a resolver built, the holes of every chain and every non-factorable token. A token added by hand, which
the resolver's document does not hold, is checked for its modes only.

```typescript
collection.check();
// { incomplete: [{ path: 'card.glow', missingModes: ['low/light', 'high/light'] }],
//   holes: [{ path: 'card.glow', property: '$value', holes: [{ theme: 'light' }] }, …],
//   nonFactorable: [{ path: 'card.shadow', property: '$value', reason: 'partial-composite', … }] }
```

```typescript
interface Check {
  incomplete: Array<{ path: string; missingModes: string[] }>;
  holes: Array<{ path: string; property: LeafProperty; holes: Array<Record<string, string>> }>;
  nonFactorable: NonFactorable[];
}
```

Two sources of one set or context giving one token a value are reported by
[`load`](#loadentry-options-promiseloadresult), as `result.collisions`: a collection does not know files.

---

## DesignSystem

The resolved system: its collections, and the answers about a token by its lookup path: its value, the token
resolved, and the references it makes.

### Reference paths vs lookup paths

These are two different namespaces:

| | Form | Relative to |
|---|---|---|
| **Lookup path**: the argument to `resolveValue()`, `resolveToken()`, `referencesOf()`; what `TokenReference.to` holds | `collectionName.tokenPath`, and for `resolveValue()` optionally `.member…` | the `DesignSystem` |
| **Reference path**: the text inside a `$value` | `{tokenPath}` | the **document root**, i.e. the collection owning the token |

```typescript
const theme = system.getCollection('theme')!;
theme.setToken('color.blue', new DesignToken('#0066cc', 'color'));

// The reference carries no collection name...
theme.setToken('color.brand', new DesignToken('{color.blue}', 'color'));

// ...while the lookup does.
system.resolveValue('theme.color.brand');
// { colorSpace: 'srgb', components: [0, 0.4, 0.8], hex: '#0066cc' }
```

The `DesignSystem` resolves references within the collection that owns the token, so they never cross collection boundaries, and a token document stays portable: renaming the collection does not touch its references.

A lookup path given to `resolveValue()` may continue past the token into its
resolved value, one own member or array index per segment:
`theme.type.body.fontSize`, `theme.elevation.raised.0.color`,
`theme.color.blue.components.0`. It is the lookup-path form of the W3C JSON
Pointer `$ref` (Format §7, Example 32). A reference path cannot do this: the
curly-brace syntax targets whole tokens only.

**The one-collection shorthand.** In a system of one collection, every method that takes a lookup path also takes
a reference path, and puts the collection's name in front: `system.resolveValue('button.backgroundColor')` is
`system.resolveValue('ds.button.backgroundColor')`. A first segment that names a collection is the collection, so a
group named like the collection loses: in a collection `ds` holding a group `ds`, `ds.gap` is the token `gap`, and
the group's token is `ds.ds.gap`. With two collections or more, a path must name its collection.

#### `lookupPath(path): string`

The lookup path a path stands for, by the rule above. Throws `CollectionNotFoundError` when the first segment names
no collection and the system has more than one.

```typescript
system.lookupPath('button.backgroundColor');    // 'ds.button.backgroundColor'
system.lookupPath('ds.button.backgroundColor'); // 'ds.button.backgroundColor'
```

#### `referencePath(lookupPath): string`

A named export, not a method: the path without its collection segment, as a reference inside a token writes it.

```typescript
referencePath('ds.button.backgroundColor'); // 'button.backgroundColor'
```

### DesignSystem constructor

```typescript
new DesignSystem()
```

### Collection management

#### `addCollection(collection): void`

Adds a collection to the system. Throws if a collection with that name is already registered, because replacing one silently would repoint the original's references at the replacement's tokens.

```typescript
system.addCollection(colors);
```

#### `getCollection(name): Collection | null`

Retrieves a collection by name; `null` when there is none.

```typescript
const colors = system.getCollection('colors');
```

#### `getCollectionNames(): string[]`

Returns the names of all registered collections.

### Token resolution

#### `resolveValue(path, mode?): any`

Resolves a token value, expanding every reference it contains, including those nested inside composite values and arrays. `mode` defaults to the string `'default'`. Every method of `DesignSystem` that takes a mode reads that sentinel as "this collection's default mode" (`getDefaultMode()`), whatever that mode is called. A collection may declare a mode named `default` too, and the two then coincide. `resolveToken()`, `referencesOf()` and `getToken()` take the same sentinel.

Throws on a dangling, malformed, or circular reference rather than passing the
`{...}` text through. See [Error Classes](#error-classes).

A value written with a reference is **computed once it resolves**, as its type stores a literal (see
[Token values](#token-values)): the resolved value goes through the type's handler before it is returned, and before
a member path walks it. The type is the one `resolveToken()` gives. A literal comes back as stored.

```typescript
// ink: '#112233'; shadow.raised.color: 'color-mix(in srgb, {ink} 5%, transparent)'
system.resolveValue('ds.shadow.raised.color'); // { colorSpace: 'srgb', components: [0.0667, 0.1333, 0.2], alpha: 0.05 }
// space.md: { value: 1, unit: 'rem' }; space.lg: 'calc({space.md} * 2)'
system.resolveValue('ds.space.lg');            // { value: 2, unit: 'rem' }
```

A resolved value its type cannot compute throws `InvalidTokenError`, naming the token, the mode, the member and
the resolved string:

```text
Token "ds.shadow.raised" (mode "light"): color: 'color-mix(in srgb, currentColor 5%, #112233)' cannot be computed: currentColor has no value until an element uses it.
Token "ds.space.pad" (mode "default"): '1rem 1rem' cannot be computed: it is a list of values, not one dimension; leave the token untyped to keep it as written.
```

```typescript
const value = system.resolveValue('colors.primary.blue'); // { colorSpace: 'srgb', …, hex: '#0066cc' }
const darkValue = system.resolveValue('colors.ui.background', 'dark');
```

The path may continue into the resolved value. The owning token is resolved
first, with references expanded and the mode respected; the remaining segments
then walk that value. The rule is the same for every type: any value with own
members can be walked, a composite or a structured scalar.

```typescript
system.resolveValue('ds.type.body.fontSize');       // { value: 1, unit: 'rem' }
system.resolveValue('ds.elevation.raised.0.color'); // the colour of layer 0
system.resolveValue('ds.space.4.value');            // 1
system.resolveValue('ds.color.blue.components.0');  // 0
```

Only own members count. An array takes numeric indices, never `length`. A miss
is a `PathNotFoundError` that names what exists:

```text
'type.body' has no member 'fontSze'. Its members: fontFamily, fontSize, fontWeight, lineHeight, letterSpacing.
'elevation.raised' has no index 3. It has 2 entries.
'space.4' is a string, so it has no member 'value'.
```

A path with no token at any prefix keeps the plain error,
`Token 'nothing.here' not found in collection 'ds' for mode 'light'.`

A member is not a token: `resolveToken()` returns `null` for a member path.

#### `referencesOf(path, mode?): TokenReference[]`

Reports the references a token's value makes, as written, where `resolveValue()`
reports what they resolve to. One [`TokenReference`](#tokenreference) per
reference, in document order of members, depth-first. A literal makes none.

```typescript
system.referencesOf('ds.type.body');        // [{ at: 'fontFamily', to: 'ds.font.family.sans', interpolated: false, written: '{font.family.sans}' },
                                            //  { at: 'fontSize', to: 'ds.font.size.md', interpolated: false, written: '{font.size.md}' }]
system.referencesOf('ds.elevation.raised'); // [{ at: '0.color', to: 'ds.color.brand', interpolated: false, written: '{color.brand}' }]
system.referencesOf('ds.color.button.bg');  // [{ at: '', to: 'ds.color.brand', interpolated: false, written: '{color.brand}' }]
system.referencesOf('ds.color.brand');      // []
```

- `at` is in the lookup path's member grammar, so `referencesOf('ds.type.body')`
  reporting `at: 'fontSize'` and `resolveValue('ds.type.body.fontSize')` speak of
  the same member.
- `to` is the **first hop**, what the author wrote, qualified with the owning
  collection's name.
- The read is **syntactic**: it does not check that the target exists or is a
  token. Resolution errors remain `resolveValue()`'s job.
- The mode is respected exactly as `resolveValue()` respects it. A path that is
  not a token (missing, a group, or a member path) throws `PathNotFoundError`
  with the token-not-found message.

#### `resolveToken(path, mode?): DesignToken | null`

Returns a resolved `DesignToken` with all references expanded, its value computed as `resolveValue()` computes it. A resolved value its type cannot compute throws `InvalidTokenError`, as there.

Returns `null` when the **lookup** fails (a malformed path, an unknown collection, or no token there). A resolution failure throws instead, so a broken token is never mistaken for an absent one.

`$type` follows W3C §5.2.2 precedence: the token's own `$type`, else the
resolved type of the token it references, else the nearest parent group's
`$type`.

```typescript
const token = system.resolveToken('colors.primary.blue');
```

---

## Resolver

Implements the W3C Design Tokens Resolver specification for multi-mode and multi-theme workflows.

### Resolver constructor

```typescript
new Resolver(document: ResolverDocument)
```

### The document: `ResolverDocument`

```json
{
  "version": "2025-11-01",
  "name": "My Design System",
  "description": "optional",
  "sets": {
    "foundation": {
      "sources": [{ "color": { "primary": { "$value": "#0000ff", "$type": "color" } } }]
    }
  },
  "modifiers": {
    "theme": {
      "contexts": {
        "light": [{ "$ref": "#/sets/foundation" }],
        "dark":  [{ "color": { "primary": { "$value": "#ffffff", "$type": "color" } } }]
      },
      "default": "light"
    }
  },
  "resolutionOrder": [
    { "$ref": "#/sets/foundation" },
    { "$ref": "#/modifiers/theme" }
  ]
}
```

| Field | Required | Type | Description |
|---|---|---|---|
| `version` | yes | `"2025-11-01"` | The one version the specification fixes |
| `name` | — | `string` | Names the collection the resolver builds, unless `collectionName` is given |
| `description` | — | `string` | Read by the `description` getter |
| `sets` | — | `Record<string, ResolverSet>` | Named static layers; a `ResolverSet` is `{ sources: TokenSource[], description?, $extensions? }` |
| `modifiers` | — | `Record<string, ResolverModifier>` | Named conditional layers: `{ contexts: ModifierContexts, default?, description?, $extensions? }`, where `ModifierContexts` maps a context name to its `TokenSource[]` |
| `resolutionOrder` | yes | `ResolutionOrderItem[]` | The merge order; a later item overrides an earlier one, per path |
| `$defs` | — | | Ignored, as the specification requires |

- A `TokenSource` is an inline token tree or a `ReferenceObject`, `{ "$ref": "…" }`.
- A `ResolutionOrderItem` is a `ReferenceObject` naming `#/sets/<name>` or `#/modifiers/<name>`, or an `InlineSet` / `InlineModifier`, `{ name, type: 'set' | 'modifier', sources | contexts }`.
- `Resolver` follows same-document pointers only (RFC 6901: `~1` is `/`, `~0` is `~`); a pointer to a file is inlined first by [`load`](#loadentry-options-promiseloadresult).
- `ResolverModifierDef` is an alias of `ResolverModifier`.

A `ResolverInput` is `Record<string, string>`: a modifier name to a context name, matched regardless of case. It is what `resolve()`, `resolveToDesignSystem()`, `getModeName()` and the query methods that take an input take.

Why the document is shaped this way, and the stages it goes through, are in [specs.md](./specs.md#w3c-resolver-module).

Validates the document on construction. Throws `ResolverValidationError` if the document is invalid. Safe to create once and call `resolve()` many times with different inputs.

### `name` (getter)

```typescript
get name(): string | undefined
```

Document name, if set.

### `description` (getter)

The document's root `description`, or `undefined`.

### `getDeclaredVersion(namespace?): string | undefined`

```typescript
getDeclaredVersion(namespace = 'com.toghen'): string | undefined
```

The version the design system declares for **itself**, if it declares one.

Not the document's `version` field. §4.1.2 fixes that at `"2025-11-01"` and
reserves it for breaking changes to the format. It is identical in every
conforming document and says nothing about the system described by it.

The spec provides no root-level place for a system's own version. It does
provide `$extensions`, and §4.3 is specific about where: *"An `$extensions`
object MAY be added to any set, modifier, or inline set/modifier"*. The root is
not among them. So a system versions itself from a set or a modifier:

```json
{
  "version": "2025-11-01",
  "name": "demo",
  "sets": {
    "primitives": {
      "$extensions": { "com.toghen": { "version": "1.0.0" } },
      "sources": [ ... ]
    }
  }
}
```

Optional, and absent from most documents. A tool showing several documents to a
person can use it to tell two revisions of one system apart; nothing in
resolution depends on it.

Sets are searched in declaration order, then modifiers, then inline
sets/modifiers in `resolutionOrder`, and **the first declaration wins**. Several
parts of one document disagreeing about the version of the whole is a
contradiction for the document to settle, not one to resolve by merging.

Pass `namespace` to read another vendor's key. A version that is not a non-empty
string is ignored; surrounding whitespace is trimmed.

### `resolve(input?): Record<string, any>`

Returns a flat DTCG token object. Token aliases (e.g., `{ $value: '{color.primary}' }`) are **preserved as strings**.

```typescript
const tokens = resolver.resolve({ theme: 'dark' });
// tokens.color.primary.$value → '#ffffff' — as written: resolve() only merges
```

### `resolveToDesignSystem(input?, system?, collectionName?): DesignSystem`

Calls `resolve()` for **one** context, loads the result into a single-mode `Collection`, and returns a `DesignSystem` with aliases fully resolved by the core engine. Pass an existing `system` to inject the resolved collection alongside others.

```typescript
const ds = resolver.resolveToDesignSystem({ theme: 'dark' });
const token = ds.resolveToken('resolved.color.primary');
// token.$value → { colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' }
```

The resulting collection has one mode, so asking it for a different one throws `InvalidModeError`. Use `resolveAllToDesignSystem()` when one system has to answer for several contexts.

### `resolveAllToDesignSystem(system?, collectionName?): DesignSystem`

Resolves **every** permutation into a single multi-mode `Collection`, one mode per permutation, named by `getModeName()`. This is what gives the `mode` argument meaning downstream: `resolveValue(path, 'dark')`, `toghen(path, dark)` in CSS. The modes keep the order of `getPermutations()`; the default mode is the combination of every modifier's declared default, wherever it falls, as in the sum build.

```typescript
const ds = resolver.resolveAllToDesignSystem();

ds.getCollection('my-system')?.getModes();            // ['light', 'dark']
ds.resolveValue('my-system.color.bg');                // default mode
ds.resolveValue('my-system.color.bg', 'dark');        // dark
```

Documents with no modifiers produce a single mode named `'default'`.

### `resolveContextsToDesignSystem(combinations?, system?, collectionName?): DesignSystem`

Resolves the defaults, and each context of each modifier on its own, into one
multi-mode `Collection`: the **sum** of the contexts, where
`resolveAllToDesignSystem()` builds their product. It is the build for
modifiers switched independently at runtime, each by its own attribute or class.
Modes are named by `getModeName()`, as in the full build. A combination is built
only when it is listed in `combinations`.

```typescript
// theme: light|dark, density: cosy|compact|spacious
const ds = resolver.resolveContextsToDesignSystem([{ theme: 'dark', density: 'compact' }]);

ds.getCollection('ds')?.getModes();
// ['light/cosy', 'dark/cosy', 'light/compact', 'light/spacious', 'dark/compact']
ds.resolveValue('ds.space.md', 'density=compact');
```

Four modifiers with 2, 3, 3 and 6 contexts build 11 modes here, 108 in the full build.

### Naming a mode by its contexts

Wherever a mode is accepted, against a collection built by either method above, it may be named by the contexts that differ from the defaults: `modifier=context`, several separated by spaces, in any order.

- `density=compact` is the defaults with density compact.
- `theme=dark density=compact` is that combination.
- Naming a default (`theme=light`) is the default mode.

The full name (`dark/compact`) keeps working. `Collection.modeNamed()` does the translation, and throws `InvalidModeError` for an unknown modifier, an unknown context, or a combination the collection did not build.

### `getModeName(input): string`

The canonical mode name for a set of modifier selections: context values joined with `/` in the order the document declares its modifiers (the order of [`getModifiers()`](#getmodifiersorder-modemodifier)), so the name never depends on the input object's key order. An omitted modifier contributes its `default`. A modifier with no `default` and no selection contributes nothing: `getModeName()` leaves it out of the name, where `resolve()` would refuse it.

```typescript
// modifiers: theme (default 'light'), density (default 'cosy')
resolver.getModeName({ theme: 'dark' });                     // 'dark/cosy'
resolver.getModeName({ density: 'compact', theme: 'dark' }); // 'dark/compact'
resolver.getModeName({});                                    // 'light/cosy'
```

### `getModifiers(order?): ModeModifier[]`

The document's modifiers, as `{ name, contexts, default?, description?, $extensions? }`.

- In the order the document **declares** them, top-level modifiers first, then inline ones in `resolutionOrder`.
  This is the contract: the order every list of modifiers follows, and the order a mode name joins contexts in.
- Asked for `'precedence'`, in the order they **win**: the order `resolutionOrder` applies them, a later one
  winning, with any it never names last. An adapter that writes one block or one layer per modifier needs this
  order, so the cascade agrees with the resolver.

```typescript
// modifiers declared shape, theme, density; resolutionOrder applies theme, density, shape
resolver.getModifiers().map((m) => m.name);             // ['shape', 'theme', 'density']
resolver.getModifiers('precedence').map((m) => m.name); // ['theme', 'density', 'shape']
```

Adapters read a context's spelling from a modifier with
[`getContextSelector`](#getcontextselectormodifier-context-contextselector--undefined).

### `getPermutations(): ResolverInput[]`

Returns every possible permutation of modifier context selections as an array of `ResolverInput` objects (Cartesian product).

```typescript
// For theme{light,dark} × density{compact,spacious}:
[
  { theme: 'light', density: 'compact' },
  { theme: 'light', density: 'spacious' },
  { theme: 'dark',  density: 'compact' },
  { theme: 'dark',  density: 'spacious' },
]
```

For a document with no modifiers, returns `[{}]` (one permutation, empty input).

---

## Querying one token across contexts

> Exported from `@toghen/lib`: the types `LeafProperty`, `Step`, `Chain`, `ChainLink`, `NonFactorable`, `TokenContexts`; the three methods are on `Resolver`. The names *home modifier*, *fall-through*, *chain* and *link* are still candidates to be christened, and the member names that follow them change with the christening.
>
> What a chain is, why the unit is the leaf property, the evidence behind it, and the rules for the two consumers are in [specs.md](./specs.md#querying-one-token-across-contexts); this section holds only signatures, shapes and errors.

Three methods on `Resolver`. A path is a **reference path** (relative to the document, no collection name; see [Reference paths vs lookup paths](#reference-paths-vs-lookup-paths)). A generated path (`color.bg~scheme`) is accepted wherever a path is. An `input` is a `ResolverInput` that may name any subset of the modifiers; an omitted modifier takes its default.

### Type: LeafProperty, Step, Chain

```typescript
type LeafProperty = '$value' | '$type' | '$description' | '$extensions';

/** What one context of one link says. */
type Step =
  | { value: unknown; base?: true } // the definition; a `$value` in the shape lib stores, a reference as written;
                                    // with `base: true`, the base carried into a context that defines nothing
  | { fallThrough: string }     // the context does not define it; the path is the next link's token
  | { hole: true };             // the last link, no base: no value in this context

interface ChainLink {
  /** The home modifier. */
  modifier: string;
  /** The token that carries this link: the token itself for the first, a generated path for the rest. */
  path: string;
  /** One step per context of the modifier: dense. */
  steps: Record<string, Step>;
}

interface Chain {
  property: LeafProperty;
  /** Last-winning first. Empty when only sets define the property. */
  links: ChainLink[];
  /** A set's value when every link falls through; `undefined` if no set defines the property. */
  base: unknown;
  /** Combinations of the links' home modifiers in which the property has no value. Empty unless `base` is undefined. */
  holes: Array<Record<string, string>>;
}
```

The last link's non-defining contexts carry the base as `{ value: base, base: true }` when there is one, so a consumer that wants a value in every cell reads `steps` alone, and one that wants only what a context defines skips the steps marked `base`. A context that defines the same value as the base is a definition, and is not marked. For a property other than `$value`, `{ hole: true }` means only that the token does not define the property in that context.

A `$value` chain's values, each step's and the `base`, come in the shape lib stores, as a stored token and `resolveValue()` give a literal: a hex string is a structured colour, `'24px'` is `{ value: 24, unit: 'px' }`, and a `fontFamily` string with commas is an array. The type is the token's own, its `$type` or else its nearest group's, never one reached through a reference. Where the type differs between contexts, each step takes the type of its own context: the step's modifier at that context and every other modifier at its default (a modifier with no default defines no type there). The `base` takes the type with every modifier at its default. A token with no type of its own keeps its values as written. A reference is never touched, wherever it stands: a whole reference, a reference in a member of a composite, a reference inside a longer string. A value holding one stays exactly as written, members and all, doubled braces included; it is computed only when it resolves, by `valueAt()` or `resolveValue()` (see [Token values](#token-values)). The `$type`, `$description` and `$extensions` chains carry what the document writes.

### Type: NonFactorable

```typescript
interface NonFactorable {
  /** The token, as a reference path. */
  path: string;
  property: LeafProperty;
  reason: 'partial-composite';
  /** The sets and modifier contexts that make it so, in `resolutionOrder`. `context` is absent for a set. */
  involved: Array<{ entry: string; context?: string }>;
  /** One sentence for a person. */
  detail: string;
}
```

`partial-composite`: a plain-object `$value` (or `$extensions`, which merges the same way; `property` says which) merged onto a plain-object `$value` beneath it, in some cell, whose result differs from the incoming object alone (a `{unit}` after `{value, unit}`; a shadow's `blur` alone). It is the only reason a token is reported. Three cases follow:

- The resolver reports it only when it would output it: some way through the contexts reaches the end of `resolutionOrder` with the merged result.
- A partial that a later modifier replaces whole in every one of its contexts never shows. The resolver does not report it, and the token's chain stops at that modifier.
- A shape change across contexts (a literal in one, an alias in another) is not reported and is factorable.

The reasons are in [specs.md](./specs.md#report-do-not-factor).

### Type: TokenContexts

```typescript
interface TokenContexts {
  path: string;
  /** One chain per leaf property the token defines anywhere. */
  chains: Partial<Record<LeafProperty, Chain>>;
  /** Paths of the generated tokens: one per link after the first, in the `$value` chain. */
  generated: Array<{ path: string; of: string; modifier: string }>;
  /** Empty when every property factors. A non-empty report is returned, never thrown. */
  nonFactorable: NonFactorable[];
}
```

A generated token, where an adapter materialises one, carries `$extensions["com.toghen"].generated = { of, modifier }`.

### Method: dependsOn

```typescript
dependsOn(path: string): { direct: string[]; through: string[] }
```

- `direct`: the modifiers of the token's `$value` chain, in `resolutionOrder` (a modifier below one that defines the `$value` in every context cannot show through, so it is not counted; for a non-factorable token, every modifier a context of which defines it).
- `through`: the modifiers reached by following the references in its `$value`, transitively, across every cell, minus those already in `direct`.

The chain stops where `through` stops, so the two together are the modifiers a consumer must scope.

```typescript
resolver.dependsOn('button.bg');   // { direct: ['scheme', 'tone'], through: [] }
```

A token that is in no chain's links depends on nothing: `{ direct: [], through: [] }`.

**Throws** `PathNotFoundError` for a path that is not a token of the document and not a generated path. A reference to nothing, or a cycle, throws as it does in resolution (`UnresolvableReferenceError`, `CircularReferenceError`). The `UnresolvableReferenceError` names the reference as written, the token, the collection a build of the document is named (the document's `name`, else `resolved`), and the mode of the context the reference is written in (the defaults for the base).

### Method: contextsOf

```typescript
contextsOf(path: string): TokenContexts
```

The chains of the token, its generated paths, its holes, and its report. Does not take an input: it describes the whole token.

```typescript
resolver.contextsOf('button.bg').chains.$value;
// {
//   property: '$value',
//   links: [
//     { modifier: 'tone',   path: 'button.bg',
//       steps: { neutral: { fallThrough: 'button.bg~scheme' },
//                primary: { value: { colorSpace: 'srgb', components: [0.1, 0.4, 0.9] } } } },
//     { modifier: 'scheme', path: 'button.bg~scheme',
//       steps: { light: { value: { colorSpace: 'srgb', components: [0.9, 0.9, 0.9] }, base: true },
//                dark:  { value: { colorSpace: 'srgb', components: [0.2, 0.2, 0.2] } } } },
//   ],
//   base: { colorSpace: 'srgb', components: [0.9, 0.9, 0.9] },
//   holes: [],
// }
resolver.contextsOf('shadow.card').nonFactorable;
// [{ path: 'shadow.card', property: '$value', reason: 'partial-composite',
//    involved: [{ entry: 'base' }, { entry: 'density', context: 'compact' }], detail: '…' }]
```

For a non-factorable property `chains` omits that property and `nonFactorable` names it; the token still resolves early-bound.

**Throws** `PathNotFoundError`; a generated-path collision (a document that already holds a token at a generated path) as `InvalidReferenceError`; and `InvalidTokenError`, naming the token, for a `$value` its type rejects, as loading it would.

### Method: valueAt

```typescript
valueAt(path: string, input?: ResolverInput): unknown
```

The final value under `input`, with every reference followed. Late binding: the token's chain is read at `input`, and so is the chain of every token it references, each reading only its own modifiers. The result is what `DesignSystem.resolveValue()` returns for the same token against `resolveToDesignSystem(input)`, shape included.

```typescript
resolver.valueAt('button.bg', { tone: 'primary' });
// { colorSpace: 'srgb', components: [0.1, 0.4, 0.9] }   (checked against resolveToDesignSystem)
```

A non-factorable token still resolves: the call answers early-bound for it. The name differs from `DesignSystem.resolveToken()`, which returns a `DesignToken | null`; this method returns a value.

**Throws** `PathNotFoundError` for an unknown path, and for a hole (the message names the cell); `InvalidInputError`; and the reference errors of `resolveValue()`. A value written with a reference is computed as `resolveValue()` computes it, and one its type cannot compute throws `InvalidTokenError`. The answer is built in a collection named `resolved`, so the message names the token `resolved.<path>`: `Token "resolved.shadow.raised" (mode "default"): color: …`.

### Errors

The errors above are the existing classes; see [Error Classes](#error-classes). A non-factorable token is reported
by `contextsOf()`, never thrown.

---

## `getContextSelector(modifier, context): ContextSelector | undefined`

How a modifier's context appears in CSS, read from the modifier's
`$extensions["com.toghen"].css`, so every adapter reads one spelling:

```json
"density": {
  "default": "cosy",
  "contexts": { "cosy": [], "compact": [] },
  "$extensions": { "com.toghen": { "css": {
    "selector": "[data-density='{context}']",
    "contexts": { "compact": { "selector": ".compact" } }
  } } }
}
```

| Member | Meaning |
|---|---|
| `selector` | The selector a context's block goes under. `{context}` is replaced by the context's name |
| `atRule` | An at-rule the block is wrapped in, e.g. `@media (prefers-color-scheme: {context})`. Alone, the block sits under the stylesheet's root selector |
| `contexts.<name>` | `{ selector?, atRule? }` replacing the pattern whole for that context |

Returns `{ selector?, atRule? }`, or `undefined` when the modifier
gives no spelling for that context.
Throws `ResolverValidationError` when `selector` or `atRule` is not a string, or an `atRule` does not start
with `@`: the fault is in the modifier's `$extensions`. `modifier` is a resolver document's
modifier or one from `collection.getModifiers()`.

---

## `load(entry, options): Promise<LoadResult>`

```typescript
load(entry: string | string[], options: LoadOptions): Promise<LoadResult>
```

Reads `entry` and returns one resolver document with every file reference
inlined, ready for `new Resolver(document)`.

```typescript
const { document, origins } = await load('tokens/ds.resolver.json', {
  read: (path) => readFile(path, 'utf8'),
});
const { document: plain } = await load(['tokens/primitives.tokens.json', 'tokens/roles.tokens.json'], {
  read: (path) => readFile(path, 'utf8'),
});
const { document: warm } = await load('tokens/ds.resolver.json', {
  read: (path) => readFile(path, 'utf8'),
  overrides: { 'roles.tokens.json': 'roles.warm.tokens.json' },
});
```

**The three forms of `entry`.**

| `entry` | Is read as |
|---|---|
| A string naming a resolver document | That document. A file is a resolver document when its `resolutionOrder` is an array |
| A string naming any other file | One token file: the list form with one file |
| A list of locations | Token files, merged in the order given; the last wins |

Token files are wrapped in memory in a resolver document with one set:

```json
{
  "version": "2025-11-01",
  "name": "<name>",
  "sets": { "base": { "sources": [{ "$ref": "<file relative to the folder>" }] } },
  "resolutionOrder": [{ "$ref": "#/sets/base" }]
}
```

The folder is the files' common folder, and the wrapper is held at
`<folder>/<name>.resolver.json`; `read` is never asked for it. The wrapper is
then loaded as any resolver document, so `document` is a valid resolver
document with the files inlined, and `origins` names the real files. There is
no folder form: list the files.

| | |
|---|---|
| `options.read(location)` | `Promise<string>`: the text at `location`. Rejecting means the file is not there. Lib performs no I/O of its own |
| `options.name` | Token files only: the collection's name, and the wrapper's `name`. Defaults to the base name of the files' common folder. Ignored for a resolver document, which names itself |
| `options.overrides` | `Record<string, string>`, optional: the overrides map, below. A `$ref` as written → the location to read instead |
| `result.document` | The `ResolverDocument` with every reference to another file resolved. `JSON.stringify` of it is a bundle |
| `result.origins` | `Map<string, string[]>`: each token path, collection-relative (`card.background`), to the files that define it, in document order. Under a map, the files actually read |
| `result.reads` | `Array<{ ref, holder, location, overridden }>`: every reference whose resolution reads a file, in the order met. `ref` is the `$ref` as written, `holder` the document it is written in, `location` the file read, `overridden` whether the map sent it there. A same-document pointer the map leaves alone reads no file and is not listed. A set or modifier copied once has its references listed once |
| `result.overrides` | `{ hash: string; unused: string[] }`, present only when a map was given. `hash` is FNV-1a, 64 bits, over the JSON of the map with its keys sorted, as 16 lowercase hex digits: the same map in any key order gives the same hash, and a changed value another. `unused` lists the keys no reference matched, in the map's order |
| `result.collisions` | `Collision[]`: the token paths that two sources of one set, or of one modifier context, both give a `$value`. Empty when there are none. Below |

**What is followed.** A `{ "$ref": "<path>[#<pointer>]" }` in a set's `sources`,
a modifier's contexts, or `resolutionOrder`. The path is relative to the
directory of the file the reference is written in, or absolute; `.` and `..`
are folded, and each file is read once. Sibling keys on the reference are
shallow overrides. What the reference names decides the rest:

| Names | Becomes |
|---|---|
| A token file, or a group in one (`#/color`) | Inlined as a source. A group's members are merged at the root. Refused as an item of `resolutionOrder`, which must name a set or modifier |
| A set of another resolver document (`#/sets/base`) | Copied into `document.sets` under the key `<file>#<name>`, so it cannot clash with a set of the same name; the reference points at the copy |
| A modifier of another resolver document (`#/modifiers/theme`) | Copied into `document.modifiers` under its own name, which is its input key |
| A set or modifier of the entry document | Left as it is |

A copied set or modifier has its own references followed in turn, relative to
its own file. A resolver document is recognised by its `resolutionOrder`;
another document's `resolutionOrder` is never read. References inside token
files are not followed.

**The overrides map.** `options.overrides` is the declarative form of `read`.
Its keys are `$ref` strings as written, matched whole and exactly: the fragment
is part of the key, so `roles.tokens.json` does not catch
`roles.tokens.json#/surface`. Before a reference is resolved, its text is looked
up. On a match the value is read instead, and a relative value is resolved
against the document that holds the reference, as the written one would be. A
value may carry its own fragment. The map applies in every document `load`
reads, the entry and each resolver document a set or modifier is borrowed from,
so one key catches the same text in all of them. A same-document pointer
(`#/sets/base`) is a key like any other. The references of the wrapper around
token files are written references too: each is the file's path relative to the
files' common folder. The reasons are in [specs.md](./specs.md#the-overrides-map).

```typescript
const { reads, overrides } = await load('ds.resolver.json', {
  read,
  overrides: { 'roles.tokens.json': 'roles.warm.tokens.json' },
});
reads[1]; // { ref: 'roles.tokens.json', holder: 'ds.resolver.json', location: 'roles.warm.tokens.json', overridden: true }
overrides; // { hash: '5784d4a9943c490c', unused: [] }
```

**The collision report.** Two sources of one set, or of one modifier context,
that both give one token path a `$value` collide. The standard allows it: the
sources merge in array order and the last wins, and it still does. The report
is advisory. It covers every set in `document.sets`, sets copied from other
resolver documents included, every context of every modifier, and every inline
set or modifier in `resolutionOrder`. It is never made across items of
`resolutionOrder`, where a later item overriding an earlier one is the intent,
nor between a set and a modifier context.

```typescript
interface Collision {
  path: string;        // the token path, collection-relative, as in `origins`
  set?: string;        // the set's key in `document.sets`, or an inline set's name
  modifier?: string;   // with `context`: the modifier and the context whose sources collide
  context?: string;
  files: string[];     // the file of each source that gives it a $value, in merge order; the last wins (a file may repeat)
  redundant: boolean;  // every one of those $values is equal as written
}
```

Exactly one of `set`, or `modifier` with `context`, is present. A source's
file is the token file as read, so under a map the location the map sent it
to; an inline token tree's file is the document it is written in. A source
that points at another set (`{ "$ref": "#/sets/core" }`) counts as that set's
sources, in place. A token is a leaf with a `$value`: a group's `$type` or
`$description` alone never collides. **Redundant** means equal as written:
the `$value`s are compared as JSON with key order ignored, before anything is
resolved, so `"#ffffff"` and `{ "colorSpace": "srgb", "components": [1, 1, 1] }`
are not redundant. The list is ordered by set or context, the entry's sets
first in the order written, then by path as first met.

```typescript
const { collisions } = await load('ds.resolver.json', { read });
// [{ path: 'color.accent', set: 'base', files: ['palette.tokens.json', 'brand.tokens.json'], redundant: false }]
```

**Errors.** `load` throws `InvalidReferenceError`, naming the reference and the file it was written in, when:

- a reference has a URI scheme;
- a file cannot be read or is not JSON;
- a pointer names no group;
- a reference names a whole resolver document, or a set or modifier it does not have;
- two different modifiers share a name;
- sets and modifiers refer back to themselves, in which case the message lists the cycle;
- an item of `resolutionOrder` names tokens where the standard wants a set or modifier;
- a list of token files is empty;
- token files share no folder, or share only the root, and `options.name` is not given. The message says to give `name`;
- a value of the overrides map is not a string.

A mapped reference passes every check a written one does, and `Resolver` still
checks any same-document pointer the map produces. A cycle made through the map
is a cycle. When the map sent a reference elsewhere, the message also names the
location read:
`$ref "roles.tokens.json" in "ds.resolver.json" (mapped to "shared/core.resolver.json") names a resolver document; …`.

---

## Error classes

All are named exports supporting `instanceof` checks.

| Class | Thrown by | Common causes |
|---|---|---|
| `InvalidTokenError` | `Collection.setToken`, `Collection.setGroupAttribute`, `Collection.getGroupAttribute`, the parts methods (`vocabularyAt()`, `partsOf()`, `partAt()`, `axesOf()`, `applies()`), `normalizeTokenValue()`, `DesignSystem.resolveValue()`, `resolveToken()`, `Resolver.valueAt()`, `contextsOf()` | A path segment that is empty or starts with `$`, a path that would make one node both a token and a group, or a group attribute set on a token's path; a group attribute name without `$`; a value its type rejects, on load or once it resolves; an invalid parts vocabulary, a key that is a value of two axes, or a path nesting two parts of one axis. The `DesignToken` constructor itself never throws |
| `PathNotFoundError` | `DesignSystem.resolveValue()` | Lookup path doesn't exist |
| `UnresolvableReferenceError` | Resolution engine | A `{reference}` inside a `$value` names no token, names a group, or is malformed. Extends `PathNotFoundError`; carries `reference`, `tokenPath`, `collectionName`, `mode`, `reason` (`'not-found' \| 'group' \| 'no-value' \| 'malformed'`) |
| `InvalidInterpolationError` | Resolution engine | A non-scalar was interpolated into a string. Extends `InvalidTokenError`; carries `reference`, `tokenPath` |
| `InvalidModeError` | Collection access | Specified mode doesn't exist |
| `CollectionNotFoundError` | `DesignSystem` | A lookup path names no collection, and the system has more than one |
| `CircularReferenceError` | Resolution engine | Token references create a cycle |
| `ResolverValidationError` | `Resolver` constructor, `getContextSelector()` | Wrong `version`, invalid modifier structure, a name occurring twice in `resolutionOrder` (inline or by `$ref`; sets and modifiers share the namespace); a modifier's CSS spelling that is not a string, or an `atRule` that does not start with `@` |
| `InvalidInputError` | `Resolver.resolve()`, `valueAt()` | Unknown modifier key, non-string value, missing required selection |
| `InvalidReferenceError` | `Resolver.resolve()`, `load()`, `contextsOf()` | Unresolvable `$ref`, pointer to `#/resolutionOrder/…`, modifier referencing modifier; a file `load` cannot read or parse; a generated chain path that collides with a token |

---

## Types

### `TokenReference`

Returned by [`referencesOf()`](#referencesofpath-mode-tokenreference).

```typescript
interface TokenReference {
  /** Member address inside the value, dotted, '' for the whole value: 'fontSize', '0.color'. */
  at: string;
  /** The referenced token as a lookup path, collection-qualified: 'ds.font.size.md'. First hop only. */
  to: string;
  /** True when the reference is embedded in a longer string ('0 2px {color.x}'); nothing can bind to part of a string. */
  interpolated: boolean;
  /** The reference as written, braces included: '{color.x}'. Replace it in the string to rewrite the reference. */
  written: string;
}
```

[`referencesIn()`](#referencesinvalue-collectionname-tokenreference) returns the same shape for any value.

---

## Composite value interfaces

Each interface is the shape lib stores, every member computed. On the way in a member may be written in any form
its family's gate accepts (`'#abc'`, `'red'`, `'16px'`, `'calc(1rem + 2px)'`, `'bold'`); see
[Token values](#token-values). A value holding a reference is stored as written, and takes this shape when it
resolves.

### `TypographyValue`

```typescript
{
  fontFamily: string | string[];
  fontSize: DimensionValue;
  fontWeight: number;                       // 1–1000; a W3C keyword ('bold') is stored as its number
  lineHeight: number | string | DimensionValue;   // a ratio, a percentage string '150%', or a length
  letterSpacing?: LetterSpacingValue;       // { value, unit: 'px' | 'rem' | 'em' }
  fontStyle?: string;
  textTransform?: string;
  textDecoration?: string;
  [property: string]: unknown;   // any further CSS property, camelCase: a string or a finite number
}
```

`letterSpacing` alone also takes `em`, because letter spacing should scale with
the text's own size; `getLetterSpacingPx()` multiplies it by the font size. It goes
through the `letterSpacing` gate, so `pt` and `mm` are refused there. A
dimension token stays `px` or `rem`, so a `letterSpacing` that references one
cannot be in `em`. A ramp of letter spacings that needs `em` is a set of
[`letterSpacing` tokens](#letterspacingvalue), which the member may reference.

`lineHeight` written as a string is computed: `'1.5'` and `'calc(1.25 * 1.2)'` are the number `1.5`, `'24px'` is
`{ value: 24, unit: 'px' }`, and a percentage has no structured form, so `'150%'` is kept as the string `'150%'`.

Any further member, keyed by a CSS property in camelCase
(`fontVariantNumeric: 'tabular-nums'`), is accepted when its value is a string or
a finite number. The lib does not check that the key is a property; the PostCSS
plugin does, and the Figma adapter leaves it out of the text style.

`fontFamily` is one family name or a font stack, `['Inter', 'sans-serif']`. A
stack must not be empty, and every entry must be a non-empty string. A
`{reference}` to a `fontFamily` token is a string like any other, and resolves
to whatever that token holds. `getFontFamily()` returns the stored value, a
string or an array; it does not flatten a stack.

### `ShadowValue`

```typescript
{
  color: ColorValue | 'currentColor';
  offsetX: DimensionValue;
  offsetY: DimensionValue;
  blur: DimensionValue;
  spread?: DimensionValue;
  inset?: boolean;
}
```

A shadow token `$value` may be a single `ShadowValue` or `ShadowValue[]` for stacked shadows. The colour takes any
colour string, `transparent` and `color-mix()` included; `currentColor` is kept as the string. A length written
`'0'` is `{ value: 0, unit: 'px' }`; any other bare number is refused.

### `BorderValue`

```typescript
{
  color: ColorValue | 'currentColor';
  width: DimensionValue;
  style: StrokeStyleValue;
}

type StrokeStyleValue =
  | 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'outset' | 'inset'
  | { dashArray: DimensionValue[]; lineCap: 'round' | 'butt' | 'square' };
```

The value of a `border` token (W3C §9.3). `color` goes through the colour gate, `width` and each dash through the
length gate. A style keyword is matched as written, in lower case.

### `GradientValue`

```typescript
type GradientValue = GradientStopsValue | GradientObjectValue;

type GradientStopsValue = GradientStopValue[];            // the W3C form (§9.7): a bare list of stops, read as linear at 0deg

interface GradientObjectValue {
  type: GradientKind;                                     // 'linear' | 'radial' | 'angular' | 'conic'
  angle?: string | number;                                // stored as a number of degrees
  stops: GradientStopValue[];
}

interface GradientStopValue { color: ColorValue | 'currentColor'; position: number }
```

Both forms are accepted everywhere a gradient is read, and `normalizeGradient(value)` returns one
`NormalizedGradient` for either. An `angle` is stored as a number of degrees. Written as a string it may be in
`deg`, `grad`, `rad` or `turn`, `calc()` included (`'0.25turn'` and `'calc(45deg + 0.125turn)'` are `90`); a unitless
string is degrees, as a number is. A stop's colour takes any colour string; `currentColor` is kept as the string.
A position lies in [0, 1].

### `DimensionValue`

```typescript
{ value: number; unit: 'px' | 'rem' | 'pt' | 'mm' }
```

### `LetterSpacingValue`

```typescript
{ value: number; unit: 'px' | 'rem' | 'em' }
```

The value of a `letterSpacing` token, a token that is only ever a letter spacing. Not a W3C type; the format has none. `pt`, `mm` and a bare number are refused.

### `ColorValue`

```typescript
{ colorSpace: string; components: (number | 'none')[]; alpha?: number; hex?: string }
```

`hex` is the W3C fallback, `#rrggbb`. Lib sets it when a colour was written as a hex string or a named colour,
which are sRGB hex in CSS, and for nothing else; `transparent` carries `#00000000`. Any other colour string is stored
in its own space with no `hex`: `'oklch(0.7 0.1 200)'` is `{ colorSpace: 'oklch', components: [0.7, 0.1, 200] }`,
and `color-mix(in oklch, …)` is an `oklch` colour. A computed hue lies in [0, 360), and alpha is omitted at 1.

---

## Utilities

### `normalizeColorToSRGB01`

```typescript
normalizeColorToSRGB01(value: string | ColorValue): { r: number; g: number; b: number; a: number }
```

Converts any colour lib accepts to an sRGB 0–1 tuple, clamped into the gamut. Accepts every colour string the
`color` type accepts (hex, named colours, `transparent`, any CSS Color 4 function, `color-mix()`; see
[Token values](#token-values)) and W3C structured color objects (`{ colorSpace, components, alpha }`). A string the
type refuses throws the same sentence: `'currentColor' cannot be computed: currentColor has no value until an element
uses it.` Uses `culori` internally for color space conversions; `srgb-linear` is read as linear light, so
`{ colorSpace: 'srgb-linear', components: [0.5, 0.5, 0.5] }` is about 0.735 in sRGB.

### `normalizeTokenValue`

```typescript
normalizeTokenValue(type: string, value: unknown, path: string): unknown
```

A raw token value in the shape the lib stores for `type`: the function every token's `$value` goes through on load.

- A `'#aa0000'` with type `color` comes back as `{ colorSpace: 'srgb', components, hex }`.
- A `{ value, unit }` comes back as it is.
- A value holding a reference (`'{a.b}'`) comes back as written, since it has no shape until it resolves. `resolveValue()` computes it once it resolves.
- `'calc(1rem + 2px)'` with type `dimension` comes back as `{ value: 1.125, unit: 'rem' }`, and `'bold'` with type `fontWeight` as `700`.
- A type with no handler comes back unchanged.

It throws `InvalidTokenError` naming `path` (`Token "ds.space.bad": …`) for a value the
type rejects. A chain from [`contextsOf()`](#method-contextsof) already carries its values in this
shape; the function is for a value that comes from elsewhere, or is read as a type that is not the
token's own.

### `normalizeDimensionToPx`

```typescript
normalizeDimensionToPx(value: string | DimensionValue, baseFontSize = 16): number
```

Converts a dimension, `{ value, unit }` or a string, to pixels (`rem` × `baseFontSize`, `pt` and `mm` at 96 dpi). A string is computed by the numeric grammar of [Token values](#token-values), so `'calc(1rem + 2px)'` is 18. A unitless string (`'16'`, `'calc(2 * 8)'`) has always meant pixels here, and still does, unlike the `dimension` type. Throws on a bare number, an unparsable string or an unknown unit.

### `normalizeLineHeight`

```typescript
normalizeLineHeight(value: string | number | DimensionValue, baseFontSize = 16): { value: number; unit: 'ratio' | 'percent' | 'px' }
```

Reads a `lineHeight`: a number or numeric string is a `ratio` of the font size, `'120%'` is a `percent`, and a dimension in either form is a length in `px`; a string may be a `calc()` (`'calc(1.25 * 1.2)'` is the ratio 1.5). Throws on anything else.

### `cssPropertyName`

```typescript
cssPropertyName(lookupPath: string): string
cssPropertyName('ds.surface.accent');         // '--surface-accent'
cssPropertyName('ds.button.backgroundColor'); // '--button-background-color'
```

A token's CSS custom-property name, `--` included: the token path without the collection segment, each segment spelled by [`cssIdentifier`](#cssidentifier), joined by `-`. `@toghen/postcss` names properties with it by default, and the Figma adapter writes the same name as a variable's code syntax.

### `cssLinkName`

```typescript
cssLinkName(head: string, modifier: string): string
cssLinkName('--surface-raised', 'colorScheme');                  // '--surface-raised--colorScheme'
cssLinkName(cssPropertyName('ds.button.backgroundColor'), 'theme'); // '--button-background-color--theme'
```

The custom-property name of a chain's link: the head token's property, two hyphens, the modifier **as written**.
The modifier keeps its capitals, so the name reads back to the modifier it came from. Only what an identifier
cannot hold changes: whitespace becomes `-`, and any other such character is escaped. `head` is the head's property
as the adapter names it, so `@toghen/postcss` passes the property its `propertyName` option gives. Both adapters
call it: the CSS adapter declares the link, and the Figma adapter writes it as a link variable's code syntax, a
folded axis's link included.

### `cssIdentifier`

```typescript
cssIdentifier(name: string): string
cssIdentifier('backgroundColor');  // 'background-color'
cssIdentifier('Primary');          // 'primary'
cssIdentifier('-webkitLineClamp'); // '-webkit-line-clamp'
cssIdentifier('brand colors');     // 'brand-colors'
```

One name spelled as CSS spells it, by the CSSOM rule between `element.style.backgroundColor` and `background-color`: a capital inside the name becomes `-` and its lowercase. It takes one path segment, never a dotted path. Two edges:

- A capital that starts the name, or follows whitespace, is lowercased with no hyphen, so a segment exported from a design tool (`Primary`) does not grow a leading hyphen.
- A vendor property keeps its own leading `-`.

Acronyms come out letter by letter (`textURL` → `text-u-r-l`). Whitespace becomes `-`. `@toghen/postcss` spells property names from token keys and typography members with it, so a property and the custom property holding its value read alike.

### `fontFamilyNames`

```typescript
fontFamilyNames(value: string | string[]): string[]
fontFamilyNames(['Inter', 'sans-serif']);              // ['Inter', 'sans-serif']
fontFamilyNames("'Inter', system-ui, sans-serif");     // ['Inter', 'system-ui', 'sans-serif']
fontFamilyNames("'Foo, Bar', serif");                  // ['Foo, Bar', 'serif']
fontFamilyNames('Helvetica Neue');                     // ['Helvetica Neue']
```

The families a `fontFamily` value names. A string is split at commas outside
quotes; each part is trimmed, and one pair of matching surrounding quotes,
single or double, removed. An array comes back as it is. The format says a
string is one family, but no font name holds a comma, so a string with commas
can only be the CSS habit of writing a list.

It throws `fontFamily "Inter," has an empty family name.` for an empty part.
Both adapters read families through it: `@toghen/postcss` to spell
`font-family` and the `font` shorthand, the Figma adapter to take the first
family. That covers a family load cannot convert: one reached through an untyped
token.

---

## Reference grammar

What a reference **is**, as text: `{a.b}`, a dot-separated path in braces,
relative to the document root. These read a value; none of them resolves
anything or looks anything up.

**A literal brace is written doubled**, a Toghen extension: in any string, `{{` is the text `{` and `}}` the text `}`.
A string is read left to right, and a reference is a `{path}` whose braces are not part of an escape. A lone brace
that is neither stays text, and so does `{}`.

| Written | Resolves to |
|---|---|
| `'{{size.sm}}'` | `'{size.sm}'`, no reference |
| `'{{{size.sm}}}'` | a brace, the value of `size.sm`, a brace |
| `'{size.sm}}'` | the value of `size.sm`, then `}` |
| `'a { b'`, `'{}'` | as written, no reference |

`referencesIn()`, `holdsReference()` and `referenceTarget()` skip escapes. A stored value and a step of
`contextsOf()` keep the doubled braces as written. A resolved string has them removed and is never re-scanned, so
the `{size.sm}` it holds stays text.

For a token in a `DesignSystem`, use [`referencesOf()`](#referencesofpath-mode-tokenreference). These are for a
value that is not a stored token: a chain's step, or a file that writes references and is not a token document,
such as a component file whose layer fields say `"{space.md}"`.

### `referencesIn(value, collectionName?): TokenReference[]`

The references in a raw value, member by member, in document order, depth-first, as
[`TokenReference`](#tokenreference)s. With a `collectionName`, each `to` is a lookup path; without one, it is the
reference path as written. A reference that would not resolve is still reported.

```typescript
referencesIn({ color: '{color.ink}', blur: { value: 4, unit: 'px' } }, 'ds');
// [{ at: 'color', to: 'ds.color.ink', interpolated: false, written: '{color.ink}' }]
referencesIn('0 2px {space.sm}');
// [{ at: '', to: 'space.sm', interpolated: true, written: '{space.sm}' }]
```

### `holdsReference(value): boolean`

Whether a value holds a reference anywhere: a `{path}` in any string, or a `$ref` object, at any depth. `'{}'` is
not one: a reference needs a path. `'{{a}}'` is not one: its braces are escapes. Such a value cannot be checked against its type until it resolves.

### `referenceTarget(value): string | undefined`

The path a value names when it is exactly one reference and nothing else, without the braces; otherwise
`undefined`. `' {a.b}'` and `'0 2px {a.b}'` are not one. The path is not checked.

```typescript
referenceTarget('{color.blue}');          // 'color.blue'
referenceTarget('0 2px 4px {color.ink}'); // undefined
referenceTarget('{{color.blue}}');        // undefined: the text {color.blue}
```

### `literalText(value): string`

A raw string's text with its escapes removed: `{{` becomes `{`, `}}` becomes `}`, and references stay as written.
For a string read outside resolution; a resolved value has its escapes removed already.

```typescript
literalText('{{size.sm}}');   // '{size.sm}'
literalText('{{{size.sm}}}'); // '{{size.sm}}': the reference stays, its escapes go
literalText('x {{ y');        // 'x { y'
```

### `parseReferencePath(path): string[]`

A path's segments. Throws on an empty segment (`a..b`) or one starting with `$`,
which the W3C format reserves. Whitespace inside a segment is kept: it is legal
in a name.

---

## Token values

Every token is checked against its type when it enters a system, whichever way
it enters: `Collection.setToken()`, or a resolver document. A value
that passes is stored in the structured shape, as its computed value: everything
that can be worked out without an element is worked out. So adapters only ever read one
shape. A value that fails throws `InvalidTokenError` naming the token, and the member
of a composite: `Token "ds.shadow.raised": color: …`. A string lib refuses to compute
says why: `'<text>' cannot be computed: <reason>`. The principle is in
[specs.md](./specs.md#token-values).

| `$type` | Structured shape | Also accepted, and converted |
|---|---|---|
| `color` | [`ColorValue`](#colorvalue) | Any CSS Color 4 string: a hex (`#rgb` `#rgba` `#rrggbb` `#rrggbbaa`) or a named colour in any case, which becomes an `srgb` colour with its `hex`; `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color(<space> …)`, stored in their own space. `transparent`, any case, becomes black at alpha 0 with hex `#00000000`. `color-mix(in <space> [<hue method> hue], <colour> [<p>%], <colour> [<p>%])` is computed: any space lib knows, the four hue methods, the CSS Color 5 percentage rules, premultiplied alpha, nesting; the result is in the mix's space. `currentColor`, any case, is stored as the string `'currentColor'`: it has no value until an element uses it, and a converter such as `normalizeColorToSRGB01` throws on it. Refused, with the reason: `currentColor` inside a mix, `var()`, relative colour syntax, `light-dark()`, system colours, `inherit`, `initial` and the other CSS-wide keywords, `calc()` inside a channel |
| `dimension` | [`DimensionValue`](#dimensionvalue) | A number and a unit, `'24px'`, `'1.5rem'`, `'12pt'`, `'1mm'`, and `'0'` as `0px`. `calc()`, `min()`, `max()`, `clamp()`, `round([nearest\|up\|down\|to-zero,] A, B)`: one unit stays; absolute units reduce to `px`; `rem` mixed with absolute units is stored in `rem` (`calc(1rem + 2px)` is `{ value: 1.125, unit: 'rem' }`). Rounded to 10 decimals. Refused: any other bare number, `em`, `%`, viewport and container units, `ch`, `ex`, `var()`, a product of two lengths, a division by a length or by zero, and a space-separated list (`'8px 13px'`), whose reason says to leave the token untyped |
| `letterSpacing` | [`LetterSpacingValue`](#letterspacingvalue) | A number and a unit, `'-0.021em'`, `'2px'`, `'0.1rem'`, and `'0'` as `0px`; the unit may be in any case and is stored lower case. The same functions as `dimension`; `em` mixes only with `em` (`calc(0.1em - 0.02em)` is `0.08em`). A typography member's `letterSpacing` may reference one |
| `fontWeight` | A number from 1 to 1000 | A W3C keyword in any case (`thin` 100, `light` 300, `normal` 400, `medium` 500, `semi-bold` 600, `bold` 700, `black` 900, `extra-black` 950, and their aliases), which becomes its number; a numeric string or a `calc()` (`'calc(400 + 300)'`) |
| `border` | [`BorderValue`](#bordervalue) | `color` any colour string, `width` any `dimension` string, `style` a W3C keyword or `{ dashArray, lineCap }`, each dash any `dimension` string |
| `fontFamily` | A string (one family) or an array of strings | A string with a comma outside quotes, `"'Inter', system-ui, sans-serif"`, which becomes the array by [`fontFamilyNames`](#fontfamilynames) |
| `shadow`, `typography`, `gradient` | Their [interfaces](#composite-value-interfaces) | Members may use the string forms above, and every member is stored computed: a shadow's `color: '#abc'` is a structured colour with `hex: '#aabbcc'`, `'16px'` is `{ value: 16, unit: 'px' }`, a typography `fontWeight` keyword is its number, a gradient `angle` is a number of degrees. A shadow's, a gradient stop's and a border's colour take `transparent`, and keep `currentColor` as the string |

**A token defined in one context only** (in a modifier context's source and in no base set) exists in the modes that context reaches and nowhere else: elsewhere `getToken()` and `resolveToken()` return `null`, `resolveValue()` throws that the token is not found, and the default mode does not hold it. It is a hole of its chain, and [`Collection.check()`](#check-check) lists it as incomplete, with the modes it lacks.

Other types (`number`, `duration`, `cubicBezier`, `strokeStyle`, `transition`, a system's own) are stored as
written. A value holding a reference anywhere (`{path}` or `$ref`) is stored as written: its shape is known only
once it resolves. It is checked and computed when it resolves, by
[`resolveValue()`](#resolvevaluepath-mode-any), [`resolveToken()`](#resolvetokenpath-mode-designtoken--null) and
[`valueAt()`](#method-valueat), in each mode, and a value its type cannot compute throws there.

A reference embedded in a longer string interpolates a dimension as `'24px'`
and a structured colour of any space as CSS: its `hex` when it carries one, with
the alpha byte appended to a six-digit hex when the alpha is below 1 (so
`transparent` is `#00000000`), otherwise CSS Color 4 syntax in its own space
(`oklch(0.7 0.1 200)`). Lib's colour reader reads every such spelling back, so
`'color-mix(in oklch, {ink} 40%, white)'` computes whatever space `ink` is in. A
token whose own value holds a reference is inserted as its resolved string. The
library refuses to interpolate any other object.

## Type handlers

The core checks and stores each W3C type through a handler of its own (colour, dimension, letter spacing,
font weight, border, typography, shadow, gradient). The handlers are not exported, and a resolved token carries no methods: what an
adapter reads of a value is the value, through the [normalized forms](#utilities).

---

## Removed exports

Removed on 21 October 2026, with no deprecation: the package is experimental and has one user. Each one either
answered a question no consumer asked, or answered one the core answers another way. The reasons are in
[decisions.md](./decisions.md#ruled-the-surface-of-the-core-is-its-question-set-21-october-2026).

| Removed | Ask instead |
|---|---|
| `DesignToken.set()`, `update()`, `merge()` | `new DesignToken(…)` |
| `DesignToken.isReference()`, `getReferences()` | `referencesOf()` for a stored token; `referencesIn()`, `holdsReference()` for a value |
| `DesignSystem.entries()` | `Collection.getAllPaths()` with `resolveToken()` |
| `DesignSystem.queryToken()` | `Collection.getNodeKind()`, or `resolveToken()` against `null` |
| `DesignSystem.setToken()`, `removeToken()`, `TokenData` | `Collection.setToken()` |
| `DesignSystem.removeCollection()` | a new `DesignSystem` |
| `DesignSystem.registerTypeHandler()`, `TokenTypeHandler`, the six handler objects, `colorSpaces` | the [normalized forms](#utilities); the core checks every type itself |
| `Collection.hasToken()` | `Collection.getToken()` against `null` |
| `Collection.removeToken()` | a new collection |
| `Collection.getProperty()` | `resolveToken(path).$type` for a token's type; `getGroupAttribute()` for a group's own attribute |
| `Collection.setDefaultMode()` | the build: a resolver's default mode is its modifiers' declared defaults |
| `Collection.findIncompleteTokens()` | `Collection.check().incomplete` |
| `Collection.getModifiers()` | `Resolver.getModifiers()`, through `collection.resolver` |
| `Resolver.getModifierNames()`, `getModifierContexts()`, `getModifierDefault()` | `Resolver.getModifiers()` |
| `Resolver.step()`, `NonFactorableError` | `contextsOf()`: the head link's step at the context; `valueAt()` for the value |
| `containsReference()`, `isWholeReference()` | `holdsReference()`, `referenceTarget()` |
| `extractReferencePaths()` | `referencesIn()` |
| `isReferenceObject()` | `holdsReference()` |
| `isGradientStopsValue()`, `parseAngleToDegrees()` | `normalizeGradient()` |
| `ResolverModifierDef` | `ResolverModifier`, the same type |
