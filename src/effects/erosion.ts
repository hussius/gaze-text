import { clamp01, lerp, smoothstep, type Effect, type EffectContext } from './types';

export type ErosionStyle = 'blur' | 'fade' | 'rewrite' | 'rewrite+blur';

/**
 * "Erosion of the past": lines some distance above the read front decay over
 * time. Intensity controls how close behind the reader it starts, how fast it
 * progresses, and how far it goes.
 *
 * Owns: blur, opacity, bleed, swapped.
 */
export class Erosion implements Effect {
  style: ErosionStyle = 'rewrite+blur';

  update({ now, renderer, model, intensity }: EffectContext): void {
    // lag: how many lines behind the read front stay untouched
    const lag = Math.round(lerp(6, 1, intensity));
    // seconds from the front passing a line until it is fully eroded
    const duration = lerp(30, 3, intensity);

    for (const line of renderer.lines) {
      const passedAt = model.linePassedAt[line.index];
      const behind = model.readFront - line.index;
      let amount = 0;
      if (intensity > 0 && !Number.isNaN(passedAt) && behind >= lag) {
        const timeProgress = (now - passedAt) / 1000 / duration;
        // lines further back erode a bit more
        const depth = clamp01((behind - lag + 1) / 3);
        amount = smoothstep(timeProgress) * lerp(0.6, 1, depth) * lerp(0.4, 1, intensity);
      }
      for (const i of line.words) this.applyTo(renderer.words[i], amount);
    }
  }

  private applyTo(
    w: { blur: number; opacity: number; bleed: number; swapped: boolean; seed: number },
    amount: number,
  ): void {
    w.blur = 0;
    w.opacity = 1;
    w.bleed = 0;
    w.swapped = false;
    switch (this.style) {
      case 'blur':
        w.blur = amount * 5;
        w.opacity = 1 - amount * 0.35;
        break;
      case 'fade':
        w.opacity = 1 - amount * 0.92;
        w.bleed = amount;
        break;
      case 'rewrite':
        // words flip one by one, in a fixed scattered order
        w.swapped = amount > w.seed * 0.9 + 0.05;
        break;
      case 'rewrite+blur':
        w.swapped = amount > w.seed * 0.9 + 0.05;
        w.blur = Math.max(0, amount - 0.6) * 4;
        w.opacity = 1 - Math.max(0, amount - 0.5) * 0.5;
        break;
    }
  }

  clear({ renderer }: Pick<EffectContext, 'renderer'>): void {
    for (const w of renderer.words) this.applyTo(w, 0);
  }

  reset(): void {}
}
