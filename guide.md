# @toghen/lib guide

Tasks for `@toghen/lib`. Each one gives the code that does it, with the output where that helps. The example is the [running example](./model.md#the-running-example); its resolver document is [`ds.resolver.json`](./example/ds.resolver.json). Signatures are in the [reference](./reference.md), and the model is in [model.md](./model.md).

## Install the library

```sh
pnpm add @toghen/lib
```

The only runtime dependency is [`culori`](https://culorijs.org/), which the colour handling uses.

### From the repository

To use a commit not yet released, a project installs the package from its repository by git URL.

```sh
pnpm add "git+https://codeberg.org/Toghen/lib.git#main"
```

`#main` can be a branch, a tag or a commit; a commit pins the version exactly. The package builds itself on install, and pnpm runs a dependency's build only when the project allows it. Allow it once, in the project's `pnpm-workspace.yaml`:

```yaml
onlyBuiltDependencies:
  - "@toghen/lib"
  - "@toghen/postcss"
```

Without that line the install stops with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`, naming the package to add. The [PostCSS plugin](https://codeberg.org/Toghen/postcss/src/branch/main/guide.md#set-up-the-pipeline) installs the same way, beside the library.

## Create a token

A token has a value and a type, and can have a description and extensions. Tokens are immutable, so each change returns a new token:

```ts
import { DesignToken } from '@toghen/lib';

const accent = new DesignToken('#1a66e6', 'color', 'Accent surface');
const brighter = accent.set('$value', '#5c9bff'); // accent is unchanged
```

`update()` and `merge()` change a token the same way. See [`DesignToken`](./reference.md#designtoken).

## Organize tokens in a collection

A collection holds tokens at dot paths. Name it after its document, so lookups start with that name:

```ts
import { Collection, DesignToken } from '@toghen/lib';

const ds = new Collection('ds');
ds.setToken('surface.accent', new DesignToken('#1a66e6', 'color'));
ds.setToken('space.sm', new DesignToken({ value: 8, unit: 'px' }, 'dimension'));

ds.getToken('surface.accent')?.$value;
```

Once it is in a collection, a value comes back in the structured shape:

```
{
  "colorSpace": "srgb",
  "components": [
    0.10196078431372549,
    0.4,
    0.9019607843137255
  ],
  "hex": "#1a66e6"
}
```

Describe a group with `setGroupAttribute()` and list the paths with `getAllPaths()`. See [group attributes](./reference.md#group-attribute-methods).

## Give a token a value in one mode

A collection can declare modes. A token given a mode has a value in that mode alone. A token given no mode has the same value in every mode:

```ts
const modes = new Collection('ds', ['light', 'dark']);
modes.setToken('surface.raised', new DesignToken('#ffffff', 'color'), 'light');
modes.setToken('surface.raised', new DesignToken('#2b2b2b', 'color'), 'dark');
modes.setToken('surface.accent', new DesignToken('#1a66e6', 'color'));

modes.getToken('surface.raised', 'dark')?.$value;
modes.getToken('surface.raised', 'sepia'); // throws InvalidModeError
```

`check().incomplete` lists the tokens that a mode lacks. See [`Collection`](./reference.md#collection).

## Reference another token

A `$value` names another token with `{path}`. The path inside a value starts at the document root, so it never names a collection. A lookup does name one:

| Where | Form | Example |
|---|---|---|
| Inside a `$value` | `{tokenPath}` | `{surface.accent}` |
| A lookup on a system | `collectionName.tokenPath` | `ds.surface.accent` |

```ts
import { DesignSystem } from '@toghen/lib';

ds.setToken('surface.link', new DesignToken('{surface.accent}', 'color'));

const system = new DesignSystem();
system.addCollection(ds);
system.resolveValue('ds.surface.link');
```

Chains resolve recursively: a reference can name a token that is itself a reference. `resolveValue()` returns the final value.

## Read into a composite value

A lookup can continue past a token into its value, one member or array index per segment. Here `button.font` refers to the typography token `type.label`:

```ts
ds.setToken('type.label', new DesignToken({
  fontFamily: ['Inter', 'Helvetica Neue', 'sans-serif'],
  fontSize: { value: 0.875, unit: 'rem' },
  fontWeight: 500,
  lineHeight: 1.25,
}, 'typography'));
ds.setToken('button.font', new DesignToken('{type.label}', 'typography'));

system.resolveValue('ds.button.font.fontSize');
```

```
{
  "value": 0.875,
  "unit": "rem"
}
```

## Ask what a token refers to

`resolveValue()` returns values, so it cannot say that `button.font` was written as `{type.label}`. For that, use `referencesOf()`. An adapter that can write a native alias uses it:

```ts
system.referencesOf('ds.button.font');
```

```
[
  {
    "at": "",
    "to": "ds.type.label",
    "interpolated": false,
    "written": "{type.label}"
  }
]
```

Each entry gives the member (`at`, empty for the whole value), the first hop as written (`to`), whether the reference sits inside a longer string (`interpolated`), and the reference as the text holds it (`written`).

With one collection in the system, as here, the collection may be left out: `system.referencesOf('button.font')` asks the same token.

## Interpolate a reference into a string

A reference can sit inside a longer string. This is a Toghen extension, not part of the W3C format:

```ts
ds.setToken('ink', new DesignToken('#111111', 'color'));
ds.setToken('elevation', new DesignToken('0 2px 4px {ink}', 'string'));
system.resolveValue('ds.elevation');
```

```
0 2px 4px #111111
```

The target must have a plain text form (a string, a number, a boolean, a dimension, or a colour). A colour is written as its `hex` when it has one, and otherwise in CSS syntax in its own space, such as `oklch(0.7 0.1 200)`. Any other value throws `InvalidInterpolationError`. See [`InvalidInterpolationError`](./reference.md#error-classes).

## Write a value CSS would compute

A value may be written as CSS writes it: any CSS colour, `color-mix()`, `calc()`, `min()`, `max()`, `clamp()` and `round()`, with references inside. Lib stores the result, and computes a value written with a reference once the reference resolves:

```ts
ds.setToken('shade', new DesignToken('#000000', 'color'));
ds.setToken('space.md', new DesignToken('1rem', 'dimension'));
ds.setToken('space.lg', new DesignToken('calc({space.md} * 1.5 + 2px)', 'dimension'));
ds.setToken('shadow.raised', new DesignToken({
  color: 'color-mix(in srgb, {shade} 25%, transparent)',
  offsetX: '0',
  offsetY: '2px',
  blur: '{space.md}',
}, 'shadow'));

system.resolveValue('ds.space.lg');
system.resolveValue('ds.shadow.raised.color');
```

```
{
  "value": 1.625,
  "unit": "rem"
}
{
  "colorSpace": "srgb",
  "components": [
    0,
    0,
    0
  ],
  "alpha": 0.25
}
```

A `rem` mixed with `px` stays in `rem`, at a root font size of 16px. What needs an element is refused with the reason: `currentColor` inside a mix, `var()`, `em` in a dimension, a percentage, a viewport unit. A space-separated list such as `'8px 13px'` is not one dimension: leave that token untyped and it is kept as written. The full list is in [Token values](./reference.md#token-values).

## Write a literal brace

A string that must show a brace writes it doubled: `{{` is `{` and `}}` is `}`. Resolution removes the doubling, and the text it leaves is never read as a reference:

```ts
ds.setToken('hint', new DesignToken('Use {{space.md}} for gaps', 'string'));
system.resolveValue('ds.hint');
```

```
Use {space.md} for gaps
```

The stored value keeps the doubled braces. To read a raw string's text outside resolution, use [`literalText()`](./reference.md#literaltextvalue-string).

## Find a broken reference

An unresolvable reference throws, and never passes through as text. A reference cycle throws `CircularReferenceError`:

```ts
import { UnresolvableReferenceError } from '@toghen/lib';

ds.setToken('broken', new DesignToken('{surface.teal}', 'color'));

try {
  system.resolveValue('ds.broken');
} catch (error) {
  if (error instanceof UnresolvableReferenceError) {
    console.log(error.reason, error.reference, error.tokenPath);
  }
}
```

The output is `not-found {surface.teal} broken`. A cycle reports the whole loop. Two tokens that refer to each other, `loop.a` and `loop.b`, give this:

```
Circular reference detected in collection "ds" (mode "default"): loop.a -> loop.b -> loop.a. Reference {loop.a} in token "ds.loop.b" at $value.
```

## Check a reference from outside a token document

A component file can hold references too. The grammar is public, so its reader does not need its own pattern:

```ts
import { referenceTarget, referencesIn } from '@toghen/lib';

referenceTarget('{space.sm}');           // 'space.sm'
referenceTarget('0 2px {ink}');          // undefined: the reference sits inside a longer string
referencesIn('0 2px {ink}');             // [{ at: '', to: 'ink', interpolated: true, written: '{ink}' }]
```

## Start from token files

You need no resolver document to begin. Hand `load()` one token file, or a list of them. They merge in the order given, and the last wins:

```ts
import { readFile } from 'node:fs/promises';
import { load, Resolver } from '@toghen/lib';

const { document } = await load(['tokens/primitives.tokens.json', 'tokens/roles.tokens.json'], {
  read: (path) => readFile(path, 'utf8'),
});
new Resolver(document).resolveContextsToDesignSystem().resolveValue('tokens.surface.base');
```

The collection is named after the folder that holds the files, here `tokens`. Give `name` to choose another, and you must give it when the files share no folder. Behind this, `load()` wraps the files in a standard resolver document with one set, `base`, whose sources are the files. When you want themes or other modifiers, save that document beside the files and grow it; the [reference](./reference.md#loadentry-options-promiseloadresult) shows its shape.

## Load a resolver document

A resolver document names its sets, its modifiers, and the order to combine them. Lib reads no files itself, so you hand it a `read` function. The example document references its token files, and `load()` follows those references into one document:

```ts
import { readFile } from 'node:fs/promises';
import { load, Resolver } from '@toghen/lib';

const { document } = await load('node_modules/@toghen/lib/example/ds.resolver.json', {
  read: (path) => readFile(path, 'utf8'),
});
const resolver = new Resolver(document);
```

In a test, `read` can serve files from a `Map`. In a tool with no filesystem, it can look the path up among the files a person supplied.

`load()` accepts a fragment (`./primitives.tokens.json#/color`) to take part of a file. A resolver document can also build on another one, by naming its sets or modifiers. Write `load()`'s result to a file to give a tool that cannot read files one self-contained document. See [`load`](./reference.md#loadentry-options-promiseloadresult).

## Theme a system with a map

To theme a system, read the same document with a map. The map sends a reference, as it is written in the document, to another file. The example's [warm.overrides.json](./example/warm.overrides.json) reads `roles.warm.tokens.json` wherever a document says `roles.tokens.json`:

```json
{ "roles.tokens.json": "roles.warm.tokens.json" }
```

```ts
const overrides = JSON.parse(await readFile('node_modules/@toghen/lib/example/warm.overrides.json', 'utf8'));
const { document, reads, overrides: map } = await load('node_modules/@toghen/lib/example/ds.resolver.json', {
  read: (path) => readFile(path, 'utf8'),
  overrides,
});
new Resolver(document).resolveContextsToDesignSystem().resolveValue('ds.surface.accent'); // the warm accent
```

A key matches the whole reference, fragment included. A relative value is read from the folder of the document that holds the reference. `reads` lists each file read and whether the map chose it. `map.unused` lists the keys nothing matched, which is usually a typo. `map.hash` changes only when the map does, so you can tell a new map from new tokens. The dark theme still applies on top: the map swaps a file, not the order. See [the overrides map](./reference.md#loadentry-options-promiseloadresult).

## Build on a base: an overlay

When a theme needs a layer of its own, write an overlay: a second resolver document that borrows the base's parts. The example's [ds.warm.resolver.json](./example/ds.warm.resolver.json) borrows the base's set and its two modifiers by `$ref` into the other file, adds its own set, and states its own order:

```json
{
  "version": "2025-11-01",
  "name": "ds",
  "sets": { "warm": { "sources": [{ "$ref": "warm.tokens.json" }] } },
  "resolutionOrder": [
    { "$ref": "ds.resolver.json#/sets/base" },
    { "$ref": "#/sets/warm" },
    { "$ref": "ds.resolver.json#/modifiers/theme" },
    { "$ref": "ds.resolver.json#/modifiers/density" }
  ]
}
```

Load it as any resolver document. The base's order is never read: the overlay says where its set goes. Two limits follow from the standard. An overlay cannot add a source inside a borrowed modifier's context; to change a context, redeclare the modifier in the overlay. And only the base's named sets and modifiers can be borrowed: an inline set or modifier, written inside the base's `resolutionOrder`, cannot be referenced.

## Resolve one context

`resolveToDesignSystem()` picks one context per modifier and returns one collection. The lookup path starts with the document's name:

```ts
const dark = resolver.resolveToDesignSystem({ theme: 'dark' });
dark.resolveValue('ds.surface.accent');
```

## Resolve every context into one collection

`resolveAllToDesignSystem()` folds every permutation into one collection, with one mode per permutation. Each mode is named by its contexts, in the order the modifiers are declared:

```ts
const all = resolver.resolveAllToDesignSystem();
all.getCollection('ds')?.getModes();
all.resolveValue('ds.surface.accent', 'dark/regular');
```

The default mode is the one where every modifier is at its declared default, `light/regular` here, wherever the build placed it. `getModeName()` gives the mode name for a set of contexts. An omitted modifier takes its default:

```ts
resolver.getModeName({ theme: 'dark' });                     // dark/regular
resolver.getModeName({ density: 'compact', theme: 'dark' }); // dark/compact
```

## Query the defaults and each modifier on its own

Most modifiers act independently: a theme does not change a spacing scale. `resolveContextsToDesignSystem()` builds the defaults and one set per context, so you do not need every combination:

```ts
const sum = resolver.resolveContextsToDesignSystem();
sum.resolveValue('ds.space.sm', 'density=compact');
sum.resolveValue('ds.surface.accent', 'theme=dark');
```

Name a combination to build it, then ask for it by its name. A stylesheet that scopes two modifiers at once needs that combination. Without it, the query throws `InvalidModeError`:

```ts
const both = resolver.resolveContextsToDesignSystem([{ theme: 'dark', density: 'compact' }]);
both.resolveValue('ds.surface.accent', 'theme=dark density=compact');
```

## Ask which modifiers a token depends on

An adapter that writes one declaration per modifier needs to know which modifiers a token depends on, and what each context says about it. The resolver answers with three methods, each taking a token path:

```ts
resolver.dependsOn('space.sm');
resolver.contextsOf('surface.accent');
resolver.valueAt('surface.accent', { theme: 'dark', density: 'compact' });
```

`dependsOn()` returns `{ "direct": ["density"], "through": [] }` for `space.sm`. `contextsOf()` returns the token's full chain. The shapes and errors are in [querying one token across contexts](./reference.md#querying-one-token-across-contexts).

## Declare how a context appears in CSS

A modifier says how each of its contexts is spelled in CSS, in `$extensions["com.toghen"].css`. The entry takes a `selector` (with `{context}` where the context name goes), an `atRule`, or both:

```json
"theme": {
  "default": "light",
  "contexts": { "light": [], "dark": [{ "$ref": "theme.dark.tokens.json" }] },
  "$extensions": {
    "com.toghen": { "css": { "selector": "[data-theme='{context}']" } }
  }
}
```

`getContextSelector()` reads that spelling, and the CSS adapter writes every context from it. See [`getContextSelector`](./reference.md#getcontextselectormodifier-context-contextselector--undefined).

## Add parts to a component

A component is a group. A subgroup whose key is a value of the vocabulary is a part of it: a part re-points its group while that value is active. Tokens directly under the group are the rest. The [model](./model.md#components-and-parts) says why.

Declare the vocabulary once, on the document root or on any group, in `$extensions["com.toghen"].css.parts`. Each axis maps its values to the spelling that makes each one active. The running example declares it on the root, in its own file, [`vocabulary.tokens.json`](./example/vocabulary.tokens.json):

```json
{
  "$extensions": {
    "com.toghen": {
      "css": {
        "parts": {
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
      }
    }
  }
}
```

A group sees the vocabulary above it. A group can replace one value of an axis for itself. [`field.tokens.json`](./example/field.tokens.json) replaces the `disabled` spelling inside its own `$extensions`, and keeps the rest:

```json
    "$extensions": {
      "com.toghen": {
        "css": {
          "parts": {
            "state": {
              "disabled": ":has(> input:disabled)"
            }
          }
        }
      }
    },
```

`vocabularyAt('field')` returns the root's three axes with that one spelling replaced:

```
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

Declare the variant axis first in the vocabulary, and nest a variant's own state under it, as `button.primary.hover`. Write the rest tokens directly under the component, and each part as a subgroup. The example's `button` has a `primary` part and a `selected` part, which has its own `hover` state. These are the two blocks of [`button.tokens.json`](./example/button.tokens.json) that show it, unaltered:

```json
    "primary": {
      "backgroundColor": {
        "$type": "color",
        "$value": "{surface.accent}"
      },
      "color": {
        "$type": "color",
        "$value": "{text.on-accent}"
      }
    },
```

```json
    "selected": {
      "backgroundColor": {
        "$type": "color",
        "$value": "{surface.selected}"
      },
      "hover": {
        "backgroundColor": {
          "$type": "color",
          "$value": "{surface.accent}"
        }
      }
    }
```

A path cannot hold two values of one axis. `button.hover.pressed.backgroundColor` is refused with this message:

```
Path 'button.hover.pressed.backgroundColor' nests two parts of axis 'state': 'hover' and 'pressed'.
```

The order of parts follows the vocabulary: axes in the order declared, values in the order declared within an axis, and the later one wins. It does not follow the order of the keys in the file.

Read the vocabulary of a group with `vocabularyAt()`, and the parts of a path with `partsOf()`:

```ts
const collection = resolver.resolveContextsToDesignSystem().getCollection('ds')!;
collection.vocabularyAt('button');
collection.partsOf('button.selected.hover.backgroundColor');
```

`vocabularyAt('button')` returns the three axes the root declares:

```
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

`partsOf('button.selected.hover.backgroundColor')` returns the two parts the path passes through, the twin along each axis, the rest token it falls back to, and the component:

```
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

A child group that is not a vocabulary value is not a part. `partsOf('button.icon.color')` returns no parts and the path itself as its rest.

## Ask which token applies under a selection

A component with parts has, for each of its keys, one token that applies under a selection of part values. Ask the collection, and the axes it varies along:

```ts
collection.applies('button', { variant: 'primary', state: 'hover' });
// { backgroundColor: 'button.hover.backgroundColor', color: 'button.primary.color', … }
collection.axesOf('button');
// [{ axis: 'variant', values: ['primary'] }, { axis: 'state', values: ['hover', 'pressed', 'disabled'] }, …]
```

The token with more matching parts wins; on a tie, the one whose latest differing axis comes later in the vocabulary. Two tokens with one part each, `button.primary.backgroundColor` and `button.hover.backgroundColor`, tie, and `state` comes after `variant`. The order of the keys in the file never matters. The lookups are in the [reference](./reference.md#parts).

## Name a token in CSS

`cssPropertyName()` gives the custom property name for a token path. The collection segment is dropped, and camelCase keys are spelled the way CSS spells them:

```ts
import { cssPropertyName } from '@toghen/lib';

cssPropertyName('ds.surface.accent');         // --surface-accent
cssPropertyName('ds.button.backgroundColor'); // --button-background-color
```

Two tokens that give the same name are a conflict; the CSS adapter reports it.

## Normalize a colour to sRGB

`normalizeColorToSRGB01()` turns a colour string into sRGB numbers from zero to one, for renderers and for Figma:

```ts
import { normalizeColorToSRGB01 } from '@toghen/lib';

normalizeColorToSRGB01('#1a66e6');
```

```
{
  "r": 0.10196078431372549,
  "g": 0.4,
  "b": 0.9019607843137255,
  "a": 1
}
```

## Catch resolution errors

Check the more specific error first. `UnresolvableReferenceError` extends `PathNotFoundError`:

```ts
import { CircularReferenceError, PathNotFoundError, UnresolvableReferenceError } from '@toghen/lib';

try {
  system.resolveValue('ds.broken');
} catch (error) {
  if (error instanceof UnresolvableReferenceError) {
    // a reference written inside a token is broken
  } else if (error instanceof PathNotFoundError) {
    // the path you asked for does not exist
  } else if (error instanceof CircularReferenceError) {
    // a token refers back to itself
  }
}
```

The full list of errors is in [error classes](./reference.md#error-classes).
