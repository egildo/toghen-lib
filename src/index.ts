/**
 * Main entry point for the design tokens library.
 *
 * Every export answers a question of the core's question set (specs.md, "The questions the core answers"),
 * or is the shape of such an answer, or the error it gives. Consumers never reach into deep import paths.
 */

// Core classes
export { DesignSystem, referencePath } from './core/design-system.js';
export { Collection } from './core/collection.js';
export type { Axis, Check, Child, ModeModifier, Part, Parts } from './core/collection.js';
export { DesignToken } from './core/design-token.js';

// Error types: exported so callers can `instanceof`-check without deep imports
export {
  InvalidTokenError,
  PathNotFoundError,
  InvalidModeError,
  CollectionNotFoundError,
  CircularReferenceError,
  UnresolvableReferenceError,
  InvalidInterpolationError,
} from './core/design-token.js';
export type {
  UnresolvableReferenceReason,
  UnresolvableReferenceDetails,
} from './core/design-token.js';

// The reference grammar, for values that are not stored tokens: a chain's step, a file that writes DTCG references
export type { TokenReference } from './core/alias.js';
export { referencesIn } from './core/alias.js';
export { holdsReference, referenceTarget, parseReferencePath, literalText } from './core/alias-syntax.js';

// Token values: the stored shape of a literal, and its normalized forms
export { normalizeTokenValue } from './handlers/built-in.js';
export type {
  DimensionUnit,
  DimensionValue,
  LetterSpacingEmValue,
  LetterSpacingUnit,
  LetterSpacingValue,
  ColorValue,
  TypographyValue,
  ShadowValue,
  BorderValue,
  StrokeStyleValue,
  GradientStopValue,
  GradientKind,
  GradientStopsValue,
  GradientObjectValue,
  GradientValue,
  NormalizedColorValue,
  NormalizedGradient,
  NormalizedLineHeight,
  NormalizedShadow,
} from './types/composite-values.js';
export { normalizeColorToSRGB01 } from './utils/normalize-color.js';
export { normalizeDimensionToPx, normalizeLineHeight } from './utils/dimensions.js';
export { fontFamilyNames } from './utils/font-family.js';
export { normalizeGradient } from './utils/normalize-gradient.js';

// The names two adapters share
export { cssPropertyName, cssIdentifier, cssLinkName } from './utils/css-name.js';
export { getContextSelector } from './resolver/context-selector.js';
export type { ContextSelector } from './resolver/context-selector.js';

// W3C Resolver Module
export { Resolver } from './resolver/resolver.js';
export { load } from './resolver/load.js';
export type { Collision, LoadOptions, LoadResult } from './resolver/load.js';
export type {
  LeafProperty,
  Step,
  Chain,
  ChainLink,
  NonFactorable,
  TokenContexts,
} from './resolver/chains.js';
export type {
  ResolverDocument,
  ResolverInput,
  ResolverSet,
  ResolverModifier,
  ModifierContexts,
  InlineSet,
  InlineModifier,
  ResolutionOrderItem,
  ReferenceObject,
  TokenSource,
} from './resolver/types.js';
export {
  ResolverValidationError,
  InvalidInputError,
  InvalidReferenceError,
} from './resolver/errors.js';
