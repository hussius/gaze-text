import type { GazeSample } from './types';

/** Standard normal via Box–Muller. */
export function gaussian(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Degrades a clean gaze signal so it behaves roughly like a webcam tracker:
 * per-sample jitter plus a slowly wandering offset (calibration drift).
 */
export class WebcamNoise {
  private driftX = 0;
  private driftY = 0;

  /** `amount` is the jitter standard deviation in px; 0 disables all noise. */
  constructor(public amount = 0) {}

  apply(s: GazeSample): GazeSample {
    if (this.amount <= 0) return s;
    const driftLimit = this.amount * 1.2;
    this.driftX = clamp(this.driftX + gaussian() * this.amount * 0.05, -driftLimit, driftLimit);
    this.driftY = clamp(this.driftY + gaussian() * this.amount * 0.05, -driftLimit, driftLimit);
    return {
      x: s.x + this.driftX + gaussian() * this.amount,
      y: s.y + this.driftY + gaussian() * this.amount * 0.8,
      t: s.t,
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
