import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { converter, parse } from 'culori';
import { parseCssColor, spellCssColor, toColorValue, toCuloriColor } from '../../../src/utils/css-color.js';
import type { ColorValue } from '../../../src/types/composite-values.js';

const EPSILON = 1e-9;

/** Asserts two structured colours match: same space, components within `epsilon`, same alpha. */
const close = (actual: ColorValue, expected: ColorValue, epsilon = EPSILON): void => {
  assert.equal(actual.colorSpace, expected.colorSpace, `space of ${JSON.stringify(actual)}`);
  assert.equal(actual.components.length, expected.components.length);
  actual.components.forEach((component, i) => {
    const want = expected.components[i];
    if (want === 'none' || component === 'none') {
      assert.equal(component, want, `component ${i} of ${JSON.stringify(actual)}`);
    } else {
      assert.ok(Math.abs(component - want) <= epsilon, `component ${i}: ${component} is not ${want} (${JSON.stringify(actual)})`);
    }
  });
  assert.ok(Math.abs((actual.alpha ?? 1) - (expected.alpha ?? 1)) <= epsilon, `alpha ${actual.alpha} is not ${expected.alpha}`);
};

const computed = (text: string): ColorValue => toColorValue(parseCssColor(text));

describe('parseCssColor: every CSS Color 4 spelling to its structured value', () => {
  const cases: Array<[string, ColorValue]> = [
    ['#336699', { colorSpace: 'srgb', components: [0.2, 0.4, 0.6] }],
    ['#33669980', { colorSpace: 'srgb', components: [0.2, 0.4, 0.6], alpha: 128 / 255 }],
    ['transparent', { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0 }],
    ['Transparent', { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0 }],
    ['rgb(10 20 30 / 50%)', { colorSpace: 'srgb', components: [10 / 255, 20 / 255, 30 / 255], alpha: 0.5 }],
    ['rgba(10, 20, 30, 0.5)', { colorSpace: 'srgb', components: [10 / 255, 20 / 255, 30 / 255], alpha: 0.5 }],
    ['hsl(120 50% 50%)', { colorSpace: 'hsl', components: [120, 50, 50] }],
    ['HSL(0.5turn 50% 25%)', { colorSpace: 'hsl', components: [180, 50, 25] }],
    ['hwb(120 10% 20%)', { colorSpace: 'hwb', components: [120, 10, 20] }],
    ['lab(50 20 30)', { colorSpace: 'lab', components: [50, 20, 30] }],
    ['lch(50 30 none)', { colorSpace: 'lch', components: [50, 30, 'none'] }],
    ['oklab(0.5 0.1 -0.1)', { colorSpace: 'oklab', components: [0.5, 0.1, -0.1] }],
    ['oklch(0.7 0.1 200)', { colorSpace: 'oklch', components: [0.7, 0.1, 200] }],
    ['oklch(0.7 0.1 -20)', { colorSpace: 'oklch', components: [0.7, 0.1, 340] }],
    ['oklch(0.7 0.1 400)', { colorSpace: 'oklch', components: [0.7, 0.1, 40] }],
    ['color(srgb 0.4 0.2 0.6)', { colorSpace: 'srgb', components: [0.4, 0.2, 0.6] }],
    ['color(srgb-linear 0.5 0.5 0.5)', { colorSpace: 'srgb-linear', components: [0.5, 0.5, 0.5] }],
    ['color(display-p3 1 0 0 / 0.5)', { colorSpace: 'display-p3', components: [1, 0, 0], alpha: 0.5 }],
    ['color(a98-rgb 1 0 0)', { colorSpace: 'a98-rgb', components: [1, 0, 0] }],
    ['color(prophoto-rgb 1 0 0)', { colorSpace: 'prophoto-rgb', components: [1, 0, 0] }],
    ['color(rec2020 1 0 0)', { colorSpace: 'rec2020', components: [1, 0, 0] }],
    ['color(xyz 0.5 0.5 0.5)', { colorSpace: 'xyz-d65', components: [0.5, 0.5, 0.5] }],
    ['color(xyz-d65 0.5 0.5 0.5)', { colorSpace: 'xyz-d65', components: [0.5, 0.5, 0.5] }],
    ['color(xyz-d50 0.5 0.5 0.5)', { colorSpace: 'xyz-d50', components: [0.5, 0.5, 0.5] }],
  ];
  for (const [text, expected] of cases) {
    it(text, () => close(computed(text), expected));
  }

  it('reads a named colour in any case', () => {
    for (const text of ['rebeccapurple', 'RebeccaPurple', 'REBECCAPURPLE', ' rebeccapurple ']) {
      close(computed(text), { colorSpace: 'srgb', components: [0x66 / 255, 0x33 / 255, 0x99 / 255] });
    }
  });
});

