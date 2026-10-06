import type { GazeSource, SampleListener } from './types';
import type { TextRenderer } from '../text/renderer';
import { WebcamNoise, gaussian } from './noise';

const SAMPLE_HZ = 30;

interface Fixation {
  x: number;
  y: number;
  duration: number;
}

/**
 * A synthetic reader: fixates word by word along each line (~250 ms per
 * fixation), skips some short words, occasionally regresses, and makes a
 * return sweep at the end of each line. Lets the effects be watched hands-free.
 */
export class SimulatedReader implements GazeSource {
  readonly name = 'simulated reader';
  private listeners: SampleListener[] = [];
  private timer: number | undefined;
  private plan: Fixation[] = [];
  private step = 0;
  private stepStartedAt = 0;

  constructor(
    private renderer: TextRenderer,
    private noise: WebcamNoise,
  ) {}

  start(): void {
    this.plan = this.buildPlan();
    this.step = 0;
    this.stepStartedAt = performance.now();
    this.timer = window.setInterval(() => this.tick(), 1000 / SAMPLE_HZ);
  }

  stop(): void {
    window.clearInterval(this.timer);
  }

  onSample(listener: SampleListener): void {
    this.listeners.push(listener);
  }

  private tick(): void {
    const now = performance.now();
    while (this.step < this.plan.length && now - this.stepStartedAt > this.plan[this.step].duration) {
      this.stepStartedAt += this.plan[this.step].duration;
      this.step++;
    }
    const f = this.plan[this.step];
    if (!f) return; // finished the page: gaze is "lost"
    const sample = this.noise.apply({ x: f.x, y: f.y, t: now });
    for (const l of this.listeners) l(sample);
  }

  private buildPlan(): Fixation[] {
    const plan: Fixation[] = [];
    const lines = this.renderer.lines;
    for (const line of lines) {
      const words = line.words.map((i) => this.renderer.words[i]);
      for (let k = 0; k < words.length; k++) {
        const w = words[k];
        const short = w.base.replace(/\W/g, '').length <= 3;
        if (short && k > 0 && Math.random() < 0.5) continue;
        const r = w.rect;
        plan.push({
          // readers land slightly left of a word's centre
          x: r.left + r.width * 0.4,
          y: r.top + r.height / 2,
          duration: Math.max(120, 230 + gaussian() * 50 + w.base.length * 8),
        });
        if (k > 1 && Math.random() < 0.08) {
          const back = words[k - 1].rect;
          plan.push({ x: back.left + back.width * 0.5, y: back.top + back.height / 2, duration: 180 });
        }
      }
    }
    return plan;
  }
}
