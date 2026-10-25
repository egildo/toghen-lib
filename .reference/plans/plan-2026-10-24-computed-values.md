# Plan: lib computes every value it can (24 October 2026)

**Part 1 of the round of 24 October 2026.** Part 2, the nine open issues, is in [toghen-figma/plan-2026-10-24-issues.md](https://codeberg.org/Toghen/figma/src/branch/main/.reference/plans/plan-2026-10-24-issues.md). Questions are numbered across both files: 1 to 5 here, 6 onwards there.

**Provenance.** A consumer of `toghen-figma` 6.4.1 reported a shadow whose colour is `color-mix(in srgb, {shadow.ink} 5%, transparent)` that never became an effect style (issue #123). Egildo ruled the principle the same day: CSS Values separates the *specified* value (what the author wrote), the *computed* value (reduced as far as possible without the element) and the *used* value (needs the box, the page, the font). Lib turns every specified value it holds into its computed value. What needs the element stays out, and the adapter says so. CSS has a runtime for the last step; Figma has none, and that gap has produced issue after issue. Already settled by Egildo: named colours are accepted; the principle; both parts in one round.

Every finding below was checked against `main` at lib 5.1.0, postcss (workspace), figma 6.4.1, culori 4.0.2.

## Rulings (24 October 2026)

Egildo answered every question of both plans and vetoed none of the 24 settlements (13 here, 11 in the issues plan); they all stand.

- **1a.** The arithmetic and `color-mix()` are written in lib, on culori; culori stays the only production dependency.
- **2b.** A mix of `rem` and absolute units is stored in `rem` (each `px` divided by 16).
- **3a.** Every composite member is stored computed, plain forms included.
- **4b.** postcss writes hex when a colour has a `hex` or lies in sRGB, otherwise the colour's own CSS function.
- **5a.** A space-separated list of dimensions stays a skip; a typed one is refused, and the reason says to leave the token untyped.
- Questions 6 to 11 are ruled in the [issues plan](https://codeberg.org/Toghen/figma/src/branch/main/.reference/plans/plan-2026-10-24-issues.md#rulings-24-october-2026): 6b, 7a, 8a, 9a, 10b, 11b.

## 1. Findings

### 1.1 Two colour gates, both hex-only

- **Load.** `colorHandler.normalize` (`src/handlers/color-handler.ts:62`) accepts a string only if it is `currentColor`, `transparent` (matched without case) or starts with `#` (`:69`: `value.startsWith('#') ? parse(value) : undefined`). Anything else throws *a colour string must be hex…*.
- **Read.** `normalizeColorToSRGB01` (`src/utils/normalize-color.ts:63`) throws `String color values must be CSS hex strings.` for any string not starting with `#` (`:67`). It does not even accept `transparent`, so a shadow's own colour member cannot be `transparent` (reference.md says so in the *Token values* table).
- Every reader goes through the read gate: `shadow-handler.ts:11` and `:31`, `normalize-gradient.ts:95` and `:132`, `toghen-figma/main/utils/figmaTokenAdapter.ts:81` (variables), `figmaStyleAdapter.ts:220` (`toEffectStyleProps`), `toghen-figma/main/handlers/tokenGraph.ts:111` (`hexOf`), `toghen-postcss/src/index.ts:250` (`colorToHex`).

### 1.2 culori parses all of CSS Color 4, and not `color-mix()`

Measured with culori 4.0.2 in this workspace:

- `parse()` reads named colours (any case), `transparent`, `rgb()`/`rgba()` in both syntaxes, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()` with `srgb`, `srgb-linear`, `display-p3`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz`, `xyz-d50`, `xyz-d65`; `none` components; hue in `deg` and `turn`.
- It returns `undefined` for `currentColor`, `inherit`, `color-mix(…)`, relative colour syntax (`hsl(from #abc h s l)`), and `calc()` inside a channel (`rgb(calc(10 + 5) 0 0)`).
- `formatCss()` spells any colour back in CSS Color 4 syntax: `oklch(0.7 0.1 200)`, `color(display-p3 1 0 0)`, `color(srgb 0.4 0.2 0.6)`, `hsl(120 50% 50%)`.

### 1.3 The premultiplication trap, measured

Mixing `#112233` at 5% with `transparent`, in `srgb`:

- `culori.interpolate([ink, transparent], 'rgb')(0.95)` gives `#0102030d`: near-black at alpha 0.05. Wrong.
- `culori.interpolateWithPremultipliedAlpha([ink, transparent], 'rgb')(0.95)` gives `#1122330d`: the ink at alpha 0.05. This is what CSS Color 5 §3 specifies and what a browser draws.
- Hue: `interpolateWithPremultipliedAlpha(colors, 'oklch', { h: { fixup: fixupHueLonger } })` works. culori exports `fixupHueShorter`, `fixupHueLonger`, `fixupHueIncreasing`, `fixupHueDecreasing`. The default is shorter, as in CSS. The result's hue may be negative (`-33.36`), so it must be brought into `[0, 360)` before it is stored, or the handler's range check warns on every read (`color-handler.ts:99-101`, `console.warn`).

### 1.4 A colour interpolated into a string: two defects

`toInterpolable` (`src/core/alias.ts:394`) writes a colour back into a string only when it carries `hex` (`:408`), appending an alpha byte when `alpha < 1`.

- **A structured colour without `hex` cannot be interpolated at all.** `'x {ink}'` with `ink` an `oklch` colour throws `InvalidInterpolationError` (measured). So a `color-mix(…)` over a structured colour cannot even be written.
- **`transparent` interpolates as `#0000000000`** (measured: `color-mix(in srgb, {t} 50%, {half})` resolves to `color-mix(in srgb, #0000000000 50%, #11223380)`). `transparent` is stored with `hex: '#00000000'`, eight digits, and the alpha byte is appended again. The postcss plugin passes the string through verbatim (`index.ts:93`), so this reaches a stylesheet as invalid CSS today.

### 1.5 Nothing computes after resolution

- **Load.** `normalizeTokenValue` (`src/handlers/built-in.ts:37`) runs on every token from `Collection.setToken()` (`src/core/collection.ts:425`) and on every chain step (`src/resolver/chains.ts:208`). It returns any value that holds a reference as written (`built-in.ts:46`). That is right: the value has no shape until it resolves.
- **Read.** `DesignSystem.resolveValue()` (`src/core/design-system.ts:189`) and `resolveToken()` (`:317`) return `resolveTokenValue()`'s result (`:199`, `:342`) unchanged. `Resolver.valueAt()` (`src/resolver/resolver.ts:609`) ends in `resolveValue()`. So a colour written `color-mix(in srgb, {ink} 5%, transparent)`, or a shadow whose colour member is, comes back as the interpolated *string*, never in the stored shape (measured). Reference.md says the opposite of what a reader expects: *"A value holding a reference … is stored as written and checked by nothing"* (`reference.md:1608`), and nothing anywhere checks it later.
- This is issue #123's cause: `toEffectStyleProps` receives `"color-mix(in srgb, #… 5%, transparent)"` and the read gate refuses it.

### 1.6 Lengths: one regex per handler, no arithmetic

- `dimensionHandler.normalize` (`src/handlers/dimension-handler.ts:37`): `^(-?\d*\.?\d+)(px|rem|pt|mm)$`. A unit is required.
- `normalizeDimensionToPx` (`src/utils/dimensions.ts:34`): the same number grammar, but the unit is optional and defaults to `px`. The two disagree on `'16'`.
- `letterSpacingHandler.normalize` (`src/handlers/letter-spacing-handler.ts:22`): `px|rem|em`, any case.
- The `rem` base is fixed at 16 (`dimensions.ts:11`, `dimension-handler.ts:75`, `letter-spacing-handler.ts:61`). So lib already assumes a root font size; `calc()` over `rem` and absolute units is computable under the same assumption.
- No number grammar accepts an exponent (`1e3px`) or a leading `+`, which CSS accepts.
- `calc(1rem + 2px)` typed `dimension` is refused at load (measured).

### 1.7 Angles, numbers, percentages

- `parseAngleToDegrees` (`src/utils/normalize-gradient.ts:25`) takes a number or `<n>deg`. `0.25turn`, `rad`, `grad` are refused (measured: `Invalid angle '0.25turn'`).
- `lineHeight` (`dimensions.ts:71`) takes a number, a percentage or a length; a percentage is kept as `{ unit: 'percent' }`, which an adapter multiplies by the font size.
- Lib has no handler for `number`, `duration`, `fontWeight`, `cubicBezier`, `strokeStyle`, `border` or `transition` (`built-in.ts:16-23`). Their values are stored as written.

### 1.8 Composites check their members and store them as written

- `shadowHandler` has no `normalize` (`shadow-handler.ts:56`); its `validate` checks members through the read gates (`:31`, `:41-46`). So a shadow's `color: '#abc'` is stored as `'#abc'`, and `color: 'red'` is refused (measured).
- `typographyHandler.normalize` (`typography-handler.ts:103`) converts only an `em` letter spacing; `fontWeight` must be a number (`:65`), so the W3C keywords (`bold`) are refused (measured). A `fontWeight` *token* `'bold'` is accepted, since no handler checks it, and reaches Figma as `Number('bold')` (`figmaTokenAdapter.ts:128-133`), a skip.
- `gradientHandler` has no `normalize` (`gradient-handler.ts:19`).
- reference.md states it: members *"are checked but stored as written"* (`reference.md:1605`); specs.md too (*What is not checked*, `specs.md:757`).

### 1.9 Two bugs in the colour bridge, found on the way

- `color-spaces.ts:20` maps `srgb-linear` to culori's `rgb`, not `lrgb`. A linear colour is read as gamma-encoded: `{ colorSpace: 'srgb-linear', components: [0.5, 0.5, 0.5] }` comes out of `normalizeColorToSRGB01` as 0.5 grey instead of about 0.735.
- `color-handler.ts:17` (`toCuloriColor`) passes an `hsl`/`hwb` colour's saturation and lightness as written (0–100) to culori, which wants 0–1. `normalize-color.ts:38-43` divides by 100. Two bridges, and they disagree. The handler's helpers (`toHex`, `toRgb`, `getLuminance`, …) are used only by tests, but they are wrong for every `hsl` colour.

### 1.10 The standing ruling to overturn

`specs.md:731`: *"Named colours (`red`, `navy`) stay refused: they are a palette's job."* `reference.md:1600` repeats it. Egildo settled today that named colours are in: the rule was discipline, not capability, and discipline is the design system's.

### 1.11 What the adapters do with a string today

- **postcss** passes a string through verbatim (`toghen-postcss/src/index.ts:93`), so a colour that lib leaves as an interpolated `color-mix(…)` string reaches CSS as that string. That works in a browser, except for the `transparent` bug (1.4). A structured colour is always spelled as sRGB hex (`colorToHex`, `:249`), clamped, whatever its space.
- **postcss `references: 'var'`** rewrites an interpolated reference in the *authored* string (`overlay`, `index.ts:746-768`): `color-mix(in srgb, var(--shadow-ink) 5%, transparent)`. It replaces the member at its address in the resolved value, so it keeps working whatever shape the resolved value has.
- **figma** reads values through `resolver.valueAt()` (`toghen-figma/main/utils/sum.ts:449`), and `cellFor` swallows the error: `resolved()` returns `undefined` on any throw (`sum.ts:448-453`), and the cell then throws *The value … cannot be resolved in …* (`:460`), with the core's reason lost.

## 2. The design

### 2.1 The principle, as lib states it

A value lib holds is stored and returned as its **computed value**: everything that can be worked out without an element is worked out. What needs an element (`currentColor`, `var()`, `em` outside a letter spacing, `%` without a reference box, viewport units, `ch`, `light-dark()`, system colours) is not computed. Each such value is either kept as written, where the type already allows it (`currentColor`), or refused with a sentence naming the token, the context and the reason.

The one assumption lib already makes stays the only one: the root font size is 16px. It turns `rem` into `px` today, and the same assumption lets `calc()` mix them.

### 2.2 One parser per family, in `src/utils`

Two new files. Each family has one parser, and both gates call it.

**`src/utils/css-color.ts`**

- `parseCssColor(text: string): Color`. Returns a culori colour or throws a sentence:
  - culori's `parse()` for everything CSS Color 4 spells;
  - `color-mix()` read by a small recursive-descent reader (find the top-level commas, read `in <space> [<hue-method> hue]`, then two `<color> <percentage>?` arguments, each operand read by `parseCssColor` itself, so a mix may nest);
  - its own refusals, each with a reason: `currentColor` (*has no value until an element uses it*), `var(` (*a custom property has no value outside the page*), `from ` inside a colour function (*relative colour syntax is not computed*), `light-dark(` (*depends on the element's colour scheme; express it as a mode*), CSS-wide keywords and system colours.
- `mixColors(space, hueMethod, a, pa, b, pb): Color`. CSS Color 5 §3: percentage normalization (one omitted is the rest of 100; both omitted are 50/50; a sum other than 100 scales both, and a sum below 100 multiplies the result's alpha by `sum / 100`; a sum of 0 or a percentage outside 0–100 is refused), `interpolateWithPremultipliedAlpha` in the named space, the hue fixup for `shorter` (default), `longer`, `increasing`, `decreasing`. `xyz` is `xyz-d65`.
- `toColorValue(color: Color): ColorValue`. The W3C structured shape, in the colour's own space: `hsl`/`hwb` back to 0–100, hue into `[0, 360)`, `undefined` channels as `'none'`, alpha omitted at 1.
- `toCuloriColor(value: ColorValue): Color`. The one bridge from the structured shape to culori, replacing both of today's (`color-handler.ts:17`, `normalize-color.ts:10`). Fixes 1.9: `srgb-linear` becomes culori's `lrgb` in `color-spaces.ts`.
- `spellCssColor(value: ColorValue): string`. A colour inside a string: its `hex` when it carries one, with the alpha byte only for a six-digit hex (fixes `transparent`); otherwise `formatCss()` in its own space. Contract: `parseCssColor(spellCssColor(c))` gives `c` back, within float tolerance. A test holds it.

**`src/utils/css-math.ts`**

- `computeCssNumeric(text: string, kind: NumericKind): { value: number; unit: string } | number`. A tokenizer (numbers with sign and exponent, units, `%`, `+ - * /`, parentheses, commas, function names) and an evaluator. `NumericKind` says which units the place accepts:
  - `length`: `px rem pt mm`;
  - `letterSpacing`: `px rem em`;
  - `angle`: `deg grad rad turn`, returned in `deg`;
  - `number`: no unit;
  - `lineHeight`: a number, a `%`, or a length (as today).
- Functions: `calc()`, `min()`, `max()`, `clamp()`, `round([nearest|up|down|to-zero,] A, B)`. Operators `+ - * /`, nesting, parentheses. Nothing else.
- Units: the same unit stays (`calc(1rem + 0.5rem)` is `1.5rem`). Absolute units reduce to `px` (`calc(1pt + 1px)`). `rem` mixed with an absolute unit follows **question 2**. `em` mixed with anything but `em` is refused (*an em is a fraction of the font size, which only the element has*). A product of two lengths, a division by a length, a division by zero, a unit the place does not take: refused, each with a sentence.
- A plain `'16px'` goes through the same function, so there is one grammar per family, and the handler regexes go.

### 2.3 The two gates

**Gate 1, load: `handler.normalize`.** Unchanged in place (`built-in.ts:37`), widened in what it accepts:

- `colorHandler.normalize`: `currentColor` stays the string `'currentColor'`; every other string goes through `parseCssColor` then `toColorValue`. `#…` keeps its `hex` as today; a named colour also gets `hex` (a named colour *is* an sRGB hex in CSS); any other computed colour carries none.
- `dimensionHandler.normalize`, `letterSpacingHandler.normalize`: through `computeCssNumeric`.
- Composites (`shadow`, `typography`, `gradient`, and the new `border`) get a `normalize` that sends each member through its family's parser and stores the computed member. **Question 3** decides whether a member already in a plain form (`'#abc'`, `'16px'`) is also converted.
- `fontWeight`: a `normalize` that turns the W3C keywords (`thin` 100 … `extra-black` 950, W3C §8.4) into numbers, for the `fontWeight` type and the typography member.
- `border` (new): `color` through the colour gate, `width` through the length gate, `style` a W3C keyword or the object form, checked and kept.

**Gate 2, read: after resolution.** In `DesignSystem.resolveValue()` and `resolveToken()`, when the token's raw value holds a reference, the resolved value goes through the type's handler before it is returned. For `resolveValue()` the member walk (`memberOf`, `design-system.ts:200`) runs on the computed value, so `ds.elevation.raised.0.color` is a structured colour. `valueAt()` gets it for free.

- It needs `computeTokenValue(type, value, path)`: `normalizeTokenValue` without the reference test at `built-in.ts:46`. A resolved value holds no reference by definition (rule 4 of `alias.ts:37`: never re-scan), and a literal brace left in one must not bypass the gate. `normalizeTokenValue` becomes `holdsReference(value) ? value : computeTokenValue(...)`.
- The type is found as `resolveToken()` finds it (`design-system.ts:332-336`): own, else through the alias, else the group. That code moves into one private method both call.
- A structured value already in the stored shape passes through unchanged, so a whole reference to a stored colour costs a check and changes nothing.
- `contextsOf()` stays as it is: its steps keep references as written (`reference.md:995`, decision of 21 October). The contract that changes is only *"what `resolveValue()` returns"*, and it changes towards what reference.md already implies (*"in the shape lib stores, as a stored token and `resolveValue()` give a literal"*).

**Why both.** `color-mix(in srgb, {ink} 5%, transparent)` is computable only once `{ink}` resolves, so a load gate alone cannot do it. A read gate alone would leave stored literals in two shapes, which is the defect the 21 October ruling closed for chains.

### 2.4 Interpolation spelling: any colour spells, any spelling parses

`toInterpolable` (`alias.ts:394`) calls `spellCssColor` for any structured colour (a value with `colorSpace` and `components`). A dimension keeps `${value}${unit}`. The loop closes: a colour of any space interpolates into a `color-mix(…)` or `calc(…)` string as CSS lib's own parser reads back.

### 2.5 Error contract

- **Load:** `InvalidTokenError` *Token "ds.shadow.raised": color: color-mix() takes two colours, got 1.* Path, member, reason, the value as written. The load stops, as for any invalid value today (*Failures are errors*, specs.md *Token values*).
- **Read:** `InvalidTokenError` *Token "ds.shadow.raised" (mode "light"): color: 'color-mix(in srgb, currentColor 5%, transparent)' cannot be computed: currentColor has no value until an element uses it.* Path, mode, member, the resolved string, the reason.
- **Adapters** already catch per token: postcss through `onUnresolved` (the directive stays, specs *Error modes*); the style sync keeps the message in its skip (`styleSyncEngine.ts:333-342`). The figma sum swallows it (`sum.ts:448-453`); unit **F1** passes the reason through. Skips are printed by reason in Part 2 (issue #128).
- No silent path: a computed value that fails throws; nothing falls back to the string.

## 3. Family by family

| Family | Where lib holds it | Decision | Reason |
|---|---|---|---|
| `<color>` CSS Color 4 | `color`, shadow/gradient/border colour | **In** | culori parses it all (1.2) |
| Named colours | same | **In** | Ruled by Egildo today; ruling of specs.md:731 superseded |
| `transparent` as a member colour | shadow, gradient stop, border | **In** | It is a colour; the member refusal was an accident of the hex-only read gate |
| `color-mix()` | same | **In**, all spaces, all four hue methods | CSS Color 5 §3; culori has the pieces (1.3) |
| Relative colour syntax over a literal | — | **Out** | Nobody asked; needs `calc()` inside channels; culori does not parse it |
| `calc()` inside a colour channel | — | **Out** | Same |
| `currentColor` | `color` | **Kept as written**, as today | Needs the element |
| `currentColor` inside `color-mix()` | — | **Refused**, with reason | Needs the element |
| `light-dark()`, system colours, `var()` | — | **Refused**, with reason | Need the element or the page; a scheme is a mode |
| `<length>`: `calc() min() max() clamp() round()` over `px rem pt mm` | `dimension`, shadow, typography `fontSize`, border `width` | **In** | Same root-size assumption lib already makes |
| Mixed `rem` + absolute | same | **In**, unit by **question 2** | — |
| `em`, `%`, `vw vh vmin vmax`, `ch`, `ex`, container units | `dimension` | **Refused**, with reason | Need the element or the viewport |
| `em` in a letter spacing, `calc()` over `em` alone | `letterSpacing`, typography member | **In** (`calc(0.1em - 0.02em)`) | Same unit stays `em`, as today |
| New absolute units (`in cm Q pc`) | — | **Out** | Nobody asked; the type's unit list is unchanged |
| Space-separated lists (`8px 13px`) | untyped tokens | **Question 5** | — |
| `<angle>`: `deg grad rad turn`, `calc()` | gradient `angle` | **In**, stored in `deg` | Absolute conversions |
| `<number>`: `calc()` | typography `lineHeight`, `fontWeight` member | **In** | Lib has a numeric form there |
| `<number>` as a token type | `number` | **Deferred** | No handler, stored as written; nobody asked |
| `<percentage>` | `lineHeight` | **Kept** as `{ unit: 'percent' }`, as today | The reference box is the font size, which the adapter has |
| `<time>` | `duration`, transition members | **Deferred** | No lib form today; stored as written; nobody asked |
| `fontWeight` keywords | `fontWeight`, typography member | **In** | W3C §8.4 defines them; today a typography `bold` is refused and a token `bold` reaches Figma as `NaN` |
| `fontFamily` | `fontFamily`, typography member | **Unchanged** | Already one function, `fontFamilyNames`, on both gates (specs.md *A font family string with commas is a list*) |
| `cubicBezier`, `strokeStyle`, `transition` | — | **Deferred** | Keywords and number lists, no arithmetic; stored as written; postcss spells them |
| `border` | new handler | **In** | Its colour and width are families lib computes; without it the same colour computes in a shadow and not in a border |
| `shadow`, `typography`, `gradient` | handlers | **In**: members through the family gates | One shape (question 3) |

## 4. Dependencies

Measured with `npm view` today:

| Package | Unpacked | Brings |
|---|---|---|
| `@csstools/css-calc` 3.4.3 | 46.7 KB | peers `@csstools/css-tokenizer` 4.0.2 (41.2 KB) and `@csstools/css-parser-algorithms` 4.0.2 (35.9 KB): three packages, 124 KB |
| `@csstools/css-color-parser` 4.2.6 | 65.1 KB | `css-calc`, `@csstools/color-helpers` 6.1.2 (59.3 KB) and the two peers: five packages, 248 KB |
| culori 4.0.2 (today's only one) | 1.5 MB on disk | — |

The evaluator lib needs is small: five functions, four operators, one unit table per kind. My estimate is under 200 lines with its tokenizer. `color-mix()` on top of culori is under 100. Recommendation: write both in lib and keep culori the only dependency (**question 1**).

## 5. Units for implementers

Files are listed so no two units in the same wave share one. Tests go beside the code (`test/unit/utils/`, `test/unit/handlers/`, `test/unit/core/`).

### Wave 1 (parallel)

**L1. The colour family.** New `src/utils/css-color.ts` (2.2). Rewrite `src/utils/normalize-color.ts` to call it (accepts any colour string the gate accepts; same signature, same `{r,g,b,a}` result, clamped). `src/handlers/color-handler.ts`: `normalize` through `parseCssColor`; `toCuloriColor` replaced by the shared bridge. `src/handlers/color-spaces.ts`: `srgb-linear` → `lrgb`. L1 exports nothing new from `src/index.ts` (L3 owns it): the adapters keep calling `normalizeColorToSRGB01`.
Tests: new `test/unit/utils/css-color.test.ts`; `normalize-color.test.ts`; `color-handler.test.ts`.

**L2. The numeric family.** New `src/utils/css-math.ts`. `src/utils/dimensions.ts` (`normalizeDimensionToPx` and `normalizeLineHeight` through it; the unitless string keeps its documented meaning). `src/handlers/dimension-handler.ts`, `src/handlers/letter-spacing-handler.ts`. `src/utils/normalize-gradient.ts` (`parseAngleToDegrees` through `computeCssNumeric(…, 'angle')`).
Tests: new `test/unit/utils/css-math.test.ts`; `dimensions.test.ts`, `dimension-handler.test.ts`, `letter-spacing-handler.test.ts`, `gradient-handler.test.ts`.

**L5. The literal brace (issue #129, lib side).** `src/core/alias-syntax.ts`, `src/core/alias.ts` (`walk` and `interpolate` only), `src/resolver/chains.ts` (`reach`, if it scans on its own). Design and question 6 are in the issues plan. L3 edits `alias.ts` after L5 has merged.

### Wave 2

**L3. Composites, keywords, the read gate, interpolation.** `src/handlers/built-in.ts` (`computeTokenValue`; register `fontWeight` and `border`), `src/handlers/shadow-handler.ts`, `src/handlers/typography-handler.ts`, `src/handlers/gradient-handler.ts`, new `src/handlers/font-weight-handler.ts`, new `src/handlers/border-handler.ts`, `src/types/composite-values.ts` (`BorderValue`; the member types narrow if question 3 is (a)), `src/core/design-system.ts` (the read gate, the shared type lookup), `src/core/alias.ts` (`toInterpolable` through `spellCssColor`), `src/index.ts` (export `BorderValue`).
Tests: `shadow-handler.test.ts`, `typography-handler.test.ts`, `normalize-token-value.test.ts`, new `font-weight-handler.test.ts`, `border-handler.test.ts`; `test/unit/core/alias.test.ts`, `design-system.test.ts`; `test/integration/token-values.test.ts`, `composite-handlers.test.ts`.

**D-lib. The lib docs.** `reference.md`, `specs.md`, `decisions.md`, `guide.md` (section 8). It writes from this plan and L1/L2/L5's merged code, and checks L3's text against L3's branch before the wave closes.

### Wave 3 (after lib's API lands; adapters)

**P1. postcss.** New `toghen-postcss/test/computed-values.test.ts`; `src/index.ts` only if question 4 changes `colorToHex`; regenerate `test/example-output` where the computed value changes; `specs.md` *Composite types* and *References kept as `var()`* (one sentence each, linking lib).

**F1. figma adapters.** `toghen-figma/main/utils/sum.ts` (pass the core's reason through `resolved()` instead of swallowing it, `:448-460`); new `toghen-figma/test/computedValues.test.ts` (variable value, effect style, paint, gradient stop, from synthetic tokens in the structured shapes); `test/inputs.test.ts` (#129's data file case); `specs.md:527` (*a shadow colour that is not a hex string* goes). Then `pnpm --filter @toghen/figma build` and the leak check (section 7). The shadow issue (#123) is proved here; its printing is the issues plan's unit A.

**Q1. toghen-query.** Replay its sessions; a transcript that prints a resolved value which is now computed is updated, with the change named in the commit. No code.

## 6. Risks

1. **The read gate turns tolerated strings into errors.** Today a typed token whose value interpolates into something its type refuses (a `dimension` written `'{space.y} {space.x}'`, a `shadow` written as a string `'0 2px 4px {blue}'`, the example in `design-system.ts:174`) resolves to a string and reaches CSS verbatim. After the gate it throws. That is the principle, and the message names the token; but a design system that relied on it breaks at once. The postcss run then leaves the directive and warns. The example in `design-system.ts` changes. Question 5 covers the dimension list.
2. **CSS output changes.** In `references: 'resolve'`, a `color-mix(…)` the browser computed is now written computed (hex, or as question 4 decides). In `'var'` the authored string with `var()` is kept, as today. Example outputs in postcss and figma change; each diff is reviewed, not regenerated blind.
3. **Wide gamut.** A mix in `oklch` of two P3 colours is out of sRGB. Figma clamps (`normalizeColorToSRGB01`); postcss clamps to hex today (question 4).
4. **`rem` under a root size other than 16.** Lib's assumption was harmless while `rem` stayed `rem`. Mixing it with `px` writes a number that is right only at 16 (question 2).
5. **Console noise.** Computed colours must be canonical (hue in `[0, 360)`, components within float tolerance) or `color-handler.ts:99-101` warns on every read through the gate.
6. **culori's handling of `none` in a mix** (CSS: a missing component takes the other colour's) is not measured. L1 tests it; if culori differs, `mixColors` fills it before interpolating.
7. **Performance.** The gate parses once per `resolveValue()` of a token holding a reference; `valueAt()` already rebuilds a design system per call, so this is small beside it. Not measured.

## 7. Tests

The standing lesson applies: every test uses synthetic tokens, and the structured W3C shapes (`{colorSpace, components}`, `{value, unit}`, `fontFamily` arrays), not only strings.

- **Lib, per family:** every CSS Color 4 spelling to its structured value; named colours in any case; `color-mix()` in every space, the percentage rules, nesting, `none`, the four hue methods; **the trap**: `#112233` 5% with `transparent` in `srgb` is `#112233` at alpha 0.05. Each refusal's sentence. `calc/min/max/clamp/round` per kind, same unit, absolute mixes, the `rem` mix, every refusal.
- **Lib, the gates:** `color-mix(in srgb, {ink} 5%, transparent)` with `ink` a structured `oklch` colour resolves to a structured colour through `resolveValue`, `resolveToken`, `valueAt` and a member path (`ds.shadow.raised.0.color`); the same as a shadow member; `calc({space.md} * 2)` with `space.md` `{ value: 1, unit: 'rem' }`; `contextsOf()` unchanged for a step holding a reference; `spellCssColor` round-trip; the `transparent` interpolation regression (1.4).
- **postcss:** the CSS of each of the above in `'resolve'` and `'var'`; no `[object Object]`, no `toghen(` left, no `#0000000000`.
- **figma:** a variable from the `color-mix` colour, an effect style from the shadow (issue #123, synthetic), a gradient stop with a named colour, a dimension from `calc()`.
- **Build:** `pnpm typecheck`, `pnpm test`, `pnpm build`; then `pnpm --filter @toghen/figma build` and `grep -n "\[object Object\]\|toghen(" toghen-figma/dist/*.css` (or wherever the build writes the stylesheet) returns nothing.

## 8. Docs that change

- **toghen-lib/reference.md**
  - *Token values* (`:1590-1612`): the `color` row (any CSS colour, named colours, `color-mix()`; what is refused and why), the `dimension` and `letterSpacing` rows (`calc()` and the others), the composites row (members computed; drop *stored as written* if question 3 is (a)), new `fontWeight` and `border` rows, the closing paragraph on references (*checked when it resolves*, not *checked by nothing*), the interpolation paragraph (any colour spells).
  - *`resolveValue`* (`:652`) and *`resolveToken`* (`:715`): the value returned is computed after resolution; the error it throws.
  - *`ColorValue`* (`:1424`): when `hex` is set.
  - *`normalizeColorToSRGB01`* (`:1436`), *`normalizeDimensionToPx`* (`:1462`): accepted strings.
  - *`GradientValue`* (`:1392`): angle units.
  - *Reference grammar* (`:1544`): the escape (issue #129).
  - The `$value` chain paragraph (`:995`) stays true; one sentence links the read gate.
- **toghen-lib/specs.md**
  - *Token values* (`:696-757`): a new paragraph *Lib stores the computed value* stating the principle (2.1) and the two gates; the *Two colour keywords* bullets lose the named-colour refusal; *What is not checked* (`:757`) is rewritten.
  - *Partial-string interpolation* (`:247`): the spelling.
  - *`normalizeColorToSRGB01()` Utility* (`:770`).
  - *Known limitations* (`:916`): the root size, relative colour syntax, the deferred families.
- **toghen-lib/decisions.md** (added to, never rewritten)
  - *Ruled: lib computes every specified value it can (24 October 2026)*: the principle, the table of section 3 as rulings, what the build finds.
  - *Superseded: named colours stay refused*, the specs.md:731 bullet moved whole, with the reason: the rule was discipline, not capability, and discipline is the design system's.
  - *Considered and rejected*: the dependency alternatives of question 1, with the measurements.
- **toghen-lib/guide.md**: any sentence saying a colour string must be hex (to be found by `grep -n hex guide.md` when writing).
- **toghen-postcss/specs.md**, **toghen-figma/specs.md:527**: as in units P1 and F1, linking lib.

## 9. Settled by the planner (veto any)

1. Relative colour syntax, `calc()` inside colour channels, `light-dark()`, system colours: out, refused with a reason.
2. All four hue interpolation methods are in.
3. A computed colour is stored in its own space (a `color-mix(in oklch, …)` is an `oklch` colour); `hex` is set for a hex or a named colour and for nothing else.
4. The operator set: `calc min max clamp round`, `+ - * /`, parentheses. Not `mod rem abs sign`, trigonometry, `pow sqrt hypot log exp`.
5. No new units. Angles are stored in `deg`.
6. A same-unit computation keeps its unit.
7. `fontWeight` keywords become numbers, for the type and the typography member.
8. `border` gets a handler; `number`, `duration`, `cubicBezier`, `strokeStyle`, `transition` stay as written.
9. The read gate sits in `resolveValue()` and `resolveToken()`, behind one internal `computeTokenValue`, and applies only when the raw value holds a reference. `contextsOf()` is unchanged.
10. A failure to compute throws `InvalidTokenError`, at load or at read, never a silent fallback to the string.
11. The two colour bridges become one; the `srgb-linear` and `hsl` defects (1.9) are fixed by it, not separately.
12. `normalizeColorToSRGB01` keeps its name and signature, and accepts every colour string the load gate accepts.
13. `figma.value` on a shadow (issue #123's second wish) is not needed once the colour computes; not built.

## 10. Questions

**1. Where the arithmetic lives.**

*Context.* Lib's only production dependency is culori, by an invariant of CLAUDE.md. `color-mix()` and `calc()` need a reader that culori does not have. The measurements are in section 4.

*Alternatives.*

- **(a) Write both in lib, on culori.** About 300 lines; nothing new to install; the reader covers only what section 3 lets in, so it stays small. We own the conformance.
- **(b) Add `@csstools/css-calc`** for the math, three packages, 124 KB; `color-mix()` still written in lib. Conformance tested upstream against WPT; the invariant gains an exception.
- **(c) Add `@csstools/css-color-parser`**, five packages, 248 KB: `color-mix()`, relative colour syntax and `calc()` in channels, all per spec; culori stays for conversions. Most capability, two colour libraries side by side.

*Recommendation.* **(a)**, because the subset lib admits is small and fixed, and the invariant is worth more than code we would not use.

**2. What `calc(1rem + 2px)` stores.**

*Context.* Lib turns `rem` into `px` at a root of 16 only when an adapter asks for pixels; a `rem` token stays `rem`. A mix forces one unit into the stored value. In a browser, `calc(1rem + 2px)` at a root of 20 is 22px.

*Alternatives.*

- **(a) `px`: `{ value: 18, unit: 'px' }`.** Simple; Figma gets 18; CSS writes `18px` and stops scaling with the root (18px at a root of 20).
- **(b) `rem`: `{ value: 1.125, unit: 'rem' }`** (each `px` divided by 16). Figma still gets 18; CSS keeps scaling (22.5px at a root of 20, against the browser's 22).
- **(c) Refused:** *mixing rem and px needs the root size; write one unit.* No assumption widened; authors rewrite.

*Recommendation.* **(b)**, because Figma gets the same number, and CSS keeps the scaling the author chose `rem` for.

**3. Composite members: always computed, or only when they need it.**

*Context.* Today a shadow's `color: '#abc'` and a typography `fontSize: '16px'` are stored as written; only the top-level types are structured. Computing `color-mix()` in a member forces a choice for the plain forms too.

*Alternatives.*

- **(a) Every member is stored computed:** `'#abc'` becomes a structured colour with `hex: '#aabbcc'`, `'16px'` becomes `{ value: 16, unit: 'px' }`. One shape for adapters; example outputs change (`#abc` is written `#aabbcc` in CSS).
- **(b) Only members that need computing are converted** (a function, a keyword, a named colour); `'#abc'` and `'16px'` stay as written. Smallest diff; two shapes remain, as today.

*Recommendation.* **(a)**, because "adapters read one shape" was the point of the load gate, and the composites are where it was never true.

**4. How postcss spells a colour outside sRGB.**

*Context.* `colorToHex` (`toghen-postcss/src/index.ts:249`) writes every structured colour as sRGB hex, clamped. Until now only an author's own structured `oklch` or `display-p3` colour could be out of gamut; after this round any `oklch()` string or `color-mix(in oklch, …)` can, and today they reach CSS unclamped as strings.

*Alternatives.*

- **(a) Hex as today:** out-of-gamut colours are clamped in CSS, as in Figma. One rule, a visible change for wide-gamut authors.
- **(b) Hex when the colour has a `hex` or lies in sRGB, else its own CSS function** (`oklch(…)`, `color(display-p3 …)`) by `formatCss`. Only out-of-gamut output changes, and it stops being wrong.
- **(c) Always its own space:** `oklch(0.7 0.1 200)` even when in gamut. Most faithful; every non-sRGB token's CSS changes.

*Recommendation.* **(b)**, because it changes only the outputs that are wrong today.

**5. A space-separated list of dimensions (`8px 13px`).**

*Context.* `toghen-figma/specs.md:527` lists it as a Figma skip. Typed `dimension`, it is refused at load today; untyped, it is stored as written and CSS writes it verbatim. With the read gate, a *typed* dimension that interpolates into a list (`'{space.y} {space.x}'`) also becomes an error, where today it reaches CSS.

*Alternatives.*

- **(a) Keep the skip.** Untyped lists stay as written, CSS writes them, Figma skips them with the reason Part 2 prints. A typed one is refused at load or at read, and the reason says to leave the token untyped.
- **(b) A new Toghen type for a list** (one to four dimensions, each computed): CSS writes it space-joined; Figma still skips it, until a component binding wants sides. Typed, checked, more surface.
- **(c) Lib refuses an untyped value that looks like a length list.** Lib would start judging untyped values, which it never does.

*Recommendation.* **(a)**, because a padding shorthand is CSS's packing of four values, and the type that fits it is four tokens; nobody has asked for the list type.

## 11. What the build found (24 October 2026)

Built on the integration branch `round-2026-10-24` in four waves: L1 colour, L2 numeric and L5 brace (wave 1), L3 composites and the read gate (wave 2, closed by the issues plan's F1), P1 postcss and D-lib docs (wave 3). Q1 needed no work: toghen-query's sessions replay unchanged in its test. The root `pnpm build`, `pnpm typecheck` and `pnpm test` are green (lib 626, postcss 365, query 30, ui 45, figma 1524). The plugin's built `ui.html` holds no `[object Object]` and no `toghen(`. The one `toghen(` in `code.js` is inside a JSDoc comment bundled from lib's resolver.

### What deviated from the plan

- **A percentage `lineHeight` is stored as the string `'150%'`**, not as `{ unit: 'percent' }`. Only `normalizeLineHeight` returns the `percent` form; the stored shape stays a string for that one case.
- **Computed colour components are not rounded** (an alpha can read `0.0500000000044`). Only the numeric grammar rounds, to 10 decimals; colours are snapped onto their range bound within 1e-9 and their hue wrapped into [0, 360).
- **A bare `0` is a length** (`0px`), added at integration after L3 made every shadow member computed: a shadow written `offsetX: '0'` would otherwise have stopped loading. Any other bare number is still refused for a length. `normalizeDimensionToPx` keeps reading a unitless string as px, as documented before; the `dimension` type refuses it.
- **Members refuse what they used to pass:** a typography `letterSpacing` in `pt` or `mm`, a unitless length string other than `0`.
- **The read gate finds the type through a whole reference** (own `$type`, then the referenced token's, then the group's), as `resolveToken()` always did; not the token's own type alone, as the chain ruling of 21 October uses.
- **Interpolating a token that itself holds a reference inserts its resolved string**, not its computed value; the colour reader parses the nested `color-mix()` anyway, so the result is the same.
- **postcss's gamut check (ruling 4b)** reads unclamped sRGB channels through `normalizeColorToSRGB01` by a mixing trick, since lib exports neither a gamut check nor `spellCssColor` and postcss must not add culori. It is marked with a `ponytail:` comment; the clean fix is a lib export.
- **postcss chains under `references: 'resolve'`**: a chain's raw context step written `color-mix(… {ink} …)` is written with the value substituted into the string, not computed. Valid CSS, not the computed value.
- **The figma adapter could not stay as it was.** Figma called `resolveToken()` on every token without catching, so a token the read gate refuses stopped a whole plan. F1 added `readToken` (figma `resolverModes.ts`), which catches `InvalidTokenError` per token and keeps the core's sentence in a `cannot-write` / `cannot-build` skip. An export still stops on such a token.

### What the build discovered

- culori reads a `none` component as 0 in a premultiplied mix (CSS takes the other colour's); `mixColors` fills it first.
- culori does not parse `Transparent` capitalised, though `RED` works; every piece is lowercased before parsing.
- culori's hue override works only as `{ h: { fixup } }`.
- The two bridge bugs (`srgb-linear` read as gamma-encoded; the handler helpers' `hsl` scale) and the `transparent` interpolation bug (`#0000000000`) are fixed by the one bridge and `spellCssColor`, each with a regression test.
- A postcss fixture (`type.label`) had no `lineHeight`, invalid all along but never checked because its value held references; the read gate found it.

### What is left

- **Two lib questions** a consumer now answers for itself: a token's type without computing its value (figma derives it for a refused token), and a gamut check or a colour spelling (postcss imitates one).
- `Resolver.valueAt()` errors name the collection `resolved`, the name of the design system it builds, not the document's.
- Deferred families: `number`, `duration`, `cubicBezier`, `strokeStyle` as a token type, `transition`; relative colour syntax; `color-mix()` without `in <space>` or with more than two colours; CSS's parse-time clamps of authored channels (`rgb(300 0 0)` still warns).
