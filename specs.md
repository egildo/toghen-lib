# @toghen/lib — Technical Specifications

> **Audience:** developers, AI coding agents, and contributors.
> For the user manual and examples, see [guide.md](./guide.md).
> For the API surface, see [reference.md](./reference.md).

---

## Purpose

`@toghen/lib` is the core engine of the Toghen ecosystem. It owns the token data model, reference resolution, type-specific handler logic, and W3C Resolver processing. It writes nothing out: an adapter serialises. Every other package in the monorepo depends on this library for token semantics, resolution behavior, and normalization utilities.

---

## The questions the core answers

*Ruled 21 October 2026; the ruling and what it absorbs are in [decisions.md](./decisions.md#ruled-the-core-answers-nine-questions-21-october-2026).*

The core loads token sources and the resolver, builds the data structure, and answers questions about it.
Consumers ask and never re-derive. A question enters the core when two consumers ask it. These nine are the
contract: every export answers one of them, is the shape of an answer, or is the error it gives. `toghen-query`
asks them, one command each.

| Question | Asks | Answered by |
|---|---|---|
| **system** | Which modifiers there are, with their contexts and defaults; which modes a build made, and which is the default | `load`, `new Resolver`, `Resolver.name`, `getDeclaredVersion`, `getModifiers`, `getModeName`, `getPermutations`, the three builds, `Collection.getModes`, `getDefaultMode`, `modeNamed` |
| **paths** | What lies under a group, each marked token or group; what a group declares; the lookup path of a reference path and back | `Collection.childrenOf`, `getAllPaths`, `getNodeKind`, `getGroupAttribute`, `DesignSystem.lookupPath`, `referencePath` |
| **value** | A token's value, or a member's, in a mode; across the modes; what each context says and which definition applies; the value under contexts no build made | `DesignSystem.resolveValue`, `Resolver.contextsOf`, `Resolver.valueAt`, `normalizeTokenValue` and the normalized forms |
| **type** | A token's type, its own, through a reference, or its group's, in a mode | `DesignSystem.resolveToken` |
| **refs** | What a token or a raw value refers to, member by member; which modifiers a token depends on, directly and through references | `DesignSystem.referencesOf`, `referencesIn`, `holdsReference`, `referenceTarget`, `parseReferencePath`, `Resolver.dependsOn` |
| **parts** | The parts a path passes through, its component, its twins and rest; the part a group is; the vocabulary in force; a component's axes in precedence order | `Collection.partsOf`, `partAt`, `vocabularyAt`, `axesOf` |
| **applies** | Under a selection of part values, which token supplies each key of a component | `Collection.applies` |
| **check** | The holes, the non-factorable tokens and the tokens incomplete in some mode, in one call; two sources of one set or context giving one token a value | `Collection.check`, `load` (its collisions) |
| **css** | The names two adapters share: a token's custom property, a chain link's, a context's spelling | `cssPropertyName`, `cssIdentifier`, `cssLinkName`, `getContextSelector` |

A consumer that needs something else asks for it to be added here, once a second consumer asks it too; until then
it is the consumer's own business. The rules each answer follows:

- **The modifiers have one order: the order the document declares them.** `getModifiers()` lists them so, and a
  mode name joins contexts in it. Which modifier wins over which is the resolver's `resolutionOrder`; an adapter
  that writes one block or layer per modifier asks for that order by name, `getModifiers('precedence')`.
- **The default mode is the declared defaults**, in every build that keeps the resolver: the sum and the product
  agree, wherever the build placed that combination.
- **A path may leave out its collection** when the system has one: the one-collection shorthand. A first segment
  that names a collection is the collection, so a group named like the collection loses.
- **The twin of a part token along an axis** is the token at its path with that axis's part removed; **its rest**
  is the path with every part removed. `partsOf` says both, and whether each is there.
- **Which token applies under a selection**: the candidate with more matching parts; on a tie, the one whose latest
  differing axis comes later in the vocabulary. The document's key order never matters.
- **A step says whether its context defines the value**, or carries the base into a context that defines nothing
  (`base: true`). A context that defines the base's own value is a definition.
- **A chain link's CSS name is the modifier as written**, after the head's property and two hyphens:
  `--surface-raised--colorScheme`. It reads back to the modifier.

---

## Architecture & Philosophy

### Minimal and Unopinionated

The guiding principle is minimalism, powerful yet unobtrusive:

- **Minimal dependencies:** the only production dependency is [`culori`](https://culorijs.org/), a tree-shakeable color science library used by the colour reader and the color handler. The arithmetic of `calc()` and `color-mix()` is lib's own, written on culori, so that it stays the only one ([ruling](./decisions.md#ruled-lib-computes-every-specified-value-it-can-24-october-2026)).
- **Lean core:** the public API focuses on the essential tasks of managing design tokens.
- **Unopinionated:** the library provides building blocks (`DesignToken`, `Collection`, `DesignSystem`) but does not enforce a specific workflow or data source.

### Core Architectural Patterns

#### Immutability

`DesignToken` instances are immutable. A change is a new instance. This provides:

- **Predictable state**: no side effects, easy data-flow tracing.
- **Safe sharing**: tokens can be passed freely without fear of mutation.
- **Change detection**: trivial to diff for UI framework integration.

#### Handler Pattern for Extensibility

Instead of bloating `DesignToken` with type-specific methods, type logic lives in dedicated handler modules:

- **Separation of concerns**: `DesignToken` is a data container; type behavior is in handlers.
- **The core's own**: the handlers check and store each W3C type. They are not exported, and a resolved token carries no methods; an adapter reads a value's normalized forms through the exported functions.

#### Data-Driven Design

Type registries (e.g., `color-spaces`) define properties declaratively. Adding a new color space means updating a registry, not core logic.

---

## Data Model

### DesignToken

The fundamental data unit. Properties:

| Property | Type | Description |
|---|---|---|
| `$value` | `any` | Token value: a literal, or a `{path}` reference (document-root-relative; see [Reference Resolution](#reference-resolution)) |
| `$type` | `string` | Token type (`color`, `dimension`, `number`, `string`, `typography`, `shadow`, `gradient`) |
| `$description` | `string \| undefined` | Optional human-readable description |
| `$extensions` | `Record<string, any> \| null` | Optional extension data (W3C-compliant plural field name) |

**Key behaviors:**

- Constructed as `new DesignToken($value, $type, $description?, $extensions?)`
- Immutable, with no methods: what it refers to is `referencesOf()` on the system

### Collection

A named container for tokens organized by dot-notation paths. Supports:

- **Nested grouping**: `colors.primary.blue`
- **Multi-mode**: each path can hold a different token per mode (e.g., `light` / `dark`); see [Modes](#modes)
- **Group attributes**: `$description`, `$type`, `$extensions` and `$deprecated` at any path level, kept per mode, a falsy one included; a token inherits its group's `$type`, which `resolveToken()` reports

**Key behaviors:**

- `setToken(path, token, mode?)` / `getToken(path, mode?)`
- `getNodeKind(path)`: `'token' | 'group' | 'missing'`, without resolving
- `getAllPaths(mode?, under?)` and `childrenOf(group, mode?)`: the tokens with a value in a mode, all or under a path; a group's children, each marked
- `setGroupAttribute(path, attribute, value, mode?)` / `getGroupAttribute(path, attribute, mode?)`: a group's own attributes; setting one on a token's path is refused
- `vocabularyAt`, `partsOf`, `partAt`, `axesOf`, `applies`: the component model ([Worlds and parts](#worlds-and-parts))
- `setModeContexts()` / `modeNamed()` / `resolver`: what a collection built from a resolver keeps of it (see the [reference](./reference.md#collection))
- `getModes()` / `getDefaultMode()`
- `check()`: the incomplete tokens, and for a collection a resolver built the holes and the non-factorable tokens

`getToken()` returns a token or `null`. A group path yields `null`. An undeclared mode throws `InvalidModeError` rather than falling back.

### DesignSystem

The resolved system. Holds collections, resolves references within each of them, and answers about a token by its
lookup path.

**Key behaviors:**

- `addCollection()` / `getCollection()` / `getCollectionNames()`: `addCollection()` throws on a duplicate name rather than replacing silently
- `lookupPath(path)`: the lookup path a path stands for, with the one-collection shorthand; `referencePath()` is its inverse
- `resolveValue(path, mode?)`: resolves a token value, expanding all references; the path may continue into the resolved value
- `resolveToken(path, mode?)`: returns a resolved `DesignToken` instance
- `referencesOf(path, mode?)`: the references a token's value makes, as written (first hop, per member)

---

## Reference Resolution

### Two namespaces — the rule to get right

Toghen deals in two kinds of path, and they are **not** interchangeable:

| | Written as | Relative to | Used by |
|---|---|---|---|
| **Lookup path** | `collectionName.tokenPath`, then for `resolveValue()` optional `.member` segments into the resolved value | the whole `DesignSystem` | `resolveValue()`, `resolveToken()`, `referencesOf()`, `toghen()` in CSS |
| **Reference path** | `{tokenPath}` inside a `$value` | the **document root**: the collection owning the token | the resolution engine |

So a token looked up as `theme.color.brand` refers to its sibling as `{color.blue}`, never `{theme.color.blue}`. This follows the W3C format (§7.4.6), where a reference path is document-root-relative and a top-level token is written `{primary}`.

The practical consequence: **a token document is portable**. Its references do not mention the collection, so the same JSON resolves identically whatever `Resolver.resolveToDesignSystem()` names the collection. Conversely, references never cross collection boundaries: a document is one collection.

A lookup path may go further than a reference path. Past the token it walks the **resolved** value, one own member or array index per segment, so `type.body.fontSize` is the `fontSize` of the resolved `type.body`. This is the lookup-path form of the W3C JSON Pointer `$ref` (Format §7, Example 32), which the curly-brace syntax cannot express. The rule is uniform:

- Any value with own members can be walked, and there is no type-aware branch.
- The first prefix that is a token owns the path, which is unambiguous because a token cannot contain tokens.
- A member is not a token, so `resolveToken()` stays token-only.
- A miss names what exists, since the useful reply to a typo is the list of names it missed.

**The one-collection shorthand** (*ruled 21 October 2026*). With one collection in the system, a lookup path may
leave out the collection: the core puts its name in front. A first segment that names a collection is read as the
collection, so a group named like it loses and is reached through the collection's name (`ds.ds.gap`). The
promise is the model's ([model.md](./model.md#the-running-example)); it was the CSS adapter's alone before the
ruling. `DesignSystem.lookupPath()` gives the path the core reads, and `referencePath()` goes back.

### The engine

Implemented in `src/core/alias.ts`, with the grammar isolated in
`src/core/alias-syntax.ts` so that detection is defined in exactly one place.

1. A **whole-value** reference (`{color.blue}`) yields the target's value with its type intact: object, array, number.
2. **Composite values and arrays** are walked, so a reference nested in a
   shadow's `color` or a typography's `fontFamily` is expanded too (§9). An
   array reference occupies exactly one slot: it is never flattened or expanded
   (§9.1).
3. Resolution recurses through chains, and a resolved value is **never re-scanned**: literal braces in legitimate content are not references. A literal brace is written doubled (see [The grammar is public](#the-grammar-is-public)).
4. Cycle detection keys on collection **and** path, with a per-branch copy of the
   stack, so a diamond (A→B, A→C, B→D, C→D) resolves while a genuine cycle
   throws `CircularReferenceError`.

### Provenance: a separate read of the same grammar

Resolution erases provenance, and adapters may not parse `{...}` themselves.
For a token, `DesignSystem.referencesOf()` restores it: `referencesIn()`, beside `walk` in
`alias.ts`, reads the same raw `$value` by the same grammar and reports each
reference with its member address (`at`, in the lookup path's member grammar)
and its target (`to`, collection-qualified).

- **First hop.** `to` is what the author wrote, not the end of the chain. An
  adapter that writes an alias wants the token named, and a chain is still
  there to follow through `referencesOf(to)`.
- **Syntactic.** Nothing is looked up, so a dangling reference is reported like
  any other. Errors stay with `resolveValue()`, which already reports them with
  full context; a second reporter would only disagree with it.
- **Not folded into `resolveValue()`'s return.** That return is the value, and
  every caller uses it as one. Wrapping it with provenance would change every
  caller for the benefit of the few that can express a reference.

### The grammar is public

The grammar is exported as five functions, for values that are not stored tokens: a chain's step, or a file that
writes references and is not a token document, where `referencesOf()` has nothing to read.

- `referencesIn(value, collectionName?)`: the references in a raw value, member by member, as `referencesOf()`
  reports them for a stored token, each with the reference `written` as the text holds it.
- `holdsReference(value)`: whether a raw value holds a reference anywhere, a `$ref` included.
- `referenceTarget(value)`: the path a whole reference names, braces removed.
- `parseReferencePath(path)`: a path's segments, or the error for a malformed one.
- `literalText(value)`: a raw string with its escapes removed, for a string read outside resolution.

**A literal brace is written doubled.** A Toghen extension: W3C defines no escape. In any string, `{{` is the text
`{` and `}}` the text `}`, so `'{{size.sm}}'` is the text `{size.sm}` and holds no reference. A string is read left
to right; a reference is a `{path}` whose braces are not part of an escape. A lone brace that is neither stays
text, and so does `{}`. So `'{{{size.sm}}}'` is a brace, the value of `size.sm` and a brace, and `'{a}}'` is the
value of `a` and a brace. `referencesIn()`, `holdsReference()` and `referenceTarget()` skip escapes. A stored
value, and a step of `contextsOf()`, keep the doubled braces as written; a resolved string has them removed, and is
never re-scanned, so the `{size.sm}` it holds stays text. Data files are JSON and component files KDL, and a doubled brace is written the same in both,
with nothing escaped. The ruling and the alternatives are in
[decisions.md](./decisions.md#ruled-a-literal-brace-is-written-doubled-24-october-2026).

The rule above still holds: nobody parses `{...}` but this module. Before the four, both adapters stripped braces
and rebuilt `{path}` to find it in a string, and the Figma adapter carried a copy of the private holds-a-reference
test; those are gone.

The public names say *reference*, not *alias*. In this project a reference is
the `{a.b}` of DTCG (the W3C Design Tokens Community Group format) and an alias is what the Figma adapter makes of one, a
`VARIABLE_ALIAS`.

### Failures are errors, not warnings

The W3C format requires tools to report unresolvable and circular references
(§7.4.5, §7.2.3). Resolution throws:

| Condition | Error | `reason` |
|---|---|---|
| No node at the path | `UnresolvableReferenceError` | `not-found` |
| Path names a group, not a token (§7.1.1) | `UnresolvableReferenceError` | `group` |
| Target carries no `$value` | `UnresolvableReferenceError` | `no-value` |
| Path shape can never name a token (`{a..b}`, `{$x}`) | `UnresolvableReferenceError` | `malformed` |
| Reference chain loops | `CircularReferenceError` | — |
| Non-scalar interpolated into a string | `InvalidInterpolationError` | — |

`UnresolvableReferenceError` extends `PathNotFoundError`, so existing
`instanceof` handling keeps working; the subclass distinguishes *whose* path is
wrong: a bad lookup argument versus a bad reference written inside a token.
Messages name the reference, the token containing it, the position within a
composite value (`at $value.color`), and the chain that led there.

`resolveToken()` returns `null` only for a **lookup** miss. Resolution failures
propagate, so a broken token is never mistaken for an absent one.

### Partial-string interpolation — a Toghen extension

A reference embedded in a longer string (`'0 2px 4px {color.shadow}'`) is
spliced into the surrounding text. The W3C format has no equivalent: there, a
`$value` either *is* one reference or contains none. Toghen retains it because it is useful for values with no structured form.

Limits, enforced rather than implied:

- The target must resolve to a **scalar**. An object or array throws `InvalidInterpolationError` instead of stringifying to `[object Object]`. The library lets two objects through, as the string they could have been written as: a dimension (`'24px'`) and a structured colour of any space. A colour is spelled by its `hex` when it carries one, the alpha byte appended only to a six-digit hex, and otherwise in CSS Color 4 syntax in its own space (`oklch(0.7 0.1 200)`). Lib's colour reader reads every such spelling back, so a colour interpolated into a `color-mix()` string computes. Colours and dimension strings are stored structured (see *Token values* below), and without this a value that interpolated when written as a string would stop interpolating once it was stored.
- A target whose own value holds a reference is inserted as its resolved string, not its computed value: with `mix` written `color-mix(in srgb, {ink} 5%, transparent)`, `'x {mix}'` resolves to `'x color-mix(in srgb, #112233 5%, transparent)'`.
- A doubled brace is a literal brace, removed from the resolved string (see [The grammar is public](#the-grammar-is-public)).
- `$&`, `` $` ``, `$'` and `$1` in a resolved value stay literal.
- Every occurrence is replaced, and injected text is never re-scanned.
- A partially interpolated string derives **no** `$type` from its references: there is no single target to take one from.

### Levels

- **Collection-level**: `Collection.getToken()` returns raw tokens (references preserved as strings)
- **System-level**: `DesignSystem.resolveValue()` / `resolveToken()` expand all references recursively, then compute a value that was written with one (see [Token values](#token-values))

---

## Modes

### Two layers, one bridge

Multi-context lives in the `Resolver`, as modifiers and contexts per the W3C Resolver spec. A `Collection`'s modes are where those contexts land:

| | Produced by | Holds |
|---|---|---|
| `Resolver` permutations | `getPermutations()` | every combination of modifier contexts |
| `Collection` modes | `resolveAllToDesignSystem()` | one mode per permutation, named by `getModeName()` |
| `Collection` modes | `resolveContextsToDesignSystem()` | the defaults, one mode per single context, and the combinations asked for |

`resolveToDesignSystem(input)` collapses the document to a single context and
yields a single-mode collection. `resolveAllToDesignSystem()` keeps them all, so
one system answers for every theme. That is what makes the `mode` argument on
`resolveValue()` and the `toghen()` directive mean anything. Without
that bridge those arguments were plumbing to a system nothing could build.

### The sum and the product

The full build is the product of every modifier's contexts, and it grows as
one: four modifiers with 2, 3, 3 and 6 contexts make 108 modes, a fifth with a
dozen contexts more than a thousand. Many systems switch their modifiers
independently, each by its own attribute or class, and let the cascade combine
them at runtime. They never need a combination resolved ahead of time; they need
the defaults and each context on its own, the sum. `resolveContextsToDesignSystem()`
builds that, plus any combination named.

**One naming function.** Both builds name a mode by `getModeName()`, so the same combination has the same name in either; the sum builds fewer.

**One default mode.** In both builds the default mode is the combination of every modifier's declared default
(*ruled 21 October 2026*). The sum builds it first; the product builds the combinations in the order of
`getPermutations()`, where a modifier that declares another context before its default puts that combination
later, and the collection still names it the default.

The second spelling, `modifier=context`, names a mode by what differs from the defaults, which is what an author means by "compact". The collection translates it (`modeNamed()`), not each adapter, because an adapter sees a `DesignSystem` and nothing of the resolver; names in a pair match regardless of case there, as a resolver input does, so every adapter answers the same question the same way. For that the collection records each mode's contexts and the modifiers themselves (`setModeContexts()`), and so it works the same against either build. A combination the collection did not build is an error that says so, never the nearest mode.

**The collection also keeps the resolver that built it.** Both builds set `collection.resolver`. An adapter that needs
the per-modifier questions of [Querying one token across
contexts](#querying-one-token-across-contexts) asks the collection for its
resolver and puts the questions to it. There is no option for passing a resolver
to an adapter, no rule matching a resolver's name to a collection's, and no
error for a collection "not built from" a given resolver: a collection built by
hand has no resolver, and an adapter that needs one says so. A collection with a
resolver also has modifiers; the converse is the hand-built case.

**Independence is the author's call.** Nothing checks that two modifiers really
are independent. A token whose value depends on two of them is correct in the
sum only where the adapter lets the runtime combine them; the CSS adapter says
when it cannot ([postcss specs](https://codeberg.org/Toghen/postcss/src/branch/main/specs.md#writing-every-context)).

### Per-mode storage

A leaf in the token tree is either a `DesignToken` (the same value in every mode) or an internal `ModeValues` map holding one token per mode. `setToken()` picks between them: omit `mode` for the former, pass one for the latter.

A per-mode value is held as a map beside the token, not inside its `$value`, so a `$value` is always the token's own value. Packed into an array, it could not be told apart from a value that is genuinely an array: a two-family font stack would split one family per mode, a three-family stack would be refused, and a list of shadows would split the same way. `setToken()` rejects an array of `DesignToken` instances rather than silently changing what it means.

### Strictness

- An undeclared mode throws `InvalidModeError` from `getToken()`, `setToken()`,
  `getAllPaths()`, `childrenOf()`, `getGroupAttribute()` and `setGroupAttribute()`. Each accepts a mode
  named by its contexts too, through `modeNamed()`. A fallback to another mode's value would let `toghen(path, dark)` return the light value against a single-context system.
- `Collection` construction rejects an empty or duplicated mode list.
- `getAllPaths(mode)` lists only paths that have a value in that mode.
- `getDefaultMode()` is the single source of truth for the `'default'` sentinel.
  `DesignSystem` reads it rather than `getModes()[0]`, which differ in the product build.
- `check().incomplete` reports tokens missing from some declared mode: legal, but usually an oversight, and otherwise invisible until that mode is resolved.

---

## W3C Resolver Module

Implements the [W3C Design Tokens Resolver specification](https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/) (`version: "2025-11-01"`).

The Resolver handles multi-mode and multi-theme workflows. It reads a `.resolver.json` document declaring **sets** (static token layers) and **modifiers** (conditional layers with named contexts), then collapses everything into a single merged token structure.

### Document Structure

```json
{
  "version": "2025-11-01",
  "name": "My Design System",
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

| Field | Required | Description |
|---|---|---|
| `version` | ✅ | Must be `"2025-11-01"` |
| `resolutionOrder` | ✅ | Ordered merge list: later items override earlier ones |
| `sets` | — | Named static token layers with a `sources` array |
| `modifiers` | — | Named conditional layers; each context key is a list of sources |
| `$defs` | — | Silently ignored (pass-through, per spec MUST) |

Items in `resolutionOrder` are either JSON Pointer `$ref`s (`#/sets/<name>`, `#/modifiers/<name>`) or inline `{ name, type, sources/contexts }` objects. `Resolver` follows same-document pointers only; file references are inlined first by `load`, below. Pointers follow RFC 6901 (`~1` → `/`, `~0` → `~`).

### External sources: where the graph becomes one thing

§3 permits a set's `sources` to reference **an external JSON file**, and §7 (*Bundling*, non-normative) treats a token graph spread across several files as the normal authoring shape:

> A resolver document allows for the use of tokens to exist in multiple JSON files for organization. But for the purposes of portability, it may be advantageous to deal with only a single JSON document.

`Resolver` itself still implements the mandatory floor, same-document `$ref` only, and stays synchronous and filesystem-free. File references are followed by `load(entry, { read })` before it, which returns one self-contained document.

**Where the graph becomes one thing** is either ahead of time, as a bundle (§7's answer), or inside each consumer, from files supplied together. A Figma plugin has no filesystem and declares `networkAccess: ["none"]`, so lib could not read files itself without breaking the plugin that bundles it. The answer is that the two are one mechanism. Lib asks its caller for bytes (`read`) and never imports `node:`. In Node, `read` wraps `readFile`. In a plugin, it looks up the files a person picked. A bundle is `load` in Node followed by `JSON.stringify`.

**Three forms, so nothing is demanded first.** Toghen must not demand a structure before it can consume anything. `load` takes a resolver document, one token file, or a list of token files with an optional collection name that defaults to the name of the folder holding them. Token files are wrapped in memory in a resolver document with one set, `base`, whose sources are the files in the order given. The wrapper is a standard document, not a Toghen shape: a person can save the same few lines beside the files and grow them into sets and modifiers when the system needs them, and the loaded document, written out, is a bundle like any other. Everything Toghen adds sits outside the document, in `load`'s options and result. There is no folder form: listing a folder needs a callback beside `read`, a second seam. The ruling is in [decisions.md](./decisions.md#ruled-the-loading-chapter-21-october-2026).

Decisions, each with its reason:

- **Relative to the file that names it.** A reference resolves against the resolver document's directory, never the working directory: the same document must mean the same thing wherever the command runs.
- **Resolvers compose; token files do not.** A UI folder's resolver may build on a shared one by naming its sets and modifiers (`../shared.resolver.json#/sets/base`). Those are copied in, with what they refer to, so `Resolver` still sees one document with same-document pointers. References inside token files are not followed: the spec places file references in sources, and token files hold tokens.
- **Only the named item comes across.** Another document's `resolutionOrder` is never read. The entry document decides the order; the documents it builds on supply layers.
- **Copied sets are keyed by file, modifiers by name.** A set's name is invisible outside its pointer, so a copy is keyed `<file>#<name>` and two files may both have a `base`. A modifier's name is its input key and its mode name, so it cannot be renamed, and two different modifiers with one name are an error rather than a silent override.
- **Cycles are errors.** Copying is sequential and keeps a stack of the sets and modifiers being copied; one that is reached again while still on the stack ends the load with the whole chain in the message. A diamond, the same set reached twice, is copied once.
- **No URIs.** `load` refuses a reference with a scheme, as §3 allows. Remote token files, pinning and caching wait for a consumer that loads tokens it did not write.
- **Provenance is a side output.** `origins` maps a token path to the files that define it, without touching the tokens: writing it into `$extensions` would travel into every export.

**Collisions are reported, not refused.** Two sources of one set, or of one modifier context, that both give one token a `$value` are listed in `load`'s `collisions`, with the files in merge order, and marked redundant when the values are equal as written. The standard allows it and says the last occurrence wins, so the report changes nothing: it is the "avoid it" beside the rule, as Style Dictionary warns when `include` and `source` define one token. Only `load` knows the files, so the report lives there and not in `Collection.check`. It is never made across items of `resolutionOrder`, where an override is the intent, nor between a set and a modifier context. Equal as written, not as resolved, because a redundant entry is one a person can delete without changing a value, and two spellings of one colour are a choice the person made.

#### The overrides map

A system is themed by reading the same document with another map. The map is the declarative form of `read`, not a second seam beside it: anything it does, a `read` that answers one location with another file's text could do. Written down as data, the swap can be saved beside the files, compared, and reported on.

- **Applied to the text as written, before resolution.** A key is a `$ref` string exactly as it appears in the document that holds it, fragment included, matched whole. `roles.tokens.json` does not catch `roles.tokens.json#/surface`, and `./roles.tokens.json` does not catch `roles.tokens.json`. Matching on resolved locations instead would make a key depend on where the entry sits; matching on text keeps it as readable as the document.
- **A value is resolved against the holder.** A relative value means what it would mean written in place of the reference. Import maps differ here: they resolve a value against the map's own location. Here the map has no location of its own; it may come from a file, a command line or a test, and the document is what gives a path its meaning.
- **One key, every holder.** The map applies in every document `load` reads: the entry, and each resolver document a set or modifier is borrowed from. A key catches the same text wherever it is written, and each match resolves against its own holder. A same-document pointer such as `#/sets/base` is a key like any other. The core writes the wrapper around token files, but its references are written references of a document, so the map applies to them too. Scoping a key to one holder, as import maps can, is parked until a map needs it.
- **The hash tells a changed map from changed tokens.** FNV-1a, 64 bits, over the JSON of the map with its keys sorted. A consumer that stores the hash beside a build can say "the map changed" in one comparison, rather than inferring it from a thousand changed tokens. It needs no dependency and no `node:` import, and is not a security hash.
- **Unused keys are reported.** A key no reference matched is most often a typo or a stale entry. `load` lists them in the map's order and does not refuse them: a map shared by several documents need not match in each.
- **`reads` says what happened.** Every reference that reads a file, with its holder, the location read and whether the map sent it there. A same-document pointer the map leaves alone reads nothing and is not listed.
- **A mapped reference passes the checks a written one does.** A value with a URI scheme is refused. A reference with no fragment sent to a whole resolver document is refused, as a written one is. An item of `resolutionOrder` sent to a token file is refused: the standard wants a set or modifier there, and a written reference to tokens in that place is refused the same way. A cycle made through the map is a cycle, found by the same stack. Same-document pointers the map produces are left to `Resolver`, which checks them as before. Every message names the written reference, its holder and the location read.

### Resolution Stages

1. **Document validation** *(at construction)*: checks `version`, inline item `name`/`type`, modifier context counts (0 or 1 context → error), `default` validity, and that no name occurs twice in `resolutionOrder`. A name counts whether the item is inline or a `$ref`, and a set counts as a modifier does. The standard's rule is written for inline items; it is applied to references too, since a modifier listed twice would give a chain the same link twice and a generated token the same name twice.
2. **Input validation** *(at `resolve()`)*: normalizes all keys and values to lowercase (case-insensitive per spec), verifies all non-default modifiers have a selection, rejects unknown keys and invalid context values.
3. **Ordering & merging**: iterates `resolutionOrder`; selects the active context for each modifier, then deep-merges all token sources. Later items always win on conflict, **per path**: a token is a plain object, so it merges like a group rather than being replaced (see [what the resolver does with a token](./decisions.md#what-the-resolver-does-with-a-token-tested-in-the-spike)).
4. **Alias resolution**: `Resolver` delegates it to `DesignSystem` when `resolveToDesignSystem()` is called.

### Resolver Public Accessors

The surface is in the [reference](./reference.md#resolver): `name` and `description`, `getDeclaredVersion()`, the modifiers (`getModifiers()`, `getPermutations()`, `getModeName()`), the three builds (`resolveToDesignSystem()`, `resolveAllToDesignSystem()`, `resolveContextsToDesignSystem()`) and the three per-modifier queries (`dependsOn()`, `contextsOf()`, `valueAt()`).

**The modifiers have one order** (*ruled 21 October 2026*): the order the document declares them, top-level
modifiers first, then inline ones in `resolutionOrder`. Every list follows it and a mode name joins contexts in
it. It is the order an author wrote and can see; the resolution order is a fact about which modifier wins, which
the chains report per token. Where a whole stylesheet needs it, as the CSS adapter's blocks and layers do,
`getModifiers('precedence')` names it.

---

## Worlds and parts

[The component model](./model.md) defines the terms and shows them on the running example. This section keeps the contract and the reasons. Lib reads no element-state flag: a leftover one is ignored. The adapters' sides are [The component model, in standard CSS](https://codeberg.org/Toghen/postcss/src/branch/main/specs.md#the-component-model-in-standard-css) in postcss's specs and [Parts: axes from subgroups](https://codeberg.org/Toghen/figma/src/branch/main/specs.md#parts-axes-from-subgroups-folded-into-modes-or-one-variable-each) in figma's specs.

**The split.** A design system varies along two kinds of axis, and each is written differently.

- A **world** is a context chosen once, for a subtree, by an ancestor or a caller: theme, density. The resolver's modifier is a world, and nothing about it changes. The targets already inherit it: a custom property inherits in CSS, a Figma mode set on a frame holds for its children, and a Style Dictionary build is one world.
- A **part** is a state or a variant of one component: hover, pressed, disabled, selected, primary. It belongs to the element and is chosen by the element's own state or attribute. It is not a context of the resolver. It is written as a subgroup of the component's group: `button.hover.backgroundColor`, `button.primary.backgroundColor`, `button.selected.hover.backgroundColor`. Every part is an ordinary token in one tree, and a world may redefine `button.hover.backgroundColor` in a context as it redefines any token.

The test is who sets the choice. An ancestor or the host sets a modifier, once, for everything inside. The element sets a part.

**The vocabulary.** A subgroup is a part only when its key is a value of the vocabulary. The vocabulary lives in `$extensions["com.toghen"].css.parts` on the document root or on any group. A group reads every holder above it. A holder lower down overrides one entry and keeps the rest. The vocabulary has three levels: an axis, its values, and each value's spelling. Adapters read it and never redefine it.

In the running example the vocabulary sits on the root, so every group reads it. The `field` group overrides one entry: its `disabled` spelling is `:has(> input:disabled)`, and it keeps the other axes. The shape is in [the running example](./model.md#the-running-example).

- *Paths stay flat*: `button.primary`, not `button.variant.primary`. The axis is metadata: the Figma adapter makes an axis of it. A reader that writes CSS names the custom property by the path, as `--button-primary-background-color`.
- *Values of one axis are exclusive.* A path never nests two values of one axis: `button.hover.pressed` is refused. A combination always spans two axes: `button.selected.hover` is `selection` with `state`, which is why `selected` has its own axis.
- *A spelling is a selector fragment.* Without `&` it is appended to the rule's selector; with `&` it places itself, which is how a state inherited from a container, or read from a sibling, is said. An at-rule spelling is allowed, as for a context.
- *A subgroup whose key is in no vocabulary is a plain subgroup*, a child element or a namespace, never nested, read by its path. Part keys and child keys share one namespace: `button.icon` is a child only because `icon` is in no vocabulary.
- *A part needs no twin at rest.* `button.pressed.backgroundColor` with no `button.backgroundColor` exists only while pressed.
- *The twin and the rest* (*ruled 21 October 2026*). The twin of a part token along an axis is the token at its path
  with that axis's part removed; its rest is the path with every part removed. For
  `button.selected.hover.backgroundColor`, the twin along `state` is `button.selected.backgroundColor`, the twin
  along `selection` is `button.hover.backgroundColor`, and the rest is `button.backgroundColor`. A part token with one
  part has one twin, which is its rest. The CSS adapter re-points the rest; the Figma adapter folds an axis into
  modes through the twin along it. `partsOf` answers both, and whether each is a token.
- *A group can opt out* (*ruled and built 13 October 2026*). `"com.toghen": { "css": { "parts": false } }` on a group clears the vocabulary in force there: `vocabularyAt` returns `{}` for that group and every group below it, unless a group lower down declares a vocabulary of its own, which starts again from empty. So no key under it is a part. It is for a group that is no component, such as a lookup table, under a vocabulary on the root: `hue.plain.solid.bg`, where `plain` and `solid` are both `variant` values, otherwise throws as two parts of one axis. `false` is the only value besides an object; anything else is the existing invalid-vocabulary error. *Not chosen:* removing one value (`"plain": null`), finer but more grammar, until someone needs it; and the inverse, a vocabulary that applies only to groups marked as components, which changes the model and every existing document. The adapters read the vocabulary through lib, so the PostCSS mixins and the Figma axes follow with no change of their own.

**Precedence.** Parts that match at once are ordered by the vocabulary: axes in the order they are declared, values in the order declared within an axis, and the later one wins. A group's key order carries no meaning. Declare the variant axis first and the state axes after. A variant that must keep its look under a state nests its own value, as `button.primary.hover`. Without that, a generic `:hover` wins over the primary variant's rest.

**Which token applies** (*ruled 21 October 2026*). Under a selection of part values, the token that supplies a key
of a component is the candidate with more matching parts; on a tie, the one whose latest differing axis comes later
in the vocabulary. For the selection *variant primary, state hover*, `button.primary.backgroundColor` and
`button.hover.backgroundColor` tie at one part, and `state` comes after `variant`, so the hover background applies.
`button.selected.hover.backgroundColor` under *selection selected, state hover* beats both of its twins with two
parts. It is what the CSS cascade gives for the rules the CSS adapter writes, so the Figma adapter's member and the
stylesheet agree.

**What lib provides:**

- `Collection.vocabularyAt(groupPath, mode?)` returns the vocabulary in force at a group, merged from the root down. Its signature and errors are in the [reference](./reference.md#parts).
- `Collection.partsOf(path, mode?)` gives the parts a token path passes through, its component, its twin along each axis and its rest, each with whether it is there.
- `Collection.partAt(group, mode?)` gives the part a group is, or `null`.
- `Collection.axesOf(group, mode?)` gives the axes and values the group's own part tokens use, in precedence order. A component nested in it keeps its own.
- `Collection.applies(component, selection, mode?)` gives the token that supplies each key under a selection.
- Their signatures and errors are in the [reference](./reference.md#parts).
- The first segment of a path is never a part. It is a top-level group, which is a component, whatever the vocabulary says. The last segment is the token itself, so it is never a part either.
- A vocabulary may sit on the document root or on any group. Sources merge the root's `$extensions` key by key, as they merge a group's. Group attributes, `$extensions` and `$deprecated` survive every resolver build, the root's included, so a vocabulary does too.

**Why.** A state as a modifier gives one world per state. No flat consumer can use that: Style Dictionary, Terrazzo and every hand-written `var()` want `--button-hover-background-color` in one tree, and the resolver specification defines a modifier as a context a caller chooses, which a hover is not. In Figma, a collection per state runs into the mode limit. In CSS, it needs a flag saying the state does not inherit, and a rule for how the state joins a selector: two patches on the same mismatch. A part in the path is what common practice already writes. The alternatives weighed and rejected are in [decisions.md](./decisions.md#from-worlds-and-parts-considered-and-rejected).

**What stays.** Chains, `contextsOf`, `dependsOn` and the sum are all between worlds and are unchanged. A resolver set surviving resolution, for a warning that names two source files, is still wanted and is not decided.

---

## Querying one token across contexts

**Status: built.** The three methods are on `Resolver` (`src/resolver/chains.ts`, glue in `resolver.ts`), tested by fixed cases in the W3C structured shapes and by a seeded property test (`test/unit/resolver/factoring/`) that reproduces `resolve()` at every point of `getPermutations()` for every token and property the report does not name. What stays proposed is the vocabulary, which is still to be christened. Every claim below carries one of these marks:

| Mark | Meaning |
|---|---|
| **cited** | Read in a standard, with the section named |
| **measured in a browser** | Measured in Chromium and WebKit; the fixtures, the script and the results are tracked in [`toghen-postcss/measurements/`](https://codeberg.org/Toghen/postcss/src/branch/main/measurements/RESULTS.md) |
| **proposed** | A design to be ruled on; may change |
| **built** | Implemented and covered by the tests named in the status above |

The vocabulary marked *proposed, to be christened* is a candidate, not a name. Nothing is christened until the maintainer says so, and the glossary and the API members below follow whatever is chosen.

### The problem

`Resolver` binds early. It picks one point in context space, merges the sets and the chosen contexts, and hands back one flat world; `resolveAllToDesignSystem()` builds the product of the contexts into worlds, `resolveContextsToDesignSystem()` the sum (see [The sum and the product](#the-sum-and-the-product)). Asking a token a question means asking a world that was built before the question.

The environments Toghen feeds do not work that way. A stylesheet sets each modifier on a subtree of its own, and the nearest ancestor wins per modifier. A Figma file keeps one variable collection per modifier, and the nearest frame wins per collection. In both, a reference is followed later than the flattening point, and nobody builds the product. Three questions follow that a flat world cannot answer:

1. **Dependency.** Which modifiers does a token depend on: directly (a context of that modifier defines it) and through the references in its value?
2. **One step.** For one modifier's context, which definition applies, with references kept as references? The chain answers it: the head link's step at that context.
3. **Partial contexts.** A question names only the modifiers it cares about; the rest take their defaults.

### The unit: per leaf property

The chain is built **per leaf property**: `$value`, `$type`, `$description` and `$extensions` each get their own. The rest of this section says "the chain of a token" and means the chain of its `$value`; the other properties follow the same model and are read through [`contextsOf`](./reference.md#method-contextsof). The evidence for this unit, and why a whole token is not the unit, is in [decisions.md](./decisions.md#what-the-resolver-does-with-a-token-tested-in-the-spike).

### Report, do not factor

Some tokens the unit cannot represent. These are **reported as non-factorable, not factored, and not refused**: the resolver keeps resolving them early-bound, as it does today, and the caller decides what to do. The two adapters decide for themselves; nothing here tells them how.

One case is non-factorable:

- **A partial composite.** A context overrides only part of a composite `$value`: `{unit}` after `{value, unit}`, a shadow's `blur` alone. Detected with no knowledge of the type: a `$value` that is a plain object and is merged onto a plain-object `$value` beneath it, in some cell, giving a result different from the incoming object alone.

A token is reported **only** for this. A `$value` that changes shape across contexts, a literal in one and an alias in another, is not reported and is factorable: the alias replaces the object whole, and the chain reproduces the resolver.

A partial is reported **only when the resolver would ever output it**: some way through the contexts, choosing one context per modifier and falling through where none defines the property, reaches the end of `resolutionOrder` with the merged result. A partial that a later modifier hides in every one of its contexts never shows, `valueAt` agrees with `resolve()` everywhere, and the token is factorable: it is not reported, and its chain stops at the later modifier.

The report names the token path, the property, the contexts involved (set or modifier, with the context for a modifier) and the reason, in the shape given in [`NonFactorable`](./reference.md#type-nonfactorable). How the case was narrowed is in [decisions.md](./decisions.md#report-do-not-factor-how-the-case-was-narrowed).

### The chain model

Take one property of one token and walk `resolutionOrder` **from the end**:

- A **set** is always active. If it defines the property, the walk ends there and its value is the **base**; if not, the walk continues.
- A **modifier** has contexts, and each context either defines the property or does not. If no context defines it, the modifier is skipped. If some do, the modifier adds a **link**: for each context, its value, or a **fall-through** to whatever lies earlier. If every context defines it, nothing earlier can show through, and the walk ends with no base.
- If the walk reaches the start with no set having defined the property, then in any cell where every link falls through the token has **no value**: a hole (below).

Candidate vocabulary, *proposed, to be christened*:

| Candidate | Meaning |
|---|---|
| **chain** | the ordered links of one property, last-winning first, with its base |
| **link** | one modifier's say in a chain: a value per context that defines the property, a fall-through for the others |
| **home modifier** | the modifier that decides a link |
| **fall-through** | a context passing the question to the next link |

A link reads only its own modifier's context. That is the whole point: evaluating a chain asks `input[link.modifier]` and never the whole input, which is the discipline of the nearest frame per collection and of one attribute per modifier. The spike's `evalFactored` is written that way, so its agreement with the resolver means the discipline is enough.

### What a link is

A link is a modifier and a table from its contexts to a *step*: either `a value` (a literal in the shape lib stores, or a reference, kept as written), or a fall-through. By construction a link is **dense**: every context of the modifier has a step, and a fall-through step is not an absence but an arrow to the next link. The next link is another token, so the arrow is an alias.

### Generated tokens

A chain of *n* links needs *n* tokens to be read as aliases. The first is the token itself, home to the last-winning modifier. The others are **generated tokens**, one per remaining link:

- **Name.** The token's path with `~` and the home modifier's name appended to the last segment: `color.bg` has the generated token `color.bg~scheme`. A name occurs once in `resolutionOrder`, inline or by reference (a repeated one is rejected at construction; see [Resolution Stages](#resolution-stages)), so the name is unique per token.
- **Value.** The fall-through steps of one link alias the next token: `{color.bg~scheme}`. The last link's fall-through steps carry the base value instead, because a set cannot be an alias target of a modifier's context. Such a step says so (`base: true`), so a consumer that wants only what a context defines reads the flag, and never compares a step with the base.
- **Flagged, by the adapter.** The lib never materialises a generated token: it exists only in what a query returns, and is never written into the document. An adapter that materialises one, as a variable or a declaration, should mark it `$extensions["com.toghen"].generated = { of: <path>, modifier: <name> }`, so an export or a person can tell it from an authored token. Whether an adapter does is its own spec's business.
- **Collisions.** A document that already holds a token at a generated path is an error at the query, not a silent overwrite. `~` is legal in a DTCG name; nothing reserves it.

Because the count is *n − 1* per chain, a token that varies on one modifier, which is the common case, generates nothing.

**What it costs, measured.** One four-modifier fixture, shaped like a layered system: scheme (2 contexts), tone (2), hue (3), scale (2) over one base set, so 24 permutations and 40 tokens: primitives that vary on scheme, roles that vary on tone and on hue, size knobs that vary on scale, and a shadow whose `blur` is overridden alone by scale and whose members are overridden by scheme.

| Unit | Chains | Links | Chains with two or more links | Variables emitted (one per chain, at least) | Over the 40 tokens |
|---|---|---|---|---|---|
| whole token | 40 | 19 | 1 | 41 | 1 |
| per leaf property | 56 | 25 | 1 | 57 | 17 |
| per member of `$value` | 79 | 39 | 2 | 81 | 41 |

The "variables emitted" column counts a chain for every property (`$type` and `$description` included), so it overstates what an adapter would emit for `$value` alone; the figure that bears on generated tokens is chains with two or more links: **one** at the whole-token and leaf-property levels (the shadow), two at the per-member level. That shadow, whose `blur` is overridden alone on scale, is also exactly the token the per-leaf-property unit cannot represent: it is reported, and the per-member unit reproduces it.

### Sparse cells and holes

Two things look alike and are not:

- A **sparse cell** is a context that does not define the property. It is legal, ordinary, and not a defect: the context falls through. A link is dense by construction, so a consumer that needs a value in every mode, as a Figma variable does, gets one: the cell is an alias to the next link or the base. A consumer that may leave a cell empty, as a stylesheet may, can emit the sparse form.
- A **hole** is a cell where every link falls through and no set defines the property. The token has no value there. A hole is not filled and not guessed; it is **reported**, as the combination of the chain's home modifiers that has no value (`{ scheme: 'dark', tone: 'a' }`), because the author may have meant it and may not. The spike's fixed case has exactly this shape and the resolver agrees: the token is absent from `resolve()` there.

### The three `Resolver` methods

No new class. These are questions about a resolver document, so they are methods on `Resolver`, and *modifier* and *context* stay the only vocabulary. `DesignSystem.resolveToken` returns a `DesignToken`, so the `Resolver` method that returns a value is named `valueAt`, to avoid reusing a word for a different return. A fourth, `step()`, gave one step of the chain; it answered what `contextsOf()` already holds, and was removed on 21 October 2026.

| Method | Question | Returns |
|---|---|---|
| `dependsOn(path)` | which modifiers does the token depend on | `{ direct, through }` |
| `contextsOf(path)` | what does each modifier's context say about it | the chains of the token, its holes and its non-factorable report |
| `valueAt(path, input?)` | the token's final value under these contexts | a resolved value |

Signatures, return shapes and errors are in the [reference](./reference.md#querying-one-token-across-contexts). Common to all three:

- **Paths** are reference paths: relative to the document, with no collection name (see [Reference paths vs lookup paths](./reference.md#reference-paths-vs-lookup-paths)). A generated path (`color.bg~scheme`) is accepted wherever a token path is, for every chain that has one.
- **Partial inputs.** An input names only the modifiers the question cares about. An omitted modifier takes its default; one with no default and no input is an `InvalidInputError`, as in `resolve()`.
- **Late binding.** `valueAt` follows references as a consumer would: the referenced token's own chain is read at the same input, so a reference to a token that varies on a modifier the first token does not mention still sees that modifier's context.
  - It must agree with `resolve(input)` followed by `DesignSystem.resolveValue()` for every input and every token in every cell where the whole document's `DesignSystem` answers.
  - Where that system refuses the document because some other token is malformed, `valueAt` still answers, since it loads only the token asked.
  - **Built:** the property test compares `valueAt` with the DesignSystem in exactly those cells, and checks that a modifier outside `dependsOn` never changes the followed `$value`.
- **Stored steps.** A `$value` chain's steps and its base come in the shape lib stores, as a stored token gives a literal: a `'#aa0000'` string comes as a structured colour. Each consumer would otherwise work the shape out again, and the two adapters did, each finding the type its own way. The type is the token's own, its `$type` or its group's, read in the step's own context, never one reached through a reference. A reference has no shape until it resolves, so a value holding one stays exactly as written, wherever the reference stands. A value its type rejects is an `InvalidTokenError`, as on load. The rule is in the [reference](./reference.md#type-leafproperty-step-chain); the ruling is in [decisions.md](./decisions.md#ruled-a-chains-values-come-in-their-stored-shape-21-october-2026).

### A worked example

Synthetic, in the W3C structured shapes. The document's resolved values below were checked against `Resolver.resolve()`; the chains are what `contextsOf()` now returns for it, and the reference shows the same shapes.

```json
{
  "version": "2025-11-01",
  "name": "example",
  "sets": { "base": { "sources": [{
    "button": { "bg": { "$type": "color", "$description": "Button fill",
      "$value": { "colorSpace": "srgb", "components": [0.9, 0.9, 0.9] } } },
    "space": { "gap": { "$type": "dimension", "$value": { "value": 16, "unit": "px" } } },
    "font": { "body": { "$type": "fontFamily", "$value": ["Inter", "sans-serif"] } },
    "shadow": { "card": { "$type": "shadow", "$value": {
      "offsetX": { "value": 0, "unit": "px" }, "offsetY": { "value": 2, "unit": "px" },
      "blur": { "value": 4, "unit": "px" }, "spread": { "value": 0, "unit": "px" },
      "color": { "colorSpace": "srgb", "components": [0, 0, 0] } } } }
  }] } },
  "modifiers": {
    "scheme": { "default": "light", "contexts": { "light": [{}], "dark": [
      { "button": { "bg": { "$value": { "colorSpace": "srgb", "components": [0.2, 0.2, 0.2] } } } }] } },
    "tone": { "default": "neutral", "contexts": { "neutral": [{}], "primary": [
      { "button": { "bg": { "$value": { "colorSpace": "srgb", "components": [0.1, 0.4, 0.9] } } } }] } },
    "density": { "default": "regular", "contexts": { "regular": [{}], "compact": [{
      "space": { "gap": { "$value": { "value": 12, "unit": "px" } } },
      "font": { "body": { "$value": ["Inter Tight", "sans-serif"] } },
      "shadow": { "card": { "$value": { "blur": { "value": 2, "unit": "px" } } } } }] } }
  },
  "resolutionOrder": [{ "$ref": "#/sets/base" }, { "$ref": "#/modifiers/scheme" },
    { "$ref": "#/modifiers/tone" }, { "$ref": "#/modifiers/density" }]
}
```

`button.bg`, walked from the end: `density` does not define it and is skipped; `tone` defines it in `primary` only, so it is a link; `scheme` defines it in `dark` only, so it is a link; `base` defines it, so the walk ends. Its `$type` and `$description` are defined only by the set, so those chains have no links and are read from the base. Its `$value` chain has two links, and so one generated token:

- `button.bg`, home modifier `tone`: `primary` is `{ colorSpace: 'srgb', components: [0.1, 0.4, 0.9] }`; `neutral` falls through to `{button.bg~scheme}`.
- `button.bg~scheme`, generated, home modifier `scheme`: `dark` is `{ colorSpace: 'srgb', components: [0.2, 0.2, 0.2] }`; `light` carries the base, `{ colorSpace: 'srgb', components: [0.9, 0.9, 0.9] }`.

All four points of `scheme` × `tone` agree with `resolve()`: `light`/`neutral` is `[0.9, 0.9, 0.9]`, `dark`/`neutral` is `[0.2, 0.2, 0.2]`, and either scheme with `primary` is `[0.1, 0.4, 0.9]`. A node in `primary` reads `button.bg` from `tone` alone and never looks at `scheme`; one in `neutral` follows the alias and reads `scheme` alone.

`space.gap` (`{value, unit}`, replaced whole by `compact`) and `font.body` (an array, replaced whole) each have one link, home modifier `density`, and generate nothing: `regular` carries the base `{ value: 16, unit: 'px' }` and `['Inter', 'sans-serif']`, `compact` carries `{ value: 12, unit: 'px' }` and `['Inter Tight', 'sans-serif']`.

`shadow.card` is **non-factorable**: `compact` gives only `blur`, which the resolver merges into the base's other members (`blur` 2, the rest unchanged, checked). It is reported and left early-bound:

```json
{
  "path": "shadow.card",
  "property": "$value",
  "reason": "partial-composite",
  "involved": [{ "entry": "base" }, { "entry": "density", "context": "compact" }],
  "detail": "$value of \"shadow.card\" is overridden in part: an object merged onto the object beneath it differs from the incoming object alone."
}
```

### The two consumers of the chain

The chain is one answer with two binding rules downstream. That the two differ is the reason the answer is a chain and not a flat value.

**CSS binds `var()` where the property is declared.** *Cited:* CSS Custom Properties Level 1, §2.3: "custom properties resolve any var() functions in their values at computed-value time, which occurs *before* the value is inherited." A property declared as `var(--x)` at the root is fixed at the root; a modifier set on a subtree changes `--x` there but not the property that referenced it.

*Measured in a browser ([results](https://codeberg.org/Toghen/postcss/src/branch/main/measurements/RESULTS.md), fixtures [c6](https://codeberg.org/Toghen/postcss/src/branch/main/measurements/c6.html) and [c7](https://codeberg.org/Toghen/postcss/src/branch/main/measurements/c7.html)):* under plain override blocks, one per context, the block of an inner modifier overwrote the value an outer modifier had set, and a fall-through chain gave the right value.

The rule that follows is for any emitter: a token whose chain reaches a modifier scoped to a subtree must be declared again inside that modifier's blocks, and the chain, through `dependsOn`, says which modifiers those are.

**Figma binds an alias at the consuming node.** *Measured, in a test file:* each variable collection takes its mode from the nearest frame that sets it, independently, and an alias chain across collections resolves at the consuming node, through `variable.resolveForConsumer(node)`.

So a chain maps without a rule of its own:

- one collection per modifier;
- each link a variable in its home modifier's collection, with a mode per context;
- a fall-through an alias to the next link;
- the base the last link's fall-through value.

The cells must be dense; a link is. A token with one link whose base is a reference needs no chain in Figma at all: the base is an ordinary alias, bound where it is used. Figma needs a chain only for two or more links.

**Whether a token needs a chain is the adapter's question.** The lib reports what a chain is made of, the links, the base and the modifiers the token depends on through its references, and never says which tokens an environment must chain: that differs between the two consumers above, because it is a fact about how each binds, not about the token. Each adapter writes its own test on what the lib reports.

**Out of scope here: how adapters spell it.** Selectors, at-rules, the order of declarations, the names of collections and variables, code syntax, and what an adapter does with a non-factorable token or a hole all belong to the adapters. They translate a resolved chain into their environment and never redefine what a chain is.

The adapters' own open items are:

- The Figma plugin's *Question: independent modifiers in Figma* in [`toghen-figma/specs.md`](https://codeberg.org/Toghen/figma/src/branch/main/specs.md) (undecided until a consumer brings a file that needs it, which this section is written for).
- The CSS adapter's `bind: 'chain'` option, built and checked in two browser engines, in [`toghen-postcss`](https://codeberg.org/Toghen/postcss/src/branch/main/reference.md#bind) (reasons in its [specs.md](https://codeberg.org/Toghen/postcss/src/branch/main/specs.md#chains)).

The sum build answers the Figma question: one collection per modifier.

### Not changed

`resolve()`, `resolveToDesignSystem()`, `resolveAllToDesignSystem()` and `resolveContextsToDesignSystem()` keep their behaviour. The early-bound flat world stays the fallback for everything a chain does not represent, and for any adapter that does not want chains. Nothing requires a design system to be authored in any particular way: any legal resolver document can be asked, and the answer is either a chain or a report.

The rulings on the errors of `valueAt`, the open names and the document-wide check are in [decisions.md](./decisions.md#from-querying-one-token-across-contexts). The check is built: `Collection.check()` lists the holes and the non-factorable tokens of every chain, with the tokens incomplete in some mode, in one call.

---

## Token values

**A token's value is checked however it enters.** Every path into a system (`DesignSystem.setToken()`, `Collection.setToken()`, a resolver document) ends in `Collection.setToken()`, and the check runs there.

**The W3C types are lib's, not the caller's.** `color`, `dimension`, `fontWeight`,
`border`, `shadow`, `typography` and `gradient` are checked whether or not a handler is registered
for them: their shape is a fact about the format, not a choice a system makes.
A registered handler adds methods, and may add its own `validate()`.

**Lib stores the computed value.** CSS Values separates three values: the *specified* value, what the author
wrote; the *computed* value, reduced as far as it can be without an element; and the *used* value, which needs the
box, the page or the font. Lib turns every specified value it holds into its computed value:
`calc(1rem + 2px)` is `{ value: 1.125, unit: 'rem' }`, `color-mix(in srgb, #112233 5%, transparent)` is the ink at
alpha 0.05, `bold` is `700`. What needs the element (`currentColor`, `var()`, `em` outside a letter spacing, a
percentage without a reference box, viewport, glyph and container units, `light-dark()`, system colours) is not
computed. Each such value is kept as written where its type allows it (`currentColor`), or refused with a sentence
that names the token, the member and the reason. Nothing falls back to the string. The adapter is what knows the
element, and it says what it cannot do. CSS has a runtime for the last step; Figma has none, which is why lib does
everything that needs no element.

The one assumption lib makes is that the root font size is 16px. It turned `rem` into `px` before, and it is what
lets `calc()` mix `rem` with `px`.

The value is computed at two gates:

- **On load**, by the type's handler, in `Collection.setToken()`: a literal is computed and stored.
- **On read**, in `DesignSystem.resolveValue()` and `resolveToken()`, and so in `Resolver.valueAt()`: a value
  written with a reference has no shape until it resolves, so once it resolves it goes through its type's handler
  before it is returned. `color-mix(in srgb, {ink} 5%, transparent)` is computable only once `{ink}` resolves. The
  type is found as `resolveToken()` finds it: the token's own, else the type of the token a whole reference names,
  else the nearest group's. A path into a member walks the computed value, so `elevation.raised.0.color` is a
  structured colour. A literal was computed on load and comes back as stored. `contextsOf()` is unchanged: its steps
  keep references as written.

Both are needed. A load gate alone cannot compute a value that holds a reference; a read gate alone would leave
stored literals in two shapes. A failure on read throws `InvalidTokenError`
`Token "ds.shadow.raised" (mode "light"): color: '…' cannot be computed: <reason>`, naming the token, the mode, the
member and the resolved string. The rulings are in [decisions.md](./decisions.md#ruled-lib-computes-every-specified-value-it-can-24-october-2026).

**Strings are accepted and converted.** A design system that writes
`'#rrggbb'` or `'24px'` is common, and the composite handlers already accepted
those forms for their members. So the strict shapes are the stored form, and
the string forms are accepted on the way in and converted on load. Adapters
read one shape. The members of a composite are stored computed too, plain forms
included: a shadow's `color: '#abc'` is a structured colour with `hex: '#aabbcc'`.
A hex or a named colour keeps its sRGB value in the W3C `hex` member. The accepted forms are listed in
[reference.md](./reference.md#token-values).

**Failures are errors.** An invalid value throws with the token's path, on load,
not later in an adapter.

**A font family string with commas is a list.** The format says a `fontFamily` string is one family and an array is several. Authors write the CSS habit anyway, `"'Plex Sans', system-ui, sans-serif"`. Taken as one name, it reaches CSS as a single quoted family the browser cannot find. No real font name holds a comma, so splitting cannot misread one.

The rule is one exported function, `fontFamilyNames(value): string[]`. A string is split at commas outside quotes; each part is trimmed, and one pair of matching surrounding quotes, single or double, removed. An array is returned as it is. A string with no comma outside quotes is a one-name list. An empty part (`"Inter,"`, `", serif"`) is an error naming the value.

It is applied in two places:

- **On load**, a `fontFamily` token's string with a comma outside quotes is converted to the array, as other string forms are (see above), and so is a typography member's. A string with none stays a string, the format's own single-family form.
- **On read**, by every adapter: the PostCSS plugin's font-family spelling and the Figma adapter's `toFigmaFontFamily` take the names from `fontFamilyNames()`. That covers what load cannot see: a family reached through an untyped token by reference.

A quoted part keeps a comma inside it (`"'Foo, Bar', serif"` is two names, `Foo, Bar` and `serif`), since the quotes say where the name ends.

**Two colour keywords are colours.** A component tier needs `transparent`, a border or background present but showing nothing, so a state can colour it without the box moving; and `currentColor`, an ink that follows the surrounding text. Refused, such tokens would stay untyped and lose their checks and their Figma type. Both are accepted as `color` values, matched without regard to case as CSS matches them.

- `transparent` is stored structured: `{ colorSpace: 'srgb', components: [0, 0, 0], alpha: 0, hex: '#00000000' }`. It is a colour with a value, so it is one, in a composite's member as well as in a `color` token.
- `currentColor` has no value until an element uses it, so it cannot be structured. It is stored as the string `'currentColor'`, the way a reference is stored as written, in a `color` token and in a shadow's, a gradient stop's or a border's colour. An adapter that reads a colour checks for it first. Inside a `color-mix()` it is refused, since the mix cannot be computed without it.
- The CSS-wide keywords (`inherit`, `initial`, `unset`, `revert`, `revert-layer`) are cascade instructions, not colours, and stay refused.

**Any CSS colour is a colour.** A colour string is read by one parser, on load and by `normalizeColorToSRGB01()`
alike, so the two never disagree:

- Every CSS Color 4 spelling: hex, named colours in any case, `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`,
  `oklch()`, `color(<space> …)`, with `none` components.
- `color-mix()`, as CSS Color 5 §3 defines it: every colour space lib knows (`xyz` is `xyz-d65`), the four hue
  methods (`shorter`, the default, `longer`, `increasing`, `decreasing`), the percentage rules (one omitted is the
  rest of 100, both omitted are 50/50, a sum other than 100 scales both, a sum below 100 also scales the alpha, a sum
  of 0 or a percentage outside 0–100 is refused), premultiplied alpha, and nesting. A component missing (`none`) in
  one colour takes the other's.
- The result is stored in its own space: `color-mix(in oklch, …)` is an `oklch` colour, `oklch(0.7 0.1 200)` stays
  `oklch`. `hex` is set for a hex or a named colour, which are sRGB hex in CSS, and for nothing else. A hue is
  brought into [0, 360), and a component that float noise put within 1e-9 of a bound is snapped onto it, so a
  computed colour never trips the range warning.
- Refused, each with its reason: `currentColor` inside a mix, `var()`, relative colour syntax (`hsl(from …)`),
  `light-dark()` (a scheme is a mode), system colours, the CSS-wide keywords, and `calc()` inside a channel.

Named colours were refused until 24 October 2026; the old rule is in
[decisions.md](./decisions.md#from-token-values-named-colours-stay-refused).

**A length is computed.** A `dimension`, a `letterSpacing`, a typography `fontSize`, `lineHeight` and
`letterSpacing`, a shadow's lengths, a border's `width` and a gradient's `angle` are read by one numeric grammar,
a plain `'16px'` and a `calc()` alike:

- Functions `calc()`, `min()`, `max()`, `clamp()` and `round([nearest|up|down|to-zero,] A, B)`; operators
  `+ - * /` and parentheses; numbers with a sign and an exponent (`+2px`, `1e1px`).
- One unit stays: `calc(1rem + 0.5rem)` is `1.5rem`. Absolute units mixed together reduce to `px` at 96 dpi.
  `rem` mixed with absolute units is stored in `rem`, each absolute length turned into `px` and divided by 16:
  `calc(1rem + 2px)` is `{ value: 1.125, unit: 'rem' }`. Figma gets 18px; CSS keeps the scaling the
  author chose `rem` for. `em` mixes only with `em`, in a letter spacing.
- An angle in `deg`, `grad`, `rad` or `turn` is stored in degrees.
- Results are rounded to 10 decimal places, so float noise is not stored.
- A bare `0` is `0px`, as CSS reads a length. Any other bare number is refused for a length.
- Refused, each with its reason: `%` outside a line height, viewport units, container units, `ch`, `ex`, `em`
  outside a letter spacing, `var()`, a function outside the five, a product of two lengths, a division by a length
  or by zero, a unit the place does not take.
- A space-separated list (`'8px 13px'`) is not one value. Typed, it is refused, and the reason says to leave the
  token untyped; untyped, it is stored as written and an adapter that writes CSS writes it as it is. The type that
  fits a padding shorthand is four tokens.

**A font weight keyword is its number.** W3C §8.4 names weights (`thin` 100 … `extra-black` 950). A `fontWeight`
token, and a typography's `fontWeight` member, store a number from 1 to 1000: a keyword in any case becomes its
number, and a numeric string or a `calc()` is computed. Before, a typography `bold` was refused and a token `bold`
reached Figma as `NaN`.

**A border is a type.** W3C §9.3: a `color`, a `width` and a `style`. The colour goes through the colour gate, the
width through the length gate, and the style is a W3C keyword or the object form, its `dashArray` computed. Without
the handler, the colour a shadow computes would not compute in a border.

**A letter spacing may be in `em`.** The format's dimension allows `px` and `rem`. Letter spacing is written in `em` in CSS because it should scale with the text's own size, and a conversion to `px` or `rem` is right for one size only. A typography token's `letterSpacing` member accepts `{ value, unit: 'em' }` and the string `'0.08em'`, converted to the structured form as other string forms are.

A dimension token stays `px` or `rem`: a spacing in `em` has no meaning in Figma without a font size, and a type that means one thing in one adapter and nothing in the other is worse than a narrow one. So a `letterSpacing` that references a dimension token cannot be `em`; that is the limit, stated. The limit left a system that keeps its tracking as a ramp of its own with no type to give the ramp (see the next paragraph).

**A letter spacing is a token type of its own.** A design system may keep its tracking as a ramp (`track.tight`, `track.wide`) that is nothing but letter spacings. Untyped, the ramp is stored as written, checked by nothing, skipped by Figma, and a component token that references it is a type conflict. Typed `dimension`, it cannot hold `em`; and it cannot become typography tokens, which need a family and a size. So the lib has a type, `letterSpacing`, for a token that is only ever a letter spacing.

- **The type is a Toghen extension, not a W3C one.** The format has no letter spacing type. Tokens Studio, a tool that reads the same format, has one of this name. Like the W3C types it is checked on load whether or not a handler is registered, since its shape is a fact about the type.
- **Its value** is a length: `{ value, unit }` with `unit` one of `px`, `rem` or `em`, or the string form (`'-0.021em'`), converted to the structured form as other strings are. `pt` and `mm` are refused: no one tracks text in them, and a smaller set is easier to state. A bare number is refused.
- **Where it is used.** A typography token's `letterSpacing` member may reference a `letterSpacing` token, as it may reference a `dimension` token. A `letterSpacing` token is not a dimension and does not pass as one: a place that wants a dimension meets a type conflict, which is the point of the type. The lib adds no walk over references to check where a letter spacing ends up.
- **The member keeps its rule.** The `em` in a typography `letterSpacing` member, written inline, stays as set out above. The member goes through the type's gate, so a member in `pt` or `mm` is refused too.
- **The handler** has `toString()` and `toPx(fontSize?)`; `em` is a fraction of the font size, which defaults to 16 as the dimension handler's base does.

An adapter writes the type as it writes the length it holds. CSS writes the value as authored, `em` included. Figma: see *Values Figma cannot hold as written* in [the Figma specs](https://codeberg.org/Toghen/figma/src/branch/main/specs.md).

**A typography token may carry any CSS property.** A text style can need a property that is part of its identity and has no place in `font`: `fontVariantNumeric: 'tabular-nums'` for counters and tables, `fontFeatureSettings`. A typography `$value` accepts any further member besides the format's own and `textTransform` and `textDecoration`, keyed by a CSS property name in camelCase, with a string or number value. The lib does not check that the key is a property: it has no property list, and its only dependency stays `culori`. The adapters that write CSS check it.

The members stay in `$value`, not `$extensions`. `textTransform` and `textDecoration` already sit there, and two homes for one idea would split it. A tool that reads only the format's members ignores the rest, which is what the format asks of unknown members.

**A token may be defined in one context only.** A component token that applies only while an element is pressed must not be declared at rest, where another rule's value stands. The resolver format already says this: the token is in the `pressed` context's source and in no base set. The lib accepts such a token. In the modes where no set defines it, it is absent: `getToken` and `resolveToken` find nothing there, and the default mode does not hold it. This is not a hole (see *Sparse cells and holes*): no link was meant to reach it.

**What is checked when it resolves.** A value holding a reference has no shape until it
resolves, so it is stored as written and computed by the read gate when it is read, in each
mode on its own. A token whose type comes from a group `$type` set *after* the token is
checked as untyped on load. A type lib does not own (`number`, `duration`, `cubicBezier`,
`strokeStyle` as a token, `transition`, or a system's own) is stored as written.

## Type Handlers

The core checks and stores each W3C type through a handler of its own; the handlers are not exported. A handler's
`normalize(value, path)` returns the value in the type's structured shape, and is what [Token values](#token-values)
runs.

- **Colour**: a colour string is computed by the colour reader (`src/utils/css-color.ts`) and stored in its own space, with its `hex` when it was a hex or a named colour; a structured colour is checked against the colour-space registry, which lists each W3C space's components and ranges declaratively, and accepts `'none'` for a component.
- **Dimension**: a string (`'16px'`, `'calc(1rem + 2px)'`) is computed by the numeric grammar (`src/utils/css-math.ts`) into `{ value, unit }`; a structured dimension is checked.
- **Letter spacing**: the same, with units `px`, `rem` and `em`: `'-0.021em'` becomes `{ value: -0.021, unit: 'em' }`.
- **Font weight**: a W3C keyword becomes its number; a number or a numeric string is checked from 1 to 1000.
- **Typography, shadow, gradient, border**: every member goes through its family's gate and is stored computed. An error names the member (`color`, `0.blur`, `stops.1.color`).

The colour reader and the numeric grammar are the two families. Each has one parser, and both gates call it, so a
string the load gate accepts is one the read gate and the normalized forms accept.

### `normalizeColorToSRGB01()` Utility

Converts any colour lib accepts to an sRGB 0–1 tuple, clamped into the gamut:

```typescript
function normalizeColorToSRGB01(
  value: string | ColorValue
): { r: number; g: number; b: number; a: number }
```

A string goes through the same colour reader as the load gate, so it accepts every string the gate accepts, and a
string the gate refuses throws the gate's sentence (`'currentColor' cannot be computed: …`). A structured colour
goes through the one bridge to culori, which reads `srgb-linear` as linear light and an `hsl`/`hwb` colour's
percentages as percentages.

Used by the shadow and gradient handlers, the Figma adapter's `figmaTokenAdapter`, and any consumer needing normalized color output.

---

## Composite Value Interfaces

`TypographyValue`, `ShadowValue`, `GradientValue`, `BorderValue`, `StrokeStyleValue`, `DimensionValue` and
`ColorValue`, exported from `src/types/composite-values.ts`. They describe the stored shape: every member computed. The field-by-field
shapes are in [reference.md](./reference.md#composite-value-interfaces) and are
**not** repeated here. They were, verbatim, and a duplicated type definition is
one that eventually disagrees with itself.

What belongs here is why they exist at all: a composite token's `$value` is an
object, and something has to say which keys are meaningful. These interfaces are
that contract, and the handlers in `src/handlers/` are what read it. A `shadow`
`$value` may be a single `ShadowValue` or an array of them, which is the one
place the shape is not the interface alone.

"Composite" covers two kinds of thing, and each has one name:

| Kind | What it is | Types |
|---|---|---|
| **list** | one property, several entries | `shadow`, `gradient` |
| **block** | several properties at once | `typography` |

The core treats both alike: each is a value, and a lookup path can walk into
either. The names matter to adapters, which write them differently. A list
becomes one target value (one CSS declaration value, one Figma effect or paint
style). A block becomes several target properties (a CSS declaration block, a
Figma text style), so an adapter that writes single values writes a block
member by member.

---

## Error Classes

Every error is a named export with an `instanceof` check. The table of classes, what throws each and what each carries is in the [reference](./reference.md#error-classes); this file does not repeat it. The design rule behind them is in *Failures are errors, not warnings* above: a wrong path, a dangling reference and an undeclared mode each throw rather than pass text through, and the class says which of the three it was.

---

## Integration Contracts

### With `@toghen/postcss`

- `@toghen/postcss` consumes a resolved `DesignSystem`.
- For multi-context workflows: `Resolver` → `resolveContextsToDesignSystem()` → PostCSS plugin. What the plugin needs of the resolver it reads from the collection (`collection.resolver`), not from an option of its own.

### With `@toghen/figma`

The plugin depends on:

- `Resolver` construction, `load()` for a document whose sources name files, and `getModifiers()`
- The per-modifier queries, `contextsOf()`, `dependsOn()` and `valueAt()`, from which it builds one variable collection per modifier
- `DesignSystem` / `DesignToken` access, `referencePath()`, and the reference grammar
- Primitive and composite value handling, `normalizeColorToSRGB01()`
- The component model: `partsOf()`, `axesOf()`, `childrenOf()` and `applies()`, for a component's folds and a component file's groups. The plugin does not call `getContextSelector()`: it reads a context's CSS spelling, and an element state is a part, not a modifier.
- `cssPropertyName()`, `cssLinkName()` and `cssIdentifier()`, for a variable's code syntax and a key's spelling

### One CSS name for two adapters

`cssPropertyName()` is CSS knowledge in a package that is otherwise
environment-free, and it is here for the same reason as the normalization
helpers: two adapters need the same answer and cannot import from each other.
The CSS adapter declares and references the property; the Figma adapter writes
the name as a variable's code syntax. Two copies of a naming rule drift, and the whitespace case
shows how quietly.

**Each segment is spelled by the CSSOM rule.** `ds.button.backgroundColor` is `--button-background-color`: inside a
segment, each capital becomes a hyphen and its lowercase, the rule CSS uses
between `element.style.backgroundColor` and `background-color`. Two departures,
both at the edges:

- *A capital that starts a segment is lowercased with no hyphen.* `ds.Colors.Primary`
  is `--colors-primary`. The CSSOM rule would give `---colors--primary`, which
  is what it does for a vendor prefix (`WebkitLineClamp`); a token path that
  starts a segment with a capital is common in documents exported from design
  tools, and a vendor property is spelled with its own leading hyphen instead
  (`-webkitLineClamp` → `-webkit-line-clamp`).
- *Acronyms come out letter by letter.* `textURL` is `text-u-r-l`. Ugly, and
  predictable: no exceptions to remember.

The segment rule is exported on its own, `cssIdentifier(name)`, and
`cssPropertyName` is built on it. `@toghen/postcss` spells a group's keys and a
typography block's members as properties with it, so a property and the custom
property holding its value are spelled the same way.

**A link's name keeps the modifier as written** (*ruled 21 October 2026*). `cssLinkName(head, modifier)` is the
head's property, two hyphens, and the modifier unchanged but for what an identifier cannot hold:
`--surface-raised--colorScheme`. A hyphenated modifier (`--color-scheme`) would not read back to `colorScheme`. Both
adapters call it, so the CSS adapter's link and the Figma code syntax agree; before, they wrote
`--surface-raised--colorScheme` and `--surface-raised--color-scheme`.
Paths already in lowercase and hyphens, the common case, keep their names.
Whitespace still becomes `-`.

**Open: a configurable rule.** `@toghen/postcss` takes a `propertyName`
function, and a function cannot reach the Figma plugin, which reads documents.
A consumer who customises it gets CSS and code syntax that disagree. When a
design system needs names that differ from its token paths, the rule becomes
document data both adapters read, applied by one function here. Until then the
default is the only rule, and `propertyName` is an escape hatch that gives the
agreement up.

### With `toghen-ui`

The plugin's design system is loaded with `load` and resolved with `resolveContextsToDesignSystem()` when the plugin is built, and then run through `@toghen/postcss`.

---

## Key Directories

```
src/
├── core/           # DesignToken, Collection, DesignSystem
├── handlers/       # Type implementations (color, dimension, typography, shadow, gradient)
├── resolver/       # W3C Resolver types, errors, implementation
├── types/          # Exported value-shape contracts (composite values)
└── utils/          # Shared normalization helpers (dimensions, color normalization)
```

---

## Build & Testing

- **Module format:** ESM (`"type": "module"`)
- **Bundler:** tsup
- **Test runner:** tsx + Node test runner
- **Commands:**
  - `pnpm --filter @toghen/lib build`
  - `pnpm --filter @toghen/lib test`

---

## Roadmap

Completed items are in [decisions.md](./decisions.md#completed).

### Known limitations

- **`$root` is unrepresentable.** W3C §6.2 reserves `$root` as a group's own
  token, but `Collection.setToken()` rejects any `$`-prefixed segment, so
  `{color.brand.$root}` has no target. Toghen does not claim §6.2 conformance.
- **The root font size is 16px.** A `rem` mixed with an absolute unit is stored in `rem` at that size, so
  `calc(1rem + 2px)` at a root of 20 is 22.5px where a browser draws 22.
- **Colours not computed.** Relative colour syntax (`hsl(from …)`), `calc()` inside a channel, a `color-mix()`
  without `in <space>`, and a mix of more than two colours are refused.
- **Authored components are not clamped.** `rgb(300 0 0)` is stored with a red of 1.18, outside sRGB's range, and
  a reference to it warns when it is read, as a structured colour out of its range does.
- **Families not computed.** `number`, `duration`, `cubicBezier`, `strokeStyle` as a token and `transition` have no
  handler and are stored as written. No unit beyond the types' own is read: `in`, `cm`, `Q`, `pc` are refused.

### Future
- [ ] Dangling references in the document-wide check, which lists holes, non-factorable tokens and incomplete tokens today
- [ ] JSON Pointer `$ref` references (§7.1.2) and `$extends` (§6.4)
- [ ] Schema versioning / migration utilities