describe('parseCssColor: color-mix()', () => {
  it('mixes with premultiplied alpha: the ink at 5% over transparent is the ink at alpha 0.05', () => {
    const mixed = computed('color-mix(in srgb, #112233 5%, transparent)');
    close(mixed, { colorSpace: 'srgb', components: [0x11 / 255, 0x22 / 255, 0x33 / 255], alpha: 0.05 }, 1e-12);
  });

  const spaces = [
    'srgb',
    'srgb-linear',
    'display-p3',
    'a98-rgb',
    'prophoto-rgb',
    'rec2020',
    'lab',
    'oklab',
    'xyz',
    'xyz-d50',
    'xyz-d65',
    'hsl',
    'hwb',
    'lch',
    'oklch',
  ];
  const modes: Record<string, string> = {
    srgb: 'rgb',
    'srgb-linear': 'lrgb',
    'display-p3': 'p3',
    'a98-rgb': 'a98',
    'prophoto-rgb': 'prophoto',
    rec2020: 'rec2020',
    lab: 'lab',
    oklab: 'oklab',
    xyz: 'xyz65',
    'xyz-d50': 'xyz50',
    'xyz-d65': 'xyz65',
    hsl: 'hsl',
    hwb: 'hwb',
    lch: 'lch',
    oklch: 'oklch',
  };
  for (const space of spaces) {
    it(`mixes in ${space}, the result a colour of that space, its channels the mean`, () => {
      const mixed = computed(`color-mix(in ${space}, #336699, #cc9966)`);
      const stored = space === 'xyz' ? 'xyz-d65' : space;
      const toSpace = converter(modes[space] as never);
      const a = toColorValue(toSpace(parse('#336699')!) as never);
      const b = toColorValue(toSpace(parse('#cc9966')!) as never);
      const mean = a.components.map((c, i) => ((c as number) + (b.components[i] as number)) / 2);
      if (['hsl', 'hwb', 'lch', 'oklch'].includes(space)) {
        // The hue is the mean only along the shorter arc; the methods are tested below.
        const hue = space === 'hsl' || space === 'hwb' ? 0 : 2;
        mean[hue] = mixed.components[hue] as number;
      }
      close(mixed, { colorSpace: stored, components: mean }, 1e-6);
    });
  }

  it('reads xyz as xyz-d65', () => {
    assert.equal(computed('color-mix(in xyz, #336699, #cc9966)').colorSpace, 'xyz-d65');
  });

  it('takes an omitted percentage as the rest of 100, in either place, and either order', () => {
    close(computed('color-mix(in srgb, #000000 25%, #ffffff)'), { colorSpace: 'srgb', components: [0.75, 0.75, 0.75] });
    close(computed('color-mix(in srgb, #000000, #ffffff 25%)'), { colorSpace: 'srgb', components: [0.25, 0.25, 0.25] });
    close(computed('color-mix(in srgb, 25% #000000, #ffffff)'), { colorSpace: 'srgb', components: [0.75, 0.75, 0.75] });
  });

  it('scales two percentages that do not add up to 100', () => {
    close(computed('color-mix(in srgb, #000000 60%, #ffffff 60%)'), { colorSpace: 'srgb', components: [0.5, 0.5, 0.5] });
    close(computed('color-mix(in srgb, #000000 30%, #ffffff 10%)'), { colorSpace: 'srgb', components: [0.25, 0.25, 0.25], alpha: 0.4 });
  });

  it('multiplies the alpha by the sum when the percentages add up to less than 100', () => {
    close(computed('color-mix(in srgb, #000000 20%, #ffffff 20%)'), { colorSpace: 'srgb', components: [0.5, 0.5, 0.5], alpha: 0.4 });
  });

  it('refuses percentages that add up to 0, and a percentage outside 0–100', () => {
    assert.throws(() => parseCssColor('color-mix(in srgb, #000 0%, #fff 0%)'), {
      message: "'color-mix(in srgb, #000 0%, #fff 0%)' cannot be computed: the percentages in color-mix() add up to 0%.",
    });
    assert.throws(() => parseCssColor('color-mix(in srgb, #000 120%, #fff)'), {
      message:
        "'color-mix(in srgb, #000 120%, #fff)' cannot be computed: a percentage in color-mix() must lie between 0% and 100%, got 120%.",
    });
    assert.throws(() => parseCssColor('color-mix(in srgb, #000 -10%, #fff)'), /between 0% and 100%, got -10%/);
  });

  it('reads a mix nested in a mix', () => {
    close(computed('color-mix(in srgb, color-mix(in srgb, #000000, #ffffff), #ffffff)'), {
      colorSpace: 'srgb',
      components: [0.75, 0.75, 0.75],
    });
    close(computed('color-mix(in srgb, color-mix(in srgb, #000 50%, transparent) 50%, #000)'), {
      colorSpace: 'srgb',
      components: [0, 0, 0],
      alpha: 0.75,
    });
  });

  it("gives a component missing in one colour the other colour's value", () => {
    close(computed('color-mix(in oklch, oklch(0.5 0.1 none), oklch(0.7 0.2 100))'), { colorSpace: 'oklch', components: [0.6, 0.15, 100] });
    close(computed('color-mix(in srgb, color(srgb none 0.2 0.3), color(srgb 0.8 0.4 0.5))'), {
      colorSpace: 'srgb',
      components: [0.8, 0.3, 0.4],
    });
  });

  it('keeps a component missing in both colours missing', () => {
    close(computed('color-mix(in oklch, oklch(0.5 0.1 none), oklch(0.7 0.2 none))'), {
      colorSpace: 'oklch',
      components: [0.6, 0.15, 'none'],
    });
  });

  it('interpolates the hue by each of the four methods, the result in [0, 360)', () => {
    const hue = (method: string, from: number, to: number, space = 'oklch'): number => {
      const a = space === 'oklch' ? `oklch(0.6 0.1 ${from})` : `hsl(${from} 50% 50%)`;
      const b = space === 'oklch' ? `oklch(0.6 0.1 ${to})` : `hsl(${to} 50% 50%)`;
      const mixed = computed(`color-mix(in ${space}${method ? ` ${method} hue` : ''}, ${a}, ${b})`);
      return mixed.components[space === 'oklch' ? 2 : 0] as number;
    };
    const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
    near(hue('', 30, 270), 330);
    near(hue('shorter', 30, 270), 330);
    near(hue('longer', 30, 270), 150);
    near(hue('increasing', 30, 270), 150);
    near(hue('decreasing', 30, 270), 330);
    near(hue('shorter', 270, 30), 330);
    near(hue('longer', 270, 30), 150);
    near(hue('increasing', 270, 30), 330);
    near(hue('decreasing', 270, 30), 150);
    near(hue('longer', 30, 270, 'hsl'), 150);
  });

  it('stores the shorter-hue mid of red and blue in oklch with a hue in [0, 360)', () => {
    const mixed = computed('color-mix(in oklch, red, blue)');
    assert.equal(mixed.colorSpace, 'oklch');
    const h = mixed.components[2] as number;
    assert.ok(h >= 0 && h < 360 && Math.abs(h - 326.64) < 0.01, `hue ${h}`);
  });

  it('refuses a malformed mix, with the reason', () => {
    assert.throws(() => parseCssColor('color-mix(in srgb, red)'), {
      message: "'color-mix(in srgb, red)' cannot be computed: color-mix() takes two colours, got 1.",
    });
    assert.throws(() => parseCssColor('color-mix(in srgb, red, blue, green)'), /color-mix\(\) takes two colours, got 3\./);
    assert.throws(
      () => parseCssColor('color-mix(in nowhere, red, blue)'),
      /'nowhere' is not a colour space color-mix\(\) interpolates in\./,
    );
    assert.throws(() => parseCssColor('color-mix(red, blue)'), /color-mix\(\) starts with 'in <colour space>'/);
    assert.throws(
      () => parseCssColor('color-mix(in srgb longer hue, red, blue)'),
      /a hue method needs a space with a hue \(hsl, hwb, lch, oklch\), got 'srgb'\./,
    );
    assert.throws(() => parseCssColor('color-mix(in srgb, bogus, blue)'), {
      message: "'color-mix(in srgb, bogus, blue)' cannot be computed: 'bogus' is not a CSS colour.",
    });
  });
});

