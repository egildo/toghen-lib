import type { Mode } from 'culori';

// Defines the structure for a color space definition.
export interface ColorSpaceDefinition {
  components: string[];
  ranges: number[][];
  culoriFormat: Mode;
}

// A registry of color space definitions compliant with the W3C Design Tokens spec.
export const colorSpaces: Record<string, ColorSpaceDefinition> = {
  srgb: {
    components: ['r', 'g', 'b'],
    ranges: [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    culoriFormat: 'rgb',
  },
  'srgb-linear': {
    components: ['r', 'g', 'b'],
    ranges: [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    culoriFormat: 'lrgb',
  },
  hsl: {
    components: ['h', 's', 'l'],
    ranges: [
      [0, 360],
      [0, 100],
      [0, 100],
    ],
    culoriFormat: 'hsl',
  },
  hwb: {
    components: ['h', 'w', 'b'],
    ranges: [
      [0, 360],
      [0, 100],
      [0, 100],
    ],
    culoriFormat: 'hwb',
  },
  lab: {
    components: ['l', 'a', 'b'],
    ranges: [
      [0, 100],
      [-160, 160],
      [-160, 160],
    ],
    culoriFormat: 'lab',
  },
  lch: {
    components: ['l', 'c', 'h'],
    ranges: [
      [0, 100],
      [0, 230],
      [0, 360],
    ],
    culoriFormat: 'lch',
  },
  oklab: {
    components: ['l', 'a', 'b'],
    ranges: [
      [0, 1],
      [-0.5, 0.5],
      [-0.5, 0.5],
    ],
    culoriFormat: 'oklab',
  },
  oklch: {
    components: ['l', 'c', 'h'],
    ranges: [
      [0, 1],
      [0, 0.5],
      [0, 360],
    ],
    culoriFormat: 'oklch',
  },
  'display-p3': {
    components: ['r', 'g', 'b'],
    ranges: [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    culoriFormat: 'p3',
  },
  'a98-rgb': {
    components: ['r', 'g', 'b'],
    ranges: [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    culoriFormat: 'a98',
  },
  'prophoto-rgb': {
    components: ['r', 'g', 'b'],
    ranges: [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    culoriFormat: 'prophoto',
  },
  rec2020: {
    components: ['r', 'g', 'b'],
    ranges: [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    culoriFormat: 'rec2020',
  },
  'xyz-d65': {
    components: ['x', 'y', 'z'],
    ranges: [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    culoriFormat: 'xyz65',
  },
  'xyz-d50': {
    components: ['x', 'y', 'z'],
    ranges: [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    culoriFormat: 'xyz50',
  },
};
