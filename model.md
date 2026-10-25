# The component model

A component is a group, it supports its subgroups, a part re-points the group; worlds are everything above it.

Worlds are explained under [Modifiers and contexts](#modifiers-and-contexts). This page is the explanation the other docs link to. It says what each word means, who sets each choice, and how a choice reaches CSS and Figma. Its example is the document `ds` in [the running example](#the-running-example).

## Tokens, groups and paths

A token is a leaf with a `$value`. Its `$type` may come from its group. A group holds tokens and other groups. A path joins keys from the top with dots, so `button.backgroundColor` is the token under the `backgroundColor` key of the `button` group. A value can name another token in braces: `{surface.raised}` takes that token's value.

```json
    "backgroundColor": {
      "$type": "color",
      "$value": "{surface.raised}"
    },
```

The collection segment may be left out when a document has one collection, as `ds` does. So `button.backgroundColor` names the same token as `ds.button.backgroundColor`. The core reads it so (the one-collection shorthand); a first segment that names the collection is the collection. The full token set is in the [tokens file](./example/button.tokens.json).

## Modifiers and contexts

A **world** is a kind of choice: a context chosen once, for a whole subtree, by an ancestor or by a caller. The page's theme is a world, and so is an area's density. A world is written as a **modifier**: a named choice with its **contexts**. In the example, `theme` is a modifier with the contexts `light` (the default) and `dark`. `density` has `regular` (the default) and `compact`. From here this page says modifier and context.

A context changes tokens by redefining them. The `dark` context of `theme` gives `surface.raised` a dark value, and every token that refers to it follows. Its spelling says when it applies: `[data-theme='{context}']`, an attribute on the page or on a wrapper.

## Components and parts

A **component** is a group. In the example, `button` and `field` are components. The tokens directly under a component are its **rest**: `button.backgroundColor` is the resting background of the button.

A **part** is a subgroup of a component whose key is a value of its vocabulary. `button.hover.backgroundColor` is the hover background of the button. The **twin** of a part token along an axis is the token at its path with that axis's part removed: `button.backgroundColor` is the twin of `button.hover.backgroundColor` along `state`. Its **rest** is the path with every part removed. A token with one part has one twin, which is its rest; `button.selected.hover.backgroundColor` has two twins, `button.hover.backgroundColor` along `selection` and `button.selected.backgroundColor` along `state`, and its rest is `button.backgroundColor`.

- **Values of one axis are exclusive.** A path never holds two values of one axis. `button.hover.pressed.backgroundColor` is refused:

  ```
  Path 'button.hover.pressed.backgroundColor' nests two parts of axis 'state': 'hover' and 'pressed'.
  ```

- **A combination spans two axes.** `button.selected.hover.backgroundColor` is the `selected` value of the `selection` axis with the `hover` value of the `state` axis. This is why `selected` has an axis of its own. Lib reads the path into its parts and the rest, as in [parts-of-selected-hover.json](./test/example-output/parts-of-selected-hover.json).
- **A part needs no twin.** `field.disabled.opacity` can exist with no `field.opacity`. It then applies only while the part is active. In Figma such an axis stays in the path, and the plan says why:

  ```
  "field": "state" stays in the path, one variable per part: no rest value: "field.disabled.opacity" needs "field.opacity", which is not defined.
  ```

- **A child is a subgroup whose key is no vocabulary value.** `button.icon.color` is the color of the icon inside the button. Part keys and child keys share one namespace: `icon` is a child only because no vocabulary value is called `icon`.

**Precedence.** Under a selection of part values, the token that **applies** for a key is the one with more matching parts; on a tie, the one whose latest differing axis comes later in the vocabulary: axes in the order declared, values in the order declared within an axis. A group's key order carries no meaning. The CSS writes rules with more parts after rules with fewer, then in that tie order, and gives every part rule one weight, so the order alone decides and a spelling's weight never does (see [Part spellings](https://codeberg.org/Toghen/postcss/src/branch/main/reference.md#part-spellings)). Under *variant primary, state hover*, the button's background is `button.hover.backgroundColor`, and its text colour `button.primary.color`. Declare the variant axis first and the state axes after. A variant that must keep its look under a state nests its own value, as `button.primary.hover`. Without that, the generic hover part wins over the primary variant's rest.

## The vocabulary

The vocabulary lists the part values of a component. It lives in `$extensions["com.toghen"].css.parts` on the document root or on any group. A group reads the vocabulary of every holder above it. A holder below overrides one entry, an axis and value, and keeps the rest.

It has three levels: an **axis** (`state`), the **values** of that axis (`hover`), and each value's **spelling**.

- A **spelling** is a selector fragment. Without `&`, it is appended to the rule's selector, so `:hover` makes a part apply while the element is hovered. With `&`, it places itself. That is how a state inherited from a container, or read from a sibling, is written. An at-rule spelling is allowed, as for a context.

In the example, the vocabulary is the root of the document, from [vocabulary.tokens.json](./example/vocabulary.tokens.json). It is read first in the `ds` set, so it holds for every group:

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

`button` and `field` are top-level groups, so both read it. [field.tokens.json](./example/field.tokens.json) overrides one entry: its `disabled` state is spelled `:has(> input:disabled)`. It keeps the `variant` and `selection` axes from the root.

Lib reads what a group sees with `vocabularyAt`. For `button`, the result is in [vocabulary-at-button.json](./test/example-output/vocabulary-at-button.json).

## Who sets it

| Choice | Who sets it, and when | Example |
|---|---|---|
| Modifier (a world) | An ancestor or a caller, once, for everything inside | `data-theme` on the page; `data-density` on a wrapper |
| Part | The element itself, from its own state or attribute | `:hover`, `aria-pressed` and `data-variant` on the button |

The test for an author is one question: who sets it? An ancestor or the host, once: a modifier. The element itself: a part. Both are legitimate, and the author decides by where the attribute is placed.

The vocabulary is set once, by whoever writes the tokens. Adapters read it and never redefine it.

## The running example

The example is the document `ds`, in [the example's folder](./example/). It has one collection, so its paths may leave the collection out.

| Part of `ds` | What it holds |
|---|---|
| Modifiers | `theme`: `light` (default) and `dark`. `density`: `regular` (default) and `compact`. |
| Roles | `surface.raised`, `surface.accent`, `surface.selected`, `text.default`, `text.on-accent`, `text.muted`, `space.sm`, `radius.md`, `type.label`. The `dark` context changes the surfaces and text. `compact` changes `space.sm`. |
| Vocabulary | On the document root: `variant` (`primary`), `state` (`hover`, `pressed`, `disabled`), `selection` (`selected`). |
| `button` | Rest tokens: `backgroundColor`, `color`, `paddingBlock`, `borderRadius`, `font`. A child `icon` with `color`. Parts `primary`, `hover`, `pressed`, `disabled`, `selected` and `selected.hover`. |
| `field` | A rest, a `disabled` part and a child `focus`. |
| Overlay | [ds.warm.resolver.json](./example/ds.warm.resolver.json) borrows the base's set and its two modifiers by reference, and adds a set of its own after the base: a warm `surface.accent`. The `dark` context still comes after it. |

The same warm theme can be had from the base itself, with the map [warm.overrides.json](./example/warm.overrides.json), which reads `roles.warm.tokens.json` in place of `roles.tokens.json`. An overlay cannot add a source inside a borrowed modifier's context, so [ds-striped.resolver.json](./example/ds-striped.resolver.json), which adds sources inside the theme's and the density's contexts, stays a document of its own. See [Theme a system with a map](./guide.md#theme-a-system-with-a-map) and [Build on a base: an overlay](./guide.md#build-on-a-base-an-overlay).

The button's path from tokens to CSS to Figma, one step each:

1. **Tokens.** The primary variant, from [button.tokens.json](./example/button.tokens.json):

   ```json
       "primary": {
         "backgroundColor": {
           "$type": "color",
           "$value": "{surface.accent}"
         },
```

2. **Custom properties.** The hover token, redefined by the dark context. These lines sit inside `[data-theme='dark']` in the theme layer of [tutorial.out.css](https://codeberg.org/Toghen/postcss/src/branch/main/test/example-output/tutorial.out.css):

   ```css
               --button-primary-background-color: #5c9bff;
               --button-hover-background-color: #26364d;
               --button-pressed-background-color: #26364d;
```

3. **The rule.** The button's rule, with its parts, from [tutorial.out.css](https://codeberg.org/Toghen/postcss/src/branch/main/test/example-output/tutorial.out.css):

   ```css
   .button {
       display: inline-flex;
       --_button-background-color: initial;
       --_button-color: initial;
       background-color: var(--_button-background-color, var(--button-background-color, #ffffff));
       color: var(--_button-color, var(--button-color, #1a1a1a));
       padding-block: var(--button-padding-block, 8px);
       border-radius: var(--button-border-radius, 6px);
       font-family: var(--button-font-font-family, Inter, "Helvetica Neue", sans-serif);
       font-size: var(--button-font-font-size, 0.875rem);
       font-weight: var(--button-font-font-weight, 500);
       line-height: var(--button-font-line-height, 1.25);
       &:where([data-variant='primary']) {
           --_button-background-color: var(--button-primary-background-color, #1a66e6);
           --_button-color: var(--button-primary-color, #ffffff)
       }
       &:where(:hover) {
```

4. **Figma variables.** The `state` collection, which folds the state axis into its modes, from [variable-plan.out.txt](https://codeberg.org/Toghen/figma/src/branch/main/test/example-output/variable-plan.out.txt):

   ```
   state  (modes: rest, hover, pressed, disabled)
     button/backgroundColor  COLOR  var(--button-background-color)
       rest: alias variant/button/backgroundColor--variant
       hover: alias theme/surface/selected
       pressed: alias theme/surface/selected
       disabled: alias variant/button/backgroundColor--variant
   ```

5. **The component.** Its axes, and one of its sixteen members, from [button-component-axes.out.txt](https://codeberg.org/Toghen/figma/src/branch/main/test/example-output/button-component-axes.out.txt):

   ```
     variant  VARIANT  rest, primary  pins the collection variant
     state  VARIANT  rest, hover, pressed, disabled  pins the collection state
     selection  VARIANT  rest, selected  no pin: laid out in the path
   ```

   ```
     variant=primary, state=hover, selection=selected  |  pins variant=primary state=hover  |  fill button.selected.backgroundColor
   ```

The plan for the whole example is in [variable-plan.out.txt](https://codeberg.org/Toghen/figma/src/branch/main/test/example-output/variable-plan.out.txt), and its warnings are in [variable-plan.warnings.txt](https://codeberg.org/Toghen/figma/src/branch/main/test/example-output/variable-plan.warnings.txt).

## In CSS and in Figma

| Concept | In CSS | In Figma |
|---|---|---|
| Modifier | A sublayer named after the modifier (`@layer theme`), inside the layer where the author writes `@toghen contexts`, holding one block per context | A variable collection named after the modifier |
| Context | A block under the modifier's layer, selected by the modifier's spelling, such as `[data-theme='dark']` | A mode of the modifier's collection |
| Group | Custom properties named by path, such as `--button-background-color`, and a mixin named after the group | A name prefix: `button/backgroundColor` is one variable. A component file that names the group becomes a component set |
| Part | A rule under the group, with the part's spelling (`&:where(:hover)`) and the part's own custom property, such as `--button-hover-background-color` | Folded: a mode of the axis's collection, such as `hover` in `state`. Unfolded: a variable of its own, such as `button/selected/backgroundColor` |
| Rest | The custom property with no part's spelling, such as `--button-background-color` | The `rest` mode of a folded collection, and the rest member of a component |
| Twin | The same custom property, which the part's rule overwrites | The rest variable's cell in the part's mode, taken from the part token |
| Vocabulary order | The order of the rules: rules with more parts come after rules with fewer, then the latest differing axis decides, and a later rule wins | Axes are decided in the vocabulary's order, so an earlier axis folds first |
| Fold | Not a CSS concept: each part is a rule | A part axis becomes the modes of one collection shared by its components, so one variable serves every value |

## Glossary

- **apply**: `@apply --name;`, which expands a mixin inside a style rule.
- **axis**: a named set of mutually exclusive part values, such as `state`. In a component file, a variant property.
- **collection**: lib's `Collection`, the tokens of one document. In Figma, a variable collection. Say which.
- **context**: one value of a modifier, such as `dark`.
- **fold**: the Figma layout in which a part axis becomes the modes of one shared collection.
- **group**: a node that holds tokens or groups. A component is one.
- **local property**: in CSS, `--_<name>`, the property a part re-points on the element for a token it changes. The component whose parts change it resets it to `initial`, so a nested instance starts from its rest.
- **mixin**: the CSS `@mixin --<path>` that Toghen writes for each group.
- **mode**: in lib, the one context chosen per modifier, written `theme=dark`. In Figma, one column of a variable collection. Say which.
- **modifier**: a named choice with its contexts, which makes it a world.
- **part**: a state or variant of one component, written as a subgroup whose key is a vocabulary value.
- **pin**: in Figma, the mode a component member sets on its root for each folded axis. Say "Figma mode pin".
- **rest**: a component with no part active: the tokens directly under its group.
- **set**: a resolver set, a named layer of sources. In Figma, a component set. Say which.
- **spelling**: the selector fragment or at-rule that says a context or a part value is active.
- **twin**: of a part token along an axis, the token at its path with that axis's part removed. The **rest** of a part token is its path with every part removed.
- **value**: one member of an axis, such as `hover`.
- **when-mixin**: a `--when-<modifier>-<context>` mixin that wraps its contents in a context's spelling.
- **world**: the kind of a choice: a context chosen once, for a subtree, by an ancestor or a caller. Modifiers are worlds.

## Why a state is not a modifier

A state is chosen by the element, not by an ancestor, so it is a part and not a world. Written as a modifier, each state would be a world of its own. A flat consumer, such as Style Dictionary, wants `--button-hover-background-color` in one tree, and the resolver defines a modifier as a context a caller chooses, which a hover is not. In Figma, a collection per state runs into the mode limit, and a frame set to hover also hovers every button inside it. A part in the path is what a flat token tree already writes. The alternatives weighed and rejected, and the history, are in [the lib decisions archive](./decisions.md#from-worlds-and-parts-considered-and-rejected).