describe('parseCssColor: what it refuses, and why', () => {
  const refusals: Array<[string, string]> = [
    ['currentColor', 'currentColor has no value until an element uses it.'],
    ['CURRENTCOLOR', 'currentColor has no value until an element uses it.'],
    ['color-mix(in srgb, currentColor 5%, transparent)', 'currentColor has no value until an element uses it.'],
    ['var(--ink)', 'a custom property (var()) has no value outside the page.'],
    ['color-mix(in srgb, var(--ink) 5%, transparent)', 'a custom property (var()) has no value outside the page.'],
    ['hsl(from #abc h s l)', 'relative colour syntax (from) is not computed.'],
    ['light-dark(#fff, #000)', "light-dark() depends on the element's colour scheme; express it as a mode."],
    ['Canvas', "'Canvas' is a system colour, which only the user's platform knows."],
    ['inherit', "'inherit' is a CSS-wide keyword, which takes its value from the element's cascade."],
    ['revert-layer', "'revert-layer' is a CSS-wide keyword, which takes its value from the element's cascade."],
    ['rgb(calc(10 + 5) 0 0)', 'calc() inside a colour channel is not computed.'],
    ['not-a-colour', 'it is not a CSS colour.'],
  ];
  for (const [text, reason] of refusals) {
    it(text, () => {
      assert.throws(() => parseCssColor(text), { message: `'${text}' cannot be computed: ${reason}` });
    });
  }
  for (const keyword of ['initial', 'unset', 'revert']) {
    it(keyword, () => assert.throws(() => parseCssColor(keyword), /is a CSS-wide keyword/));
  }
});

