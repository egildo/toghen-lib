# A review of the core against its sentence

*21 October 2026. Investigation only: nothing in the source, tests or other docs was changed.*

The sentence under review:

> The core loads token sources and the resolver, builds the data structure, and answers questions about it (references, contexts, dependencies, parts and the component model); consumers ask and never re-derive, and a question enters the core only when two consumers ask it.

The ground at the time of writing: `pnpm --filter @toghen/lib test` passes 395 tests, and `typecheck` is clean. Every behaviour reported below as measured was run against the sources through the public API, with a synthetic document in the W3C structured shapes (a colour as `{colorSpace, components}`, a dimension as `{value, unit}`, a font family as an array, a typography and a shadow list with references in their members). The consumers are the CSS adapter (`toghen-postcss/src`), the Figma adapter (`toghen-figma` main thread, shared code and command line) and the plugin's own design system (`toghen-ui`).

## 1. What the core promises today

### Exports

| Export | Used by | What it answers |
|---|---|---|
| `DesignSystem` | postcss; figma (as a type) | The resolved system: a value, a resolved token, the references of a token, by lookup path |
| `Collection` | postcss, figma (as a type; built only by the resolver) | One document's tokens per mode, group attributes, modes, the vocabulary and parts |
| `DesignToken` | figma (as a type) | One token's four properties |
| `Resolver` | figma, ui; postcss reads it from the collection | The resolver document: builds, modifiers, mode names, and the four per-modifier questions |
| `load` | figma (command line), ui | A resolver document with every file reference inlined, and where each token came from |
| `getContextSelector` | postcss | A modifier context's CSS spelling |
| `isWholeReference` | figma | Whether a value is exactly one reference |
| `extractReferencePaths` | postcss, figma | The reference paths in one string |
| `parseReferencePath` | figma | The segments of a reference path, or an error for a malformed one |
| `containsReference` | none | Whether a string holds a reference |
| `isReferenceObject` | none | Whether a source is a `$ref` object |
| `normalizeTokenValue` | postcss, figma | The stored shape of a literal of a type |
| `normalizeColorToSRGB01` | postcss, figma | A colour as sRGB numbers from 0 to 1 |
| `normalizeDimensionToPx` | figma | A dimension in pixels |
| `normalizeLineHeight` | figma | A line height as a multiplier or a length |
| `normalizeGradient` | figma | A gradient in one shape |
| `isGradientStopsValue`, `parseAngleToDegrees` | none | Gradient handler helpers |
| `fontFamilyNames` | postcss, figma | A font family as a list of names |
| `cssPropertyName`, `cssIdentifier` | postcss, figma | The one CSS name both adapters write for a path, and for one segment |
| `colorHandler`, `dimensionHandler`, `letterSpacingHandler`, `typographyHandler`, `shadowHandler`, `gradientHandler` | none (the core uses them on load) | Checks and methods per type |
| `colorSpaces` | none | The colour space registry |
| `PathNotFoundError`, `CollectionNotFoundError` | postcss | A wrong lookup |
| `InvalidTokenError`, `InvalidModeError`, `CircularReferenceError`, `UnresolvableReferenceError`, `InvalidInterpolationError`, `NonFactorableError`, `ResolverValidationError`, `InvalidInputError`, `InvalidReferenceError` | none by class (messages only) | The other failures |
| Types `ModeModifier`, `TokenReference`, `Step`, `TokenContexts` | postcss | Shapes of answers above |
| Types `Part`, `ResolverDocument`, `ResolverInput`, `ColorValue`, `DimensionValue`, `GradientValue`, `GradientKind`, `ShadowValue`, `TypographyValue` | figma | Shapes of answers and values |
| All other types (`TokenTypeHandler`, `TokenData`, `UnresolvableReferenceReason`, `UnresolvableReferenceDetails`, `DimensionUnit`, the letter spacing and gradient stop types, the `Normalized…` types, `ContextSelector`, `LoadOptions`, `LoadResult`, `LeafProperty`, `Chain`, `ChainLink`, `NonFactorable`, `ResolverSet`, `ResolverModifier`, `ResolverModifierDef`, `ModifierContexts`, `InlineSet`, `InlineModifier`, `ResolutionOrderItem`, `ReferenceObject`, `TokenSource`) | none | Shapes |

