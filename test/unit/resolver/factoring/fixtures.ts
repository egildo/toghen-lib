/** Fixed documents in the W3C structured shapes. Synthetic. */
import type { ResolverDocument } from '../../../../src/resolver/types.js';

export const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
export const px = (value: number, unit = 'px') => ({ value, unit });
export const set = (name: string, ...sources: object[]) => ({ type: 'set' as const, name, sources });
export const doc = (resolutionOrder: any[], extra: object = {}): ResolverDocument => ({ version: '2025-11-01', resolutionOrder, ...extra });
export const mod = (name: string, contexts: Record<string, object[]>, def?: string) => ({
  type: 'modifier' as const,
  name,
  contexts,
  ...(def ? { default: def } : {}),
});
export const tok = (path: string, node: object) => path.split('.').reduceRight<object>((acc, k) => ({ [k]: acc }), node);

/** Four independent modifiers over one base set, shaped like a layered system. */
export function fourModifierFixture(): ResolverDocument {
  const merge = (a: any, b: any): any => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b))
      out[k] = typeof v === 'object' && !Array.isArray(v) && typeof a[k] === 'object' ? merge(a[k], v) : v;
    return out;
  };
  const add = (target: any, path: string, node: object) => Object.assign(target, merge(target, tok(path, node)));
  const base: any = {};
  const scheme = { light: {} as any, dark: {} as any };
  const tone = { neutral: {} as any, accent: {} as any };
  const hue = { cool: {} as any, warm: {} as any, mono: {} as any };
  const scale = { regular: {} as any, compact: {} as any };

  for (let i = 0; i < 6; i++) {
    add(scheme.light, `prim.p${i}`, { $value: srgb(1 - i / 6, 0.5, 0.2), $type: 'color' });
    add(scheme.dark, `prim.p${i}`, { $value: srgb(i / 6, 0.5, 0.8), $type: 'color' });
  }
  for (let i = 0; i < 10; i++) add(base, `palette.c${i}`, { $value: `{prim.p${i % 6}}`, $type: 'color' });
  for (let i = 0; i < 4; i++) {
    add(tone.neutral, `tone.r${i}`, { $value: `{palette.c${i}}` });
    add(tone.accent, `tone.r${i}`, { $value: `{palette.c${i + 4}}` });
  }
  add(scheme.dark, 'tone.r0', { $value: `{palette.c9}` });
  for (let i = 0; i < 3; i++)
    for (const h of Object.keys(hue)) add((hue as any)[h], `hue.r${i}`, { $value: `{palette.c${(i + h.length) % 10}}` });
  for (let i = 0; i < 4; i++) {
    add(scale.regular, `size.k${i}`, { $value: px(8 * (i + 1)) });
    add(scale.compact, `size.k${i}`, { $value: px(6 * (i + 1)) });
  }
  add(base, 'shadow.card', { $value: { offsetX: px(0), offsetY: px(2), blur: px(4), color: srgb(0, 0, 0) } });
  add(scale.compact, 'shadow.card', { $value: { blur: px(2) } });
  add(scheme.dark, 'shadow.card', { $value: { color: srgb(0, 0, 0), blur: px(8) } });
  for (let i = 0; i < 6; i++) {
    add(base, `space.s${i}`, { $value: px(4 * (i + 1)) });
    add(base, `font.f${i}`, { $value: ['Inter', 'sans-serif'] });
  }
  const ctx = (m: Record<string, object>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [v]]));
  return doc([
    set('base', base),
    mod('scheme', ctx(scheme), 'light'),
    mod('tone', ctx(tone), 'neutral'),
    mod('hue', ctx(hue), 'cool'),
    mod('scale', ctx(scale), 'regular'),
  ]);
}
