# @toghen/lib — Decisions

> **Audience:** contributors and agents who ask why the lib is shaped as it is, or what is still undecided.
> For the present shape, see [specs.md](./specs.md). For the API, see [reference.md](./reference.md).

This is the archive of the lib's design. It holds what is no longer the shape of the code, and what waits for a ruling. Each entry says where it came from. The entries are of five kinds:

- **Dated rulings**: a decision, the date it was made, and its status.
- **Considered and rejected**: an alternative that was weighed, and why it was not taken.
- **Found in the build**: a finding that building a decision brought up, which the decision did not foresee.
- **Superseded sections**: text that a later decision replaced, moved here whole.
- **Open questions**: what has no ruling yet.

This file is added to, never rewritten. A new ruling adds a section; it does not edit an older one. [specs.md](./specs.md) explains the present and links here where a reader needs the history.

## From One CSS name for two adapters: the inherits flag

*Superseded 13 October 2026 by [Worlds and parts](./specs.md#worlds-and-parts): a state is a part in the path, not a modifier. The flag below stays until both adapters have moved.*

**A modifier says whether its contexts inherit** (*ruled and built 8 October
2026*). `"inherits": false` beside the spelling in `$extensions["com.toghen"].css`
marks an element state: a context that belongs to the element it is spelled on
and does not pass to its descendants (hover, pressed, disabled). Absent, it is
`true`.

`getContextSelector` returns it as `inherits: false` beside `selector` and `atRule` when the modifier says so. It throws when the value is not a boolean. It reads the flag from the modifier, never from a per-context entry, since a modifier is one kind or the other.

What an adapter does with it is the adapter's:

- the CSS adapter writes no context blocks for it and writes its states in components;
- the Figma adapter, after its round, takes it as a variant axis.

## From Worlds and parts: considered and rejected

**Considered and rejected.**

- *Spellings in the stylesheet*, as Tailwind's `@custom-variant`. Then Figma and any other reader cannot see which subgroup is a state. The vocabulary stays with the tokens.
- *A per-component modifier.* The resolver forbids a modifier referencing another, so a component's own `state` could not inherit the document's spellings; and it would still be a world.
- *The axis in the path* (`button.variant.primary`). A longer name in every consumer for a fact only Figma needs.

## From Querying one token across contexts

### The spike that began the design

The evidence the design started from is a spike on the branch `factoring-spike` (commit `9f9655d`), which tested the *definitions* half of the idea.

Marks the section used before its rewrite, now retired:

| Mark | Meaning |
|---|---|
| **tested in the spike** | Reproduced by the spike's tests, with the numbers given |
| **ruled** | Decided by the maintainer, 4 October 2026; not a measurement |

### What the resolver does with a token (tested in the spike)

The spike began by reading `deepMergeTokenStructures`, and what it found overturns the sentence the idea started from. The resolver does **not** let the last definition of a token win. A token is a plain object, so a later definition merges into an earlier one, as two groups would:

- a context that sets only `$description` or `$type` leaves the earlier `$value` in place;
- a `$value` that is a plain object (`{value, unit}`, a shadow's members) merges key by key, so `{unit: 'rem'}` after `{value: 16, unit: 'px'}` gives `{value: 16, unit: 'rem'}`;
- arrays and scalars are replaced whole: `{colorSpace, components}` merges `colorSpace` and replaces `components`; a `fontFamily` array is replaced as an array; an alias string replaces an object whole.

The merge is associative per path, so folding the entries of `resolutionOrder` from the end gives the same value as folding from the start. That is what makes a chain built by walking from the end sound (below), and it holds for as long as each link replaces whole.

Three units of factoring were measured, each reproduced against `resolver.resolve()` at every point of `getPermutations()`, on 500 seeded random legal documents (1 to 4 modifiers, 2 to 3 contexts each, with and without defaults, 0 to 3 sets anywhere in `resolutionOrder`, inline and `$ref` forms, tokens defined in two modifiers, sparse definitions):

| Unit | What gets a chain | Seeds that fail, all documents | Holds when |
|---|---|---|---|
| whole token | the token | 472 of 500 | never: a description alone breaks it |
| **per leaf property** | `$value`, `$type`, `$description`, `$extensions`, each its own chain | **353 of 500** | **no composite `$value` is ever partial** (500 of 500 on that corpus, aliases included) |
| per scalar or array leaf inside `$value` | every member of a composite | 235 of 500 | no `$value` ever changes shape (500 of 500 on that corpus); fails whenever an alias replaces an object whole |

The per-leaf-property failures are all partial composites: with partials removed from the corpus it held on all 500 seeds, with aliases still present. With aliases removed but partials kept it failed 370 of 500. In the four fixed cases the spike wrote in the W3C structured shapes, a `$description`-only override and a `fontFamily` array hold per leaf property, while a `unit`-only override on a `{value, unit}` and a shadow's `blur` alone do not.

### Report, do not factor: how the case was narrowed

*Recorded, not hidden:* the first ruling listed a second case, a shape change across contexts, for caution, although the spike had not found it unsound. The spike's corpus showed that only partial composites break the per-leaf-property unit and that aliases did not: with aliases and no partial composites it held on 500 of 500 seeds. The ruling was narrowed accordingly on 4 October 2026. The shape-change rule would also have flagged every token whose literal in one context is an alias in another, which is ordinary.

### The chain model (built on what the spike tested)

**Status of the chain model by itself:** tested in the spike for definitions, per leaf property, with no partial composites. References were not followed by the spike: aliases stayed strings.

### Ruled, 6 October 2026

- `step` throws on a non-factorable token: a chain claims each modifier can be read alone, and for such a token that claim is false; an early-bound answer would hide it from the adapter asking. The report of why is on `contextsOf`.
- `valueAt` on a hole throws `PathNotFoundError`, naming the combination: an `undefined` would travel into an adapter as "no value here" and surface as a blank mode or a missing declaration, far from its cause.
- A generated token carries only `$value`; its `$type`, `$description` and `$extensions` are the head token's, read from the head. A copy on every generated token would be the same data twice, kept in step by hand.

### Built, and stated in the reference

- `$extensions` is a plain object and merges as `$value` does, so the partial-composite rule applies to it too; the report names the property.
- `dependsOn` for a non-factorable token counts every modifier a context of which defines the `$value`, since a partial lets an earlier modifier show through; for any other token, the modifiers of its chain.

### Future / not built

- **A document-wide check.** One call listing every non-factorable token and every hole in a resolver document, which is not among the four methods. Trigger: when someone needs it.

## From Token values: where the check runs

*Superseded by [Token values](./specs.md#token-values): every path into a system ends in `Collection.setToken()`, and the check runs there.*

Before the check moved into `Collection.setToken()`, it ran only inside `DesignSystem.setToken()`, and only for types someone had registered a handler for. No adapter registered any, so in practice nothing was checked: a `color` written `'#000000'` loaded silently and reached an adapter as a string.

## From The grammar is public: the names

*Superseded by [The grammar is public](./specs.md#the-grammar-is-public): the public names say reference, not alias.*

The functions were called `isFullAlias` and so on while they were internal.

## Ruled: a group can opt out of the vocabulary (13 October 2026)

A vocabulary on the root read a lookup table as a component, and `hue.plain.solid` threw as two parts of one axis, stopping every mixin. Ruled: `"parts": false` on a group. Rejected: removing one value (`"plain": null`), finer but more grammar, until someone needs it; a vocabulary that applies only to groups marked as components, which changes the model and every document. The PostCSS half, an error that stays in its group, is in postcss's decisions.

## Ruled: the core answers nine questions (21 October 2026)

**Status:** ruled and built.

**The ruling.** The [core review](./core-review.md) of the same date listed 39 questions in its section 5, and
`toghen-query` first asked them with one command per export, 23 commands. The maintainer ruled that too large: too
many ways to ask one thing. The question set is nine questions, stated as the core's contract in
[specs.md](./specs.md#the-questions-the-core-answers), and `toghen-query` has one command for each.

| Question | Asks | Absorbs, by the review's numbers |
|---|---|---|
| `system` | modifiers, contexts, defaults, the modes built | 1 (load), 2 (valid), 3 (declared version), 21 (modifiers in one order), 22 (the defaults' mode), 23 (the mode for some contexts) |
| `paths [group]` | what lies under here, each marked token or group | 4 (paths in a mode), 5 (token, group or nothing), 6 (tokens under a group, a group's children), 7 (the groups, one level at a time), 9 (lookup and reference paths), 10 (what a group declares; what a token inherits is its type, under `type`) |
| `value <path>` | the value; `across`, one row per mode; `how`, the chain: what each context says and which definition applies | 8 (the token that owns a member path, which `resolveValue` walks), 11 (the value), 14 (the stored shape of a literal), 15 (the normalized forms), 25 (what each context says), 26 (a context's own definition or the base), 27 (which definition applies), 28 (the late-bound value) |
| `type <path> [contexts]` | its type | 12 (its type), 13 (its types across contexts, asked one context at a time) |
| `refs <path>` | what it refers to, member by member, and which modifiers it depends on | 16 (references of a token), 17 (references of a raw value), 18 (whether a raw value holds one), 19 (the target of a whole reference), 20 (who refers to a token: not answered, one consumer), 24 (the modifiers it depends on) |
| `parts <path>` | the parts it passes through, the vocabulary in force, the rest | 30 (the vocabulary), 31 (the parts and the rest), 32 (whether a group is a part), 33 (a part token's component), 34 (its twins), 35 (a component's axes in precedence order) |
| `applies <component> [axis=value …]` | which token supplies each key under a selection | 36 |
| `check` | holes, non-factorable tokens, tokens incomplete in some mode | 29 |
| `css <path>` | the shared names | 37 (a token's custom property), 38 (a link's), 39 (a context's spelling: answered by `getContextSelector`, which the prompt does not ask, since it takes a modifier) |

**Considered and rejected.**

- *The 23-command table, one command per export.* It was `toghen-query` as first built. It mirrored the surface,
  so every second way to ask a thing became a second command, and the table was the review's overlaps written
  out again. A question is what a consumer wants to know; an export is how the core happens to answer today.

## Ruled: the surface of the core is its question set (21 October 2026)

**Status:** ruled and built.

**The ruling.** Every export answers one of the nine questions, is the shape of an answer, or is the error it
gives. Where two exports answered one question, one stays; where an export answered nothing a consumer asks, it
goes. The maintainer ruled that compatibility on npm does not matter (the package is experimental, with one user),
so the others are **removed**, not deprecated, and no version changes. Every caller in the repository moved to
the export that stays.

| Removed | Stays as the answer |
|---|---|
| `DesignToken.set()`, `update()`, `merge()` | `new DesignToken(…)`: nothing asked for a copy with one property changed |
| `DesignToken.isReference()`, `getReferences()` | `referencesOf()`, `referencesIn()`, `holdsReference()`. The two read a string value only, so a typography or shadow with references in its members reported none |
| `DesignSystem.entries()` | `Collection.getAllPaths()` with `resolveToken()`. It yielded stored tokens, without a group's type, and threw on a mode one collection lacked |
| `DesignSystem.queryToken()`, `Collection.hasToken()` | `getNodeKind()`, and `getToken()` or `resolveToken()` against `null`: three exports asked nearly one thing |
| `DesignSystem.setToken()`, `removeToken()`, `removeCollection()`, `TokenData`; `Collection.removeToken()` | `Collection.setToken()`, the one way a token enters, and a new collection or system for removing |
| `DesignSystem.registerTypeHandler()`, `TokenTypeHandler`, the six handler objects, `colorSpaces` | The normalized forms (`normalizeColorToSRGB01` and the rest). No consumer registered a handler, so the methods a handler attached to a resolved token never activated |
| `Collection.getProperty()` | `resolveToken(path).$type` for the one inherited attribute a consumer asks, and `getGroupAttribute()` for a group's own. The core keeps the walk for itself |
| `Collection.setDefaultMode()` | The build: the default mode is the declared defaults (see the ruling below) |
| `Collection.findIncompleteTokens()` | `Collection.check().incomplete` |
| `Collection.getModifiers()` | `Resolver.getModifiers()`, reached through `collection.resolver` |
| `Resolver.getModifierNames()`, `getModifierContexts()`, `getModifierDefault()` | `Resolver.getModifiers()`: one list, one order |
| `Resolver.step()`, `NonFactorableError` | `contextsOf()` holds every step; `valueAt()` gives the value. Nothing called `step` |
| `containsReference()`, `isWholeReference()`, `extractReferencePaths()`, `isReferenceObject()` | `holdsReference()`, `referenceTarget()`, `referencesIn()` |
| `isGradientStopsValue()`, `parseAngleToDegrees()` | `normalizeGradient()` |
| `ResolverModifierDef` | `ResolverModifier`, the same type under its one name |

Kept, though no consumer calls them by name: the error classes, which are the answers a question refuses with;
`resolve()`, the resolver specification's own operation, against which the property test checks every chain;
`getPermutations()`, which the Figma adapter calls; and the types that shape a kept answer.

**What the two adapters asked, and now ask the core.** The review (section 2) found both adapters computing the
tokens under a group and a group's children (its question 6), and turning a lookup path into a reference path and
back (its question 9). The core answers both: `Collection.getAllPaths(mode, under)` and `Collection.childrenOf()`;
`DesignSystem.lookupPath()` and `referencePath()`. The CSS adapter's prefix filter and path slicing, and the Figma
adapter's `withoutCollection` and its walk over token paths for a group's children, are deleted.

**Considered and rejected.**

- *Mark each overlapping export deprecated, name its replacement, and remove it in a major version.* The brief's
  first form. The maintainer ruled compatibility does not matter here, and a deprecated export with no caller is
  surface a reader still has to learn.

**Found in the build.**

- *The CSS cascade needs the order modifiers win in.* The CSS adapter writes one block, or one layer, per modifier,
  and a later block wins where two apply, so it writes them in the order `resolutionOrder` applies the modifiers.
  With one list in declared order, a document that resolves its modifiers in another order would have a later
  block win where the resolver lets the other modifier win. `getModifiers()` therefore takes the order as an
  argument: declared, the default and the contract, or `'precedence'`. Decided in the build, and open for the
  maintainer to confirm (see the open questions).
- *`axesOf()` reads a group's own tokens.* The Figma adapter asked a component's axes, the CSS adapter the part
  groups directly under any group. One answer serves both when it reads the parts below the group of the tokens
  whose component is the group or a group above it: a component nested in the group keeps its axes to itself.
- *The handlers' helpers stay in the source.* `toHex()`, `toPx()` and the other methods a handler carries are no
  longer reachable from outside; the handlers' own tests still use them. Deleting them is left for a pass of its
  own.
- *Still re-derived:* the CSS adapter builds the list of groups from token paths for its spellings directive (the
  review's question 7), and the Figma adapter builds who refers to a token (question 20). One consumer each, so
  they stay with it.

## Ruled: the twin is per axis, and the rest is every part removed (21 October 2026)

**Status:** ruled and built.

**The ruling.** The review (section 2, item 1) found the two adapters computing different twins for a token with
two parts. Taken: the twin of a part token **along an axis** is the token at its path with that axis's part
removed; its **rest** is the path with every part removed. `Collection.partsOf()` answers both, and whether each is
a token. The CSS adapter re-points the rest; the Figma adapter folds an axis into modes through the twin along it.
Both call the core, and their derivations are deleted. The glossary in [model.md](./model.md#glossary) says it.

**Considered and rejected.**

- *Every part removed as the one twin.* It skips the single-part tokens' own axis, and cannot answer the fold
  question, which is asked one axis at a time.

## Ruled: which token applies, by specificity and then order (21 October 2026)

**Status:** ruled and built.

**The ruling.** Under a selection of part values, the token that supplies a key of a component is the candidate
with **more matching parts**; on a tie, the one whose **latest differing axis** comes later in the vocabulary. The
document's key order never matters. `Collection.applies()` answers it; the Figma adapter's design source, which
took the token with most parts and then the first met in the document, calls it, and a test swaps two keys in a
document and gets the same answer. The review's questions 32 to 35 enter the core with it, since both adapters
derived them (section 2, items 2 to 4): the component of a part token (`partsOf().component`), whether a group is a
part (`partAt()`), and a component's axes and values in precedence order (`axesOf()`). The CSS adapter's invented
`${group}.x` child, and its sort by the vocabulary's rank, are deleted.

**Considered and rejected.**

- *Vocabulary order alone*, the later part winning whatever the count. It gives the same answers for every
  document the review measured, and is the worse sentence: a two-part token beats a one-part token because it is
  more specific, which is what the cascade does with the rules the CSS adapter writes.
- *A precedence declared per component.* Nothing asks for it.

## Ruled: the product build's default mode is the declared defaults (21 October 2026)

**Status:** ruled and built.

**The ruling.** The review (section 4, item 1) measured the product build taking its first combination as its
default mode, so a theme that declared `dark` before its default `light` answered dark to a call with no mode. Taken:
the default mode is the combination of every modifier's declared default, as the sum already had it. The modes
keep the order of `getPermutations()`. The CSS adapter's own defaults lookup is deleted. A test declares `default`
after another context.

**Considered and rejected.**

- *Document the first combination as the default.* True of the code, and contrary to what an author means.
- *No default mode at all.* Every call that omits a mode would then need one, for a question the document already
  answers.

## Ruled: the one-collection shorthand is the core's (21 October 2026)

**Status:** ruled and built.

**The ruling.** The model said a path may leave out the collection when there is one; the core refused, and only
the CSS adapter honoured it (review section 4, item 2). Taken: the core accepts a reference path without its
collection when the system has one collection. A first segment that names a collection is the collection, so a
group named like the collection loses; the reference says so. `DesignSystem.lookupPath()` gives the path the core
reads. The CSS adapter's own prepending is deleted, and `toghen-query` passes paths as typed.

**Considered and rejected.**

- *Retract the model's promise.* Every example in the docs writes the short path, and the CSS adapter already
  honoured it.
- *Drop the collection segment from lookup paths altogether.* An open question, below.

## Ruled: one order of modifiers, and a link's CSS name keeps the modifier (21 October 2026)

**Status:** ruled and built.

**The ruling.** The core gave two orders of modifiers: `getModifierNames()` and mode names in declared order,
`Collection.getModifiers()` in resolution order (review section 3). Taken: **the declared order is the contract**,
one export, `Resolver.getModifiers()`, and the other is removed. It is the order the author wrote and can see; mode
names already followed it. The build found that a cascade needs the order modifiers win in, and asks it by name (see
*Found in the build* under the surface ruling).

A chain link's CSS name is the head's property, two hyphens, and **the modifier as written**: `cssLinkName()`,
beside `cssPropertyName()`. Both adapters call it. They disagreed: the CSS adapter wrote
`--surface-raised--colorScheme`, the Figma code syntax `--surface-raised--color-scheme` (review section 2, item 13).
A test with a camel-case modifier passes in both.

**Considered and rejected.**

- *Alphabetical order.* An order nobody wrote.
- *Hyphenated modifier names in links.* `--color-scheme` does not read back to `colorScheme`, and a link's name is
  how a person finds the modifier.

## Ruled: the review's leftovers (21 October 2026)

**Status:** ruled and built. Each closes an item of the review; each has a test in the W3C structured shapes.

- **A step says whether its context defines the value.** The last link's silent contexts carry the base as
  `{ value, base: true }`. Both adapters told the two apart by comparing a step with the base (a deep equality, and
  two JSON strings), and misread a context that defines the base's own value. Both read the flag now (section 2,
  item 10).
- **A group attribute set to false survives the load.** The loader kept an attribute only when truthy, and
  `getGroupAttribute()` returned `value || null`. `$deprecated: false` reads `false` (section 4, item 3).
- **`setGroupAttribute()` through a token's path is refused**, with `InvalidTokenError`, and the token stays as it
  was. It used to write onto the stored token (section 4, item 4).
- **`dependsOn()` errors carry true details**: the collection a build of the document is named, and the mode of the
  context the reference is written in, where they said `''` and `'default'` (section 3).
- **The reference grammar answers raw values**: `referencesIn()`, `holdsReference()`, `referenceTarget()`, and each
  reference's `written` text. The Figma adapter's copy of the holds-a-reference test, and both adapters' brace
  handling, are deleted (section 2, items 6 and 7).
- **The document-wide check is built**: `Collection.check()` lists the tokens incomplete in some mode, and for a
  collection a resolver built the holes of every chain and the non-factorable tokens. It waited for a second
  consumer (*Future / not built* under *From Querying one token across contexts*, above); the prompt is that
  consumer. It supersedes `findIncompleteTokens()`.

## Ruled: the loading chapter (21 October 2026)

**Status:** ruled. The three forms of `load` are built, and so are the overrides map
([built](#built-the-overrides-map-21-october-2026)) and the collision report
([built](#built-the-collision-report-21-october-2026)); the overlay example follows in this round.

**The concern.** The maintainer: Toghen must not demand a complex structure before it can consume anything. A person
with two token files should not have to write a resolver document first.

**The five points.**

1. **Three forms.** `load` takes a resolver document, as before; one token file; or a list of token files with an
   optional collection name, which defaults to the name of the folder that holds them. The core wraps token files in
   a resolver document with one set, in memory. The document stays a valid W3C resolver document throughout;
   everything Toghen adds sits outside it, in `load`'s options and result. There is no folder form.
2. **An overrides map.** A JSON object. Its keys are `$ref` strings as written in the document that holds them,
   matched whole and exactly, fragment included. Its values are the location to read instead; a relative value is
   resolved against the holding document. The map applies to a reference as written, before it is resolved, and
   then `read` is called. The result names the written reference and the location read, carries a hash of the map,
   and lists the keys no reference used. This is how a system is themed: the same document, another map.
3. **A collision report**, in `load`'s result. Two sources of one set, or of one modifier context, give one path a
   `$value`: the report names the path and the files, and marks the collision redundant when the values are equal
   as written. Never across items of `resolutionOrder`, where an override is the intent. The last source still
   wins. [specs.md](./specs.md#the-questions-the-core-answers) will name `load` among the answerers of the `check`
   question.
4. **An overlay** is a second resolver document. It borrows the base's sets and modifiers by `$ref` into the other
   file's `#/sets/…` and `#/modifiers/…`, and adds its own, in its own order. The standard forbids a reference into
   `#/resolutionOrder/…`, so an order is never borrowed, and `load` never reads another document's order. No new
   keyword. An overlay cannot add a source to a borrowed modifier's context; it redeclares the modifier.
5. **Rejected and parked**, below.

**Prior art.** Import maps, the web standard, for the overrides map: keys matched as written, values resolved
against the map's own location, a map swapped without touching the code. Vite's `alias` and npm's `overrides` for
the same swap in a build and in a dependency tree. Style Dictionary's warning when `include` and `source` define one
token, for the collision report. Kustomize's base and overlay, for borrowing without inheritance.

**The maintainer's answers.**

- Three forms, and no folder form.
- Collisions are reported in `load`'s result, and a modifier context's sources count, as a set's do.
- Redundant means equal as written, before anything is resolved.
- Map keys are matched whole and exactly. A relative value is resolved against the document that holds the
  reference. Unused keys are reported.

**Considered and rejected.**

- *An `extends` keyword* on a resolver document. Not to be confused with the format's `$extends` on groups (§6.4),
  which stays on the roadmap. Borrowing sets and modifiers by `$ref` already says what an overlay needs, inside the
  standard.
- *CSS-style layer names on sets.* Syntax over the standard, and nothing asks for it.
- *A second seam for the swap.* The map is defined in terms of `read`, not beside it.
- *A folder as a form.* Listing a folder needs a callback beside `read`, a second seam. A list of files says the
  same, and says the order.

**Parked.**

- *Scopes in the map*, as import maps have them: one key meaning two things in two places. Parked until a map needs
  it.

## Ruled: the order modifiers win in stays (21 October 2026)

**Status:** ruled. Nothing changes in the code.

**The ruling.** `getModifiers('precedence')` stays. It closes the first open question from the question set.

**The reason.** The CSS adapter writes one layer order statement, and one block per modifier, per stylesheet. A
chain is per token. Ordering the blocks from the chains would merge partial orders over every token and every token
it refers to, would need a rule for ties, and would give two `@toghen contexts` directives, scoped to two different
groups, two different orders, which the adapter cannot write in one layer. The order from the chains would also
re-derive what `resolutionOrder` already states. The prompt's `system` question will print the order, which makes
two consumers.

**Considered and rejected.**

- *An adapter that orders its blocks from the chains, token by token.* For the reasons above.

## Built: the overrides map (21 October 2026)

**Status:** built. `load` takes `options.overrides`, and returns `reads` always and `overrides` when a map was
given. The shape is in [reference.md](./reference.md#loadentry-options-promiseloadresult), the reasons in
[specs.md](./specs.md#the-overrides-map). The ruling is [the loading chapter](#ruled-the-loading-chapter-21-october-2026),
point 2.

**Found in the build.**

- *An item of `resolutionOrder` that names tokens was never refused.* A written `{ "$ref": "a.tokens.json" }` in
  the order was inlined as if it were a source, and `Resolver` then failed on an item with no name and no type. The
  map makes the mistake easy to make, so `load` now refuses it, written or mapped, with `InvalidReferenceError`.
- *The entry's own pointer with no fragment* (`{ "$ref": "ds.resolver.json" }`, written in `ds.resolver.json`) was
  handed on to `Resolver` unchanged. It is now refused as any whole resolver document is, so that a map sending a
  reference to the entry gets the same message. An entry pointer with a fragment is still handed to `Resolver`,
  rewritten as a same-document pointer.
- *The map's keys and the wrapper's references.* The core writes the wrapper around token files; its references are
  each file's path relative to the files' common folder. They are written references of a document, so the map
  applies to them.
- *The hash needs `BigInt`, and the build targets ES2017.* `load.ts` adds the `es2020.bigint` library to its own
  types and calls `BigInt(…)` rather than writing literals, which ES2017 output cannot hold. The UTF-8 bytes are
  computed by hand: a plugin sandbox may lack `TextEncoder`.

**Decided alone.**

- *A value that is not a string* is refused at the start of `load`, before anything is read.
- *Error messages* put the location read in parentheses after the holder: `$ref "x" in "a.json" (mapped to "b.json")`.
  The URI check, which runs before a location exists, names the value as written.
- *`reads` lists a mapped same-document pointer* too, with its holder as the location: it is listed because the map
  touched it, which is what a reader of `reads` looks for.
- *`reads` lists a reference once per copy.* A set reached twice is copied once, and its references are read once.
- *No type is exported for an entry of `reads`*: `LoadResult['reads'][number]` names it.

## Built: the collision report (21 October 2026)

**Status:** built. `load` returns `collisions` always, an empty list when there are none, and `Collision` is
exported as a type. The shape is in [reference.md](./reference.md#loadentry-options-promiseloadresult), the reasons
in [specs.md](./specs.md#external-sources-where-the-graph-becomes-one-thing). The ruling is
[the loading chapter](#ruled-the-loading-chapter-21-october-2026), point 3.

**Found in the build.**

- *The loaded document does not keep the sets in the order written.* A set that another set points at is copied in
  first, so `document.sets` may hold it ahead of the set that names it. The report lists the entry's sets in the
  order written, then the sets copied from other documents in the order they were copied.
- *A collision inside a set that others point at is reported once per set.* The set's own entry names it, and so
  does the entry of each set whose sources point at it, since a pointer counts as that set's sources in place. Each
  set is a merge of its own, and the report says what each merge meets.
- *The list form is the common case.* Two token files given to `load` are two sources of the wrapper's set, `base`,
  so a token both define is reported there. That is the case the chapter began from: a person with a few files.
- *`origins` and the report walk the tokens the same way.* One walk now serves both: a leaf with a `$value`, keys
  starting with `$` skipped.

**Decided alone.**

- *The file of each source is kept in a side table inside `load`*, from the inlined source to the file it came
  from. The document gains nothing.
- *Sibling keys on a pointer to a set are left out of the report.* The standard lets them override the set's own
  properties shallowly, but they are rare, and following them would need their sources inlined too.
- *Equal as written compares the JSON of each `$value` with every object's keys sorted.* Array order counts, so a
  font stack in another order is a different value.

## Ruled: the parts and spelling errors carry a class (21 October 2026)

**Status:** ruled and built.

**The defect.** The reference says every error is a named export with an `instanceof` check. Some errors that
public methods threw were plain `Error`: the parts errors (an invalid vocabulary, a key that is a value of two
axes, a path nesting two parts of one axis), the group attribute name without `$` in `setGroupAttribute()` and
`getGroupAttribute()`, and the two spelling errors of `getContextSelector()` (a spelling that is not a string, an
`atRule` that does not start with `@`). A caller could not tell them from any other failure. The CSS adapter
recognised them by `err.constructor === Error`, which caught every other plain error too.

**The ruling.** Name them with the existing classes; no new export. The parts errors and the group attribute error
throw `InvalidTokenError`. The spelling errors throw `ResolverValidationError`: they are faults in a modifier's
`$extensions` in the resolver document. Every message stays word for word.

**Found in the build.**

- *A value its type rejects escaped `setToken()` as a plain `Error`.* The handlers throw plain errors that already
  name the token (`Token "ds.space.bad": …`), and `normalizeTokenValue()` let them through. By the same rule it now
  rethrows them as `InvalidTokenError`, with the message unchanged, so `setToken()` and `normalizeTokenValue()`
  answer with one class.
- *Left plain.* The normalization helpers (`normalizeColorToSRGB01()`, `normalizeDimensionToPx()`,
  `normalizeLineHeight()`, `normalizeGradient()`, `fontFamilyNames()`) throw plain errors about a bare value with no
  token in it; no public method lets them out unwrapped. `parseReferencePath()` throws a plain error about a
  reference's text; inside the core it is wrapped in `UnresolvableReferenceError`. `DesignSystem.addCollection()`
  throws a plain error for an argument that is not a `Collection` and for a name already registered; no existing
  class fits either.

**What the adapters now check.** The CSS adapter's `failure()` recognises the library's sentence by
`instanceof InvalidTokenError` or `instanceof ResolverValidationError`, and writes it as before:
`Cannot write the mixins of "…": Path '…' nests two parts of axis …`. Another plain error is now reported as any
other failure. The Figma adapter and `toghen-query` recognised no library error by its constructor or its text, and
are unchanged.

## Ruled: a chain's values come in their stored shape (21 October 2026)

**Status:** ruled and built.

**The defect.** A chain's steps carried each context's value as the document writes it: a hex string stayed a
string. Both adapters then put it in the stored shape themselves, through `normalizeTokenValue(type, value, path)`,
and each worked out the type on its own: the CSS adapter took the first type it met across the modes. Two consumers
derived the stored shape again. The rule of the core is that consumers ask and never derive, and a question enters the
core when two consumers ask it.

**The ruling.** `contextsOf()` gives each step of the `$value` chain, and its `base`, in the shape lib stores, as
`resolveValue()` and a stored token give it. The type is the token's own: its `$type`, else its group's, in the
context of the step, never a type reached through a reference. A reference stays as written wherever it stands: a
whole reference, a member reference inside a composite, a reference inside a longer string. The `$type`,
`$description` and `$extensions` chains carry what they carried.

**Built.**

- *References.* `normalizeTokenValue()` already returned any value holding a reference, at any depth, as written, so
  the chain calls it as it is. A composite with one member reference stays as written in every member.
- *A type that differs between contexts.* A step takes the type where its modifier is at its context and every other
  modifier at its default; a modifier with no default defines no type there. The base takes the type at the defaults.
  The reference says so.
- *Where it happens.* At the answer, in `contextsOf()`, not when a chain is built. `valueAt()` and `dependsOn()` read
  the same chains, and a token's chain may hold a value its type rejects in a context the question never reaches.
  Normalizing on build made `valueAt()` refuse a token whose reference's chain held such a value elsewhere, where the
  resolver answers. A non-factorable property has no chain in the answer, so its parts, which have no shape of their
  own, are never normalized.
- *A value its type rejects.* `contextsOf()` throws `InvalidTokenError` naming the token, as loading it would.
- *The adapters.* The CSS adapter's `chains()` no longer normalizes a step or the base; it keeps the type it needs to
  spell the value. The Figma adapter's `cellFor()` no longer normalizes a step or the base of an unkeyed cell. Two
  calls stay there, because they ask something else: a cell with a `figma.value` key checks the value against the
  Figma type, which for a token with no `$type` is the type of the value the key names, not the token's own; and the
  key's own literal is normalized, which is not a chain value.

**Found in the build.** The seeded property test compared every chain with `resolve()` and expected `contextsOf()`
to answer for every token. Its generator writes a partial composite with nothing beneath it, which is a value its
type rejects. Such a token is now refused by `contextsOf()`, and the test checks the refusal's class and moves on.
Every other token is compared as before; a valid structured value is its own stored shape, so the comparison holds.

**Considered and rejected.** *The chain carries its type, and each adapter normalizes.* It answers the type question
once, but leaves the shape question to every consumer, which is the defect.

## Ruled: lib computes every specified value it can (24 October 2026)

**Status:** ruled and built. The present shape is in [specs.md](./specs.md#token-values) and
[reference.md](./reference.md#token-values).

**The defect.** A shadow whose colour was written `color-mix(in srgb, {ink} 5%, transparent)` never became a Figma
effect style (issue #123). Three gaps met there:

- *Two colour gates, both hex-only.* On load, `colorHandler.normalize` took a string only if it was `currentColor`,
  `transparent` or started with `#`. On read, `normalizeColorToSRGB01` took `#` alone, so a shadow's own colour
  member could not even be `transparent`. culori parses all of CSS Color 4; lib let it read hex only.
- *Nothing computed after resolution.* `resolveValue()` and `resolveToken()` returned a value written with a
  reference as the interpolated string. The shadow's colour reached the Figma adapter as
  `'color-mix(in srgb, #112233 5%, transparent)'`, and the hex-only read gate refused it.
- *No arithmetic.* Each length handler had its own regular expression for a number and a unit, and they disagreed on
  `'16'`. `calc(1rem + 2px)` typed `dimension` was refused at load; a gradient angle in `turn`, `rad` or `grad` was
  refused too. Composite members were checked and stored as written, so adapters read two shapes.

**The principle** (ruled by the maintainer the same day). CSS Values separates the *specified* value, what the
author wrote; the *computed* value, reduced as far as it can be without an element; and the *used* value, which
needs the box, the page or the font. Lib turns every specified value it holds into its computed value. What needs
the element stays out, and the adapter says so. CSS has a runtime for the last step; Figma has none, and that gap
had produced issue after issue. Named colours were settled as accepted before the plan was written.

**The rulings.** Each question had alternatives; the maintainer took these and vetoed none of the planner's
settlements.

- **1a. The arithmetic and `color-mix()` are written in lib, on culori.** culori stays the only production
  dependency.
- **2b. A mix of `rem` and absolute units is stored in `rem`**, each absolute length in px divided by 16:
  `calc(1rem + 2px)` is `{ value: 1.125, unit: 'rem' }`. Figma gets 18px, and CSS keeps the scaling the
  author chose `rem` for (22.5px at a root of 20, against a browser's 22).
- **3a. Every composite member is stored computed, plain forms included.** `'#abc'` in a shadow is a structured
  colour with `hex: '#aabbcc'`; `'16px'` is `{ value: 16, unit: 'px' }`. One shape for adapters was the point of the
  load gate, and the composites were where it had never been true.
- **5a. A space-separated list of dimensions stays a skip.** Untyped, `'8px 13px'` is stored as written and a CSS
  adapter writes it. Typed, it is refused, on load or once it resolves, and the reason says to leave the token
  untyped. The type that fits a padding shorthand is four tokens.
- Ruling 4b, how the CSS adapter spells a colour outside sRGB, is the CSS adapter's. Ruling 6b, the literal brace, is
  [its own entry](#ruled-a-literal-brace-is-written-doubled-24-october-2026).

**Settled by the planner, not vetoed.**

- *Colours in:* every CSS Color 4 spelling; named colours; `transparent` as a member colour, since its refusal there
  was an accident of the hex-only read gate; `color-mix()` in every space, with all four hue methods.
- *Colours out, refused with a reason:* relative colour syntax, `calc()` inside a channel, `light-dark()` (a scheme
  is a mode), system colours, `var()`, `currentColor` inside a mix. `currentColor` alone is kept as written, as
  before.
- *A computed colour is stored in its own space.* `color-mix(in oklch, …)` is an `oklch` colour. `hex` is set for a
  hex or a named colour, which are sRGB hex in CSS, and for nothing else.
- *Lengths in:* `calc() min() max() clamp() round()` over `px rem pt mm`, with `+ - * /` and parentheses; not
  `mod rem abs sign`, trigonometry, `pow sqrt hypot log exp`. A same-unit computation keeps its unit. `em` only with
  `em`, in a letter spacing. Refused: `em` elsewhere, `%` without a reference box, viewport, glyph and container
  units. No new units: `in cm Q pc` stay out, and angles are stored in `deg`.
- *Numbers:* `calc()` in a typography `lineHeight` and a `fontWeight`. A percentage line height is kept, since its
  reference box is the font size, which the adapter has.
- *Keywords:* the W3C `fontWeight` keywords become numbers, for the type and the typography member. Before, a
  typography `bold` was refused, and a token `bold` reached Figma as `NaN`.
- *New handlers:* `border`, since without it the colour a shadow computes would not compute in a border. `number`,
  `duration`, `cubicBezier`, `strokeStyle` and `transition` stay as written: no arithmetic, and nobody asked.
- *The read gate* sits in `resolveValue()` and `resolveToken()`, behind one internal `computeTokenValue`, and runs
  only when the raw value holds a reference. `contextsOf()` is unchanged: its steps keep references as written, by
  the [ruling of 21 October](#ruled-a-chains-values-come-in-their-stored-shape-21-october-2026).
- *A failure to compute throws `InvalidTokenError`*, on load or on read, and never falls back to the string.
- *The two colour bridges become one*, and the defects below are fixed by it, not separately.
  `normalizeColorToSRGB01` keeps its name and signature and accepts every colour string the load gate accepts.
- *A `figma.value` on a shadow* is not built: once the colour computes it is not needed.

**Considered and rejected.**

- *A dependency for the arithmetic* (question 1). Measured with `npm view` on 24 October 2026:
  `@toghen/lib` could take `@csstools/css-calc` 3.4.3 (46.7 KB), which brings `@csstools/css-tokenizer` 4.0.2
  (41.2 KB) and `@csstools/css-parser-algorithms` 4.0.2 (35.9 KB): three packages, 124 KB, conformance tested
  upstream against the web platform tests, with `color-mix()` still to write. Or `@csstools/css-color-parser` 4.2.6
  (65.1 KB), which adds `css-calc`, `@csstools/color-helpers` 6.1.2 (59.3 KB) and the two peers: five packages,
  248 KB, with `color-mix()`, relative colour syntax and `calc()` in channels per spec, and two colour libraries side
  by side. Both rejected: the subset lib admits is small and fixed, and the invariant of one dependency is worth more
  than code lib would not use. The evaluator and the mix are lib's own, a few hundred lines.
- *`calc(1rem + 2px)` stored in `px`* (2a): simple, but CSS writes `18px` and stops scaling with the root. *Refused*
  (2c): no assumption widened, but every author rewrites.
- *Only the members that need computing converted* (3b): the smallest diff, but two shapes remain.
- *A Toghen type for a list of dimensions* (5b): typed and checked, more surface, and nobody asked. *Lib refusing an
  untyped value that looks like a list* (5c): lib would start judging untyped values, which it never does.
- *One gate only.* A load gate alone cannot compute `color-mix(in srgb, {ink} 5%, transparent)`, which has a value
  only once `{ink}` resolves. A read gate alone would leave stored literals in two shapes, the defect the
  21 October ruling closed for chains.

**Found in the build.**

- *The premultiplication trap.* culori's `interpolate` does not premultiply alpha. Mixing `#112233` at 5% with
  `transparent` in `srgb` gave `#0102030d`, near-black at alpha 0.05. `interpolateWithPremultipliedAlpha` gives
  `#1122330d`, the ink at alpha 0.05, which is what CSS Color 5 §3 specifies and a browser draws. A test holds it.
- *culori reads `none` as 0 in a premultiplied mix.* CSS says a component missing in one colour takes the other's.
  The mix fills it in before interpolating; a component missing in both stays missing.
- *culori does not parse `Transparent` capitalised*, though it parses `Red`. The reader lower-cases a string before
  culori sees it, so every keyword matches in any case, inside a mix too.
- *Two bugs in the colour bridge.* `srgb-linear` mapped to culori's `rgb`, not `lrgb`, so a linear colour was read
  as gamma-encoded: `[0.5, 0.5, 0.5]` came out 0.5 grey instead of about 0.735. And the handler's bridge passed an
  `hsl` or `hwb` colour's percentages as written (0–100) where culori wants 0–1, while `normalizeColorToSRGB01`
  divided by 100. The handler's helpers (`toHex`, `toRgb`, `getLuminance`, …) were wrong for every `hsl` colour;
  only tests used them. There is one bridge now.
- *A mixed hue can be negative* (`-33.36`), and float noise can put a component a hair outside its range. Either
  would have made the colour handler's range warning fire on every read. A hue is brought into [0, 360), and a
  component within 1e-9 of a bound is snapped onto it.
- *`transparent` interpolated as `#0000000000`.* It is stored with the eight-digit `hex` `#00000000`, and
  interpolation appended the alpha byte again; the CSS adapter wrote it verbatim, as invalid CSS. And a structured
  colour with no `hex` could not be interpolated at all, so a `color-mix()` over an `oklch` token could not be
  written. Interpolation now spells any structured colour as CSS: its hex, the alpha byte only for a six-digit hex,
  otherwise its own space.
- *A token that itself holds a reference interpolates as its resolved string*, not its computed value: a resolved
  value is never re-scanned, and computing it there would read its text a second time. The string is still a colour
  CSS reads, and lib's reader computes it in the token that holds it.
- *The bare zero, caught at integration.* With every member computed, a shadow written `offsetX: '0'` was refused,
  since the numeric grammar required a unit; it had been stored as written before. A bare `0` is now `0px`, as CSS
  reads a length, and any other bare number is still refused for a length.
- *The Figma adapter had to catch the read gate per token.* It asked for every token without catching, so one value
  the core refused to compute stopped the variable plan, the style plan, the document's load, the token graph and a
  component file's run. It now reads each token through one function that returns the core's reason in place of the
  value, and the token is a skip with that reason. To give the type beside the reason, the adapter works the type out
  itself (see the open questions).

**Left out, stated in the known limitations.** A component outside its range as authored (`rgb(300 0 0)`) is stored
as computed and still warns on read; `color-mix()` without `in <space>`, and a mix of more than two colours, are
refused.

## From Token values: named colours stay refused

*Superseded 24 October 2026 by [Any CSS colour is a colour](./specs.md#token-values): the rule was discipline, not
capability, and discipline is the design system's. A design system that wants no named colours can say so in its
own review; lib reads what CSS reads.*

The bullet moved whole from *Two colour keywords are colours* in specs.md:

- Named colours (`red`, `navy`) stay refused: they are a palette's job. These two are not palette colours; one is the absence of colour, the other a reference to context. The CSS-wide keywords (`inherit`, `initial`) are cascade instructions, not colours, and stay refused.

The last sentence still holds, and stays in specs.md.

## Ruled: a literal brace is written doubled (24 October 2026)

**Status:** ruled and built. The grammar is in [reference.md](./reference.md#reference-grammar); the reasons in
[specs.md](./specs.md#the-grammar-is-public).

**The defect.** Lib read any `{…}` in a string as a reference, whatever the `$type`, and W3C defines no escape. A
data file that shows a token's name as text, a string token, and a component file's text had no way to say "this
brace is text" (issue #129). Data files are JSON and component files KDL; both are read by lib's grammar.

**The ruling (6b).** `{{` is the text `{` and `}}` the text `}`, as in Python's and .NET's format strings:
`{{size.sm}}` is the text `{size.sm}`. It is written the same in JSON and KDL, with nothing escaped. Before,
`{{a}}` meant a brace, the value of `a` and a brace, a meaning unlikely to be in use.

**Built.**

- The scanner reads a string left to right and matches an escape before a reference, so `'{{a}}'` is two escapes
  and no reference, `'{{{a}}}'` is a brace, `a`'s value and a brace, and `'{a}}'` is `a`'s value and a brace. A lone
  brace and `{}` stay text.
- `holdsReference()`, `referencesIn()` and `referenceTarget()` skip escapes, and so do `referencesOf()`,
  `dependsOn()` and `valueAt()`, which read through them.
- A stored value and a step of `contextsOf()` keep the doubled braces as written. A resolved string has them removed
  and is never re-scanned, so the `{size.sm}` it holds stays text.
- `literalText(value)` is exported, for an adapter that reads a raw string outside resolution.
- The read gate computes a resolved value without asking whether it holds a reference, so a brace that resolution
  turned into text cannot let a value pass unchecked.

**Considered and rejected.**

- *A backslash, `\{size.sm}`.* The convention of CSS and most grammars, but JSON needs `"\\{size.sm}"`, which is
  easy to get wrong by one backslash.
- *A `string` token is never scanned.* No new syntax, but a string token could no longer reference another string
  token, and a component file's text has no `$type`.
- *A flag in `$extensions["com.toghen"]`.* Explicit, per token, but silent in the value, and it does not reach a
  component file's text.

## Moved: a repository of its own, numbered from 0.1.0 (25 October 2026)

**Status:** done.

**The change.** The package left the Toghen monorepo for its own repository, [`Toghen/lib`](https://codeberg.org/Toghen/lib) on Codeberg, in one first commit. Its history before the split is not carried over. Its version starts again at 0.1.0; the last version before the split was 6.0.0. Links that crossed into other packages now point at their repositories.

**Why.** Ruled by Egildo on 25 October 2026: one repository per package, and a [house](https://codeberg.org/Toghen/house) repository for what they share (the constitution, the speckit preset, the Biome config, the purity check). The plan is in house, `.reference/plans/workspace/plan-2026-10-25-tooling-codeberg.md`.

**With it.** Biome lints and formats the code, `pnpm check` runs every gate, and speckit with the house preset runs the rounds. The running example now ships with the package (`example/` in `files`, `./example/*` in `exports`), so the other packages read it through `@toghen/lib` rather than by a folder path. The tests are type-checked, under `tsconfig.test.json`.

## Ruled: a two-context colour modifier spelled with `light-dark()` (30 October 2026)

**Status:** done, in 0.1.1.

**The need.** A theme modifier spelled as a media query lets only the operating system choose the scheme; an app cannot offer its own switch. CSS's `light-dark(a, b)` follows the used `color-scheme`, which an app sets on any element. An adapter needs to know that a modifier is such a pair, and which context is which.

**The shape.** A modifier's CSS member may carry `lightDark: { light, dark }` instead of a selector or an at-rule, and `getLightDark()` reads it, from a resolver document's modifier or from a collection's recorded one. It refuses what cannot be a pair: a non-object, a missing or non-string name, the same name twice, a name that is no context, a modifier without exactly two contexts, and a second spelling beside it. `getContextSelector()` is unchanged and returns `undefined` for such a modifier, since it has no `selector` or `atRule`.

**Rejected.** A per-context `colorScheme` under `contexts`: longer to write, and it does not say that the two contexts are a pair.

## Open questions

### From computing values (24 October 2026)

- *A token's type without its value.* `resolveToken()` gives the type beside a value it computes, so a token whose
  value the core refuses to compute gives neither. The Figma adapter needs the type to name such a skip, and works it
  out itself today, as `resolveToken()` would. One consumer asks; a question enters the core when two do.
- *The collection named in `valueAt()`'s errors.* `valueAt()` builds its answer in a collection named `resolved`, so
  a value it cannot compute is reported as `Token "resolved.<path>"`, where `contextsOf()`'s errors name the
  document's `name` first.
- *The deferred families.* `number`, `duration`, `cubicBezier`, `strokeStyle` as a token and `transition` have no
  handler and are stored as written. Wanted when a design system needs one computed or checked.
- *Relative colour syntax* (`hsl(from var(--x) h s l)`, `oklch(from #abc l c h)`) and `calc()` inside a channel.
  culori does not parse either; lib would need the channel arithmetic its numeric grammar already has. Wanted when
  someone asks.

### From the question set (21 October 2026)

- **Closed:** [it stays](#ruled-the-order-modifiers-win-in-stays-21-october-2026). Whether
  `getModifiers('precedence')` stays. The ruling made the declared order the one order; the build found
  the CSS cascade needs the order modifiers win in. The alternative is an adapter that orders its blocks from the
  chains, token by token.
- Whether lookup paths drop the collection segment altogether, so a lookup path and a reference path are one form.
  Rejected for now in the shorthand ruling; it would end `lookupPath()` and `referencePath()`.
- Who refers to a token (the review's question 20): built twice inside the Figma adapter, asked by no other.

### From Querying one token across contexts: open for ruling

- The names: *home modifier*, *fall-through*, *chain*, *link*, and the member names of the shapes in the reference that follow them.
- A modifier declared but never named in `resolutionOrder`: `modifiersInOrder()` places it last, yet `resolve()` ignores it. The chain model treats it as defining nothing.

## From Roadmap

### Completed
- [x] Core data model (`DesignSystem`, `Collection`, `DesignToken`)
- [x] Alias/reference resolution with circular detection
- [x] W3C Resolver Module (`resolutionOrder`, `modifiers`, `sets`)
- [x] Composite value interfaces and handlers (typography, shadow, gradient)
- [x] `normalizeColorToSRGB01()` utility
- [x] `cssPropertyName()`, the one CSS name the CSS and Figma adapters share
- [x] Resolver public accessors (`getPermutations()`, etc.)
- [x] DesignSystem flat iterator (`entries()`)
- [x] W3C field naming (`$extensions` plural)
- [x] Document-relative reference paths (§7.4.6), with errors instead of silent passthrough
- [x] References inside composite values and arrays (§9, §9.1)
- [x] Provenance: `referencesOf()` reports what a token refers to, per member
- [x] First-class per-mode values, and the Resolver bridge (`resolveAllToDesignSystem()`)
- [x] Incomplete mode coverage reporting (`findIncompleteTokens()`)
- [x] `Resolver.getDeclaredVersion()`: the version a design system declares for itself in a set's or modifier's `$extensions`, as against the document's `version` field, which §4.1.2 fixes at one string for every document
- [x] `load()`: a resolver document whose sources name files, with fragments, origins and resolver-on-resolver references
- [x] `resolveContextsToDesignSystem()`, the sum of the contexts, and a mode named by `modifier=context`
- [x] `collection.resolver`, `getModifiers()`, `setModeContexts()`: what a collection keeps of the resolver that built it
- [x] The per-modifier queries `dependsOn()`, `contextsOf()`, `step()`, `valueAt()`, with the chain model and the non-factorable report
- [x] Every value checked against its type on entry and stored in the structured shape; `normalizeTokenValue()` exported
- [x] `getContextSelector()`: a context's CSS spelling in the document, and `"inherits": false` for an element state
- [x] `cssIdentifier()`, and `cssPropertyName()` hyphenating camelCase (3.0.0)
- [x] Group attributes per mode, and `getProperty()` for a token's inherited `$type`
- [x] Every W3C colour space, through `colorSpaces`, with `'none'` as a component
- [x] Every value stored as its computed value: any CSS colour and `color-mix()`, `calc()` and its kin, `fontWeight` keywords, a `border` type, every composite member; a value written with a reference computed once it resolves
- [x] A literal brace written doubled, and `literalText()`
