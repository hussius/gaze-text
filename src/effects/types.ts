import type { ReadingModel } from '../reading/model';
import type { TextRenderer } from '../text/renderer';

export interface EffectContext {
  now: number;
  /** Seconds since last frame. */
  dt: number;
  renderer: TextRenderer;
  model: ReadingModel;
  /** Global intensity slider, 0..1. */
  intensity: number;
}

/**
 * An effect owns some of the per-word effect fields on `Word` and rewrites
 * them every frame. The renderer then commits the result to the DOM.
 */
export interface Effect {
  update(ctx: EffectContext): void;
  /** Return every word field this effect owns to neutral. */
  clear(ctx: Pick<EffectContext, 'renderer'>): void;
  reset(): void;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smoothstep = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
