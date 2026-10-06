import type { GazeSample, GazeSource, SampleListener } from './types';
import { WebcamNoise } from './noise';

const SAMPLE_HZ = 30; // roughly what WebGazer delivers

/** Uses the mouse cursor as a stand-in for gaze, sampled at webcam rate. */
export class MouseSource implements GazeSource {
  readonly name = 'mouse';
  private listeners: SampleListener[] = [];
  private x = -1;
  private y = -1;
  private timer: number | undefined;

  constructor(private noise: WebcamNoise) {}

  private onMove = (e: MouseEvent) => {
    this.x = e.clientX;
    this.y = e.clientY;
  };

  start(): void {
    window.addEventListener('mousemove', this.onMove);
    this.timer = window.setInterval(() => {
      if (this.x < 0) return;
      const sample: GazeSample = this.noise.apply({ x: this.x, y: this.y, t: performance.now() });
      for (const l of this.listeners) l(sample);
    }, 1000 / SAMPLE_HZ);
  }

  stop(): void {
    window.removeEventListener('mousemove', this.onMove);
    window.clearInterval(this.timer);
  }

  onSample(listener: SampleListener): void {
    this.listeners.push(listener);
  }
}
