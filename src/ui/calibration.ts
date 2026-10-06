import type { WebGazerSource } from '../gaze/webgazerSource';
import type { GazeSample } from '../gaze/types';
import type { TuningResult } from '../gaze/ridgeTuning';

export interface CalibrationResult {
  /** Median distance between predicted and true gaze on the validation dots, px. */
  errorPx: number;
  /** Regularisation chosen from the training dots, or null if it couldn't be tuned. */
  tuning: TuningResult | null;
}

/** Fractions of the text area used for training: a 3×3 grid plus an inner 2×2, in a snake order. */
const TRAIN_POINTS: [number, number][] = [
  [0, 0], [0.5, 0], [1, 0],
  [0.75, 0.25], [0.25, 0.25],
  [0, 0.5], [0.5, 0.5], [1, 0.5],
  [0.75, 0.75], [0.25, 0.75],
  [0, 1], [0.5, 1], [1, 1],
];
/** Different positions from training, so the check measures generalisation. */
const VALIDATE_POINTS: [number, number][] = [
  [0.15, 0.15], [0.85, 0.2], [0.5, 0.45], [0.2, 0.8], [0.8, 0.85],
];

const DOT_APPEAR_MS = 350;
const TRAIN_SETTLE_MS = 450; // eyes need a moment to land on the dot
const TRAIN_RECORD_MS = 800;
const TRAIN_RECORD_EVERY_MS = 80;
const VALIDATE_SETTLE_MS = 600;
const VALIDATE_RECORD_MS = 900;

/**
 * Hands-free calibration for gallery visitors: position your face, then
 * follow an ink dot with your eyes. No clicking. Ends with a short
 * validation pass that measures the real accuracy for this visitor.
 */
export class Calibration {
  private overlay = document.createElement('div');
  private dot = document.createElement('div');
  private samples: GazeSample[] | null = null;
  private aborted = false;

  constructor(private source: WebGazerSource, private textArea: () => DOMRect) {
    this.overlay.className = 'calibration';
    this.dot.className = 'calibration-dot';
    source.onSample((s) => this.samples?.push(s));
  }

  /** `showResult`: print the measured accuracy on the closing card (for the operator). */
  async run(showResult = false): Promise<CalibrationResult> {
    this.aborted = false;
    document.body.append(this.overlay);
    document.body.classList.add('calibrating');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.aborted = true;
    };
    window.addEventListener('keydown', onKey);
    try {
      await this.source.clearCalibration();
      await this.intro();
      this.overlay.innerHTML = '';
      this.overlay.append(this.dot);

      for (const p of TRAIN_POINTS) {
        const { x, y } = this.place(p);
        await this.showDot(x, y);
        await this.wait(TRAIN_SETTLE_MS);
        for (let t = 0; t < TRAIN_RECORD_MS; t += TRAIN_RECORD_EVERY_MS) {
          this.source.train(x, y);
          await this.wait(TRAIN_RECORD_EVERY_MS);
        }
      }

      const tuning = this.source.tuneRegularization();
      if (tuning) {
        console.info(
          `calibration: ridge lambda ${tuning.lambda} (held-out error ${Math.round(tuning.errorPx)} px; ` +
            `WebGazer default would give ${Math.round(tuning.defaultErrorPx)} px)`,
        );
      }

      const errors: number[] = [];
      for (const p of VALIDATE_POINTS) {
        const { x, y } = this.place(p);
        await this.showDot(x, y, true);
        await this.wait(VALIDATE_SETTLE_MS);
        this.samples = [];
        await this.wait(VALIDATE_RECORD_MS);
        const got = this.samples;
        this.samples = null;
        if (got.length > 0) errors.push(median(got.map((s) => Math.hypot(s.x - x, s.y - y))));
      }
      // no predictions at all during validation means the face was lost
      const errorPx = errors.length > 0 ? median(errors) : Infinity;
      console.info(`calibration: median error ${Math.round(errorPx)} px`, errors.map(Math.round));
      await this.outro(showResult ? errorPx : null);
      return { errorPx, tuning };
    } finally {
      window.removeEventListener('keydown', onKey);
      this.samples = null;
      this.source.showCamera(false);
      this.overlay.remove();
      this.overlay.innerHTML = '';
      document.body.classList.remove('calibrating');
    }
  }

  private async intro(): Promise<void> {
    this.overlay.innerHTML = `
      <div class="calibration-card">
        <p class="calibration-title">Before you read</p>
        <p>Sit comfortably, about an arm’s length from the screen,<br>
           with your face inside the frame.</p>
        <p>A small mark will move across the page.<br>Follow it with your eyes.</p>
        <p class="calibration-hint">Press the space bar or click to begin</p>
      </div>`;
    this.source.showCamera(true);
    await new Promise<void>((resolve, reject) => {
      const go = (e: Event) => {
        if (e instanceof KeyboardEvent && e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        cleanup();
        resolve();
      };
      const abort = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        cleanup();
        reject(new Error('calibration cancelled'));
      };
      const cleanup = () => {
        window.removeEventListener('keydown', go);
        window.removeEventListener('keydown', abort);
        this.overlay.removeEventListener('click', go);
      };
      window.addEventListener('keydown', go);
      window.addEventListener('keydown', abort);
      this.overlay.addEventListener('click', go);
    });
    this.source.showCamera(false);
  }

  private async outro(errorPx: number | null): Promise<void> {
    let detail = '';
    if (errorPx !== null) {
      detail = Number.isFinite(errorPx)
        ? `<p class="calibration-hint">Tracking accuracy about ±${Math.round(errorPx)} px</p>`
        : '<p class="calibration-hint">No face was seen during the accuracy check. Press K to try again.</p>';
    }
    this.overlay.innerHTML = `<div class="calibration-card"><p class="calibration-title">Thank you.</p>${detail}</div>`;
    await this.wait(errorPx !== null ? 3500 : 1200);
  }

  /** Map a fraction of the text area to viewport coordinates (slightly beyond its edges). */
  private place([fx, fy]: [number, number]): { x: number; y: number } {
    const r = this.textArea();
    const padX = r.width * 0.04;
    const padY = r.height * 0.04;
    return {
      x: r.left - padX + fx * (r.width + 2 * padX),
      y: r.top - padY + fy * (r.height + 2 * padY),
    };
  }

  private async showDot(x: number, y: number, hollow = false): Promise<void> {
    this.dot.classList.toggle('hollow', hollow);
    this.dot.classList.remove('visible');
    this.dot.style.transform = `translate(${x}px, ${y}px)`;
    // restart the ink-blot animation
    void this.dot.offsetWidth;
    this.dot.classList.add('visible');
    await this.wait(DOT_APPEAR_MS);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve, reject) =>
      setTimeout(() => (this.aborted ? reject(new Error('calibration cancelled')) : resolve()), ms),
    );
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