### Methods

| Method | Used by | What it answers |
|---|---|---|
| Resolver: `resolveContextsToDesignSystem` | figma, ui | The sum build: defaults, each context alone, named combinations |
| Resolver: `resolveToDesignSystem` | figma | One context as a one-mode system |
| Resolver: `resolveAllToDesignSystem`, `resolve`, `getPermutations` | none | The product build; the merged document for one input; every combination |
| Resolver: `getModeName`, `getModifierNames`, `getModifierContexts`, `getModifierDefault`, `getDeclaredVersion`, `name` | figma | Naming and listing modifiers and contexts |
| Resolver: `dependsOn` | postcss | The modifiers a token depends on, directly and through references |
| Resolver: `contextsOf` | postcss, figma | What each context says about a token: its chains, holes, and the non-factorable report |
| Resolver: `valueAt` | figma | A token's value under some contexts, late bound |
| Resolver: `step` | none | One link's step for some contexts |
| DesignSystem: `resolveValue` | postcss | A resolved value, or a member of one |
| DesignSystem: `resolveToken` | postcss, figma | A resolved token, with its type (own, through a reference, or the group's) |
| DesignSystem: `referencesOf` | postcss, figma | The references a stored token makes, as written, per member |
| DesignSystem: `getCollection`, `getCollectionNames` | postcss, figma | The collections |
| DesignSystem: `entries`, `queryToken`, `setToken`, `removeToken`, `addCollection`, `removeCollection`, `registerTypeHandler` | none outside the core | Iteration, existence, editing, handlers |
| Collection: `getAllPaths` | postcss, figma | Token paths with a value in a mode |
| Collection: `getToken`, `getNodeKind`, `getDefaultMode`, `modeNamed`, `resolver` | postcss | A stored token; token, group or nothing; the default mode; a mode named by contexts; the resolver that built it |
| Collection: `getModifiers`, `getGroupAttribute`, `vocabularyAt`, `partsOf` | postcss, figma | Modifiers in resolution order; a group attribute; the vocabulary at a group; a path's parts and rest |
| Collection: `getModes` | figma | The modes |
| Collection: `hasToken`, `setToken`, `removeToken`, `setGroupAttribute`, `getProperty`, `setModeContexts`, `setDefaultMode`, `findIncompleteTokens` | none outside the core | Editing, inherited attributes, incomplete tokens |
| DesignToken: `set`, `update`, `merge`, `isReference`, `getReferences` | none | Copies, and references in a string value only |

`toghen-ui` loads one resolver document with `load`, builds the sum with `resolveContextsToDesignSystem`, and hands the system to the CSS adapter (`toghen-ui/scripts/build.mjs:37`). It asks nothing else.

## 2. Re-derived semantics

Each entry: where, what it computes, and whether a second consumer needs it. "Qualifies" means two consumers compute it, so by the sentence it belongs in the core.

### Parts and the component model

1. **The twin of a part token, and whether it exists.** The CSS adapter takes the path with every part removed (`partsOf().rest`) and checks it resolves (`toghen-postcss/src/index.ts:629`, `:647`). The Figma adapter removes one axis's segment at a time and checks the result is a token (`toghen-figma/main/utils/folds.ts:84`, `:86`). **Qualifies.** The two compute different twins for a token with two parts: for `button.selected.hover.backgroundColor`, one says `button.backgroundColor`, the other `button.selected.backgroundColor` for the state axis. The glossary (`model.md:30`, `:207`) does not say which is meant.
2. **The component a part token belongs to.** Both take the path before the first part (`toghen-postcss/src/index.ts:629`; `toghen-figma/main/utils/folds.ts:68`). **Qualifies.**
3. **Whether a group is a part, and of which axis and value.** The CSS adapter asks `partsOf` about an invented child, `` `${group}.x` ``, and keeps the last part (`toghen-postcss/src/index.ts:1181`). The Figma adapter learns it from the token paths in `foldsOf`. **Qualifies.** The invented child shows the core lacks the question.
4. **The axes and values a component uses, in precedence order.** The Figma adapter orders a component's axes and values by the vocabulary (`toghen-figma/main/utils/folds.ts`, `foldsOf`). The CSS adapter sorts a group's part children by the same rank (`toghen-postcss/src/index.ts:1188`). **Qualifies.** Precedence is the model's rule (`model.md`, *Precedence*), stated once and computed twice.
5. **Which token supplies a key under a selection of parts.** The Figma adapter's design source picks, for each key, the part token with the most parts, and the first one met on a tie (`toghen-figma/main/utils/designSource.ts:92`, `:109`). The CSS adapter writes rules in precedence order and lets the cascade decide. **Qualifies**, and the two disagree. Measured: for a component laid out one variable per part, with `button.primary.backgroundColor` and `button.hover.backgroundColor` and the selection *variant primary, state hover*, the Figma member binds whichever of the two comes first in the document. The model says the document's key order carries no meaning and the later axis wins, so the CSS answer is the hover token. Swapping the two keys in the document swaps the Figma answer.

### References

6. **The references in a raw value.** A chain step is a raw value, not a stored token, so `referencesOf` cannot read it. The CSS adapter walks it with its own recursion over `extractReferencePaths` (`toghen-postcss/src/index.ts:1442`). The Figma adapter carries a copy of the core's private holds-a-reference test (`toghen-figma/main/utils/sum.ts:160`; the original is `toghen-lib/src/core/alias-syntax.ts:78`). The core has both answers inside (`referencesIn`, `holdsReference`) and exports neither. **Qualifies.**
7. **The target of a whole reference, and a reference's written text.** The Figma adapter strips the braces itself before `parseReferencePath` (`toghen-figma/main/utils/sum.ts:392`, `:462`, `:504`; `toghen-figma/shared/components/read.ts:192`, `:350`). The CSS adapter rebuilds `{path}` to find it in a string (`toghen-postcss/src/index.ts:761`, `:1510`). **Qualifies.** The spec's rule that nobody parses braces but the grammar module (`specs.md`, *The grammar is public*) is kept in letter and broken in small ways.
8. **The token that owns a path that walks into a member.** The CSS adapter has two copies (`toghen-postcss/src/index.ts:778`, `:1445`). The core has two private ones (`DesignSystem.resolveValue`, and `ownerOf` in `toghen-lib/src/resolver/chains.ts:150`). One consumer, so by the letter it does not qualify. It is the core's own stated rule ("the first prefix that is a token owns the path"), already answered inside, so exporting it adds no new semantics.
9. **Who refers to a token.** The Figma adapter builds the reverse of `referencesOf` twice (`toghen-figma/main/utils/sum.ts:225`; `toghen-figma/main/handlers/tokenGraph.ts:82`). One consumer. **Stays**, until a second asks.

### Contexts

10. **A context's own definition, told from the base copied into the last link.** The chain fills the last link's silent contexts with `{ value: base }`. Both adapters undo that by comparing a step to the base: the CSS adapter with a deep equality (`toghen-postcss/src/index.ts:1496`), the Figma adapter with two JSON strings (`toghen-figma/main/utils/sum.ts:486`). **Qualifies.** A context that defines the same value as the base is misread by both.
11. **The mode where every modifier is at its default.** The CSS adapter names it by pairs (`toghen-postcss/src/index.ts:858`). The Figma adapter relies on the sum build putting the defaults first, and its style engine records the bug that a first permutation caused (`toghen-figma/main/engines/styleSyncEngine.ts`, comment on `buildPlan`). **Qualifies**; see the product build's default in section 4.
12. **A token's type across contexts.** The CSS adapter takes the first type any mode gives (`toghen-postcss/src/index.ts:1441`). The Figma adapter collects every type to report a conflict (`toghen-figma/main/utils/sum.ts:223`). **Qualifies.**
13. **The link name of a chain.** Both adapters name a link's custom property as the head's name, two hyphens, the modifier. The CSS adapter spells the modifier with its own escaping (`toghen-postcss/src/index.ts:1534`); the Figma adapter's code syntax uses `cssIdentifier` (`toghen-figma/main/utils/sum.ts:559`, `toghen-figma/main/utils/folds.ts:191`). **Qualifies**, and they disagree. Measured for a modifier named `colorScheme`: the CSS adapter writes `--surface-raised--colorScheme`, the Figma code syntax says `--surface-raised--color-scheme`. This is the drift *One CSS name for two adapters* was written to prevent.

### Structure

14. **The tokens under a group, a group's children, and the list of groups.** The CSS adapter filters `getAllPaths` by prefix (`toghen-postcss/src/index.ts:873`) and rebuilds the set of groups from token paths (`:1387`). The Figma adapter does both again for component files (`toghen-figma/main/utils/designSource.ts`, `children` and `group`). **Qualifies.**
15. **A lookup path to a reference path, and back.** The Figma adapter has a helper (`toghen-figma/main/utils/tokenPath.ts:20`); the CSS adapter slices the collection's name (`toghen-postcss/src/index.ts:1470`) and adds it back when there is one collection (`:851`). **Qualifies**, and is small.
16. **Every token of a system, resolved, across collections.** The Figma adapter does not use `entries` because it throws on a mode some collection lacks and yields tokens as stored (`toghen-figma/main/utils/flattenDesignSystem.ts`). The CSS adapter iterates `getAllPaths` itself. **Qualifies** as a fix to `entries`, not as a new question.

### What stays with an adapter

- Figma's: which contexts get a mode (`figma.include`), the mode limit, folding an axis into a collection, scopes and purposes, the values Figma cannot hold (`currentColor`, a letter spacing in `em`), `figma.value` keys, collection naming, the display text of a value (`toghen-figma/main/handlers/tokenGraph.ts:134`, though it re-derives a hex the colour handler already writes).
- CSS's: the text of a value, the member types it needs for spelling (`MEMBER_TYPES`), `var()` substitution, custom selectors, the local `--_` property, the escape-based identifier.

## 3. Unused or doubtful surface

**No consumer uses these.** The six handler objects and `colorSpaces` (the core runs them on load, but the methods they attach to a resolved token never activate, because no consumer calls `registerTypeHandler`); `DesignToken`'s `set`, `update`, `merge`, `isReference`, `getReferences`; `DesignSystem`'s `entries`, `queryToken`, `setToken`, `removeToken`, `registerTypeHandler`; `Collection`'s `hasToken`, `getProperty`, `setDefaultMode`, `findIncompleteTokens`; `Resolver`'s `resolve`, `resolveAllToDesignSystem`, `getPermutations`, `step`; `containsReference`, `isReferenceObject`, `isGradientStopsValue`, `parseAngleToDegrees`; every error class except two; most exported types. Some are the core's own vocabulary (the product build, `step`) and belong in the question set; others are building blocks from before the resolver (editing tokens, handler methods on a proxy) and need a ruling.

**Two ways to do one thing.**

- `DesignToken.isReference` and `getReferences` read only a string value, so a typography or shadow with references in its members reports none (measured). `referencesOf` answers the question properly.
- `entries` against `getAllPaths` with `resolveToken`: `entries` yields tokens as stored, so a token typed by its group has an empty type (measured), rejects the `'default'` sentinel the other methods take, and throws on a mode one collection lacks.
- `resolveToken` returns null for an unknown collection; `resolveValue` throws. `queryToken`, `hasToken` and `getNodeKind` ask nearly the same thing.
- Two orders of modifiers. `getModifierNames` and `getModeName` follow declaration order; `Collection.getModifiers` follows resolution order (`toghen-lib/src/resolver/resolver.ts:415`, `:745`). A document that declares `theme` before `density` and resolves `density` first gets mode names `light/regular` and modifiers listed `density, theme` (measured).
- Three builds, of which only two keep the resolver and the modifiers on the collection.
- `valueAt` takes a token or generated path only; `resolveValue` also takes a member path (measured).
- `ResolverModifier` and `ResolverModifierDef` are one type under two names.

**Names that do not match the glossary.**

- The glossary's *spelling* is `ContextSelector` and `getContextSelector`, whose result holds `selector` and `atRule`.
- The glossary's *value* of an axis is `Part.key`.
- *Twin*, *component* and *axis* have no name in the API at all, though they are the model's central words.
- The vocabulary lives under `css.parts`, but its axes and values are not CSS; only the spellings are. The Figma adapter reads axes from a key named for CSS.
- *Chain*, *link*, *home modifier* and *fall-through* are still candidates (`decisions.md`, open questions).
- `getProperty` names an inherited group attribute; the name says neither.

**Types that leak the implementation.**

- `TokenTypeHandler` has an open index of methods for a proxy no consumer uses.
- `TokenData` has a `$name` field nothing reads.
- `Collection.resolver` is a public, writable field.
- `setModeContexts` is a builder's step on the public surface.
- `UnresolvableReferenceError` thrown from `dependsOn` carries an empty collection name and the mode `'default'`, values that describe nothing (`toghen-lib/src/resolver/chains.ts:315`).

**CSS knowledge in the core.** `cssPropertyName` and `cssIdentifier` pass the two-consumer rule. `getContextSelector` has one consumer; the Figma adapter states it does not call it (`specs.md`, *With @toghen/figma*). By the sentence it is doubtful, unless the spelling is read as document data the core owns, as the vocabulary's spellings are.

## 4. Spec gaps

### Behaviour no doc states

1. **The product build's default mode is the first combination, not the document's defaults.** `resolveAllToDesignSystem` builds modes in the order of `getPermutations` (`toghen-lib/src/resolver/resolver.ts:301`) and a collection's default is its first mode (`toghen-lib/src/core/collection.ts:203`). Measured: with `theme` declaring `dark` before `light` and `default: light`, the default mode is `dark/regular`, and `resolveValue` with no mode answers the dark value. `reference.md:470` says the default is the first declared mode, which is literally true and contrary to what an author means. The sum build puts the defaults first (`resolver.ts:335`), so the two builds disagree.
2. **The one-collection shorthand is not the core's.** `model.md:18` says a path may leave out the collection when there is one. The core throws `CollectionNotFoundError` for `button.backgroundColor` (measured). It is the CSS adapter's behaviour (`toghen-postcss/src/index.ts:851`).
3. **A falsy group attribute is lost.** The loader keeps an attribute only when truthy (`resolver.ts:1044`), and `getGroupAttribute` returns `value || null` (`collection.ts:784`). Measured: a group's `$deprecated: false` reads as null. `reference.md` says `$deprecated` survives every build; no test covers `$deprecated`.
4. **`setGroupAttribute` on a token's path writes onto the token.** The walk does not stop at a token (`collection.ts:703`). Measured: the stored token's `$description` changes. This breaks the immutability invariant in `CLAUDE.md`. No doc, no test.
5. **The root is not a group for inheritance.** `getProperty` stops above the root (`collection.ts:819`), while `vocabularyAt` reads the root. The loader reads only the root's `$extensions` (`resolver.ts:1024`), not its `$type` or `$description`. Not stated.
6. **`entries` yields stored tokens.** A token typed by its group has an empty type there (measured). `reference.md:703` does not say so.
7. **A group's `$type` has no chain.** `contextsOf` gives a token typed by its group no `$type` chain (measured), so a consumer must ask `resolveToken` per mode. Consistent with "one chain per leaf property the token defines", but not said.
8. **`valueAt` refuses a member path.** Not stated beside `resolveValue`'s member walk.
9. **The two modifier orders** (section 3) are stated in two places and never as a pair.
10. **The archive still lists the `inherits` flag as built.** `decisions.md:143` lists `"inherits": false` under `getContextSelector`; the code no longer returns it and `specs.md` says a leftover flag is ignored. The archive is added to, never rewritten, so it needs a superseding entry.
11. **The running example lives in an adapter.** The model's example document is `toghen-postcss/test/example/`, and the core's golden test reads it across packages (`toghen-lib/test/integration/example.test.ts`).

### Statements the tests do not cover

- The resolver's unit tests (`test/unit/resolver/resolver.test.ts`, the largest file) use no structured colour or dimension at all. The three builds are exercised in the structured shapes only in a few integration cases (`context-modes`, `multi-mode`). The `CLAUDE.md` lesson asks for a structured case wherever resolution or a build changes; each build should resolve a `{colorSpace, components}` colour, a `{value, unit}` dimension and a `fontFamily` array per mode.
- No test pins the product build's default mode for a document whose default is not its first context.
- No test reads `$deprecated`, or any falsy group attribute, through a build.
- No test checks that a token is unchanged after `setGroupAttribute` on its path.
- No test covers a `dependsOn` error's details.
- The model's precedence rule ("the later one wins") is tested in each adapter's output, not as a question the core answers, so the two adapters could disagree (item 5 of section 2) without a failing test.

The chain model itself is well covered: the property test generates structured colours, dimensions and font family arrays (`test/unit/resolver/factoring/generate.ts:40`).

## 5. The question set

*Superseded by [the ruling of 21 October 2026](./decisions.md#ruled-the-core-answers-nine-questions-21-october-2026): nine questions absorb these 39.*

One sentence per question, with what answers it today. This list is the proposed contract: a consumer asks one of these, and anything else is the consumer's own business or a new entry here once two consumers ask.

### Loading

1. What is this resolver document, with every file it names inlined, and which files define each token? `load`.
2. Is the document valid? The `Resolver` constructor.
3. What version does the system declare for itself? `getDeclaredVersion`.

### Structure

4. Which token paths have a value in a mode? `Collection.getAllPaths`.
5. Is a path a token, a group, or nothing? `getNodeKind`.
6. Which tokens lie under a group, and what are a group's children? Missing.
7. Which groups does a document have? Missing.
8. Which token owns a path that walks into a member of a value? Missing (answered privately twice).
9. What is the reference path of a lookup path, and the lookup path of a reference path? Missing.
10. What does a group declare, and what does a token inherit from the nearest group, root included? `getGroupAttribute`; `getProperty` (root excluded).

### Values and types

11. What is a token's value, or a member's, in a mode? `resolveValue`.
12. What is a token's type, its own, through a reference, or its group's? `resolveToken(...).$type`.
13. What types does a token take across contexts? Missing.
14. What is the stored shape of a literal of a type? `normalizeTokenValue`.
15. What are a value's normalized forms (sRGB numbers, pixels, a line height, a gradient, a list of family names)? The `normalize…` exports and `fontFamilyNames`.

### References

16. What references does a token's value make, as written, member by member? `referencesOf`.
17. What references does a raw value make, such as a chain step? Missing (answered privately).
18. Does a raw value hold a reference anywhere? Missing (answered privately).
19. Is a value one whole reference, and to which path? `isWholeReference`, with the target left to the caller: half missing.
20. Which tokens refer to this one? Missing; one consumer so far.

### Contexts and dependencies

21. Which modifiers are there, with their contexts and defaults, in which one order? `getModifierNames` and its siblings; `Collection.getModifiers`, in another order.
22. Which mode is every modifier at its default? Missing for the product build; the sum's first mode.
23. Which mode stands for these contexts? `modeNamed`, `getModeName`.
24. Which modifiers does a token depend on, directly and through its references? `dependsOn`.
25. What does each context say about a token, with references kept? `contextsOf`.
26. Does a context define a token's value itself, or carry the base? Missing.
27. Which definition applies for these contexts? `step`.
28. What is a token's value under some contexts, late bound? `valueAt`.
29. Which tokens of a document are non-factorable, have holes, or miss a value in some mode? Missing for the first two (planned in `decisions.md`); `findIncompleteTokens` for the third.

### Parts and the component model

30. Which vocabulary is in force at a group? `vocabularyAt`.
31. Which parts does a token path pass through, and what is its rest? `partsOf`.
32. Is a group a part, of which axis and value? Missing.
33. Which component does a part token belong to? Missing.
34. What is a part token's twin, for one part and for all of them, and does it exist? Missing (`partsOf` gives the rest path, unchecked).
35. Which axes and values does a component use, in precedence order? Missing.
36. Under a selection of part values, which token supplies each key of a component? Missing.

### Names two adapters share

37. What is the CSS name of a lookup path? `cssPropertyName`.
38. What is the CSS name of a chain's link? Missing; the two adapters disagree today.
39. How does a modifier's context appear in CSS? `getContextSelector`; one consumer.

## 6. The playground

**Decision: a command line in a new workspace package, `toghen-play` (published name `@toghen/play`), that answers queries one at a time, in a loop at a prompt, or from a session file.** One loop serves all three, so a session typed by hand and a session run in a test are the same text.

**Why not the alternatives.**

- A script runner gives a person the whole API and lets them compute anything. A script would re-derive semantics, which is the problem this review is about. A fixed set of commands cannot.
- A small page needs a bundler, a browser and a screen to keep tidy, and its output is hard to compare in a test. The Figma plugin already has a token graph screen for people who want one.

**What it is built from.** Pure ESM, built with tsup like the core, run with Node. It depends on `@toghen/lib` alone, plus Node's own file reading and line reading. No other dependency.

**What it loads.**

- A resolver document by path, through `load` with a `read` that reads files. File references are followed exactly as the core follows them.
- Or bare token files by path, which it wraps in a one-set resolver document held in memory before calling `load`.
- It builds the sum by default. A flag asks for the product build, or one context.
- The running example moves here, from `toghen-postcss/test/example/`, so the model's example lives beside the core rather than inside an adapter. The core's and the adapters' tests read it from here.

**How a query is written.** One line: a question word, a path, and any `modifier=context` pairs. Paths are reference paths, so the collection is never typed. Examples:

```text
value button.backgroundColor theme=dark
across button.hover.backgroundColor
refs button.font
depends button.backgroundColor
chain surface.raised
parts button.selected.hover.backgroundColor
vocabulary field
modes
tokens button
```

**What it prints.** Plain text by default, JSON with a flag.

- The system: modifiers, contexts and defaults, the modes built, the token count.
- One token across contexts: a table, one row per mode.
- Dependencies, chains, holes and the non-factorable report.
- Parts, the vocabulary at a group, a component's axes.
- Each answer ends with the name of the export that gave it.

**The rule that makes it useful.** Every command is one call to one core export, then printing. The playground holds no semantics. A command whose question is missing from the core prints `missing:` and the question's number in section 5, rather than computing an answer. So the playground shows where the core is thin, and filling a gap means adding to the core, never to the playground.

**How it serves tests.** A session file holds queries, each on a line starting `>`, followed by the expected answer. A test in the playground package runs every session file and compares. An environment variable rewrites the answers, as the core's golden example test does now, and a person reads the diff. The core cannot depend on the playground, so the core keeps its own unit tests. The golden answers for the running example move to the playground's sessions, where they are written as questions rather than as JSON files.

**What it must not do.** It must not import either adapter, write a CSS name, a selector or a custom property, know Figma's collections, modes or limits, or write any file other than a session it was asked to update. It reads only the paths it is given.

**Five example sessions.**

1. *Where a value comes from.* `value button.backgroundColor`, then `refs button.backgroundColor`, then `chain surface.raised`, then `depends button.backgroundColor`, which answers that it depends on `theme` through its reference.
2. *One token across contexts.* `across button.hover.backgroundColor` prints a row per mode of the sum. `value button.hover.backgroundColor theme=dark density=compact` shows that the sum did not build that combination, and the same question through the late-bound value answers it.
3. *The parts of a component.* `vocabulary field` shows the overridden `disabled` spelling. `parts button.selected.hover.backgroundColor` shows two parts and the rest. `parts button.hover.pressed.backgroundColor` shows the error for two values of one axis.
4. *Precedence under a selection.* `applies button variant=primary state=hover` prints `missing` today. Once the core answers it, the expected answer is `button.hover.backgroundColor`, whatever the document's key order, and the Figma adapter's disagreement in section 2 becomes a failing session.
5. *A broken document.* A synthetic document with a dangling reference, a shadow overridden in part, and a token defined in one context only. `check` lists the non-factorable token and the hole (missing today), and `value` on the dangling one prints the core's error with its reference chain.

## 7. A proposed order of work

1. **Fix the quiet defects.** Keep falsy group attributes; refuse `setGroupAttribute` through a token; give `dependsOn` errors true details. Done when each has a test in the structured shapes and `$deprecated: false` survives the sum build.
2. **State what the code does.** Add to the reference: `entries` yields stored tokens; `valueAt` takes no member path; the two modifier orders and why; whether the root is a group for inheritance. Add a superseding entry to `decisions.md` for the `inherits` flag. Done when every item of section 4's first list is either fixed or stated.
3. **Rule on the product build's default.** Either the product build's default mode becomes the document's defaults, as in the sum, or the reference says it is not. Done when a test with `default` not first pins the ruling and the CSS adapter's own defaults lookup can be deleted.
4. **Rule on the one-collection shorthand.** Either the core accepts it, or `model.md` says it is the CSS adapter's. Done when the model and the code agree.
5. **Export what the core already answers privately.** The references in a raw value, whether a value holds a reference, the target of a whole reference, the token that owns a member path. Done when the Figma adapter's copied test and both adapters' brace handling are gone.
6. **Mark a step that carries the base.** Done when a step says whether its context defines the value, and both adapters' comparisons with the base are deleted.
7. **Name a chain's link in the core**, beside `cssPropertyName`. Done when both adapters call it and a test with a camel-case modifier name passes in both.
8. **Create the playground** with the questions the core answers today, move the running example into it, and write the five sessions, with `missing` where section 5 says so. Done when its sessions pass in `pnpm test` and the core's example test reads from it.
9. **Answer the component model.** Is a group a part; the component of a part token; the twin, after ruling which twin the glossary means; a component's axes in precedence order; the token that applies under a selection. Done when the adapters' derivations in section 2 items 1 to 5 call the core, and session 4 passes.
10. **Answer the structure questions.** Tokens under a group, a group's children, the list of groups, a token's types across contexts, and lookup and reference paths. Done when the adapters' prefix filters and path slicing are gone.
11. **Rule on every unused export.** Each one either answers a question in section 5 or is deprecated, then removed in a major version. Done when section 1's "none" rows are each settled.
12. **The document-wide check** (non-factorable tokens, holes, incomplete tokens in one call) waits for its second consumer, as `decisions.md` already says. The playground's `check` command shows the need meanwhile.