describe('spellCssColor', () => {
  const roundTrip = (value: ColorValue): void => close(toColorValue(parseCssColor(spellCssColor(value))), value);

  it('spells a colour with a hex as the hex, the alpha byte appended', () => {
    assert.equal(spellCssColor({ colorSpace: 'srgb', components: [0.2, 0.4, 0.6], hex: '#336699' }), '#336699');
    assert.equal(spellCssColor({ colorSpace: 'srgb', components: [0, 0, 0], alpha: 128 / 255, hex: '#000000' }), '#00000080');
    roundTrip({ colorSpace: 'srgb', components: [0.2, 0.4, 0.6], hex: '#336699' });
    close(computed(spellCssColor({ colorSpace: 'srgb', components: [0, 0, 0], alpha: 128 / 255, hex: '#000000' })), {
      colorSpace: 'srgb',
      components: [0, 0, 0],
      alpha: 128 / 255,
    });
  });

  it('spells transparent as #00000000, never with a second alpha byte', () => {
    const clear: ColorValue = { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0, hex: '#00000000' };
    assert.equal(spellCssColor(clear), '#00000000');
    roundTrip(clear);
  });

  it('spells a colour without a hex in its own space, and reads it back', () => {
    assert.equal(spellCssColor({ colorSpace: 'oklch', components: [0.7, 0.1, 200] }), 'oklch(0.7 0.1 200)');
    assert.equal(spellCssColor({ colorSpace: 'display-p3', components: [1, 0, 0] }), 'color(display-p3 1 0 0)');
    assert.equal(spellCssColor({ colorSpace: 'hsl', components: [120, 50, 50] }), 'hsl(120 50% 50%)');
    for (const value of [
      { colorSpace: 'oklch', components: [0.7, 0.1, 200] },
      { colorSpace: 'oklch', components: [0.62, 0.137, 'none'], alpha: 0.3 },
      { colorSpace: 'display-p3', components: [0.9, 0.2, 0.1], alpha: 0.5 },
      { colorSpace: 'hsl', components: [210, 40, 35] },
      { colorSpace: 'srgb-linear', components: [0.5, 0.25, 0.1] },
      { colorSpace: 'lab', components: [50, -20, 30] },
      { colorSpace: 'xyz-d50', components: [0.3, 0.4, 0.5] },
    ] satisfies ColorValue[]) {
      roundTrip(value);
    }
    roundTrip(computed('color-mix(in oklch, red, blue)'));
  });
});

describe('toCuloriColor: the one bridge', () => {
  it('reads srgb-linear as linear light: 0.5 grey is about 0.735 in sRGB', () => {
    const rgb = converter('rgb')(toCuloriColor({ colorSpace: 'srgb-linear', components: [0.5, 0.5, 0.5] }));
    assert.ok(Math.abs(rgb.r - 0.735) < 0.001, `r ${rgb.r}`);
  });

  it('reads hsl and hwb channels from 0–100', () => {
    assert.deepEqual(toCuloriColor({ colorSpace: 'hsl', components: [120, 100, 50] }), { mode: 'hsl', h: 120, s: 1, l: 0.5 });
    assert.deepEqual(toCuloriColor({ colorSpace: 'hwb', components: [120, 10, 20], alpha: 0.5 }), {
      mode: 'hwb',
      h: 120,
      w: 0.1,
      b: 0.2,
      alpha: 0.5,
    });
  });

  it("reads 'none' as a missing channel", () => {
    assert.deepEqual(toCuloriColor({ colorSpace: 'oklch', components: [0.5, 0, 'none'] }), { mode: 'oklch', l: 0.5, c: 0 });
  });

  it('refuses an unknown space or the wrong number of components', () => {
    assert.throws(() => toCuloriColor({ colorSpace: 'foo', components: [0, 0, 0] }), /Color space 'foo' is not supported/);
    assert.throws(() => toCuloriColor({ colorSpace: 'srgb', components: [0, 0] }), /components must have 3 items/);
  });
});
