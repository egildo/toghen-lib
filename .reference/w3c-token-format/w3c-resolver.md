# Design Tokens Resolver Module 2025.10

Abstract
--------

This specification extends the [format](../CG-FINAL-format-20251028/) and describes a method to work with [design tokens](https://www.designtokens.org/) in multiple contexts (such as “light mode” and “dark mode” color themes).

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
3. [1\. Introduction](#introduction)
4. [2\. Terminology](#terminology)
    1. [2.1 Orthogonality](#orthogonality)
    2. [2.2 Permutation](#permutation)
5. [3\. Filetype](#filetype)
    1. [3.1 Format](#format)
    2. [3.2 File extension](#file-extension)
    3. [3.3 MIME type](#mime-type)
6. [4\. Syntax](#syntax)
    1. [4.1 Root level properties](#root-level-properties)
        1. [4.1.1 Name](#name)
        2. [4.1.2 Version](#version)
        3. [4.1.3 Description](#description)
        4. [4.1.4 Sets](#sets)
        5. [4.1.5 Modifiers](#modifiers)
            1. [4.1.5.1 Contexts](#contexts)
            2. [4.1.5.2 Description](#description-0)
            3. [4.1.5.3 Default](#default)
            4. [4.1.5.4 Resolution count](#resolution-count)
        6. [4.1.6 Resolution Order](#resolution-order)
            1. [4.1.6.1 Inline sets and modifiers](#inline-sets-and-modifiers)
            2. [4.1.6.2 Ordering of sets and modifiers](#ordering-of-sets-and-modifiers)
    2. [4.2 Reference objects](#reference-objects)
        1. [4.2.1 Invalid pointers](#invalid-pointers)
        2. [4.2.2 Extending](#extending)
    3. [4.3 $extensions](#extensions)
    4. [4.4 $defs](#defs)
7. [5\. Inputs](#inputs)
    1. [5.1 Case sensitivity](#case-sensitivity)
    2. [5.2 Enforcing strings](#enforcing-strings)
8. [6\. Resolution logic](#resolution-logic)
    1. [6.1 Input validation](#input-validation)
    2. [6.2 Ordering](#ordering)
    3. [6.3 Aliases](#aliases)
    4. [6.4 Resolution](#resolution)
9. [7\. Bundling](#bundling)
    1. [7.1 Inlining files](#inlining-files)
    2. [7.2 Using $defs for files](#using-defs-for-files)
10. [8\. Conformance](#conformance)
11. [A. Acknowledgments](#acknowledgements)
12. [B. References](#references)
     1. [B.1 Normative references](#normative-references)

_This section is non-normative._

Consumers of design tokens often need to express alternate values that apply in different contexts. Such examples include, but are not limited to:

* **Theming**, such as light mode, dark mode, and high contrast color modes
* **Sizing**, such as mobile (small), tablet (medium), desktop (large)
* **Accessibility mode**, such as reduced motion, colorblindness, etc.

However, these alternate contexts are susceptible to [combinatorial explosion](https://en.wikipedia.org/wiki/Combinatorial_explosion), making storage and management unwieldy.

This format describes a mechanism for deduplicating all repeat values of tokens across all contexts as well as enumerating all permutations of contexts.

_This section is non-normative._

A trait describing two or more contexts that each operate on exclusive tokens, i.e. do not overlap. Modifiers _MAY_ be orthogonal, but it are not required to be.

Making modifiers orthogonal as much as possible reduces cognitive load and reduces user error.

A permutation is a single possible permutation of a resolver document. A permutation maps 1:1 to an [input](#inputs), but the term “input” emphasizes the [modifier](#modifiers) contexts used, where “permutation” emphasizes the final set of tokens.

A resolver document _MUST_ use standard JSON syntax (\[[RFC8259](#bib-rfc8259 "The JavaScript Object Notation (JSON) Data Interchange Format")\]).

Tools _MAY_ support extensions such as [JSONC](https://jsonc.org/) or [JSON5](https://json5.org/) so long as the document may be converted to normal JSON without affecting token values.

Users _SHOULD_ use the `.resolver.json` file extension to name resolver documents.

When transmitting a resolver document over HTTP, users _SHOULD_ use the expected `application/json` MIME type (\[[RFC6838](#bib-rfc6838 "Media Type Specifications and Registration Procedures")\]) in the `Content-Type` header (\[[RFC1341](#bib-rfc1341 "MIME (Multipurpose Internet Mail Extensions): Mechanisms for Specifying and Describing the Format of Internet Message Bodies")\]). Users _SHOULD NOT_ use a custom or unexpected MIME type.

A resolver document contains the following properties at the root level:

* Name: name
  * Type: string
  * Required:
  * Description: A short, human-readable name for the document.
* Name: version
  * Type: YYYY-MM-DD
  * Required: Y
  * Description: Version. Must be 2025-10-01.
* Name: description
  * Type: string
  * Required:
  * Description: A human-readable description for this document.
* Name: sets
  * Type: Map[string, Set]
  * Required:
  * Description: Definition of sets.
* Name: modifiers
  * Type: Map[`string, Modifier]
  * Required:
  * Description: Definition of modifiers.
* Name: resolutionOrder
  * Type: (ReferenceObject | Set | Modifier)
[]
  * Required: Y
  * Description: Resolution of sets and modifiers.

The document _MAY_ provide a human-readable `name` at the root level. This is helpful to distinguish one resolver document from another, in case the filename itself isn’t enough.

The document _MUST_ provide a version at the root level, and it _MUST_ be `2025-11-01`. This is reserved for future versions in case breaking changes are introduced.

The document _MAY_ provide a `description` at the root level. This may be used to add additional explanation or context not present in [name](#name).

A set is a collection of design tokens in [DTCG format](../CG-FINAL-format-20251028/). A set _MUST_ contain a `sources` array with tokens declared directly, or a [reference object](#reference-objects) pointing to a JSON file containing design tokens, or any combination of the two.

A set _MAY_ include a `description` describing the purpose of the set.

If the array declares multiple sources, they will be merged in array order, meaning if a token is declared multiple times, the last occurrence in the array will be the final value. Tools _MUST_ respect array ordering.

A modifier is similar to a [set](#sets), but allows for conditional inclusion via the [contexts](#contexts) map.

A modifier _MUST_ declare a `contexts` map of a `string` value to an array of token sources. The array of tokens sources _MUST_ be a [ReferenceObject](#reference-objects), inline tokens, or any combination of the two.

A modifier _SHOULD_ have two or more `contexts`, since one is the equivalent of a [set](#sets). A modifier _MUST NOT_ have an empty `contexts` map. Tools _SHOULD_ throw an error for modifiers with only 1 context. Tools _MUST_ throw an error for modifiers with 0 contexts.

Like [sets](#sets), array order _MUST_ be respected such that in case of conflict, the last occurrence of a token in the array produces the final value.

A modifier _MAY_ reference a [set](#sets) inside a context value. However a modifier _MUST NOT_ reference any other modifier, not even another context inside the same modifier.

A modifier _MAY_ declare a human-readable `description`.

A modifier _MAY_ declare a `default` value that _MUST_ match one of the keys in `contexts`. Tools _MUST_ throw an error if the value is not present in `contexts`.

The number of possible [resolutions](https://www.w3.org/policies/process/#group-decision) a document may generate may be predicted with the product of all `contexts` across all modifiers.

The `resolutionOrder` key is an array of [sets](#sets) and [modifiers](#modifiers) ordered to produce the final result of tokens. The order is significant, with tokens later in the array overriding any tokens that came before them, in case of conflict.

In `resolutionOrder`, a [set](#sets) or [modifier](#modifiers) _MAY_ be declared inline, so long as `name` and `type` keys are added to the object:

* Property: name
  * Type: string
  * Required: Y
  * Description: A unique name that MUST NOT conflict with any other name in resolutionOrder.
* Property: type
  * Type: "set" | "modifier"
  * Required: Y
  * Description: MUST be "set" or "modifier" according to the type.

Tools _MUST_ throw an error in the case where `name` or `type` are missing from an inline object, or if `name` is duplicated among any objects.

Inline sets and modifiers _MUST NOT_ be referenced in any way. Tools _SHOULD_ throw an error when a [reference object](#reference-objects) points to a resolution order item.

_This section is non-normative._

The `resolutionOrder` array allows for any ordering of sets and modifiers to the user’s choosing. However, in the scenario that many sets must appear after the modifiers to resolve conflicts, it is likely a [smell](https://en.wikipedia.org/wiki/Code_smell) of unpredictable and brittle token organization. Ideally, modifiers handle conditional values so well they require few or no overrides (see [orthogonality](#orthogonality)). In practical terms, this means that

When referring to another JSON document or a structure within the same document, a reference object _MUST_ be used. This is described in [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-core#ref) as an object with a key of `$ref` whose string is a valid JSON pointer as described in \[[RFC6901](#bib-rfc6901 "JavaScript Object Notation (JSON) Pointer")\].

Tools _MUST_ resolve all reference objects in a resolver document.

Reference objects _MUST NOT_ be circular, neither referencing other pointers that reference itself, nor referencing any parent node of the reference object.

Tools _MUST_ support same-document reference objects, as that is the minimum requirement to support this resolver module. Beyond that, tools may make individual decisions to not support some URI types such as importing files on a local file system, or remote URIs over TCP/IP.

A pointer _MAY_ point anywhere within the same document, with the exception of the following:

1. Only [resolutionOrder](#resolution-order) may reference a modifier (`#/modifiers/…`). Sets and modifiers _MUST NOT_ reference another modifier.
    * Referencing a modifier from a set could cause [inputs](#inputs) to apply conditional logic to a structure that can’t support it, therefore it’s not allowed.
    * Referencing a modifier from another modifier would mean a single input applies to unexpected modifiers, therefore it’s not allowed.
2. A reference object _MUST NOT_ point to anything in the [resolutionOrder](#resolution-order) array (`#/resolutionOrder/…`). Resolution ordering, by its nature, references many other parts of the document. Duplicating any part of this will produce complex, hard-to-predict chains.

Tools _MUST_ throw an error if encountering any invalid pointers.

As [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-core#ref) allows, other keys _MAY_ exist on a reference object alongside `$ref`. In these scenarios, the local keys alongside `$ref` _MUST_ be treated as overrides.

If a key alongside `$ref` declares an object or array, tools _MUST_ flatten these shallowly, meaning objects and arrays are not merged.

An `$extensions` object _MAY_ be added to any [set](#sets), [modifier](#modifiers), or [inline set/modifier](#inline-sets-and-modifiers), to declare arbitrary metadata that is up to individual tools to either use or ignore.

If provided, `$extensions` _MUST_ be an object with the keys being vendor-specific namespaces. This allows multiple tools to use this metadata without conflict.

Tools _MAY_ allow defining structures in JSON Schema [$defs](https://json-schema.org/understanding-json-schema/structuring#defs) but is not a requirement. However, tools _MUST NOT_ throw an error when encountering `$defs`, and _MUST_ ignore the key if it is not supported.

A resolver document only describes how conditional token values _MAY_ be produced. But the conditions must still be provided somewhere. The term “input” refers to any selection of context values passed to the tool.

Tools _MUST_ accept inputs as a JSON-serializable object, such as an [object in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) or a [dictionary in Python](https://docs.python.org/3/tutorial/datastructures.html#dictionaries).

Tools that load a resolver that declares modifiers _SHOULD_ throw an error if an accompanying input is not provided.

Inputs _SHOULD_ be case-insensitive. For example, `{ "theme": "dark" }`, `{ "Theme": "Dark" }`, and `{ "THEME": "DARK" }` _SHOULD_ be equivalent. However, tools _MAY_ make individual decisions on case sensitivity.

Inputs _MUST_ have strings as their values. Tools _MUST_ throw an error if an input contains a non-string value, such as `{ "beta": true }` or `{ "size": 100 }`.

Tools _MUST_ handle the resolution stages in order to produce the correct output.

1. [Input validation](#input-validation): verifying the [input](#inputs) is valid for the given resolver document.
2. [Ordering](#ordering): tracing the `resolutionOrder` array to produce the final tokens structure.
3. [Aliases](#aliases): resolving token aliases in the final tokens structure.
4. [Resolution](#resolution): the final end result

Tools _MUST_ require all [inputs](https://html.spec.whatwg.org/multipage/input.html#the-input-element) match the provided [modifier](#modifiers) contexts.

If a resolver does NOT declare any modifiers, skip this step and proceed to [ordering](#ordering).

1. For every key in the input object:
    1. Verify it corresponds with a valid modifier. If it does not, throw an error.
    2. Verify that key’s value corresponds with that modifier’s allowed values. If it does not, throw an error.
2. For every modifier in the resolver:
    1. If that resolver does NOT declare a default value, verify a key is provided in the input. If not, throw an error.

Tools _MUST_ iterate over the [resolutionOrder](#resolution-order) array in order.

1. For every item in the array, determine whether it’s a [set](#sets) or [modifier](#modifiers), flattening into a single tokens structure in array order.

    1. If the item is a set, combine the `sources` in array order to produce a single tokens structure.
    2. Otherwise, if the item is a modifier, select only the `context` that matches the [input](#inputs), combining the array in order to produce a single tokens structure.
    3. In case of a conflict, take the most recent occurrence in the array.
2. Repeat until you’ve reached the end of the `resolutionOrder` array.

The final result will be a tokens structure that behaves the same as if it were one source to begin with.

Aliases _MUST NOT_ be resolved until this step.

After the [ordering](#ordering) has been flattened into a single tokens structure, the only remaining step is resolving aliases. Aliases are resolved the exact same way as outlined in the [format](about:blank/CG-FINAL-format-20251028/#aliases-references):

* Deep aliases are allowed, so long as they’re not circular
* An alias must point to the correct `$type`.

_This section is non-normative._

A resolver document allows for the use of tokens to exist in multiple JSON files for organization. But for the purposes of portability, it may be advantageous to deal with only a single JSON document.

“Bundling” refers to the process by which a resolver document may be reduced down into a single file. There are multiple strategies to accomplish this, more than this document outlines. But for the purpose of illustration, this will outline 2 of the many possible approaches:

Inlining involves taking all [reference objects](#reference-objects) to remote files, and replacing them with their contents. This is a simple strategy that accomplishes the end goal, but results in duplication whenever the same file is referenced multiple times. While a tool may not have any difficulty with duplicated tokens, a human reading this document may likely struggle reading the number of lines of code this would produce.

As described in [$defs](#defs), `$defs` don’t have defined behavior in a resolver document. They may only be used if a tool decides to support this feature of JSON Schema.

This strategy involves creating a top-level `$defs` key, with each top-level key containing the contents for that file.

The only downside of using `$defs` is some tools may choose to ignore it, as it is not a minimum requirement of a resolver document.

As well as sections marked as non-normative, all authoring guidelines, diagrams, examples, and notes in this specification are non-normative. Everything else in this specification is normative.

The key words _MAY_, _MUST_, _MUST NOT_, _SHOULD_, and _SHOULD NOT_ in this document are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) \[[RFC2119](#bib-rfc2119 "Key words for use in RFCs to Indicate Requirement Levels")\] \[[RFC8174](#bib-rfc8174 "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words")\] when, and only when, they appear in all capitals, as shown here.

Tools implementing the Resolver Specification _MUST_:

* **Support the Resolution Process**: Implement the [resolution logic](#resolution-logic) as defined, including input validation, base set flattening, modifier application, aliasing, and conflict resolution.
* **Validate Inputs**: Ensure that provided modifier inputs match the defined modifiers and acceptable values.
* **Resolve Aliases Correctly**: Handle [token references](about:blank/CG-FINAL-format-20251028/#aliases-references) accurately, including recursive references and detection of circular dependencies.
* **Preserve Token Properties**: Maintain additional token properties (e.g., [$extensions](#extensions)) throughout the resolution process.
* **Handle Errors Gracefully**: Provide meaningful error messages for issues like invalid inputs or circular references.

_This section is non-normative._

This resolver spec wouldn’t have happened without the Hyma Team, including but not limited to Mike Kamminga, Andrew L’Homme, and Lilith. Significant contributions were also made by Joren Broekema, Louis Chenais. We thank the members of the Design Tokens Community Group for their contributions and feedback.

\[html\]

[HTML Standard](https://html.spec.whatwg.org/multipage/). Anne van Kesteren; Domenic Denicola; Dominic Farolino; Ian Hickson; Philip Jägenstedt; Simon Pieters. WHATWG. Living Standard. URL: [https://html.spec.whatwg.org/multipage/](https://html.spec.whatwg.org/multipage/)

\[RFC1341\]

[MIME (Multipurpose Internet Mail Extensions): Mechanisms for Specifying and Describing the Format of Internet Message Bodies](https://www.rfc-editor.org/rfc/rfc1341). N. Borenstein; N. Freed. IETF. June 1992. Proposed Standard. URL: [https://www.rfc-editor.org/rfc/rfc1341](https://www.rfc-editor.org/rfc/rfc1341)

\[RFC2119\]

[Key words for use in RFCs to Indicate Requirement Levels](https://www.rfc-editor.org/rfc/rfc2119). S. Bradner. IETF. March 1997. Best Current Practice. URL: [https://www.rfc-editor.org/rfc/rfc2119](https://www.rfc-editor.org/rfc/rfc2119)

\[RFC6838\]

[Media Type Specifications and Registration Procedures](https://www.rfc-editor.org/rfc/rfc6838). N. Freed; J. Klensin; T. Hansen. IETF. January 2013. Best Current Practice. URL: [https://www.rfc-editor.org/rfc/rfc6838](https://www.rfc-editor.org/rfc/rfc6838)

\[RFC6901\]

[JavaScript Object Notation (JSON) Pointer](https://www.rfc-editor.org/rfc/rfc6901). P. Bryan, Ed.; K. Zyp; M. Nottingham, Ed. IETF. April 2013. Proposed Standard. URL: [https://www.rfc-editor.org/rfc/rfc6901](https://www.rfc-editor.org/rfc/rfc6901)

\[RFC8174\]

[Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words](https://www.rfc-editor.org/rfc/rfc8174). B. Leiba. IETF. May 2017. Best Current Practice. URL: [https://www.rfc-editor.org/rfc/rfc8174](https://www.rfc-editor.org/rfc/rfc8174)

\[RFC8259\]

[The JavaScript Object Notation (JSON) Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259). T. Bray, Ed. IETF. December 2017. Internet Standard. URL: [https://www.rfc-editor.org/rfc/rfc8259](https://www.rfc-editor.org/rfc/rfc8259)

\[w3c-process\]

[W3C Process Document](https://www.w3.org/policies/process/). Elika J. Etemad (fantasai); Florian Rivoal. W3C. 18 August 2025. URL: [https://www.w3.org/policies/process/](https://www.w3.org/policies/process/)
