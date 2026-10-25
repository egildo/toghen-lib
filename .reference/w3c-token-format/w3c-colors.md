# Design Tokens Color Module 2025.10

Abstract
--------

This document describes the technical specification for design token color values and opacity.

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
    1. [2.1 Color Tokens](#color-tokens)
5. [3\. Color terminology](#color-terminology)
6. [4\. Color type](#color-type)
    1. [4.1 Format](#format)
        1. [4.1.1 The `none` keyword](#the-none-keyword)
            1. [4.1.1.1 Using the `none` keyword](#using-the-none-keyword)
    2. [4.2 Supported Color spaces](#supported-color-spaces)
        1. [4.2.1 sRGB](#srgb)
            1. [4.2.1.1 Components](#components)
        2. [4.2.2 sRGB linear](#srgb-linear)
            1. [4.2.2.1 Components](#components-0)
        3. [4.2.3 HSL](#hsl)
            1. [4.2.3.1 Components](#components-1)
        4. [4.2.4 HWB](#hwb)
            1. [4.2.4.1 Components](#components-2)
        5. [4.2.5 CIELAB](#cielab)
            1. [4.2.5.1 Components](#components-3)
        6. [4.2.6 LCH](#lch)
            1. [4.2.6.1 Components](#components-4)
        7. [4.2.7 OKLAB](#oklab)
            1. [4.2.7.1 Components](#components-5)
        8. [4.2.8 OKLCH](#oklch)
            1. [4.2.8.1 Components](#components-6)
        9. [4.2.9 Display P3](#display-p3)
            1. [4.2.9.1 Components](#components-7)
        10. [4.2.10 A98 RGB](#a98-rgb)
             1. [4.2.10.1 Components](#components-8)
        11. [4.2.11 ProPhoto RGB](#prophoto-rgb)
             1. [4.2.11.1 Components](#components-9)
        12. [4.2.12 Rec 2020](#rec-2020)
             1. [4.2.12.1 Components](#components-10)
        13. [4.2.13 XYZ-D65](#xyz-d65)
             1. [4.2.13.1 Components](#components-11)
        14. [4.2.14 XYZ-D50](#xyz-d50)
             1. [4.2.14.1 Components](#components-12)
    3. [4.3 Future color space support](#future-color-space-support)
7. [5\. Gamut mapping](#gamut-mapping)
8. [6\. Interpolation](#interpolation)
9. [7\. Token naming](#token-naming)
    1. [7.1 Categorization](#categorization)
        1. [7.1.1 Base](#base)
        2. [7.1.2 Alias](#alias)
        3. [7.1.3 Component](#component)
    2. [7.2 Naming strategies](#naming-strategies)
        1. [7.2.1 Base Tokens](#base-tokens)
            1. [7.2.1.1 Descriptive](#descriptive)
            2. [7.2.1.2 Numerical](#numerical)
                1. [7.2.1.2.1 Ordered scales](#ordered-scales)
                2. [7.2.1.2.2 Bounded scales](#bounded-scales)
                3. [7.2.1.2.3 Computer generated scales](#computer-generated-scales)
        2. [7.2.2 Alias Tokens](#alias-tokens)
        3. [7.2.3 Component Tokens](#component-tokens)
10. [A. Issue summary](#issue-summary)
11. [B. References](#references)
     1. [B.1 Normative references](#normative-references)

As well as sections marked as non-normative, all authoring guidelines, diagrams, examples, and notes in this specification are non-normative. Everything else in this specification is normative.

The key words _MAY_, _MUST_, and _MUST NOT_ in this document are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) \[[RFC2119](#bib-rfc2119 "Key words for use in RFCs to Indicate Requirement Levels")\] \[[RFC8174](#bib-rfc8174 "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words")\] when, and only when, they appear in all capitals, as shown here.

Color tokens can be used to represent colors in different color spaces. Colors represented in tokens can then be converted to other color spaces by translation tools.

Generally speaking, this module uses [CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/) for reference to concepts and terminology. [CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/) is a W3C Working Draft and is not a final specification. It is subject to change and may not be implemented in all browsers or platforms.

Editor's note: Why CSS Color Module Level 4?

This section provides a high-level overview of the terminology used in the specification and how it relates to [color science](https://en.wikipedia.org/wiki/Color_science) and [colorimetry](https://en.wikipedia.org/wiki/Colorimetry).

Color space

A color space is a specific organization of colors, which helps in the reproduction of color in both physical and digital realms. It defines a range of colors that can be represented and manipulated.

Color model

A color model is a mathematical representation of colors within a specific [color space](#dfn-color-space). It defines how colors are represented as numerical values, typically using components.

Color gamut

A color gamut is the complete range of colors that can be represented in a specific color space. It defines the limits of color reproduction for that space.

Component

A component is a single value that defines a part of a color in a specific color space. For example, in the RGB color space, the components are red, green, and blue.

Hue

Hue is the attribute of a color that allows it to be classified as red, green, blue, etc. In many color spaces, hue is represented as an angle on a color wheel. Different color spaces may position colors differently on the wheel.

Saturation

Saturation is the colorfulness of a color relative to its own brightness. It describes how much gray is present in a color. A fully saturated color has no gray, while a desaturated color appears more grayish. It is inherently tied to both [chroma](#dfn-chroma) and [lightness](#dfn-lightness), especially in models like HSL or HSV. A color can be highly saturated but still appear light or dark depending on its lightness.

Lightness

Lightness is the perceived brightness of a color. It describes how light or dark a color appears.

Chroma

Chroma refers to the colorfulness of a color relative to the brightness of a similarly illuminated white. It measures how pure or intense a color appears. In the CIE LCH color model (Lightness, Chroma, Hue), Chroma is independent of lightness and expresses how far a color is from neutral gray along the chromatic axis.

Alpha

Alpha is a component that represents the transparency of a color. It defines how opaque or transparent a color is, with the minimum value (usually 0) being fully transparent and the maximum value (usually 1) being fully opaque.

Represents a color.

For color tokens, the `$type` property _MUST_ be set to the string `color`.

The `$value` property can then be used to specify the details of the color, The `$value` object contains the following properties:

* `colorSpace` (required): A string that specifies the [color space](#dfn-color-space) or [color model](#dfn-color-model). For supported color spaces, see the [supported color spaces](#supported-color-spaces) section below.
* `components` (required): An array representing the color [components](#dfn-components). The number of components depends on the color space. Each element of the array _MUST_ be either:
  * A number
  * The 'none' keyword
* `alpha` (optional): A number that represents the [alpha](#dfn-alpha) value of the color. This value is between `0` and `1`, where `0` is fully transparent and `1` is fully opaque. If omitted, the alpha value of the color _MUST_ be assumed to be 1 (fully opaque).
* `hex` (optional): A string that represents a fallback value of the color. The fallback color _MUST_ be formatted in [6 digit CSS hex color notation](https://www.w3.org/TR/css-color-4/#hex-notation) format to avoid conflicts with the provided alpha value.

When specifying a color in some color spaces, a value of `0` could be ambiguous. For example, in the HSL color space, colors with a [hue](#dfn-hue) of `0` are red; while a single color like `hsl(0, 0, 50)` would not be rendered as red, it may be treated as a completely desaturated red when interpolated with other colors. Therefore, in certain color spaces, `0` is insufficient to indicate that there is no value for a given component.

[CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/) has introduced the `none` keyword to indicate that a component is missing, or not applicable. For example, in the HSL color space, the `none` keyword may be used to indicate that there is no angle value for the color; a color with a hue value of `none` _MAY_ be rendered differently from a color with a hue angle of `0`, or result in different colors when [interpolating](https://www.w3.org/TR/css-color-4/#interpolation-missing).

The `none` keyword _MAY_ be used in the `components` array to indicate that a component is not applicable or not specified.

Contrast this with the following example where the Hue is specified as `0`:

While both examples will render as white, the first example is more explicit about the fact that the hue is not applicable. This is important when interpolating between colors or mixing colors, where using colors with components of `0` or `none` can yield different results.

The following values are supported for the `colorSpace` property. The `components` array will vary depending on the color space.

Editor's note: Syntax for expressing ranges

|Color Space |Key                    |Values   |         |
|------------|-----------------------|---------|---------|
|sRGB        |"srgb"                 |Red      |[0 - 1]  |
|Green       |[0 - 1]                |         |         |
|Blue        |[0 - 1]                |         |         |
|sRGB linear |"srgb-linear"          |Red      |[0 - 1]  |
|Green       |[0 - 1]                |         |         |
|Blue        |[0 - 1]                |         |         |
|HSL         |"hsl"                  |Hue      |[0 - 360)|
|Saturation  |[0 - 100]              |         |         |
|Lightness   |[0 - 100]              |         |         |
|HWB         |"hwb"                  |Hue      |[0 - 360)|
|Whiteness   |[0 - 100]              |         |         |
|Blackness   |[0 - 100]              |         |         |
|CIELAB      |"lab"                  |Lightness|[0 - 100]|
|A           |[-Infinity - Infinity]*|         |         |
|B           |[-Infinity - Infinity]*|         |         |
|LCH         |"lch"                  |Lightness|[0 - 100]|
|Chroma      |[0 - Infinity]**       |         |         |
|Hue         |[0 - 360)              |         |         |
|OKLAB       |"oklab"                |Lightness|[0 - 1]  |
|A           |[-Infinity - Infinity]†|         |         |
|B           |[-Infinity - Infinity]†|         |         |
|OKLCH       |"oklch"                |Lightness|[0 - 1]  |
|Chroma      |[0 - Infinity]‡        |         |         |
|Hue         |[0 - 360)              |         |         |
|Display P3  |"display-p3"           |Red      |[0 - 1]  |
|Green       |[0 - 1]                |         |         |
|Blue        |[0 - 1]                |         |         |
|A98 RGB     |"a98-rgb"              |Red      |[0 - 1]  |
|Green       |[0 - 1]                |         |         |
|Blue        |[0 - 1]                |         |         |
|ProPhoto RGB|"prophoto-rgb"         |Red      |[0 - 1]  |
|Green       |[0 - 1]                |         |         |
|Blue        |[0 - 1]                |         |         |
|Rec 2020    |"rec2020"              |Red      |[0 - 1]  |
|Green       |[0 - 1]                |         |         |
|Blue        |[0 - 1]                |         |         |
|XYZ-D65     |"xyz-d65"              |X        |[0 - 1]  |
|Y           |[0 - 1]                |         |         |
|Z           |[0 - 1]                |         |         |
|XYZ-D50     |"xyz-d50"              |X        |[0 - 1]  |
|Y           |[0 - 1]                |         |         |
|Z           |[0 - 1]                |         |         |

\* In CIELAB, A and B are unbounded but in practice don't exceed -160 to 160  
\*\* In LCH, C is unbounded but in practice doesn't exceed 230  
† In OKLAB, A and B are unbounded but in practice don't exceed -0.5 to 0.5  
‡ In OKLCH, Chroma is unbounded but in practice doesn't exceed 0.5

Editor's note: Precision in examples

Editor's note: Optional values in examples

Editor's note: How does this conform to CSS Color Module 4?

sRGB was the standard color space for all CSS colors before CSS Color Module 4. It is the most widely used color space on the web, and is the default color space for most design tools.

`[Red, Green, Blue]`

* Red: A number between `0` and `1` representing the red component of the color.
* Green: A number between `0` and `1` representing the green component of the color.
* Blue: A number between `0` and `1` representing the blue component of the color.

For more information on the sRGB color space, see [Multimedia systems and equipment - Colour measurement and management - Part 2-1: Colour management - Default RGB colour space - sRGB](https://webstore.iec.ch/publication/6169).

sRGB linear is a linearized version of sRGB. It is used in some design tools to represent colors in a linear color space.

`[Red, Green, Blue]`

* Red: A number between `0` and `1` representing the red component of the color.
* Green: A number between `0` and `1` representing the green component of the color.
* Blue: A number between `0` and `1` representing the blue component of the color.

For more information on the sRGB linear color space, see [Multimedia systems and equipment - Colour measurement and management - Part 2-1: Colour management - Default RGB colour space - sRGB](https://webstore.iec.ch/publication/6169).

HSL is a [color model](#dfn-color-model) that is a polar transformation of sRGB, supported as early as CSS Color Level 3.

`[Hue, Saturation, Lightness]`

* Hue: A number from `0` up to (but not including) `360`, but representing the [hue](#dfn-hue) angle of the color on the color wheel.
* Saturation: A number between `0` and `100` representing the percentage of color [saturation](#dfn-saturation).
* Lightness: A number between `0` and `100` representing the percentage of [lightness](#dfn-lightness).

For more information on the HSL color space, see [HSL: light vs saturation](http://www.cwi.nl/~steven/css/hsl.html).

Another [color model](#dfn-color-model), a polar transformation of sRGB.

`[Hue, Whiteness, Blackness]`

* Hue: A number from `0` up to (but not including) `360` representing the angle of the color on the color wheel.
* Whiteness: A number between `0` and `100` representing the percentage of white in the color.
* Blackness: A number between `0` and `100` representing the percentage of black in the color.

For more information on the HWB color space, see [HWB — A More Intuitive Hue-Based Color Model](http://alvyray.com/Papers/CG/HWB_JGTv208.pdf).

CIELAB is a color space that is designed to be perceptually uniform.

`[L, A, B]`

* L: A number between `0` and `100` representing the percentage of lightness of the color.
* A: A signed number representing the green-red axis of the color.
* B: A signed number representing the blue-yellow axis of the color.

A and B are theoretically unbounded, but in practice don't exceed -160 to 160.

For more information on the CIELAB color space, see [ISO/CIE 11664-4:2019(E): Colorimetry — Part 4: CIE 1976 L\*a\*b\* colour space](http://cie.co.at/publications/colorimetry-part-4-cie-1976-lab-colour-space-1).

LCH is a cylindrical representation of CIELAB.

`[L, C, Hue]`

* L: A number between `0` and `100` representing the percentage of lightness of the color.
* C: A number representing the chroma of the color.
* Hue: A number from `0` up to (but not including) `360` representing the angle of the color on the color wheel.

The minimum value of C is `0`, which represents a neutral color (gray), and its maximum is theoretically unbounded, but in practice doesn't exceed 230.

For more information on the LCH color space, see [the CIELAB and LCH section of CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/#cie-lab).

OKLAB is a perceptually uniform [color space](#dfn-color-space) that is designed to be more accurate than CIELAB.

`[L, A, B]`

* L: A number between `0` and `1` representing the lightness of the color.
* A: A signed number representing the green-red axis of the color.
* B: A signed number representing the blue-yellow axis of the color.

Like in CIELAB, A and B are theoretically unbounded, but in practice don't exceed -0.5 to 0.5.

For more information on the OKLAB color space, see [OKLAB: A Perceptually Uniform Color Space](https://bottosson.github.io/posts/oklab/).

OKLCH is a cylindrical [color model](#dfn-color-model) of OKLAB.

`[L, Chroma, Hue]`

* L: A number between `0` and `1` representing the lightness of the color.
* Chroma: A number representing the chroma of the color.
* Hue: A number from `0` up to (but not including) `360` representing the angle of the color on the color wheel.

Like in LCH, the minimum value of Chroma is `0`, which represents a neutral color (gray), and its maximum is theoretically unbounded, but in practice doesn't exceed 0.5.

For more information on the OKLCH color space, see [OKLAB: A Perceptually Uniform Color Space](https://bottosson.github.io/posts/oklab/).

Display P3 is a [color space](#dfn-color-space) that is designed to be used in displays with a wide color [gamut](#dfn-gamut). It is based on the P3 color space used in digital cinema.

`[Red, Green, Blue]`

* Red: A number between `0` and `1` representing the red component of the color.
* Green: A number between `0` and `1` representing the green component of the color.
* Blue: A number between `0` and `1` representing the blue component of the color.

For more information on the Display P3 color space, see [the definition of Display P3](https://www.color.org/chardata/rgb/DisplayP3.xalter).

A98 RGB is a color space that is designed to be used in displays with a wide color gamut. It is based on the Adobe RGB color space.

`[Red, Green, Blue]`

* Red: A number between `0` and `1` representing the red component of the color.
* Green: A number between `0` and `1` representing the green component of the color.
* Blue: A number between `0` and `1` representing the blue component of the color.

To learn more about the A98 color space, see the [Adobe RGB color space article on Wikipedia](https://en.wikipedia.org/wiki/Adobe_RGB_color_space).

ProPhoto RGB is a color space that is designed to be used in displays with a wide color gamut. It is based on the ProPhoto RGB color space.

`[Red, Green, Blue]`

* Red: A number between `0` and `1` representing the red component of the color.
* Green: A number between `0` and `1` representing the green component of the color.
* Blue: A number between `0` and `1` representing the blue component of the color.

For more information on the ProPhoto RGB color space, see [Design and Optimization of the ProPhoto RGB Color Encodings](https://www.realtimerendering.com/blog/2011-color-and-imaging-conference-part-vi-special-session/) .

Rec 2020 is a color space that is designed to be used in displays with a wide color gamut. It is based on the Rec 2020 color space.

`[Red, Green, Blue]`

* Red: A number between `0` and `1` representing the red component of the color.
* Green: A number between `0` and `1` representing the green component of the color.
* Blue: A number between `0` and `1` representing the blue component of the color.

For more information on the Rec 2020 color space, see [Recommendation ITU-R BT.2020-2: Parameter values for ultra-high definition television systems for production and international programme exchange](http://www.itu.int/rec/R-REC-BT.2020/en) .

XYZ-D65 is a color space that is designed to be able to represent all colors that can be perceived by the human eye. It is a fundamental color space — all other spaces can be converted to and from XYZ. It is based on the CIE 1931 color space, using the D65 illuminant. XYZ is not commonly used in design tools, but is useful for color conversions.

`[X, Y, Z]`

* X: A number between `0` and `1` representing the X component of the color.
* Y: A number between `0` and `1` representing the Y component of the color.
* Z: A number between `0` and `1` representing the Z component of the color.

For more information on the XYZ-D65 color space, see [Colorimetry, Fourth Edition. CIE 015:2018](http://www.cie.co.at/publications/colorimetry-4th-edition).

XYZ-D50 is similar to XYZ-D65, but uses the D50 illuminant.

`[X, Y, Z]`

* X: A number between `0` and `1` representing the X component of the color.
* Y: A number between `0` and `1` representing the Y component of the color.
* Z: A number between `0` and `1` representing the Z component of the color.

For more information on the XYZ-D50 color space, see [Colorimetry, Fourth Edition. CIE 015:2018](http://www.cie.co.at/publications/colorimetry-4th-edition).

Future versions of this spec may add support for additional color spaces, depending on adoption and support in design tools.

_This section is non-normative._

Gamut mapping is the process of converting colors from one [color space](#dfn-color-space) to another.

Gamut mapping is necessary when the source color space has a larger gamut than the target color space. This can happen when converting colors from a wide-gamut color space (like Display-P3) to a smaller gamut color space (like sRGB). Gamut mapping ensures that the colors are represented accurately in the target color space, even if some colors cannot be represented exactly.

When transforming colors, translation tools _MAY_ use the gamut mapping algorithm that best fits the use case. For example, if the goal is to preserve the appearance of colors, a perceptual gamut mapping algorithm may be used. If the goal is to preserve the exact color values, a saturation or relative colorimetric gamut mapping algorithm may be used.

Token authors should be aware that the choice of gamut mapping algorithm can significantly affect the appearance of colors in the target color space. If colors need to be transformed between color spaces, it's important to validate the output of the translation tool to ensure that the colors are represented accurately and consistently.

_This section is non-normative._

In many cases, colors may be _interpolated_, or blended, to create new colors. For example, when creating a gradient, colors are often interpolated between two or more key colors.

Interpolation can be done in different [color spaces](#dfn-color-space), and the choice of color space can affect the appearance of the resulting colors. Translation tools _MAY_ use different interpolation methods depending on the color space and the desired effect. Authors should be aware of the implications of interpolation in different color spaces and validate interpolated colors to ensure they meet design requirements.

_This section is non-normative._

There are 3 main categories of design tokens that we will continue to reference in this specification.

Base tokens are the lowest level tokens.

A design token’s value _MAY_ be a _reference_ to another token. The same value _MAY_ have multiple names or aliases.

Component-specific tokens provide design decisions at the component level and improve the separation of concerns in your token architecture.

There are many naming options when it comes to design tokens, especially color type tokens. We’ve identified two that seem to be most commonly implemented, **descriptive and numerical**.

For **Base tokens**, here’s how they _MAY_ be represented in each version:

Descriptive names can be more emotional and human-friendly because they often relate to tangible things that people interact with, like grass or watermelon.

* Pros: Easier for some people to identify with, could be used to distinguish brand colors from product colors
  * Cons: Harder to determine the scale of colors (for example: which ones are lighter vs. darker? How well do they pair together?)
* Pros:
  * Cons: Names may not be easily recognized by non-English speakers. For teams working across languages, this may not be a good choice

Numerical tokens often follow a scale to help delineate how the colors progress. For example, when using an ordered scale, `color.blue.500` may be the base color, where the lightest color value is `color.blue.100`, and the darkest value could be `color.blue.900`, and these values are ordered in increments of 100s in between. We recommend not using sequential numbers (ex: 1, 2, 3, 4) for scalability in case future colors need to be added in between two existing colors.

Numerical token names can also allow for further specificity when needed. For example, when creating neutral palette tokens (like grays), the scale may increase by increments of 25 instead of 100 at the lightest values, and then increment by 100 thereafter.

Numerical tokens can also be named through **bounded scales**. These tokens utilize a distinguishing value based on the actual color used for the token, such as in HSL’s lightness value to vary shades of a tint.

Token names _MAY_ also be generated by tools, where the user specifies the base name, and the tool appends scale numbers based on changes to the underlying value.

* Pros: Easy mapping between different tokens for color contrast. For example, all 100-400 tokens pair with 500-900 tokens in order to create accessible color combinations.
  * Cons: Less memorable and less obvious difference between tokens
* Pros: If using bounded scales, the token name can help indicate something about the underlying value
  * Cons:

For **Alias Tokens**, we recommend grouping tokens with similar intentions by prioritizing the category + property within the name. For example, all background color Alias tokens would likely start with `color.background.XXX`.

We recommend avoiding abbreviations. For example, use “background” instead of “bg”, to help with clarity.

Here’s how alias tokens may be represented:

Color alias tokens could also be grouped by concept, like so:

Component-specific names should start with the component they support and be located close to the component code. They commonly refer to alias tokens and can be helpful when trying to use consistent styles across components while still maintaining separation of concerns.

There are no issues listed in this specification.

\[CIELAB\]

[ISO/CIE 11664-4:2019(E): Colorimetry — Part 4: CIE 1976 L\*a\*b\* colour space](http://cie.co.at/publications/colorimetry-part-4-cie-1976-lab-colour-space-1). International Organization for Standardization (ISO), International Commission on Illumination (CIE). 2019. Published. URL: [http://cie.co.at/publications/colorimetry-part-4-cie-1976-lab-colour-space-1](http://cie.co.at/publications/colorimetry-part-4-cie-1976-lab-colour-space-1)

\[COLORIMETRY\]

[Colorimetry, Fourth Edition. CIE 015:2018](http://www.cie.co.at/publications/colorimetry-4th-edition). CIE. 2018. URL: [http://www.cie.co.at/publications/colorimetry-4th-edition](http://www.cie.co.at/publications/colorimetry-4th-edition)

\[css-color-4\]

[CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/). Chris Lilley; Tab Atkins Jr.; Lea Verou. W3C. 24 April 2025. CRD. URL: [https://www.w3.org/TR/css-color-4/](https://www.w3.org/TR/css-color-4/)

\[hsl\]

[HSL: light vs saturation](http://www.cwi.nl/~steven/css/hsl.html). Steven Pemberton. 19 November 2009. URL: [http://www.cwi.nl/~steven/css/hsl.html](http://www.cwi.nl/~steven/css/hsl.html)

\[Rec.2020\]

[Recommendation ITU-R BT.2020-2: Parameter values for ultra-high definition television systems for production and international programme exchange](http://www.itu.int/rec/R-REC-BT.2020/en) . ITU. October 2015. URL: [http://www.itu.int/rec/R-REC-BT.2020/en](http://www.itu.int/rec/R-REC-BT.2020/en)

\[RFC2119\]

[Key words for use in RFCs to Indicate Requirement Levels](https://www.rfc-editor.org/rfc/rfc2119). S. Bradner. IETF. March 1997. Best Current Practice. URL: [https://www.rfc-editor.org/rfc/rfc2119](https://www.rfc-editor.org/rfc/rfc2119)

\[RFC8174\]

[Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words](https://www.rfc-editor.org/rfc/rfc8174). B. Leiba. IETF. May 2017. Best Current Practice. URL: [https://www.rfc-editor.org/rfc/rfc8174](https://www.rfc-editor.org/rfc/rfc8174)

\[srgb\]

[Multimedia systems and equipment - Colour measurement and management - Part 2-1: Colour management - Default RGB colour space - sRGB](https://webstore.iec.ch/publication/6169). IEC. URL: [https://webstore.iec.ch/publication/6169](https://webstore.iec.ch/publication/6169)
