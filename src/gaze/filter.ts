import type { GazeSample } from './types';

/**
 * 1€ filter (Casiez et al. 2012): heavy smoothing when the signal is still,
 * little lag when it moves fast. One instance per axis.
 */
class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(
    public minCutoff: number,
    public beta: number,
    private dCutoff = 1.0,
  ) {}

  filter(x: number, tMs: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    this.tPrev = tMs;
    const dx = (x - this.xPrev) / dt;
    const aD = alpha(this.dCutoff, dt);
    this.dxPrev = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const a = alpha(cutoff, dt);
    this.xPrev = a * x + (1 - a) * this.xPrev;
    return this.xPrev;
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/** What the rest of the app knows about the gaze at a given moment. */
export interface GazeState {
  /** Smoothed gaze point. */
  x: number;
  y: number;
  /** Latest unfiltered sample (debug display only). */
  rawX: number;
  rawY: number;
  /** True while samples cluster tightly enough to count as a fixation. */
  fixating: boolean;
  /** Centroid of the current fixation (valid when fixating). */
  fixX: number;
  fixY: number;
  fixDuration: number;
  lastSampleAt: number;
}

/**
 * Smooths samples and runs streaming I-DT fixation detection: a fixation is a
 * run of samples whose dispersion stays under a threshold for a minimum duration.
 */
export class GazeFilter {
  private fx = new OneEuro(0.8, 0.02);
  private fy = new OneEuro(0.8, 0.02);
  private window: GazeSample[] = [];

  /** Max (width + height) of the sample cluster, px. Grows with tracker noise. */
  dispersionPx = 90;
  minFixationMs = 100;

  readonly state: GazeState = {
    x: 0, y: 0, rawX: 0, rawY: 0,
    fixating: false, fixX: 0, fixY: 0, fixDuration: 0,
    lastSampleAt: -Infinity,
  };

  push(s: GazeSample): void {
    const st = this.state;
    st.rawX = s.x;
    st.rawY = s.y;
    st.x = this.fx.filter(s.x, s.t);
    st.y = this.fy.filter(s.y, s.t);
    st.lastSampleAt = s.t;

    // I-DT runs on the smoothed point so single-sample spikes don't break fixations.
    this.window.push({ x: st.x, y: st.y, t: s.t });
    if (dispersion(this.window) > this.dispersionPx) {
      this.window = [{ x: st.x, y: st.y, t: s.t }];
    }
    const duration = s.t - this.window[0].t;
    st.fixating = duration >= this.minFixationMs;
    st.fixDuration = duration;
    if (st.fixating) {
      let sx = 0, sy = 0;
      for (const p of this.window) { sx += p.x; sy += p.y; }
      st.fixX = sx / this.window.length;
      st.fixY = sy / this.window.length;
    }
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.window = [];
    this.state.fixating = false;
    this.state.lastSampleAt = -Infinity;
  }
}

function dispersion(pts: GazeSample[]): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return maxX - minX + (maxY - minY);
}
