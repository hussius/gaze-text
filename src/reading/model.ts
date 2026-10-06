import type { GazeState } from '../gaze/filter';
import type { TextRenderer } from '../text/renderer';

export interface ReadingParams {
  /** Horizontal radius of gaze influence, px (σ of a Gaussian). Grows with tracker noise. */
  zoneRadius: number;
  /** Seconds of weighted fixation for a word to count as read. */
  wordReadSeconds: number;
  /** Fraction of a line's words that must be read for the line to count as read. */
  lineCoverage: number;
}

/** A word currently under the gaze, with how strongly (0..1). */
export interface ZoneEntry {
  index: number;
  weight: number;
}

/** No samples for this long means the reader has looked away / been lost. */
const GAZE_LOST_MS = 400;
/** How long the gaze must favour another line before the snap moves. */
const LINE_SWITCH_MS = 90;

/**
 * Turns gaze into reading state:
 * - per-word accumulated attention (`wordScore`, seconds),
 * - which lines are read,
 * - the read front (furthest line read; only moves forward),
 * - when the front passed each line (drives the "erosion" timing),
 * - the words in the current gaze zone.
 */
export class ReadingModel {
  wordScore!: Float32Array;
  lineRead!: boolean[];
  /** performance.now() when the read front first reached/passed each line, NaN if not yet. */
  linePassedAt!: number[];
  readFront = -1;
  zone: ZoneEntry[] = [];
  gazeActive = false;
  /** Line the gaze is snapped to, or -1 when off the text. */
  currentLine = -1;
  private lineCandidate = -1;
  private lineCandidateSince = 0;

  constructor(private renderer: TextRenderer, public params: ReadingParams) {
    this.reset();
  }

  reset(): void {
    this.wordScore = new Float32Array(this.renderer.words.length);
    this.lineRead = this.renderer.lines.map(() => false);
    this.linePassedAt = this.renderer.lines.map(() => NaN);
    this.readFront = -1;
    this.zone = [];
    this.currentLine = -1;
    this.lineCandidate = -1;
  }

  update(now: number, dt: number, gaze: GazeState): void {
    this.gazeActive = now - gaze.lastSampleAt < GAZE_LOST_MS;
    this.zone = [];
    if (!this.gazeActive) return;

    this.snapLine(now, gaze.y);
    const lineY = this.lineCenter(this.currentLine);
    if (lineY === null) return;

    // The zone follows the smoothed gaze point continuously…
    this.zone = this.wordsNear(gaze.x, lineY);
    // …but reading is only credited during fixations (no credit while the eye sweeps).
    if (!gaze.fixating) return;
    for (const { index, weight } of this.wordsNear(gaze.fixX, lineY)) {
      this.wordScore[index] += weight * dt;
    }
    this.updateLines(now);
  }

  /**
   * Webcam gaze is noisiest vertically, so the gaze is snapped to a text line.
   * Switching lines needs the gaze to be clearly closer to the new line
   * for a moment, which stops the zone flickering between neighbours.
   */
  private snapLine(now: number, y: number): void {
    const { lines, lineHeight } = this.renderer;
    if (lines.length === 0) return;
    const above = lines[0].top - lineHeight;
    const below = lines[lines.length - 1].bottom + lineHeight;
    if (y < above || y > below) {
      this.currentLine = -1;
      return;
    }
    let nearest = 0;
    for (const line of lines) {
      if (Math.abs(y - (line.top + line.bottom) / 2) < Math.abs(y - this.lineCenter(nearest)!)) nearest = line.index;
    }
    if (this.currentLine < 0) {
      this.currentLine = nearest;
      return;
    }
    if (nearest === this.currentLine) {
      this.lineCandidate = -1;
      return;
    }
    const margin = lineHeight * 0.2;
    const clearlyCloser = Math.abs(y - this.lineCenter(nearest)!) < Math.abs(y - this.lineCenter(this.currentLine)!) - margin;
    if (!clearlyCloser) return;
    if (this.lineCandidate !== nearest) {
      this.lineCandidate = nearest;
      this.lineCandidateSince = now;
    } else if (now - this.lineCandidateSince > LINE_SWITCH_MS) {
      this.currentLine = nearest;
      this.lineCandidate = -1;
    }
  }

  private lineCenter(index: number): number | null {
    const line = this.renderer.lines[index];
    return line ? (line.top + line.bottom) / 2 : null;
  }

  /** Words around a point, weighted by an anisotropic Gaussian (wide along the line, narrow across). */
  wordsNear(x: number, y: number): ZoneEntry[] {
    const sx = this.params.zoneRadius;
    // after line snapping, neighbouring lines get a little spill-over (~0.2) and no more
    const sy = this.renderer.lineHeight * 0.55;
    const out: ZoneEntry[] = [];
    for (const w of this.renderer.words) {
      const r = w.rect;
      // distance to the box, not its centre, so long words aren't penalised
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = y - (r.top + r.bottom) / 2;
      const weight = Math.exp(-0.5 * ((dx / sx) ** 2 + (dy / sy) ** 2));
      if (weight > 0.05) out.push({ index: w.index, weight });
    }
    return out;
  }

  private updateLines(now: number): void {
    const { lines } = this.renderer;
    for (const line of lines) {
      if (this.lineRead[line.index]) continue;
      let read = 0;
      for (const i of line.words) if (this.wordScore[i] >= this.params.wordReadSeconds) read++;
      // a short last line of a paragraph is read once any of it is
      const needed = Math.max(1, Math.ceil(line.words.length * this.params.lineCoverage));
      if (read >= needed) {
        this.lineRead[line.index] = true;
        if (line.index > this.readFront) {
          for (let i = this.readFront + 1; i <= line.index; i++) {
            if (Number.isNaN(this.linePassedAt[i])) this.linePassedAt[i] = now;
          }
          this.readFront = line.index;
        }
      }
    }
  }
}
