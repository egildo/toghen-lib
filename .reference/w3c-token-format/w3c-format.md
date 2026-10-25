# Design Tokens Format Module 2025.10

Abstract
--------

This document describes the technical specification for a file format to exchange design tokens between different tools.

Status of This Document
-----------------------

This specification was published by the [Design Tokens Community Group](https://www.w3.org/groups/cg/design-tokens). It is not a W3C Standard nor is it on the W3C Standards Track. Please note that under the [W3C Community Final Specification Agreement (FSA)](https://www.w3.org/community/about/agreements/final/) other conditions apply. Learn more about [W3C Community and Business Groups](https://www.w3.org/community/).

This section describes the status of this document at the time of its publication. Other documents may supersede this document. A list of current W3C Community Group reports and the latest revision of this report can be found in the W3C Community Group reports index at [https://www.w3.org/community/reports/](https://www.w3.org/community/reports/).

This document was published by the DTCG as a [Candidate Recommendation](https://www.w3.org/policies/process/#RecsCR) following the definitions provided by the W3C process. Contributions to this draft are governed by [Community Contributor License Agreement (CLA)](https://www.w3.org/community/about/process/cla), as specified by the [W3C Community Group Process](https://www.w3.org/community/about/process/#cgroups).

While not a W3C recommendation, this classification is intended to clarify that, after extensive consensus-building, this specification is intended for implementation.

**This specification is considered stable**. Further updates will be provided in superseding specifications.

[GitHub Issues](https://github.com/design-tokens/community-group/issues/) are preferred for discussion of this specification.

Table of Contents
-----------------

1. [Abstract](#abstract)
2. [Status of This Document](#sotd)
3. [1\. Conformance](#conformance)
4. [2\. Introduction](#introduction)
5. [3\. Terminology](#terminology)
    1. [3.1 (Design) Token](#design-token)
    2. [3.2 (Design) Token Properties](#design-token-properties)
    3. [3.3 Design tool](#design-tool)
    4. [3.4 Translation tool](#translation-tool)
    5. [3.5 Documentation tool](#documentation-tool)
    6. [3.6 Type](#type)
    7. [3.7 Group](#group)
    8. [3.8 Alias (Reference)](#alias-reference)
    9. [3.9 Composite (Design) Token](#composite-design-token)
6. [4\. File format](#file-format)
    1. [4.1 Media type (MIME type)](#media-type-mime-type)
    2. [4.2 File extensions](#file-extensions)
7. [5\. Design token](#design-token-0)
    1. [5.1 Name and value](#name-and-value)
        1. [5.1.1 Character restrictions](#character-restrictions)
    2. [5.2 Additional properties](#additional-properties)
        1. [5.2.1 Description](#description)
        2. [5.2.2 Type](#type-0)
        3. [5.2.3 Extensions](#extensions)
        4. [5.2.4 Deprecated](#deprecated)
8. [6\. Groups](#groups)
    1. [6.1 Group Structure](#group-structure)
    2. [6.2 Root Tokens in Groups](#root-tokens-in-groups)
    3. [6.3 Group Properties](#group-properties)
        1. [6.3.1 `$deprecated`](#deprecated-0)
        2. [6.3.2 `$extensions`](#extensions-0)
    4. [6.4 Extending Groups](#extending-groups)
        1. [6.4.1 Equivalence to JSON Schema `$ref`](#equivalence-to-json-schema-ref)
        2. [6.4.2 Reference Resolution and Evaluation](#reference-resolution-and-evaluation)
        3. [6.4.3 Inheritance Semantics](#inheritance-semantics)
        4. [6.4.4 Circular Reference Prevention](#circular-reference-prevention)
        5. [6.4.5 Supported Reference Formats](#supported-reference-formats)
        6. [6.4.6 Error Conditions](#error-conditions)
        7. [6.4.7 Implementation Guidance](#implementation-guidance)
        8. [6.4.8 Relationship to JSON Schema Specifications](#relationship-to-json-schema-specifications)
    5. [6.5 Empty Groups](#empty-groups)
    6. [6.6 References and JSON Pointer Integration](#references-and-json-pointer-integration)
        1. [6.6.1 Current Reference Syntax (Recommended)](#current-reference-syntax-recommended)
        2. [6.6.2 JSON Pointer Support](#json-pointer-support)
    7. [6.7 Processing Rules](#processing-rules)
        1. [6.7.1 Token Resolution Order](#token-resolution-order)
        2. [6.7.2 Path Construction](#path-construction)
        3. [6.7.3 Type Inheritance](#type-inheritance)
        4. [6.7.4 Circular Reference Detection](#circular-reference-detection)
    8. [6.8 Migration and Compatibility](#migration-and-compatibility)
    9. [6.9 Examples](#examples)
        1. [6.9.1 Basic Group with Root Token](#basic-group-with-root-token)
        2. [6.9.2 Group Extension with Override Example](#group-extension-with-override-example)
        3. [6.9.3 Complex Hierarchical Structure](#complex-hierarchical-structure)
    10. [6.10 Use-cases](#use-cases)
         1. [6.10.1 File authoring & organization](#file-authoring-organization)
         2. [6.10.2 GUI tools](#gui-tools)
         3. [6.10.3 Translation tools](#translation-tools)
9. [7\. Aliases / References](#aliases-references)
    1. [7.1 Reference Syntax](#reference-syntax)
        1. [7.1.1 Curly Brace Syntax (Token References)](#curly-brace-syntax-token-references)
        2. [7.1.2 JSON Pointer Syntax (Required Support)](#json-pointer-syntax-required-support)
    2. [7.2 Reference Resolution](#reference-resolution)
        1. [7.2.1 Resolution Algorithms](#resolution-algorithms)
        2. [7.2.2 Chained References](#chained-references)
        3. [7.2.3 Circular References](#circular-references)
    3. [7.3 Property-Level References](#property-level-references)
        1. [7.3.1 Color Component References](#color-component-references)
        2. [7.3.2 Dimension Component References](#dimension-component-references)
        3. [7.3.3 Typography Component References](#typography-component-references)
    4. [7.4 JSON Pointer Path Construction and Resolution](#json-pointer-path-construction-and-resolution)
        1. [7.4.1 Path Construction Rules](#path-construction-rules)
        2. [7.4.2 Token Value Access Patterns](#token-value-access-patterns)
        3. [7.4.3 Resolution Algorithm for JSON Pointer](#resolution-algorithm-for-json-pointer)
        4. [7.4.4 Curly Brace Resolution Algorithm](#curly-brace-resolution-algorithm)
        5. [7.4.5 Error Conditions](#error-conditions-0)
        6. [7.4.6 Path Examples](#path-examples)
    5. [7.5 Implementation Guidance](#implementation-guidance-0)
        1. [7.5.1 For Tool Authors](#for-tool-authors)
        2. [7.5.2 Disambiguation Examples](#disambiguation-examples)
        3. [7.5.3 Error Conditions](#error-conditions-1)
    6. [7.6 Relationship to JSON Schema](#relationship-to-json-schema)
10. [8\. Types](#types)
     1. [8.1 Color](#color)
     2. [8.2 Dimension](#dimension)
         1. [8.2.1 Validation](#validation)
     3. [8.3 Font family](#font-family)
     4. [8.4 Font weight](#font-weight)
     5. [8.5 Duration](#duration)
         1. [8.5.1 Validation](#validation-0)
     6. [8.6 Cubic Bézier](#cubic-bezier)
     7. [8.7 Number](#number)
     8. [8.8 Additional types](#additional-types)
11. [9\. Composite types](#composite-types)
     1. [9.1 Array aliasing in composite types](#array-aliasing-in-composite-types)
     2. [9.2 Groups versus composite tokens](#groups-versus-composite-tokens)
     3. [9.3 Stroke style](#stroke-style)
         1. [9.3.1 String value](#string-value)
         2. [9.3.2 Object value](#object-value)
         3. [9.3.3 Fallbacks](#fallbacks)
     4. [9.4 Border](#border)
     5. [9.5 Transition](#transition)
     6. [9.6 Shadow](#shadow)
     7. [9.7 Gradient](#gradient)
     8. [9.8 Typography](#typography)
12. [A. Issue summary](#issue-summary)
13. [B. References](#references)
     1. [B.1 Normative references](#normative-references)

As well as sections marked as non-normative, all authoring guidelines, diagrams, examples, and notes in this specification are non-normative. Everything else in this specification is normative.

The key words _MAY_, _MUST_, _MUST NOT_, _SHOULD_, and _SHOULD NOT_ in this document are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) \[[RFC2119](#bib-rfc2119 "Key words for use in RFCs to Indicate Requirement Levels")\] \[[RFC8174](#bib-rfc8174 "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words")\] when, and only when, they appear in all capitals, as shown here.

_This section is non-normative._

Design tokens are a methodology for expressing design decisions in a platform-agnostic way so that they can be shared across different disciplines, tools, and technologies. They help establish a common vocabulary across organizations.

There is a growing ecosystem of tools for design system maintainers and consumers that incorporate design token functionality, or would benefit from doing so:

* [Design tools](#dfn-design-tool) have begun allowing designers to label and reference shared values for design properties like colors and sizes.
* [Translation tools](#dfn-translation-tool) exist that can convert source design token data into platform-specific source code that can directly be used by developers.
* [Documentation tools](#dfn-documentation-tool) can display design token names rather than the raw values in design specs and style guides.

It is often desirable for design system teams to integrate such tools together, so that design token data can flow between design and development tools.

For example:

* Extracting design tokens from design files and feeding them into [translation tools](#dfn-translation-tool) to then be converted into platform-specific code
* Maintaining a "single source of truth" for design tokens and automatically keeping design and development tools in sync with it

While many tools now offer APIs to access design tokens or the ability to export design tokens as a file, these are all tool-specific. The burden is therefore on design system teams to create and maintain their own, bespoke "glue" code or workflows. Furthermore, if teams want to migrate to different tools, they will need to update those integrations.

This specification aims to facilitate better interoperability between tools and thus lower the work design system teams need to do to integrate them by defining a standard file format for expressing design token data.

These definitions are focused on the technical aspects of the specification, aimed at implementers such as [design tool](#dfn-design-tool) vendors. Definitions for designers and developers are available at [designtokens.org](https://www.designtokens.org/glossary/).

A (Design) Token is information associated with a human readable name, at minimum a name/value pair.

For example:

* `color-text-primary: #000000;`
* `font-size-heading-level-1: 44px;`

The name may be associated with additional [Token Properties](#design-token-properties).

Information associated with a token name.

For example:

* Value
* Type
* Description

Additional metadata may be added by tools and design systems to extend the format as needed.

A design tool is a tool for visual design creation and editing.

For example:

* Bitmap image manipulation programs:
  * [Photoshop](https://www.adobe.com/products/photoshop.html)
  * [Affinity Photo](https://affinity.serif.com/photo)
  * [Paint.net](https://www.getpaint.net/)
* Vector graphics tools:
  * [Illustrator](https://www.adobe.com/products/illustrator.html)
  * [Inkscape](https://inkscape.org/)
* UI design, wireframing and prototyping tools:
  * [Adobe XD](https://www.adobe.com/products/xd.html)
  * [UXPin](https://www.uxpin.com/)
  * [Sketch](https://www.sketch.com/)
  * [Figma](https://www.figma.com/)
  * ...

Design token translation tools translate token data from one format to another.

For example:

* [Style Dictionary](https://amzn.github.io/style-dictionary/)
* [Terrazzo](https://github.com/terrazzoapp/terrazzo)
* ...

A documentation tool is a tool for documenting design tokens usage.

For example:

* [Storybook](https://storybook.js.org/)
* [Zeroheight](https://zeroheight.com/)
* [Backlight](https://backlight.dev/)
* [Supernova](https://www.supernova.io/)
* [Knapsack](https://www.knapsack.cloud/)
* ...

A token's type is a predefined categorization applied to the token's value.

For example:

* Color
* Size
* Duration

Token tools can use Types to infer the purpose of a token.

For example:

* A [translation tool](#dfn-translation-tool) might reference a token's type to convert the source value into the correct platform-specific format.
* A visual [design tool](#dfn-design-tool) might reference type to present tokens in the appropriate part of their UI - as in, color tokens are listed in the color picker, font tokens in the text styling UI's fonts list, and so on.

A group is a set of tokens belonging to a specific category.

For example:

* Brand
* Alert
* Layout

Groups are arbitrary and tools _SHOULD NOT_ use them to infer the type or purpose of design tokens.

A design token's value can be a reference to another token. The same value can have multiple names or _aliases_.

The following Sass example illustrates this concept:

```
$color-palette-black: #000000;
$color-text-primary: $color-palette-black;

```

The value of `$color-text-primary` is `#000000`, because `$color-text-primary` _references `$color-palette-black`_. We can also say `$color-text-primary` is an _alias_ for `$color-palette-black.`

A design token whose value is made up of multiple, named child values. Composite tokens are useful for closely related style properties that are always applied together. For example, a typography style might be made up of a font name, font size, line height, and color.

Here's [an example of a composite shadow token](https://design-tokens.github.io/community-group/format/#example-composite-token-example):

```
{
  "shadow-token": {
    "$type": "shadow",
    "$value": {
      "color": {
        "$type": "color",
        "$value": {
          "colorSpace": "srgb",
          "components": [0, 0, 0],
          "alpha": 0.5,
          "hex": "#000000"
        }
      },
      "offsetX": { "value": 0.5, "unit": "rem" },
      "offsetY": { "value": 0.5, "unit": "rem" },
      "blur": { "value": 1.5, "unit": "rem" },
      "spread": { "value": 0, "unit": "rem" }
    }
  }
}

```

Design token files are JSON ([https://www.json.org/](https://www.json.org/)) files that adhere to the structure described in this specification.

JSON was chosen as an interchange format on the basis of:

* Broad support in many programming languages' standard libraries. This is expected to lower barriers to entry for developers writing software that supports design token files.
* Current popularity and widespread use. This is expected to lower the learning curve as many people will already be familiar with JSON.
* Being text-based (rather than binary) allows hand-editing design token files without needing specialized software other than a basic text editor. It also means the files are somewhat human-readable.

When serving design token files via HTTP / HTTPS or in any other scenario where a media type (formerly known as MIME type) needs to be specified, the following MIME type _SHOULD_ be used for design token files:

* `application/design-tokens+json`

However, since every design token file is a valid JSON file, they _MAY_ be served using the JSON media type: `application/json`. The above, more specific media type is preferred and _SHOULD_ be used wherever possible.

Tools that can open design token files _MUST_ support both media types.

When saving design token files on a local file system, it can be useful to have a distinct file extension as this makes them easier to spot in file browsers. It may also help to associate a file icon and a preferred application for opening those files. The following file extensions are recommended by this spec:

* `.tokens`
* `.tokens.json`

The former is more succinct. However, until this format is widely adopted and supported, the latter might be useful to make design token files open in users' preferred JSON editors.

Tools that can open design token files _MAY_ filter available files (e.g. in an open file dialog) to only show ones using those extensions. It is recommended to also provide users with a way of opening files that do not use those extensions (e.g. a "show all files" option or similar).

Tools that can save design token files _SHOULD_ append one of the recommended file extensions to the filename when saving.

Editor's note: JSON schema

The group is currently exploring the addition of a JSON Schema to support the spec.

Editor's note: JSON file size limitations

A concern about file size limitations of JSON files was raised by one of the vendors. The working group continues to gather feedback about any limitations the JSON format imposes.

An object with a **`$value`** property is a token. Thus, `$value` is a reserved word in our spec, meaning you can't have a token whose name is "$value". The parent object's key is the token name.

A token's name _MUST_ be a valid JSON string as defined in \[[RFC8259](#bib-rfc8259 "The JavaScript Object Notation (JSON) Data Interchange Format")\].

The example above therefore defines 1 design token with the following properties:

* Name: "token name"
* Type: "color"
* Value:
  * Color Space: "srgb"
  * Components: \[1, 0, 0\]

Name and value are both **required**.

Token names are case-sensitive, so the following example with 2 tokens in the same group whose names only differ in case is valid:

However, some tools _MAY_ need to transform names when exporting to other languages or displaying names to the user, so having token names that differ only in case is likely to cause identical and undesirable duplicates in the output. For example, a translation tool that converts these tokens to Sass code would generate problematic output like this:

Tools _MAY_ display a warning when token names differ only by case.

All properties defined by this format are prefixed with the dollar sign (`$`). This convention will also be used for any new properties introduced by future versions of this spec. Therefore, token and [group](#groups) names _MUST NOT_ begin with the `$` character.

Furthermore, due to the syntax used for [token aliases](#references-and-json-pointer-integration) the following characters _MUST NOT_ be used anywhere in a token or group name:

* `{` (left curly bracket)
* `}` (right curly bracket)
* `.` (period)

While `$value` is the only required property for a token, a number of additional properties _MAY_ be added:

A plain text description explaining the token's purpose can be provided via the optional `$description` property. Tools _MAY_ use the description in various ways.

For example:

* Style guide generators _MAY_ display the description text alongside a visual preview of the token
* IDEs _MAY_ display the description as a tooltip for auto-completion (similar to how API docs are displayed)
* [Design tools](#dfn-design-tool) _MAY_ display the description as a tooltip or alongside tokens wherever they can be selected
* Translation tools _MAY_ render the description to a source code comment alongside the variable or constant they export.

The value of the `$description` property _MUST_ be a plain JSON string, for example:

Design tokens always have an unambiguous type, so that tools can reliably interpret their value.

A token's type can be specified by the optional `$type` property. If the `$type` property is not set on a token, then the token's type _MUST_ be determined as follows:

* If the token's value is a reference, then its type is the resolved type of the token being referenced.
* Otherwise, if any of the token's parent groups have a `$type` property, then the token's type is inherited from the closest parent group with a `$type` property.
* Otherwise, if none of the parent groups have a `$type` property, the token's type cannot be determined and the token _MUST_ be considered invalid.

Tools _MUST NOT_ attempt to guess the type of a token by inspecting the contents of its value.

The `$type` property can be set on different levels:

* at the group level
* at the token level

The `$type` property _MUST_ be a plain JSON string, whose value is one of the values specified in this specification's respective type definitions. The value of `$type` is case-sensitive.

For example:

The optional **`$extensions`** property is an object where tools _MAY_ add proprietary, user-, team- or vendor-specific data to a design token. When doing so, each tool _MUST_ use a vendor-specific key whose value _MAY_ be any valid JSON data.

* The keys _SHOULD_ be chosen such that they avoid the likelihood of a naming clash with another vendor's data. The [reverse domain name notation](https://en.wikipedia.org/wiki/Reverse_domain_name_notation) is recommended for this purpose.
* Tools that process design token files _MUST_ preserve any extension data they do not themselves understand. For example, if a design token contains extension data from tool A and the file containing that data is opened by tool B, then tool B _MUST_ include the original tool A extension data whenever it saves a new design token file containing that token.

In order to maintain interoperability between tools that support this format, teams and tools _SHOULD_ restrict their usage of extension data to optional meta-data that is not crucial to understanding that token's value.

Tool vendors are encouraged to publicly share specifications of their extension data wherever possible. That way other tools can add support for them without needing to reverse engineer the extension data. Popular extensions could also be incorporated as standardized features in future revisions of this specification.

Editor's note: Extensions section

The extensions section is not limited to vendors. All token users can add additional data in this section for their own purposes.

The **`$deprecated`** property _MAY_ be used to mark a token as deprecated, and optionally explain the reason. Reasons to deprecate tokens include but are not limited to the following:

* A future update to the design system will remove this token
* Removing the token now may break existing support
* This token is discouraged from future use

|Value |Explanation                                                |
|------|-----------------------------------------------------------|
|true  |This token is deprecated (no explanation provided).        |
|String|This token is deprecated AND this is an explanation.       |
|false |This token is NOT deprecated (may override group defaults).|

Tool makers _MAY_ augment the string when it contains aliases such as the one given as an example. A tool could potentially resolve the token, and link to docs, code, or render a visual representation of it and link to the new token inside a UI. For example, “Please use {button.activeBorder} instead“ could be output in JS as:

Or

Groups organize design tokens into logical collections and provide a hierarchical structure for token files. Groups are arbitrary and tools _SHOULD NOT_ use them to infer the type or purpose of design tokens.

A group is identified as a JSON object that does NOT contain a [`$value`](about:blank/design-token#name-and-value) property. Groups _MAY_ contain:

* **Child tokens** - Objects with a `$value` property
* **Nested groups** - Objects without a `$value` property
* **Group properties** - Properties prefixed with `$` (e.g., `$description`, `$type`)

**Important:** The presence of a `$value` property definitively identifies an object as a token. If an object contains both `$value` and child tokens/groups, this creates an invalid structure where the object cannot be both a token and a group simultaneously. Tools _MUST_ report this as an error.

Groups _MAY_ contain a **root token** alongside child tokens and nested groups. A root token provides a base value for the group while allowing for variants or extensions.

Groups support root tokens using the reserved name `$root` as the token name:

**Rationale:** Using `$root` as a reserved token name eliminates ambiguity between group references and token references while maintaining clear, explicit syntax. The `$` prefix prevents naming conflicts with user-defined tokens and aligns with other reserved properties in the specification.

Groups _MAY_ include the following properties:

* Property: $description
  * Required: No
  * Description: A plain JSON string describing the group's purpose
* Property: $type
  * Required: No
  * Description: Acts as a default type for tokens within the group that do not explicitly declare their own type. Type inheritance applies to nested groups and their tokens unless overridden
* Property: $extends
  * Required: No
  * Description: Inherits tokens and properties from another group. See Extending Groups for details
* Property: $deprecated
  * Required: No
  * Description: Marks the group as deprecated. Value can be true, false, or a string explanation
* Property: $extensions
  * Required: No
  * Description: Vendor-specific extensions where tools MAY add proprietary data

Groups _MAY_ include an optional `$deprecated` property to mark the entire group as deprecated. This extends to all child tokens within the group unless explicitly overridden.

|Value |Explanation                                                      |
|------|-----------------------------------------------------------------|
|true  |This group is deprecated (no explanation provided)               |
|string|This group is deprecated AND this is an explanation              |
|false |This group is NOT deprecated (may override parent group defaults)|

Groups _MAY_ include an optional [`$extensions`](about:blank/design-token#extensions) property where tools _MAY_ add proprietary, user-, team- or vendor-specific data. Each tool _MUST_ use a vendor-specific key whose value _MAY_ be any valid JSON data.

Groups _MAY_ include an optional `$extends` property to inherit tokens and properties from another group. `$extends` _MUST NOT_ reference a token. The `$extends` property is syntactic sugar for JSON Schema's `$ref` keyword and follows the same semantic behavior as defined in \[[json-schema-2020-12](#bib-json-schema-2020-12 "JSON Schema: A Media Type for Describing JSON Documents. Draft 2020-12")\].

The `$extends` property is semantically equivalent to JSON Schema's `$ref` keyword as specified in \[[json-schema-2020-12](#bib-json-schema-2020-12 "JSON Schema: A Media Type for Describing JSON Documents. Draft 2020-12")\] and later versions. The following two group definitions are functionally identical:

**Using `$extends` (Design Token syntax):**

```
{
  "button-primary": {
    "$extends": "{button}",
    "background": {
      "$value": {
        "colorSpace": "srgb",
        "components": [0.8, 0, 0.4],
        "hex": "#cc0066"
      }
    },
    "focus": {
      "$value": {
        "colorSpace": "srgb",
        "components": [1, 0.2, 0.6],
        "hex": "#ff3399"
      }
    }
  }
}

```

**Using `$ref` (JSON Schema syntax):**

```
{
  "button-primary": {
    "$ref": "#/button",
    "background": {
      "$value": {
        "colorSpace": "srgb",
        "components": [0.8, 0, 0.4],
        "hex": "#cc0066"
      }
    },
    "focus": {
      "$value": {
        "colorSpace": "srgb",
        "components": [1, 0.2, 0.6],
        "hex": "#ff3399"
      }
    }
  }
}

```

Extension resolution follows a straightforward process:

1. **Find the target:** Resolve the `$extends` reference to locate the target group
2. **Copy inherited content:** Start with all tokens and properties from the target group
3. **Apply local overrides:** Replace any inherited tokens/properties where local ones exist at the same path
4. **Add new content:** Include any local tokens/properties that don't exist in the inherited group

This creates a new resolved group that combines inherited and local content according to the override rules above.

Group extension follows **deep merge** behavior where local properties override inherited properties at the same path:

1. **Inheritance:** All tokens and properties from the referenced group are inherited (circular references are not allowed)
2. **Override:** Local tokens and properties replace inherited ones with the same path
3. **Addition:** Local tokens and properties with new paths are added alongside inherited ones

**Override Rules:**

* **Same path = override:** If both the inherited group and local group define a token at the same path, the local definition wins
* **Different paths = merge:** Tokens at different paths coexist in the final result
* **Complete replacement:** When overriding, the entire token definition is replaced (not merged property-by-property)

**Result for `input-amount`:**

* Token: field.width
  * Final Value: "100px" (local override wins)
* Token: field.background
  * Final Value: {"colorSpace": "srgb", "components": [1, 1, 1], "hex": "#ffffff"} (inherited, no local override)

**Multi-level Override Example:**

**Result for `extended`:**

|Token  |Final Value|Source    |
|-------|-----------|----------|
|color  |"#red"     |overridden|
|spacing|"16px"     |inherited |
|border |"1px solid"|added     |

Groups _MUST NOT_ create circular inheritance chains. The following patterns are **invalid**:

**Valid inheritance patterns:**

`$extends` supports the same reference formats as [design token aliases](#references-and-json-pointer-integration).

`$extends` error handling follows JSON Schema `$ref` error patterns:

* **Unresolvable references:** When the target group cannot be found
* **Invalid targets:** When the reference points to a non-group (e.g., a token)
* **Circular references:** When extension chains create cycles
* **Constraint violations:** When local properties violate inherited constraints

Tools _MUST_ implement the same error detection and reporting patterns used by JSON Schema validators for `$ref` resolution.

Tools implementing design token parsing _MAY_ choose to:

1. **Transform to `$ref`:** Convert `$extends` to standard JSON Schema `$ref` syntax and use existing JSON Schema libraries for validation
2. **Native implementation:** Implement `$extends` directly using the same algorithms as JSON Schema `$ref` processing
3. **Hybrid approach:** Use JSON Schema libraries for validation while maintaining design token-specific reference syntax

Regardless of implementation approach, the semantic behavior _MUST_ be equivalent to JSON Schema `$ref` as specified in JSON Schema 2020-12 or later.

This specification defines `$extends` as syntactic sugar for JSON Schema's `$ref` keyword, providing design token-specific reference syntax while maintaining equivalent behavior. The deep merge semantics described above align with how JSON Schema 2020-12 handles `$ref` with sibling properties.

For implementers familiar with JSON Schema, the `$extends` behavior is equivalent to:

* Converting `"$extends": "{group}"` to `"$ref": "#/group"`
* Applying JSON Schema 2020-12 `$ref` resolution with sibling property evaluation

Tools implementing this specification _MAY_ choose to:

1. **Transform approach:** Convert `$extends` to `$ref` and use JSON Schema libraries
2. **Direct implementation:** Implement the deep merge behavior described above
3. **Hybrid approach:** Use JSON Schema for validation while maintaining design token syntax

Regardless of implementation approach, the user-visible behavior _MUST_ match the deep merge semantics described in this specification.

Groups _MAY_ be empty (contain no tokens or nested groups). While they may appear to serve no immediate purpose, they:

* Cause no harm to processing or validation
* Support work-in-progress organization during token development
* May contain metadata via group properties (`$description`, `$extensions`)
* Provide placeholder structure for future token development

Note: Token vs Group Ambiguity

The current [token reference syntax](#references-and-json-pointer-integration) using curly braces (`{group.token}`) is maintained for backward compatibility and developer ergonomics. However, tools _MAY_ also support JSON Pointer notation for advanced use cases.

Tools _MUST_ support JSON Pointer references as defined by \[[rfc6901](#bib-rfc6901 "JavaScript Object Notation (JSON) Pointer")\], using the `$ref` property:

When processing groups, tools _MUST_ follow this resolution order:

1. **Local tokens** - Direct children with `$value` properties
2. **Root tokens** - Tokens with `$root` names
3. **Extended tokens** - Tokens inherited via `$extends` (if not overridden)
4. **Nested groups** - Process recursively

Token paths are constructed by concatenating group names and token names with periods (`.`). The reserved token name `$root` is included in the path to maintain explicit, unambiguous references.

Examples:

|Location           |Path              |Notes                                         |
|-------------------|------------------|----------------------------------------------|
|/color/accent/$root|color.accent.$root|Token path                                    |
|/color/accent/light|color.accent.light|Token path                                    |
|/color/accent      |—                 |Invalid for token resolution, valid for groups|

Type resolution follows these rules in order of precedence:

1. **Token's explicit [`$type`](about:blank/design-token#type) property** (highest precedence)
2. **Resolved group's `$type` property** (after extension resolution)
3. **Parent group's `$type` property** (walking up the hierarchy)
4. **Token is invalid** if no type can be determined

**Type Resolution with Extensions:** Since `$extends` follows JSON Schema `$ref` semantics, type inheritance behavior is determined by constraint validation rather than explicit merge rules. Local type constraints are evaluated alongside inherited constraints according to JSON Schema validation patterns.

In this example, the group `extended` must satisfy both its local `$type: "dimension"` constraint and any applicable constraints from the referenced `base` group, following JSON Schema constraint resolution rules.

Tools _MUST_ detect and throw an error on circular references in:

* Token [aliases](#references-and-json-pointer-integration) (`{token}` references)
* Group extensions (`$extends` references)
* JSON Pointer references (`$ref` properties, if supported)

Circular reference detection for `$extends` follows the same requirements as JSON Schema `$ref` circular reference detection. Tools _SHOULD_ implement the same algorithms used by JSON Schema validators for cycle detection.

Tools _MUST_ report this as an error affecting groups `a`, `b`, and `c`.

This specification is designed to be backward compatible with existing design token files. Tools implementing this specification:

* _MUST_ continue to support existing group syntax
* _SHOULD_ provide warnings for deprecated patterns
* _MAY_ implement new features incrementally
* _MUST_ validate that token names do not conflict with reserved properties

**Resolved tokens:**

* `{input-amount.field.width}` → `{ "value": 100, "unit": "px" }` (overridden)
* `{input-amount.field.background}` → `#ffffff` (inherited from input)

This demonstrates the key use case where a component extends a base component but overrides specific tokens while inheriting others.

This structure creates tokens accessible as:

* Token Reference: {color.brand.$root}
  * Resolved Value: {"colorSpace": "srgb", "components": [0, 0.4, 0.8], "hex": "#0066cc"}
* Token Reference: {color.brand.light}
  * Resolved Value: {"colorSpace": "srgb", "components": [0.2, 0.533, 0.867], "hex": "#3388dd"}
* Token Reference: {color.semantic.success.$root}
  * Resolved Value: {"colorSpace": "srgb", "components": [0, 0.8, 0.4], "hex": "#00cc66"}
* Token Reference: {color.semantic.error.dark}
  * Resolved Value: {"colorSpace": "srgb", "components": [0.6, 0, 0], "hex": "#990000"}

Groups let token file authors better organize their token files. Related tokens can be nested into groups to align with the team's naming conventions and/or mental model. When manually authoring files, using groups is also less verbose than a flat list of tokens with repeating prefixes.

For example:

...is likely to be more convenient to type and, arguably, easier to read, than:

Tools that let users pick or edit tokens via a GUI _MAY_ use the grouping structure to display a suitable form of progressive disclosure, such as a collapsible tree view.

![](./group-progressive-disclosure.png)

[Figure 1](#figure-group-progressive-disclosure) Progressive disclosure groups

Token names are not guaranteed to be unique within the same file. The same name can be used in different groups. Also, translation tools _MAY_ need to export design tokens in a uniquely identifiable way, such as variables in code. Translation tools _SHOULD_ therefore use design tokens' paths as these _are_ unique within a file.

For example, a [translation tool](#dfn-translation-tool) like [Style Dictionary](https://amzn.github.io/style-dictionary/) might use the following design token file:

...and output it as Sass variables like so by concatenating the path to create variable names:

Instead of having explicit values, tokens can reference the value of another token. To put it another way, a token can be an alias for another token. This spec considers the terms "alias" and "reference" to be synonyms and uses them interchangeably.

Aliases are useful for:

* Expressing design choices
* Eliminating repetition of values in token files (DRYing up the code)
* Creating semantic relationships between tokens
* Maintaining consistency across related values

Design tokens support two distinct syntaxes for referencing content within token files:

The curly brace syntax is specifically designed for referencing **complete token values** and always resolves to the `$value` property of the target token.

In this example, `{colors.blue}` resolves to the entire color object `{"colorSpace": "srgb", "components": [0, 0.4, 0.8], "hex": "#0066cc"}`.

**Important:** Curly brace references can ONLY target complete tokens (objects with `$value` properties), not individual properties within token values or arbitrary document locations.

For advanced use cases requiring access to specific properties within token values or other parts of the document structure, tokens _MUST_ support JSON Pointer notation as defined by \[[rfc6901](#bib-rfc6901 "JavaScript Object Notation (JSON) Pointer")\], using the `$ref` property. Tools implementing this specification _MUST_ support JSON Pointer syntax.

In this example:

* `"$ref": "#/colors/blue/$value"` is equivalent to `"{colors.blue}"`
* `"$ref": "#/colors/blue/$value/components/0"` accesses just the red component (0) of the blue color

**Key Differences:**

|Aspect       |Curly Brace {token}      |JSON Pointer $ref          |
|-------------|-------------------------|---------------------------|
|Targets      |Complete tokens only     |Any document location      |
|Implicit path|Always appends /$value   |Explicit full path required|
|Use case     |Token-to-token references|Property-level references  |
|Syntax       |{group.token}            |#/group/token/$value       |

When a tool needs the actual value of a token it _MUST_ resolve the reference - i.e. lookup the token being referenced and fetch its value. Tools _SHOULD_ preserve references and therefore only resolve them whenever the actual value needs to be retrieved. For instance, in a [design tool](#dfn-design-tool), changes to the value of a token being referenced by aliases _SHOULD_ be reflected wherever those aliases are being used.

**For Curly Brace References:**

1. **Parse reference:** Extract token path from `{group.token}`
2. **Split path:** Convert to segments `["group", "token"]`
3. **Navigate to token:** Find the target token object
4. **Validate token:** Ensure target has `$value` property
5. **Return token value:** Extract and return the `$value` content
6. **Check for cycles:** Maintain stack of resolving references

**For JSON Pointer References:**

1. **Parse JSON Pointer:** Extract path segments from `#/path/to/target`
2. **Traverse document:** Navigate through each path segment
3. **Apply JSON Pointer rules:**
    * Numeric segments in array contexts become array indices
    * All segments in object contexts become property names
    * Handle escaped characters (`~0`, `~1`)
4. **Validate target:** Ensure the final target exists and is accessible
5. **Return value:** Extract and return the resolved value

Aliases _MAY_ reference other aliases. In this case, tools _MUST_ follow each reference until they find a token with an explicit value.

In this example, `{semantic.link}` resolves to the same color value as `{base.primary}` by following the chain: `semantic.link` → `semantic.brand` → `base.primary`.

References _MUST NOT_ be circular. If a design token file contains circular references, then the value of all tokens in that chain is unknown and an appropriate error or warning message _SHOULD_ be displayed to the user.

Tools _MUST_ detect and report this as an error affecting all tokens in the circular chain.

JSON Pointer syntax enables references to specific properties within composite tokens, not just entire token values. This enables fine-grained reuse of token components while maintaining semantic relationships.

**Important:** Property-level references require JSON Pointer syntax (`$ref`) and cannot be expressed using curly brace syntax.

In this example:

* `layout.small` uses the same numeric value as `base.spacing` (16) but with a different unit (`rem`)
* `layout.large` uses the same unit as `base.spacing` (`px`) but with a different numeric value (32)

In this example:

* Both headings inherit the `fontFamily` and `lineHeight` from `base.text`
* Each heading defines its own `fontSize` and `fontWeight`
* Changes to the base font family or line height automatically affect all headings

JSON Pointer syntax provides direct access to any location within the design token document structure, following standard JSON Pointer rules as defined by \[[rfc6901](#bib-rfc6901 "JavaScript Object Notation (JSON) Pointer")\].

* **Root reference:** `#/` (refers to the document root)
* **Object properties:** `/` separates each level (e.g., `#/group/token/$value`)
* **Array indices:** Numeric indices for array elements (e.g., `#/color/$value/components/0`)
* **Special characters:** Must be escaped according to JSON Pointer rules:
  * `~` becomes `~0`
  * `/` becomes `~1`

Since design tokens store their values in `$value` properties, JSON Pointer paths to token values follow a predictable pattern:

|JSON Pointer                     |Equivalent Curly Brace Reference|Description             |
|---------------------------------|--------------------------------|------------------------|
|#/colors/blue/$value             |{colors.blue}                   |Complete token value    |
|#/colors/blue/$value/hex         |N/A                             |Hex property of color   |
|#/colors/blue/$value/components/0|N/A                             |First component of color|
|#/colors/blue/$type              |N/A                             |Token type metadata     |

1. **Parse JSON Pointer:** Extract path segments from `#/path/to/target`
2. **Traverse document:** Navigate through each path segment
3. **Apply JSON Pointer rules:**
    * Numeric segments in array contexts become array indices
    * All segments in object contexts become property names
    * Handle escaped characters (`~0`, `~1`)
4. **Validate target:** Ensure the final target exists and is accessible
5. **Return value:** Extract and return the resolved value

6. **Parse reference:** Extract token path from `{group.token}`
7. **Split path:** Convert to segments `["group", "token"]`
8. **Navigate to token:** Find the target token object
9. **Validate token:** Ensure target has `$value` property
10. **Return token value:** Extract and return the `$value` content
11. **Check for cycles:** Maintain stack of resolving references

Tools _MUST_ report errors for:

* **Invalid syntax:** Malformed curly braces or JSON Pointer syntax
* **Unresolvable paths:** Target path does not exist in document
* **Invalid token references:** Curly brace syntax targeting non-tokens
* **Circular references:** Reference chains that loop back to themselves
* **Type mismatches:** Referenced value incompatible with expected type

|Token Path          |JSON Pointer          |Curly Brace Syntax    |
|--------------------|----------------------|----------------------|
|Root token "primary"|#/primary             |{primary}             |
|Nested token        |#/colors/blue         |{colors.blue}         |
|Array element       |#/color/components/0  |not supported         |
|Property with space |#/brand colors/primary|{brand colors.primary}|
|Property with slash |#/my~1group/token     |{my/group.token}      |

Tools implementing design token parsing _MUST_:

1. **Support curly brace syntax** as the primary reference mechanism for token-to-token references
2. **Support JSON Pointer syntax** for document-level references and property access
3. **Validate reference targets** to ensure they point to valid tokens (for curly brace) or valid document locations (for JSON Pointer)
4. **Resolve references** according to the resolution algorithms defined in this specification ([Resolution Algorithms](#resolution-algorithms))
5. **Detect circular references** before attempting resolution
6. **Preserve references** in memory/storage and resolve only when values are needed
7. **Propagate changes** from referenced tokens to all aliases

**Clear resolution:**

|Reference             |Result                 |Notes                                   |
|----------------------|-----------------------|----------------------------------------|
|#/ambiguous/data/0    |10                     |JSON Pointer array index                |
|{ambiguous.metadata.0}|"Info about first item"|curly brace object property             |
|{ambiguous.data.0}    |Error                  |curly braces cannot access array indices|
|{ambiguous.metadata.2}|Error                  |property "2" doesn't exist              |

Tools _MUST_ report errors for:

* **Invalid reference syntax:** Malformed curly braces or JSON Pointer syntax
* **Unresolvable references:** Target path does not exist
* **Circular references:** Reference chains that loop back to themselves
* **Type mismatches:** Referenced property type incompatible with token type
* **Invalid property paths:** Attempting to reference non-existent properties

The reference syntax defined in this specification provides compatibility with JSON Schema patterns while serving the specific needs of design token authoring:

* **JSON Pointer compatibility:** Direct support for RFC 6901 JSON Pointer notation enables integration with JSON Schema tooling
* **Design token semantics:** Curly brace references provide token-specific syntax optimized for common token-to-token relationships
* **Complementary approaches:** Both syntaxes serve different use cases within the design token ecosystem

**Important:** While JSON Pointer references (`$ref`) in design tokens follow the same syntax as JSON Schema `$ref`, curly brace references (`{token}`) are design token-specific and provide different semantics (automatic `$value` resolution and token-only targeting) compared to standard JSON Schema references.

* * *

_This specification provides a flexible, standards-based approach to token references that balances author ergonomics with technical precision, enabling both simple token aliases and sophisticated property-level relationships._

Many tools need to know what kind of value a given token represents to process it sensibly. Translation tools _MAY_ need to convert or format tokens differently depending on their type. [Design tools](#dfn-design-tool) _MAY_ present the user with different kinds of input when editing tokens of a certain type (such as color picker, slider, text input, etc.). Style guide generators _MAY_ use different kinds of previews for different types of tokens.

This spec defines a number of design-focused types and every design token _MUST_ use one of these types. Furthermore, that token's value _MUST_ then follow rules and syntax for the chosen type as defined by this spec.

A token's type can be set directly by giving it a `$type` property specifying the chosen type. Alternatively, it can inherit a type from one of its parent groups, or be an alias of a token that has the desired type.

If no explicit type has been set for a token, tools _MUST_ consider the token invalid and not attempt to infer any other type from the value.

If an explicit type is set, but the value does not match the expected syntax then that token is invalid and an appropriate error _SHOULD_ be displayed to the user. To put it another way, the `$type` property is a declaration of what kind of values are permissible for the token. (This is similar to typing in programming languages like Java or TypeScript, where a value not compatible with the declared type causes a compilation error).

Represents a color in the UI. For details on how to represent colors, see the [Color](../CG-FINAL-color-20251028/) module.

Represents an amount of distance in a single dimension in the UI, such as a position, width, height, radius, or thickness. The `$type` property _MUST_ be set to the string `dimension`. The value _MUST_ be an object containing a numeric `value` (integer or floating-point) and `unit` of measurement (`"px"` or `"rem"`).

|Key  |Type  |Required|Description                                                       |
|-----|------|--------|------------------------------------------------------------------|
|value|number|Y       |An integer or floating-point value representing the numeric value.|
|unit |string|Y       |Unit of distance. Supported values: "px", "rem".                  |

For example:

* `$value.unit` may only be `"px"` or `"rem"`.
  * **px**: Represents an idealized pixel on the viewport. The equivalent in Android is `dp` and iOS is `pt`. Translation tools _SHOULD_ therefore convert to these or other equivalent units as needed.
  * **rem**: Represents a multiple of the system's default font size (which _MAY_ be configurable by the user). 1rem is 100% of the default font size. The equivalent of 1rem on Android is 16sp. Not all platforms have an equivalent to rem, so translation tools _MAY_ need to do a lossy conversion to a fixed px size by assuming a default font size (usually 16px) for such platforms.
* `$value.unit` is still required even if `$value.value` is `0`.

A naive approach like the one below may be appropriate for the first stage of the specification, but this could be more complicated than it seems due to platform/OS/browser restrictions.

Represents a font name or an array of font names (ordered from most to least preferred). The `$type` property _MUST_ be set to the string `fontFamily`. The value _MUST_ either be a string value containing a single font name or an array of strings, each being a single font name.

For example:

Represents a font weight. The `$type` property _MUST_ be set to the string `fontWeight`. The value must either be a number value in the range \[1, 1000\] or one of the pre-defined string values defined in the table below.

Lower numbers represent lighter weights, and higher numbers represent thicker weights, as per the [OpenType `wght` tag specification](https://docs.microsoft.com/en-us/typography/opentype/spec/dvaraxistag_wght). The pre-defined string values are aliases for specific numeric values. For example `100`, `"thin"` and `"hairline"` are all the exact same value.

|numeric value|string value aliases    |
|-------------|------------------------|
|100          |thin, hairline          |
|200          |extra-light, ultra-light|
|300          |light                   |
|400          |normal, regular, book   |
|500          |medium                  |
|600          |semi-bold, demi-bold    |
|700          |bold                    |
|800          |extra-bold, ultra-bold  |
|900          |black, heavy            |
|950          |extra-black, ultra-black|

Number values outside of the \[1, 1000\] range and any other string values, including ones that differ only in case, are invalid and _MUST_ be rejected by tools.

Example:

Represents the length of time in milliseconds an animation or animation cycle takes to complete, such as 200 milliseconds. The `$type` property _MUST_ be set to the string `duration`. The value _MUST_ be an object containing a numeric `value` (either integer or floating-point) and a `unit` of milliseconds (`"ms"`) or seconds (`"s"`). A millisecond is a unit of time equal to one thousandth of a second.

|Key  |Type  |Required|Description                                                       |
|-----|------|--------|------------------------------------------------------------------|
|value|number|Y       |An integer or floating-point value representing the numeric value.|
|unit |string|Y       |Unit of time. Supported values: "ms" (millisecond), "s"(second).  |

For example:

* `$value.unit` may only be `"ms"` or `"s"`

Represents how the value of an animated property progresses towards completion over the duration of an animation, effectively creating visual effects such as acceleration, deceleration, and bounce. The `$type` property _MUST_ be set to the string `cubicBezier`. The value _MUST_ be an array containing four numbers. These numbers represent two points (P1, P2) with one x coordinate and one y coordinate each \[P1x, P1y, P2x, P2y\]. The y coordinates of P1 and P2 can be any real number in the range \[-∞, ∞\], but the x coordinates are restricted to the range \[0, 1\].

For example:

Represents a number. Numbers can be positive, negative and have fractions. Example uses for number tokens are [gradient stop positions](about:blank/composite-types#gradient) or unitless line heights. The `$type` property _MUST_ be set to the string `number`. The value _MUST_ be a JSON number value.

_This section is non-normative._

Types still to be documented here are likely to include:

* **Font style:** might be an enum of allowed values like ("normal", "italic"...)
* **Percentage/ratio:** e.g. for opacity values, relative dimensions, aspect ratios, etc.
  * Not 100% sure about this since these are really "just" numbers. An alternative might be that we expand the permitted syntax for the "number" type, so for example "1:2", "50%" and 0.5 are all equivalent. People can then use whichever syntax they like best for a given token.
* **File:** for assets - might just be a relative file path / URL (or should we let people also express the mime-type?)

The types defined in the previous chapters such as color and dimension all have singular values. For example, the value of a color token is _one_ color. However, there are other aspects of UI designs that are a combination of multiple values. For instance, a shadow style is a combination of a color, X & Y offsets, a blur radius and a spread radius.

Every shadow style has the exact same parts (color, X & Y offsets, etc.), but their respective values will differ. Furthermore, each part's value (which is also known as a "sub-value") is always of the same type. A shadow's color must always be a [color](#color) value, its X offset must always be a [dimension](#dimension) value, and so on. Shadow styles are therefore combinations of values _that follow a pre-defined structure_. In other words, shadow styles are themselves a type. Types like this are called **composite types**.

Specifically, a composite type has the following characteristics:

* Its value is an object or array, potentially containing nested objects or arrays, following a pre-defined structure where the properties of the (nested) object(s) or the elements of the (nested) arrays are sub-values.
* Sub-values may be explicit values (e.g. `color` values) or references to other design tokens that have the sub-value's type (e.g. `"{some.other.token}"`).

When a composite type contains array properties, each element in the array may be either an explicit value or a reference to a token of the appropriate type. References in arrays resolve to single values and do not cause array expansion or flattening. This allows for flexible composition where some array elements are references while others are explicit values.

Array aliasing follows these principles:

1. **Single value resolution**: References in arrays always resolve to a single value of the appropriate type, never to arrays themselves.
2. **No flattening**: When referencing an array, the entire referenced array is treated as a single element in the referencing array.
3. **Type safety**: Each array element (explicit or referenced) must conform to the expected sub-value type for that composite type.
4. **Mixed composition**: Arrays may freely mix explicit values and references.

For example, a shadow token with an array value can mix references to other shadow tokens with explicit shadow objects:

```
{
  "layered-shadow": {
    "$type": "shadow",
    "$value": [
      "{base.shadow}",
      {
        "color": "{brand.accent}",
        "offsetX": { "value": 4, "unit": "px" },
        "offsetY": { "value": 4, "unit": "px" },
        "blur": { "value": 8, "unit": "px" },
        "spread": { "value": 0, "unit": "px" }
      }
    ]
  }
}

```

A design token whose type happens to be a composite type is sometimes also called a composite (design) token. Besides their type, there is nothing special about composite tokens. They can have all the other additional properties like [`$description`](about:blank/design-token#description) or [`$extensions`](about:blank/design-token#extensions). They can also be referenced by other design tokens.

At first glance, groups and composite tokens might look very similar. However, they are intended to solve different problems and therefore have some important differences:

* **[Groups](#groups)** are for arbitrarily grouping tokens for the purposes of naming and/or organization.
  * They impose no rules or restrictions on how many tokens or nested groups you put within them, what they are called, or what the types of the tokens within should be. As such, tools _MUST NOT_ try to infer any special meaning or typing of tokens based on a group they happen to be in.
  * Different design systems are likely to group their tokens differently.
  * You can think of groups as containers that exist "outside" of design tokens.
* **Composite tokens** are individual design tokens whose values are made up of several sub-values.
  * Since they are design tokens, they can be referenced by other design tokens. This is not true for groups.
  * Their type must be one of the composite types defined in this specification. Therefore their names and types of their sub-values are pre-defined. Adding additional sub-values or setting values that don't have the correct type make the composite token invalid.
  * Tools _MAY_ provide specialized functionality for composite tokens. For example, a [design tool](#dfn-design-tool) may let the user pick from a list of all available shadow tokens when applying a drop shadow effect to an element.

Represents the style applied to lines or borders. The `$type` property _MUST_ be set to the string `strokeStyle`. The value _MUST_ be either:

* a string value as defined in the corresponding section below, or
* an object value as defined in the corresponding section below

Is the current specification for stroke styles fit for purpose? Does it need more sub-values (e.g. equivalents to SVG's `stroke-linejoin`, `stroke-miterlimit` and `stroke-dashoffset` attributes)?

String stroke style values _MUST_ be set to one of the following, pre-defined values:

* `solid`
* `dashed`
* `dotted`
* `double`
* `groove`
* `ridge`
* `outset`
* `inset`

These values have the same meaning as the equivalent ["line style" values in CSS](https://drafts.csswg.org/css-backgrounds/#typedef-line-style). As per the CSS spec, their exact rendering is therefore implementation specific. For example, the length of dashes and gaps in the `dashed` style may vary between different tools.

Object stroke style values _MUST_ have the following properties:

* `dashArray`: An array of [dimension values](#dimension) and/or references to dimension tokens, which specify the lengths of alternating dashes and gaps. Each element in the array must be either an explicit dimension value or a reference to a dimension token. If an odd number of values is provided, then the list of values is repeated to yield an even number of values.
* `lineCap`: One of the following pre-defined string values: `"round"`, `"butt"` or `"square"`. These values have the same meaning as those of [the `stroke-linecap` attribute in SVG](https://www.w3.org/TR/SVG11/painting.html#StrokeLinecapProperty).

The string and object values are mutually exclusive means of expressing stroke styles. For example, some of the string values like `inset` or `groove` cannot be expressed in terms of a `dashArray` and `lineCap` as they require some implementation-specific means of lightening or darkening the _color_ for portions of a border or outline. Conversely, a precisely defined combination of `dashArray` and `lineCap` sub-values is not guaranteed to produce the same visual result as the `dashed` or `dotted` keywords as they are implementation-specific.

Furthermore, some tools and platforms may not support the full range of stroke styles that design tokens of this type can represent. When displaying or exporting a `strokeStyle` token whose value they don't natively support, they should therefore fallback to the closest approximation that they do support.

The specifics of how a "closest approximation" is chosen are implementation-specific. However, the following examples illustrate what fallbacks tools _MAY_ use in some scenarios.

Represents a border style. The `$type` property _MUST_ be set to the string `border`. The value _MUST_ be an object with the following properties:

* `color`: The color of the border. The value of this property _MUST_ be a valid [color value](#color) or a reference to a color token.
* `width`: The width or thickness of the border. The value of this property _MUST_ be a valid [dimension value](#dimension) or a reference to a dimension token.
* `style`: The border's style. The value of this property _MUST_ be a valid [stroke style value](#stroke-style) or a reference to a stroke style token.

Is the current specification for borders fit for purpose? Does it need more sub-values to account for features like outset, border images, multiple borders, etc. that some platforms and [design tools](#dfn-design-tool) have?

Represents a animated transition between two states. The `$type` property _MUST_ be set to the string `transition`. The value _MUST_ be an object with the following properties:

* `duration`: The duration of the transition. The value of this property _MUST_ be a valid [duration](#duration) value or a reference to a duration token.
* `delay`: The time to wait before the transition begins. The value of this property _MUST_ be a valid [duration](#duration) value or a reference to a duration token.
* `timingFunction`: The timing function of the transition. The value of this property _MUST_ be a valid [cubic Bézier curve](#cubic-bezier) value or a reference to a cubic Bézier curve token.

Is the current specification for transitions fit for purpose? Are these transitions parameters by themselves useful considering that they don't let you specify what aspect of a UI is being transitioned and what the start and end states are?

Represents a shadow style. The `$type` property _MUST_ be set to the string `shadow`. The value _MUST_ be either:

* a single shadow object with the properties defined below, or
* an array of shadow objects and/or references to shadow tokens

When the value is an array, each element must be either an explicit shadow object or a reference to another shadow token. References in the array resolve to single shadow objects and do not cause array flattening.

Each shadow object (whether explicit or referenced) _MUST_ have the following properties:

* `color`: The color of the shadow. The value of this property _MUST_ be a valid [color value](#color) or a reference to a color token.
* `offsetX`: The horizontal offset that shadow has from the element it is applied to. The value of this property _MUST_ be a valid [dimension value](#dimension) or a reference to a dimension token.
* `offsetY`: The vertical offset that shadow has from the element it is applied to. The value of this property _MUST_ be a valid [dimension value](#dimension) or a reference to a dimension token.
* `blur`: The blur radius that is applied to the shadow. The value of this property _MUST_ be a valid [dimension value](#dimension) or a reference to a dimension token.
* `spread`: The amount by which to expand or contract the shadow. The value of this property _MUST_ be a valid [dimension value](#dimension) or a reference to a dimension token.
* `inset`: (optional) Whether this shadow is inside the containing shape (“inner shadow”), rather than a “drop shadow” or “box shadow” which is rendered outside the container (default, or `false`).

Is the current specification for shadows fit for purpose? Does it need to support multiple shadows, as some tools and platforms do?

Represents a color gradient. The `$type` property _MUST_ be set to the string `gradient`. The value _MUST_ be an array of gradient stop objects and/or references to gradient tokens. Each element in the array must be either an explicit gradient stop object or a reference to a gradient token. References resolve to single gradient objects and do not cause array flattening.

Each gradient stop object (whether explicit or referenced) _MUST_ have the following structure:

* `color`: The color value at the stop's position on the gradient. The value of this property _MUST_ be a valid [color value](#color) or a reference to a color token.
* `position`: The position of the stop along the gradient's axis. The value of this property _MUST_ be a valid number value or reference to a number token. The number values must be in the range \[0, 1\], where 0 represents the start position of the gradient's axis and 1 the end position. If a number value outside of that range is given, it _MUST_ be considered as if it were clamped to the range \[0, 1\]. For example, a value of 42 should be treated as if it were 1, i.e. the end position of the gradient axis. Similarly, a value of -99 should be treated as if it were 0, i.e. the start position of the gradient axis.

If there are no stops at the very beginning or end of the gradient axis (i.e. with `position` 0 or 1, respectively), then the color from the stop closest to each end should be extended to that end of the axis.

Is the current specification for gradients fit for purpose? Does it need to also specify the type of gradient (.e.g linear, radial, conical, etc.)?

Represents a typographic style. The `$type` property _MUST_ be set to the string `typography`. The value _MUST_ be an object with the following properties:

* `fontFamily`: The typography's font. The value of this property _MUST_ be a valid [font family value](#font-family) or a reference to a font family token.
* `fontSize`: The size of the typography. The value of this property _MUST_ be a valid [dimension value](#dimension) or a reference to a dimension token.
* `fontWeight`: The weight of the typography. The value of this property _MUST_ be a valid [font weight](#font-weight) or a reference to a font weight token.
* `letterSpacing`: The horizontal spacing between characters. The value of this property _MUST_ be a valid [dimension value](#dimension) or a reference to a dimension token.
* `lineHeight`: The vertical spacing between lines of typography. The value of this property _MUST_ be a valid [number value](#number) or a reference to a number token. The number _SHOULD_ be interpreted as a multiplier of the `fontSize`.

* [Issue 53](#issue-container-number-53): Type: font family
* [Issue 98](#issue-container-number-98): Stroke style type feedback
* [Issue 99](#issue-container-number-99): Border type feedback
* [Issue 103](#issue-container-number-103): Transition type feedback
* [Issue 100](#issue-container-number-100): Shadow type feedback
* [Issue 101](#issue-container-number-101): Gradient type feedback
* [Issue 102](#issue-container-number-102): Typography type feedback

\[json-schema-2020-12\]

[JSON Schema: A Media Type for Describing JSON Documents. Draft 2020-12](https://datatracker.ietf.org/doc/html/draft-bhutton-json-schema-01). Austin Wright; Henry Andrews; Ben Hutton; Greg Dennis. Internet Engineering Task Force (IETF). 10 June 2022. Internet-Draft. URL: [https://datatracker.ietf.org/doc/html/draft-bhutton-json-schema-01](https://datatracker.ietf.org/doc/html/draft-bhutton-json-schema-01)

\[RFC2119\]

[Key words for use in RFCs to Indicate Requirement Levels](https://www.rfc-editor.org/rfc/rfc2119). S. Bradner. IETF. March 1997. Best Current Practice. URL: [https://www.rfc-editor.org/rfc/rfc2119](https://www.rfc-editor.org/rfc/rfc2119)

\[rfc6901\]

[JavaScript Object Notation (JSON) Pointer](https://www.rfc-editor.org/rfc/rfc6901). P. Bryan, Ed.; K. Zyp; M. Nottingham, Ed. IETF. April 2013. Proposed Standard. URL: [https://www.rfc-editor.org/rfc/rfc6901](https://www.rfc-editor.org/rfc/rfc6901)

\[RFC8174\]

[Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words](https://www.rfc-editor.org/rfc/rfc8174). B. Leiba. IETF. May 2017. Best Current Practice. URL: [https://www.rfc-editor.org/rfc/rfc8174](https://www.rfc-editor.org/rfc/rfc8174)

\[RFC8259\]

[The JavaScript Object Notation (JSON) Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259). T. Bray, Ed. IETF. December 2017. Internet Standard. URL: [https://www.rfc-editor.org/rfc/rfc8259](https://www.rfc-editor.org/rfc/rfc8259)
